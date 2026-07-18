import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router";

import type { Track } from "../../api/types";
import { getLyrics } from "../../api/userLibrary";
import { CoverImage } from "../../components/CoverImage";
import { FavoriteButton } from "../../components/FavoriteButton";
import { RatingStars } from "../../components/RatingStars";
import { Visualizer } from "../../components/Visualizer";
import { WaveformSeekbar } from "../../components/WaveformSeekbar";
import { useImageColor } from "../../hooks/useImageColor";
import { formatDuration } from "../../lib/format";
import { activeLrcIndex, parseLrc } from "../../lib/lrc";
import { albumCoverUrl } from "../../lib/mediaUrls";
import { usePlayerStore } from "../../stores/playerStore";

interface NowPlayingViewProps {
  track: Track;
  currentTime: number;
  duration: number;
  seek: (time: number) => void;
  restartOrPrevious: () => void;
  onClose: () => void;
}

/** Fullscreen "Now Playing": big artwork on a cover-tinted background,
 *  transport controls and live karaoke lyrics beside it. */
export function NowPlayingView({
  track,
  currentTime,
  duration,
  seek,
  restartOrPrevious,
  onClose,
}: NowPlayingViewProps) {
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const shuffle = usePlayerStore((state) => state.shuffle);
  const repeat = usePlayerStore((state) => state.repeat);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const next = usePlayerStore((state) => state.next);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const cycleRepeat = usePlayerStore((state) => state.cycleRepeat);

  const color = useImageColor(track.album ? albumCoverUrl(track.album.id) : null);
  const activeLineRef = useRef<HTMLButtonElement>(null);

  const lyrics = useQuery({
    queryKey: ["lyrics", track.id],
    queryFn: () => getLyrics(track.id),
    staleTime: Infinity,
  });
  const syncedLines = useMemo(
    () => (lyrics.data?.synced_content ? parseLrc(lyrics.data.synced_content) : []),
    [lyrics.data?.synced_content],
  );
  const activeIndex = activeLrcIndex(syncedLines, currentTime);

  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const toggleClass = (active: boolean) =>
    `rounded-full p-2 transition-colors hover:text-zinc-100 ${
      active ? "text-emerald-500" : "text-zinc-400"
    }`;

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-zinc-950"
      style={{
        background: color
          ? `linear-gradient(to bottom, ${color}, var(--color-zinc-950) 70%)`
          : undefined,
      }}
    >
      <div className="flex justify-end p-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-zinc-100"
          aria-label="Close now playing"
        >
          <ChevronDown className="h-6 w-6" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-8 px-4 pb-4 sm:px-8 lg:gap-12">
        <div className="flex max-w-md flex-col items-center gap-6">
          <CoverImage
            albumId={track.album?.id}
            className="aspect-square w-full max-w-[42vh] rounded-xl shadow-2xl"
          />
          <div className="w-full text-center">
            <p className="truncate text-2xl font-bold text-zinc-100">{track.title}</p>
            <div className="mt-1 flex justify-center">
              <RatingStars trackId={track.id} />
            </div>
            <p className="mt-1 truncate text-sm text-zinc-300">
              {track.artists.map((artist, index) => (
                <span key={artist.id}>
                  {index > 0 && ", "}
                  <Link
                    to={`/artists/${artist.id}`}
                    onClick={onClose}
                    className="hover:underline"
                  >
                    {artist.name}
                  </Link>
                </span>
              ))}
            </p>
          </div>
        </div>

        {syncedLines.length > 0 && (
          <div className="hidden max-h-[60vh] w-96 overflow-y-auto lg:block">
            {syncedLines.map((line, index) => (
              <button
                key={`${line.time}-${index}`}
                ref={index === activeIndex ? activeLineRef : undefined}
                type="button"
                onClick={() => seek(line.time)}
                className={`block w-full py-1.5 text-left text-lg font-medium leading-7 transition-colors ${
                  index === activeIndex
                    ? "text-zinc-100"
                    : index < activeIndex
                      ? "text-zinc-600"
                      : "text-zinc-400/80"
                } hover:text-zinc-100`}
              >
                {line.text}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-2xl px-4 pb-8 sm:px-8 sm:pb-10">
        <Visualizer className="mb-2 h-14 w-full opacity-60" />
        <div className="flex items-center gap-2 text-xs tabular-nums text-zinc-400">
          <span className="w-10 text-right">{formatDuration(currentTime)}</span>
          <div className="min-w-0 flex-1">
            <WaveformSeekbar
              trackId={track.id}
              currentTime={currentTime}
              duration={duration}
              onSeek={seek}
              height={36}
            />
          </div>
          <span className="w-10">{formatDuration(duration)}</span>
        </div>
        <div className="mt-3 flex items-center justify-center gap-3">
          <FavoriteButton trackId={track.id} />
          <button
            type="button"
            onClick={toggleShuffle}
            className={toggleClass(shuffle)}
            aria-label="Toggle shuffle"
          >
            <Shuffle className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={restartOrPrevious}
            className="rounded-full p-2 text-zinc-300 transition-colors hover:text-zinc-100"
            aria-label="Previous track"
          >
            <SkipBack className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            className="rounded-full bg-zinc-100 p-4 text-zinc-900 transition-transform hover:scale-105"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 translate-x-px" />}
          </button>
          <button
            type="button"
            onClick={() => next()}
            className="rounded-full p-2 text-zinc-300 transition-colors hover:text-zinc-100"
            aria-label="Next track"
          >
            <SkipForward className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={cycleRepeat}
            className={toggleClass(repeat !== "off")}
            aria-label="Cycle repeat mode"
          >
            {repeat === "one" ? <Repeat1 className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
