import { getQueue, updateQueue } from "../../api/queues";
import { selectOrderedTracks, usePlayerStore } from "../../stores/playerStore";

function snapshot() {
  const state = usePlayerStore.getState();
  return {
    track_ids: selectOrderedTracks(state).map((track) => track.id),
    current_index: Math.max(0, state.position),
    current_seconds: state.lastKnownTime,
  };
}

/** Load a saved queue, Musicolet-style: the position of the currently
 *  active saved queue is stored back first, then playback resumes the
 *  selected queue exactly where it stopped. */
export async function loadSavedQueue(queueId: number): Promise<void> {
  const store = usePlayerStore.getState();
  if (store.activeSavedQueueId !== null && store.position >= 0) {
    try {
      await updateQueue(store.activeSavedQueueId, snapshot());
    } catch {
      // best effort
    }
  }
  const detail = await getQueue(queueId);
  if (detail.tracks.length === 0) return;
  store.playQueue(detail.tracks, Math.min(detail.current_index, detail.tracks.length - 1));
  store.setPendingSeekSeconds(detail.current_seconds);
  store.setActiveSavedQueueId(detail.id);
}

export { snapshot as queueSnapshot };
