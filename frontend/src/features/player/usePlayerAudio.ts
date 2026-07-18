import { useEffect, useRef, useState } from "react";

import { getRadioTracks } from "../../api/catalog";
import type { Track } from "../../api/types";
import { recordPlay } from "../../api/userLibrary";
import { sendCommand } from "../../lib/syncBus";
import { useAuthStore } from "../../stores/authStore";
import { EQ_FREQUENCIES, useEqStore } from "../../stores/eqStore";
import {
  selectCurrentTrack,
  selectNextTrack,
  usePlayerStore,
} from "../../stores/playerStore";

const PRELOAD_AHEAD_SECONDS = 20;

function streamUrl(trackId: number): string {
  const token = useAuthStore.getState().accessToken ?? "";
  const quality = usePlayerStore.getState().streamQuality;
  const transcode =
    quality !== "original" ? `&format=opus&bitrate=${encodeURIComponent(quality)}` : "";
  return `/api/v1/tracks/${trackId}/stream?token=${encodeURIComponent(token)}${transcode}`;
}

function coverUrl(albumId: number): string {
  const token = useAuthStore.getState().accessToken ?? "";
  return `/api/v1/albums/${albumId}/cover?token=${encodeURIComponent(token)}`;
}

/** Linear gain for a track: ReplayGain dB → factor, clamped to sane bounds. */
function trackGain(track: Track | null): number {
  const { normalizeVolume } = usePlayerStore.getState();
  if (!normalizeVolume || track?.replay_gain == null) return 1;
  return Math.min(3, Math.max(0.1, 10 ** (track.replay_gain / 20)));
}

/** Owns two <audio> elements for gapless/crossfaded playback: the active one
 *  is audible, the other preloads the next track. Both feed the shared EQ
 *  chain through per-element gain nodes (crossfade + ReplayGain). */
export function usePlayerAudio() {
  const [elements] = useState<[HTMLAudioElement, HTMLAudioElement]>(() => [
    new Audio(),
    new Audio(),
  ]);
  const currentTrack = usePlayerStore(selectCurrentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const volume = usePlayerStore((state) => state.volume);
  const playbackRate = usePlayerStore((state) => state.playbackRate);
  const sleepEndsAt = usePlayerStore((state) => state.sleepEndsAt);
  const syncRole = usePlayerStore((state) => state.syncRole);
  const isRemote = syncRole === "remote";
  const lastKnownTime = usePlayerStore((state) => state.lastKnownTime);
  const remoteSeekRequest = usePlayerStore((state) => state.remoteSeekRequest);
  const normalizeVolume = usePlayerStore((state) => state.normalizeVolume);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const lastRecordedRef = useRef<Track | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainsRef = useRef<[GainNode | null, GainNode | null]>([null, null]);
  const activeIndexRef = useRef(0);
  const loadedIdsRef = useRef<[number | null, number | null]>([null, null]);
  const fadingRef = useRef(false);
  const swappedRef = useRef(false); // next track change is a preloaded swap

  const active = () => elements[activeIndexRef.current];

  /** Silence and unload one element. */
  const resetElement = (index: number) => {
    const element = elements[index];
    element.pause();
    element.removeAttribute("src");
    element.load();
    loadedIdsRef.current[index] = null;
  };

  // EQ chain shared by both elements; per-element gain sits before it
  useEffect(() => {
    const context = new AudioContext();
    const filters = EQ_FREQUENCIES.map((frequency, index) => {
      const filter = context.createBiquadFilter();
      filter.type =
        index === 0 ? "lowshelf" : index === EQ_FREQUENCIES.length - 1 ? "highshelf" : "peaking";
      filter.frequency.value = frequency;
      filter.Q.value = 1;
      filter.gain.value = 0;
      return filter;
    });
    for (let i = 1; i < filters.length; i++) filters[i - 1].connect(filters[i]);
    filters[filters.length - 1].connect(context.destination);

    elements.forEach((element, index) => {
      const source = context.createMediaElementSource(element);
      const gain = context.createGain();
      gain.gain.value = index === 0 ? 1 : 0;
      source.connect(gain);
      gain.connect(filters[0]);
      gainsRef.current[index] = gain;
    });
    audioContextRef.current = context;

    const apply = () => {
      const { enabled, gains } = useEqStore.getState();
      filters.forEach((filter, index) => {
        filter.gain.value = enabled ? (gains[index] ?? 0) : 0;
      });
    };
    apply();
    const unsubscribe = useEqStore.subscribe(apply);
    return () => {
      unsubscribe();
      void context.close();
      audioContextRef.current = null;
      gainsRef.current = [null, null];
    };
  }, [elements]);

  // Record listening history once per playback start (leader only)
  useEffect(() => {
    if (isRemote || !currentTrack || lastRecordedRef.current === currentTrack) return;
    lastRecordedRef.current = currentTrack;
    void recordPlay(currentTrack.id).catch(() => {});
  }, [currentTrack, isRemote]);

  // Remote tabs mirror state but never touch the audio elements
  useEffect(() => {
    if (isRemote) {
      resetElement(0);
      resetElement(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRemote]);

  // Seek requested from a remote tab (leader executes it)
  useEffect(() => {
    if (isRemote || remoteSeekRequest === null) return;
    active().currentTime = remoteSeekRequest;
    setCurrentTime(remoteSeekRequest);
    usePlayerStore.setState({ remoteSeekRequest: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRemote, remoteSeekRequest]);

  // Switch source when the current track changes. A gapless/crossfade swap
  // has already loaded and started the right element — leave it alone.
  useEffect(() => {
    if (isRemote) return;
    if (!currentTrack) {
      resetElement(0);
      resetElement(1);
      setCurrentTime(0);
      setDuration(0);
      return;
    }
    const activeIndex = activeIndexRef.current;
    if (swappedRef.current && loadedIdsRef.current[activeIndex] === currentTrack.id) {
      swappedRef.current = false;
      setCurrentTime(active().currentTime);
      setDuration(currentTrack.duration);
      return;
    }
    swappedRef.current = false;
    fadingRef.current = false;
    // Hard switch: cancel ramps, mute the other element, load into active
    const context = audioContextRef.current;
    const [gainA, gainB] = gainsRef.current;
    if (context && gainA && gainB) {
      const activeGain = activeIndex === 0 ? gainA : gainB;
      const otherGain = activeIndex === 0 ? gainB : gainA;
      activeGain.gain.cancelScheduledValues(context.currentTime);
      otherGain.gain.cancelScheduledValues(context.currentTime);
      activeGain.gain.value = trackGain(currentTrack);
      otherGain.gain.value = 0;
    }
    resetElement(1 - activeIndex);
    const element = active();
    element.src = streamUrl(currentTrack.id);
    loadedIdsRef.current[activeIndex] = currentTrack.id;
    setCurrentTime(0);
    setDuration(currentTrack.duration);
    if (usePlayerStore.getState().isPlaying) {
      void element.play().catch(() => usePlayerStore.getState().setPlaying(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack, isRemote]);

  // Re-apply normalization gain when the toggle changes
  useEffect(() => {
    const gain = gainsRef.current[activeIndexRef.current];
    const context = audioContextRef.current;
    if (gain && context && !fadingRef.current) {
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.value = trackGain(currentTrack);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizeVolume]);

  // Sync play/pause intent
  useEffect(() => {
    if (isRemote || !currentTrack) return;
    if (isPlaying) {
      // Browsers keep the AudioContext suspended until a user gesture
      void audioContextRef.current?.resume().catch(() => {});
      void active()
        .play()
        .catch(() => usePlayerStore.getState().setPlaying(false));
    } else {
      active().pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentTrack, isRemote]);

  useEffect(() => {
    elements.forEach((element) => {
      element.volume = volume;
    });
  }, [elements, volume]);

  useEffect(() => {
    elements.forEach((element) => {
      element.playbackRate = playbackRate;
    });
  }, [elements, playbackRate]);

  // Sleep timer: pause when the deadline passes
  useEffect(() => {
    if (sleepEndsAt === null) return;
    const check = () => {
      if (Date.now() >= sleepEndsAt) {
        usePlayerStore.getState().setPlaying(false);
        usePlayerStore.getState().setSleepEndsAt(null);
      }
    };
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [sleepEndsAt]);

  /** Start the preloaded element and advance the store without a reload. */
  const swapToPreloaded = (fadeSeconds: number) => {
    const oldIndex = activeIndexRef.current;
    const newIndex = 1 - oldIndex;
    const context = audioContextRef.current;
    const oldGain = gainsRef.current[oldIndex];
    const newGain = gainsRef.current[newIndex];
    const store = usePlayerStore.getState();
    const nextTrack = selectNextTrack(store);
    if (!context || !oldGain || !newGain || !nextTrack) return false;

    const now = context.currentTime;
    const target = trackGain(nextTrack);
    newGain.gain.cancelScheduledValues(now);
    oldGain.gain.cancelScheduledValues(now);
    if (fadeSeconds > 0) {
      fadingRef.current = true;
      newGain.gain.setValueAtTime(0, now);
      newGain.gain.linearRampToValueAtTime(target, now + fadeSeconds);
      oldGain.gain.setValueAtTime(oldGain.gain.value, now);
      oldGain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
    } else {
      newGain.gain.value = target;
      oldGain.gain.value = 0;
    }
    activeIndexRef.current = newIndex;
    void elements[newIndex].play().catch(() => {});
    const cleanupDelay = fadeSeconds > 0 ? fadeSeconds * 1000 + 250 : 0;
    setTimeout(() => {
      if (activeIndexRef.current !== oldIndex) resetElement(oldIndex);
      fadingRef.current = false;
    }, cleanupDelay);
    swappedRef.current = true;
    store.next(true);
    return true;
  };

  // Audio element events (both elements; most only react to the active one)
  useEffect(() => {
    const onTimeUpdate = (event: Event) => {
      const element = active();
      if (event.target !== element) return;
      setCurrentTime(element.currentTime);
      usePlayerStore.getState().setLastKnownTime(element.currentTime);

      const store = usePlayerStore.getState();
      if (store.syncRole === "remote" || !element.duration) return;
      const remaining = element.duration - element.currentTime;
      const nextTrack = selectNextTrack(store);
      const inactiveIndex = 1 - activeIndexRef.current;

      // Preload the next track into the idle element shortly before the end
      if (
        nextTrack &&
        nextTrack.id !== loadedIdsRef.current[inactiveIndex] &&
        remaining < PRELOAD_AHEAD_SECONDS &&
        store.repeat !== "one" &&
        !store.stopAfterTrack
      ) {
        const idle = elements[inactiveIndex];
        idle.preload = "auto";
        idle.src = streamUrl(nextTrack.id);
        idle.load();
        loadedIdsRef.current[inactiveIndex] = nextTrack.id;
      }

      // Crossfade: start the next track while this one fades out
      if (
        store.crossfadeSeconds > 0 &&
        !fadingRef.current &&
        store.isPlaying &&
        nextTrack &&
        loadedIdsRef.current[inactiveIndex] === nextTrack.id &&
        remaining <= store.crossfadeSeconds &&
        remaining > 0.1 &&
        store.repeat !== "one" &&
        !store.stopAfterTrack
      ) {
        swapToPreloaded(Math.min(store.crossfadeSeconds, remaining));
      }
    };
    const onLoadedMetadata = (event: Event) => {
      const element = active();
      if (event.target !== element) return;
      setDuration(element.duration || 0);
      const pending = usePlayerStore.getState().pendingSeekSeconds;
      if (pending !== null) {
        element.currentTime = pending;
        setCurrentTime(pending);
        usePlayerStore.getState().setPendingSeekSeconds(null);
      }
    };
    const onEnded = (event: Event) => {
      if (event.target !== active()) return; // fading-out element finished
      const store = usePlayerStore.getState();
      if (store.stopAfterTrack) {
        store.setStopAfterTrack(false);
        store.setPlaying(false);
        return;
      }
      if (store.repeat === "one") {
        const element = active();
        element.currentTime = 0;
        void element.play().catch(() => {});
        return;
      }
      const nextTrack = selectNextTrack(store);
      const inactiveIndex = 1 - activeIndexRef.current;
      if (nextTrack && loadedIdsRef.current[inactiveIndex] === nextTrack.id) {
        swapToPreloaded(0); // gapless handoff to the preloaded element
      } else if (!nextTrack && store.autoplayRadio && store.repeat === "off") {
        // Queue ended: fetch similar tracks and keep playing
        const seed = selectCurrentTrack(store);
        if (!seed) {
          store.next(true);
          return;
        }
        void getRadioTracks(seed.id, store.queue.map((track) => track.id))
          .then((tracks) => {
            const state = usePlayerStore.getState();
            if (tracks.length > 0) {
              state.enqueueEnd(tracks);
              usePlayerStore.getState().next(true);
            } else {
              state.next(true);
            }
          })
          .catch(() => usePlayerStore.getState().next(true));
      } else {
        store.next(true);
      }
    };
    for (const element of elements) {
      element.addEventListener("timeupdate", onTimeUpdate);
      element.addEventListener("loadedmetadata", onLoadedMetadata);
      element.addEventListener("ended", onEnded);
    }
    return () => {
      for (const element of elements) {
        element.removeEventListener("timeupdate", onTimeUpdate);
        element.removeEventListener("loadedmetadata", onLoadedMetadata);
        element.removeEventListener("ended", onEnded);
        element.pause();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements]);

  // OS media controls (hardware keys, lock screen) — leader tab only
  useEffect(() => {
    if (isRemote || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    if (currentTrack) {
      session.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artists.map((artist) => artist.name).join(", "),
        album: currentTrack.album?.title ?? "",
        artwork: currentTrack.album ? [{ src: coverUrl(currentTrack.album.id) }] : [],
      });
    }
    session.setActionHandler("play", () => usePlayerStore.getState().setPlaying(true));
    session.setActionHandler("pause", () => usePlayerStore.getState().setPlaying(false));
    session.setActionHandler("previoustrack", () => usePlayerStore.getState().previous());
    session.setActionHandler("nexttrack", () => usePlayerStore.getState().next());
  }, [currentTrack, isRemote]);

  const seek = (time: number) => {
    if (isRemote) {
      sendCommand("seek", time);
      return;
    }
    active().currentTime = time;
    setCurrentTime(time);
  };

  /** Restart the track when it is past 3 seconds, otherwise go to the previous one. */
  const restartOrPrevious = () => {
    const effective = isRemote ? lastKnownTime : active().currentTime;
    if (effective > 3) {
      seek(0);
    } else {
      usePlayerStore.getState().previous();
    }
  };

  return {
    currentTime: isRemote ? lastKnownTime : currentTime,
    duration: isRemote ? (currentTrack?.duration ?? 0) : duration,
    seek,
    restartOrPrevious,
  };
}
