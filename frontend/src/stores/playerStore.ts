import { create } from "zustand";

import type { Track } from "../api/types";
import { sendCommand } from "../lib/syncBus";

export type RepeatMode = "off" | "all" | "one";

/** Spotify Connect-style roles: the leader tab owns the audio element,
 *  remote tabs mirror its state and send commands. */
export type SyncRole = "standalone" | "leader" | "remote";

export interface RemoteState {
  tracks: Track[];
  position: number;
  isPlaying: boolean;
  repeat: RepeatMode;
  volume: number;
  playbackRate: number;
  currentTime: number;
}

/** Playback order as indices into the queue; the current track stays first. */
function shuffledOrder(length: number, firstIndex: number | null): number[] {
  const rest = Array.from({ length }, (_, i) => i).filter((i) => i !== firstIndex);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return firstIndex === null ? rest : [firstIndex, ...rest];
}

interface PlayerState {
  queue: Track[];
  order: number[];
  position: number; // index into order, -1 = nothing loaded
  isPlaying: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  playbackRate: number;
  sleepEndsAt: number | null; // epoch ms; playback pauses when reached
  stopAfterTrack: boolean;
  queueOpen: boolean;
  activeSavedQueueId: number | null;
  pendingSeekSeconds: number | null; // applied by the audio hook when the track loads
  lastKnownTime: number; // most recent playback position, for saving queues
  syncRole: SyncRole;
  remoteSeekRequest: number | null; // seek requested by a remote tab
  crossfadeSeconds: number; // 0 = gapless switch, no fade
  normalizeVolume: boolean; // apply per-track ReplayGain when available
  autoplayRadio: boolean; // keep playing similar tracks when the queue ends
  playQueue: (tracks: Track[], startIndex?: number) => void;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;
  next: (fromEnded?: boolean) => void;
  previous: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  setSleepEndsAt: (endsAt: number | null) => void;
  setStopAfterTrack: (stop: boolean) => void;
  toggleQueueOpen: () => void;
  setActiveSavedQueueId: (id: number | null) => void;
  setPendingSeekSeconds: (seconds: number | null) => void;
  setLastKnownTime: (seconds: number) => void;
  setSyncRole: (role: SyncRole) => void;
  setCrossfadeSeconds: (seconds: number) => void;
  setNormalizeVolume: (enabled: boolean) => void;
  setAutoplayRadio: (enabled: boolean) => void;
  applyRemoteState: (state: RemoteState) => void;
  takeOver: () => void;
  restoreQueue: (tracks: Track[], startIndex: number) => void;
  jumpTo: (orderIndex: number) => void;
  removeAt: (orderIndex: number) => void;
  moveTo: (fromIndex: number, toIndex: number) => void;
  enqueueNext: (tracks: Track[]) => void;
  enqueueEnd: (tracks: Track[]) => void;
}

/** The queue in actual play order (resolves shuffle). */
export function selectOrderedTracks(state: PlayerState): Track[] {
  return state.order.map((index) => state.queue[index]);
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  /** In remote tabs, actions are forwarded to the leader instead of
   *  running locally; the leader's state broadcast updates this tab. */
  const forwarded = (name: string, ...args: unknown[]): boolean => {
    if (get().syncRole === "remote") {
      sendCommand(name, ...args);
      return true;
    }
    return false;
  };

  return {
  queue: [],
  order: [],
  position: -1,
  isPlaying: false,
  shuffle: false,
  repeat: "off",
  volume: 1,
  playbackRate: 1,
  sleepEndsAt: null,
  stopAfterTrack: false,
  queueOpen: false,
  activeSavedQueueId: null,
  pendingSeekSeconds: null,
  lastKnownTime: 0,
  syncRole: "standalone",
  remoteSeekRequest: null,
  crossfadeSeconds: Number(localStorage.getItem("ihy-crossfade")) || 0,
  normalizeVolume: localStorage.getItem("ihy-normalize") === "1",
  autoplayRadio: localStorage.getItem("ihy-autoplay") === "1",

  playQueue: (tracks, startIndex = 0) => {
    if (forwarded("playQueue", tracks, startIndex)) return;
    if (tracks.length === 0) return;
    const { shuffle } = get();
    const order = shuffle
      ? shuffledOrder(tracks.length, startIndex)
      : tracks.map((_, index) => index);
    set({ queue: tracks, order, position: shuffle ? 0 : startIndex, isPlaying: true });
  },

  togglePlay: () => {
    if (forwarded("togglePlay")) return;
    if (get().position >= 0) set((state) => ({ isPlaying: !state.isPlaying }));
  },

  setPlaying: (isPlaying) => {
    if (forwarded("setPlaying", isPlaying)) return;
    set({ isPlaying });
  },

  next: (fromEnded = false) => {
    if (forwarded("next")) return;
    const { position, order, repeat } = get();
    if (position < 0) return;
    if (position + 1 < order.length) {
      set({ position: position + 1, isPlaying: true });
    } else if (repeat === "all") {
      set({ position: 0, isPlaying: true });
    } else if (fromEnded) {
      set({ isPlaying: false });
    }
  },

  previous: () => {
    if (forwarded("previous")) return;
    const { position } = get();
    if (position > 0) set({ position: position - 1, isPlaying: true });
  },

  toggleShuffle: () => {
    if (forwarded("toggleShuffle")) return;
    const { shuffle, queue, order, position } = get();
    if (queue.length === 0) {
      set({ shuffle: !shuffle });
      return;
    }
    const currentIndex = position >= 0 ? order[position] : null;
    if (shuffle) {
      set({
        shuffle: false,
        order: queue.map((_, index) => index),
        position: currentIndex ?? -1,
      });
    } else {
      set({
        shuffle: true,
        order: shuffledOrder(queue.length, currentIndex),
        position: currentIndex === null ? -1 : 0,
      });
    }
  },

  cycleRepeat: () => {
    if (forwarded("cycleRepeat")) return;
    set((state) => ({
      repeat: state.repeat === "off" ? "all" : state.repeat === "all" ? "one" : "off",
    }));
  },

  setVolume: (volume) => {
    if (forwarded("setVolume", volume)) return;
    set({ volume });
  },

  setPlaybackRate: (playbackRate) => {
    if (forwarded("setPlaybackRate", playbackRate)) return;
    set({ playbackRate });
  },

  setSleepEndsAt: (sleepEndsAt) => {
    if (forwarded("setSleepEndsAt", sleepEndsAt)) return;
    set({ sleepEndsAt, stopAfterTrack: false });
  },

  setStopAfterTrack: (stopAfterTrack) => {
    if (forwarded("setStopAfterTrack", stopAfterTrack)) return;
    set({ stopAfterTrack, sleepEndsAt: null });
  },

  setSyncRole: (syncRole) => set({ syncRole }),

  setCrossfadeSeconds: (crossfadeSeconds) => {
    localStorage.setItem("ihy-crossfade", String(crossfadeSeconds));
    set({ crossfadeSeconds });
  },

  setNormalizeVolume: (normalizeVolume) => {
    localStorage.setItem("ihy-normalize", normalizeVolume ? "1" : "0");
    set({ normalizeVolume });
  },

  setAutoplayRadio: (autoplayRadio) => {
    localStorage.setItem("ihy-autoplay", autoplayRadio ? "1" : "0");
    set({ autoplayRadio });
  },

  applyRemoteState: (state) =>
    set({
      queue: state.tracks,
      order: state.tracks.map((_, index) => index),
      position: state.position,
      isPlaying: state.isPlaying,
      repeat: state.repeat,
      volume: state.volume,
      playbackRate: state.playbackRate,
      lastKnownTime: state.currentTime,
    }),

  takeOver: () => {
    const state = get();
    if (state.syncRole !== "remote") return;
    set({
      syncRole: "standalone",
      pendingSeekSeconds: state.lastKnownTime,
      isPlaying: true,
    });
  },

  toggleQueueOpen: () => set((state) => ({ queueOpen: !state.queueOpen })),

  setActiveSavedQueueId: (activeSavedQueueId) => set({ activeSavedQueueId }),

  setPendingSeekSeconds: (pendingSeekSeconds) => set({ pendingSeekSeconds }),

  setLastKnownTime: (lastKnownTime) => set({ lastKnownTime }),

  restoreQueue: (tracks, startIndex) => {
    if (tracks.length === 0) return;
    set({
      queue: tracks,
      order: tracks.map((_, index) => index),
      position: Math.min(Math.max(startIndex, 0), tracks.length - 1),
      isPlaying: false,
    });
  },

  jumpTo: (orderIndex) => {
    if (forwarded("jumpTo", orderIndex)) return;
    if (orderIndex >= 0 && orderIndex < get().order.length) {
      set({ position: orderIndex, isPlaying: true });
    }
  },

  removeAt: (orderIndex) => {
    if (forwarded("removeAt", orderIndex)) return;
    const { queue, order, position } = get();
    const tracks = order.map((index) => queue[index]);
    if (orderIndex < 0 || orderIndex >= tracks.length) return;
    tracks.splice(orderIndex, 1);
    if (tracks.length === 0) {
      set({ queue: [], order: [], position: -1, isPlaying: false });
      return;
    }
    let newPosition = position;
    if (orderIndex < position) newPosition = position - 1;
    else if (orderIndex === position) newPosition = Math.min(position, tracks.length - 1);
    set({ queue: tracks, order: tracks.map((_, index) => index), position: newPosition });
  },

  moveTo: (fromIndex, toIndex) => {
    if (forwarded("moveTo", fromIndex, toIndex)) return;
    const { queue, order, position } = get();
    const tracks = order.map((index) => queue[index]);
    if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= tracks.length) return;
    const [moved] = tracks.splice(fromIndex, 1);
    tracks.splice(toIndex, 0, moved);
    let newPosition = position;
    if (fromIndex === position) newPosition = toIndex;
    else if (fromIndex < position && toIndex >= position) newPosition = position - 1;
    else if (fromIndex > position && toIndex <= position) newPosition = position + 1;
    set({ queue: tracks, order: tracks.map((_, index) => index), position: newPosition });
  },

  enqueueNext: (newTracks) => {
    if (forwarded("enqueueNext", newTracks)) return;
    const { queue, order, position, playQueue } = get();
    if (queue.length === 0 || position < 0) {
      playQueue(newTracks);
      return;
    }
    const tracks = order.map((index) => queue[index]);
    tracks.splice(position + 1, 0, ...newTracks);
    set({ queue: tracks, order: tracks.map((_, index) => index), position });
  },

  enqueueEnd: (newTracks) => {
    if (forwarded("enqueueEnd", newTracks)) return;
    const { queue, order, position, playQueue } = get();
    if (queue.length === 0 || position < 0) {
      playQueue(newTracks);
      return;
    }
    const tracks = [...order.map((index) => queue[index]), ...newTracks];
    set({ queue: tracks, order: tracks.map((_, index) => index), position });
  },
  };
});

export function selectCurrentTrack(state: PlayerState): Track | null {
  if (state.position < 0) return null;
  return state.queue[state.order[state.position]] ?? null;
}

/** The track that will play after the current one, or null at a hard end. */
export function selectNextTrack(state: PlayerState): Track | null {
  const { queue, order, position, repeat } = state;
  if (position < 0 || order.length === 0) return null;
  if (position + 1 < order.length) return queue[order[position + 1]] ?? null;
  if (repeat === "all") return queue[order[0]] ?? null;
  return null;
}
