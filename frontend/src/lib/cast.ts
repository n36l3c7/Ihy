/* Google Cast integration (Chrome only). The SDK is loaded lazily; when no
 * Cast support or no devices are around, the UI simply never shows the
 * button. While a session is active the local audio stays paused and the
 * player store keeps driving the queue: track changes are pushed to the
 * receiver, transport commands go through the RemotePlayerController. */

import type { Track } from "../api/types";
import { useAuthStore } from "../stores/authStore";
import { useCastStore } from "../stores/castStore";
import { usePlayerStore } from "../stores/playerStore";

/* The Cast SDK has no bundled types here; access it dynamically. */
type AnyRecord = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let remotePlayer: AnyRecord | null = null;
let remoteController: AnyRecord | null = null;
let lastLoadedTrackId: number | null = null;

const win = window as unknown as AnyRecord;

function framework(): AnyRecord | null {
  return win.cast?.framework ?? null;
}

function castContext(): AnyRecord | null {
  return framework()?.CastContext.getInstance() ?? null;
}

function absoluteStreamUrl(trackId: number): string {
  const token = useAuthStore.getState().accessToken ?? "";
  return `${window.location.origin}/api/v1/tracks/${trackId}/stream?token=${encodeURIComponent(token)}`;
}

function absoluteCoverUrl(albumId: number): string {
  const token = useAuthStore.getState().accessToken ?? "";
  return `${window.location.origin}/api/v1/albums/${albumId}/cover?token=${encodeURIComponent(token)}`;
}

export function isCasting(): boolean {
  return useCastStore.getState().connected;
}

/** Push a track to the receiver, resuming at startTime seconds. */
export function castLoadTrack(track: Track, startTime = 0): void {
  const context = castContext();
  const session = context?.getCurrentSession();
  const chromeCast = win.chrome?.cast;
  if (!session || !chromeCast) return;

  const mediaInfo = new chromeCast.media.MediaInfo(absoluteStreamUrl(track.id), "audio/mpeg");
  const metadata = new chromeCast.media.MusicTrackMediaMetadata();
  metadata.title = track.title;
  metadata.artist = track.artists.map((artist) => artist.name).join(", ");
  metadata.albumName = track.album?.title ?? "";
  if (track.album) {
    metadata.images = [new chromeCast.Image(absoluteCoverUrl(track.album.id))];
  }
  mediaInfo.metadata = metadata;
  const request = new chromeCast.media.LoadRequest(mediaInfo);
  request.currentTime = startTime;
  request.autoplay = usePlayerStore.getState().isPlaying;
  lastLoadedTrackId = track.id;
  void session.loadMedia(request).catch(() => {
    lastLoadedTrackId = null;
  });
}

export function castPlayPause(shouldPlay: boolean): void {
  const player = remotePlayer;
  const controller = remoteController;
  if (!player || !controller) return;
  if (player.isPaused === shouldPlay) {
    controller.playOrPause();
  }
}

export function castSeek(seconds: number): void {
  const player = remotePlayer;
  const controller = remoteController;
  if (!player || !controller) return;
  player.currentTime = seconds;
  controller.seek();
}

export function castStop(): void {
  castContext()?.getCurrentSession()?.endSession(true);
}

export function requestCastSession(): void {
  void castContext()?.requestSession();
}

function bindRemotePlayer(): void {
  const fw = framework();
  if (!fw) return;
  remotePlayer = new fw.RemotePlayer();
  const controller: AnyRecord = new fw.RemotePlayerController(remotePlayer);
  remoteController = controller;
  controller.addEventListener(
    fw.RemotePlayerEventType.CURRENT_TIME_CHANGED,
    () => {
      if (remotePlayer && useCastStore.getState().connected) {
        useCastStore.getState().setRemoteTime(remotePlayer.currentTime ?? 0);
        usePlayerStore.getState().setLastKnownTime(remotePlayer.currentTime ?? 0);
      }
    },
  );
  controller.addEventListener(
    fw.RemotePlayerEventType.MEDIA_INFO_CHANGED,
    () => {
      // Receiver went idle after finishing a track: advance the queue
      const session = castContext()?.getCurrentSession();
      const mediaSession = session?.getMediaSession();
      if (
        useCastStore.getState().connected &&
        lastLoadedTrackId !== null &&
        !mediaSession
      ) {
        lastLoadedTrackId = null;
        usePlayerStore.getState().next(true);
      }
    },
  );
}

function handleSessionState(event: AnyRecord): void {
  const fw = framework();
  if (!fw) return;
  const { SessionState } = fw;
  const store = useCastStore.getState();
  if (
    event.sessionState === SessionState.SESSION_STARTED ||
    event.sessionState === SessionState.SESSION_RESUMED
  ) {
    const session = castContext()?.getCurrentSession();
    store.setConnected(true, session?.getCastDevice()?.friendlyName ?? "Chromecast");
    const playerState = usePlayerStore.getState();
    const current =
      playerState.position >= 0
        ? playerState.queue[playerState.order[playerState.position]]
        : null;
    if (current) {
      castLoadTrack(current, playerState.lastKnownTime);
    }
  } else if (
    event.sessionState === SessionState.SESSION_ENDED ||
    event.sessionState === SessionState.SESSION_START_FAILED
  ) {
    lastLoadedTrackId = null;
    store.setConnected(false);
  }
}

function setupContext(): void {
  const fw = framework();
  const chromeCast = win.chrome?.cast;
  if (!fw || !chromeCast) return;
  const context = fw.CastContext.getInstance();
  context.setOptions({
    receiverApplicationId: chromeCast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: chromeCast.AutoJoinPolicy.ORIGIN_SCOPED,
  });
  context.addEventListener(
    fw.CastContextEventType.CAST_STATE_CHANGED,
    (event: AnyRecord) => {
      useCastStore
        .getState()
        .setAvailable(event.castState !== fw.CastState.NO_DEVICES_AVAILABLE);
    },
  );
  context.addEventListener(fw.CastContextEventType.SESSION_STATE_CHANGED, handleSessionState);
  bindRemotePlayer();
  useCastStore
    .getState()
    .setAvailable(context.getCastState() !== fw.CastState.NO_DEVICES_AVAILABLE);
}

/** Load the Cast SDK; harmless outside Chrome (callback never fires). */
export function initCast(): void {
  if (win.__ihyCastInit) return;
  win.__ihyCastInit = true;
  win.__onGCastApiAvailable = (isAvailable: boolean) => {
    if (isAvailable) setupContext();
  };
  const script = document.createElement("script");
  script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
  script.async = true;
  script.onerror = () => useCastStore.getState().setAvailable(false);
  document.head.appendChild(script);
}

/** Called by the audio hook when the current track changes while casting. */
export function syncCastTrack(track: Track | null): void {
  if (!isCasting()) return;
  if (track === null) {
    castStop();
    return;
  }
  if (track.id !== lastLoadedTrackId) {
    castLoadTrack(track, 0);
  }
}
