import { getTracks } from "../api/catalog";
import {
  selectOrderedTracks,
  usePlayerStore,
} from "../stores/playerStore";

const STORAGE_KEY = "ihy-player-session";

interface SessionSnapshot {
  trackIds: number[];
  position: number;
  seconds: number;
  volume: number;
  playbackRate: number;
  repeat: "off" | "all" | "one";
}

let persistenceStarted = false;

/** Save the queue and position to localStorage (throttled) so a page
 *  reload can pick up exactly where playback stopped. */
export function initSessionPersistence(): void {
  if (persistenceStarted) return;
  persistenceStarted = true;
  let timer: number | undefined;
  usePlayerStore.subscribe(() => {
    if (timer !== undefined) return;
    timer = window.setTimeout(() => {
      timer = undefined;
      const state = usePlayerStore.getState();
      if (state.position < 0) return;
      const snapshot: SessionSnapshot = {
        trackIds: selectOrderedTracks(state).map((track) => track.id),
        position: state.position,
        seconds: state.lastKnownTime,
        volume: state.volume,
        playbackRate: state.playbackRate,
        repeat: state.repeat,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    }, 2000);
  });
}

export async function restoreSession(): Promise<void> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  const store = usePlayerStore.getState();
  if (store.position >= 0) return; // something is already loaded

  let snapshot: SessionSnapshot;
  try {
    snapshot = JSON.parse(raw) as SessionSnapshot;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  if (!snapshot.trackIds?.length) return;

  try {
    const page = await getTracks({
      ids: snapshot.trackIds.join(","),
      limit: Math.min(snapshot.trackIds.length, 1000),
    });
    const byId = new Map(page.items.map((track) => [track.id, track]));
    const tracks = snapshot.trackIds
      .map((id) => byId.get(id))
      .filter((track): track is NonNullable<typeof track> => track !== undefined);
    if (tracks.length === 0) return;

    store.restoreQueue(tracks, snapshot.position);
    store.setPendingSeekSeconds(snapshot.seconds);
    store.setVolume(snapshot.volume ?? 1);
    store.setPlaybackRate(snapshot.playbackRate ?? 1);
  } catch {
    // library unreachable — leave the session for next time
  }
}
