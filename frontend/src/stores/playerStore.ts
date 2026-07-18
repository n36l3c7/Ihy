import { create } from "zustand";

import type { Track } from "../api/types";

export type RepeatMode = "off" | "all" | "one";

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
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
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

  playQueue: (tracks, startIndex = 0) => {
    if (tracks.length === 0) return;
    const { shuffle } = get();
    const order = shuffle
      ? shuffledOrder(tracks.length, startIndex)
      : tracks.map((_, index) => index);
    set({ queue: tracks, order, position: shuffle ? 0 : startIndex, isPlaying: true });
  },

  togglePlay: () => {
    if (get().position >= 0) set((state) => ({ isPlaying: !state.isPlaying }));
  },

  setPlaying: (isPlaying) => set({ isPlaying }),

  next: (fromEnded = false) => {
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
    const { position } = get();
    if (position > 0) set({ position: position - 1, isPlaying: true });
  },

  toggleShuffle: () => {
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

  cycleRepeat: () =>
    set((state) => ({
      repeat: state.repeat === "off" ? "all" : state.repeat === "all" ? "one" : "off",
    })),

  setVolume: (volume) => set({ volume }),

  setPlaybackRate: (playbackRate) => set({ playbackRate }),

  setSleepEndsAt: (sleepEndsAt) => set({ sleepEndsAt, stopAfterTrack: false }),

  setStopAfterTrack: (stopAfterTrack) => set({ stopAfterTrack, sleepEndsAt: null }),
}));

export function selectCurrentTrack(state: PlayerState): Track | null {
  if (state.position < 0) return null;
  return state.queue[state.order[state.position]] ?? null;
}
