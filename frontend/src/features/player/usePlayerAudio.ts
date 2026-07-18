import { useEffect, useRef, useState } from "react";

import type { Track } from "../../api/types";
import { recordPlay } from "../../api/userLibrary";
import { useAuthStore } from "../../stores/authStore";
import { EQ_FREQUENCIES, useEqStore } from "../../stores/eqStore";
import { selectCurrentTrack, usePlayerStore } from "../../stores/playerStore";

function streamUrl(trackId: number): string {
  const token = useAuthStore.getState().accessToken ?? "";
  return `/api/v1/tracks/${trackId}/stream?token=${encodeURIComponent(token)}`;
}

function coverUrl(albumId: number): string {
  const token = useAuthStore.getState().accessToken ?? "";
  return `/api/v1/albums/${albumId}/cover?token=${encodeURIComponent(token)}`;
}

/** Owns the single <audio> element: source switching, transport sync,
 *  progress reporting and OS integration via the MediaSession API. */
export function usePlayerAudio() {
  const [audio] = useState(() => new Audio());
  const currentTrack = usePlayerStore(selectCurrentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const volume = usePlayerStore((state) => state.volume);
  const playbackRate = usePlayerStore((state) => state.playbackRate);
  const sleepEndsAt = usePlayerStore((state) => state.sleepEndsAt);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const lastRecordedRef = useRef<Track | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Equalizer: route the audio element through a chain of biquad filters
  useEffect(() => {
    const context = new AudioContext();
    const source = context.createMediaElementSource(audio);
    const filters = EQ_FREQUENCIES.map((frequency, index) => {
      const filter = context.createBiquadFilter();
      filter.type =
        index === 0 ? "lowshelf" : index === EQ_FREQUENCIES.length - 1 ? "highshelf" : "peaking";
      filter.frequency.value = frequency;
      filter.Q.value = 1;
      filter.gain.value = 0;
      return filter;
    });
    let node: AudioNode = source;
    for (const filter of filters) {
      node.connect(filter);
      node = filter;
    }
    node.connect(context.destination);
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
    };
  }, [audio]);

  // Record listening history once per playback start
  useEffect(() => {
    if (!currentTrack || lastRecordedRef.current === currentTrack) return;
    lastRecordedRef.current = currentTrack;
    void recordPlay(currentTrack.id).catch(() => {});
  }, [currentTrack]);

  // Switch source when the current track changes
  useEffect(() => {
    if (!currentTrack) {
      audio.removeAttribute("src");
      audio.load();
      setCurrentTime(0);
      setDuration(0);
      return;
    }
    audio.src = streamUrl(currentTrack.id);
    setCurrentTime(0);
    setDuration(currentTrack.duration);
    if (usePlayerStore.getState().isPlaying) {
      void audio.play().catch(() => usePlayerStore.getState().setPlaying(false));
    }
  }, [audio, currentTrack]);

  // Sync play/pause intent
  useEffect(() => {
    if (!currentTrack) return;
    if (isPlaying) {
      // Browsers keep the AudioContext suspended until a user gesture
      void audioContextRef.current?.resume().catch(() => {});
      void audio.play().catch(() => usePlayerStore.getState().setPlaying(false));
    } else {
      audio.pause();
    }
  }, [audio, isPlaying, currentTrack]);

  useEffect(() => {
    audio.volume = volume;
  }, [audio, volume]);

  useEffect(() => {
    audio.playbackRate = playbackRate;
  }, [audio, playbackRate]);

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

  // Audio element events
  useEffect(() => {
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      usePlayerStore.getState().setLastKnownTime(audio.currentTime);
    };
    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      const pending = usePlayerStore.getState().pendingSeekSeconds;
      if (pending !== null) {
        audio.currentTime = pending;
        setCurrentTime(pending);
        usePlayerStore.getState().setPendingSeekSeconds(null);
      }
    };
    const onEnded = () => {
      const { repeat, next, stopAfterTrack, setPlaying, setStopAfterTrack } =
        usePlayerStore.getState();
      if (stopAfterTrack) {
        setStopAfterTrack(false);
        setPlaying(false);
        return;
      }
      if (repeat === "one") {
        audio.currentTime = 0;
        void audio.play().catch(() => {});
      } else {
        next(true);
      }
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
    };
  }, [audio]);

  // OS media controls (hardware keys, lock screen)
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
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
  }, [currentTrack]);

  const seek = (time: number) => {
    audio.currentTime = time;
    setCurrentTime(time);
  };

  /** Restart the track when it is past 3 seconds, otherwise go to the previous one. */
  const restartOrPrevious = () => {
    if (audio.currentTime > 3) {
      seek(0);
    } else {
      usePlayerStore.getState().previous();
    }
  };

  return { currentTime, duration, seek, restartOrPrevious };
}
