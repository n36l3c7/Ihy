import { useEffect, useRef, useState } from "react";

import type { Track } from "../../api/types";
import { recordPlay } from "../../api/userLibrary";
import { useAuthStore } from "../../stores/authStore";
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
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const lastRecordedRef = useRef<Track | null>(null);

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
      void audio.play().catch(() => usePlayerStore.getState().setPlaying(false));
    } else {
      audio.pause();
    }
  }, [audio, isPlaying, currentTrack]);

  useEffect(() => {
    audio.volume = volume;
  }, [audio, volume]);

  // Audio element events
  useEffect(() => {
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      const { repeat, next } = usePlayerStore.getState();
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
        artist: currentTrack.artist?.name ?? "",
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
