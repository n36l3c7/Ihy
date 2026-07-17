import {
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";
import { Link } from "react-router";

import { CoverImage } from "../../components/CoverImage";
import { FavoriteButton } from "../../components/FavoriteButton";
import { formatDuration } from "../../lib/format";
import { selectCurrentTrack, usePlayerStore } from "../../stores/playerStore";
import { usePlayerAudio } from "./usePlayerAudio";

export function PlayerBar() {
  const track = usePlayerStore(selectCurrentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const shuffle = usePlayerStore((state) => state.shuffle);
  const repeat = usePlayerStore((state) => state.repeat);
  const volume = usePlayerStore((state) => state.volume);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const next = usePlayerStore((state) => state.next);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const cycleRepeat = usePlayerStore((state) => state.cycleRepeat);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const { currentTime, duration, seek, restartOrPrevious } = usePlayerAudio();

  if (!track) return null;

  const toggleClass = (active: boolean) =>
    `rounded-full p-2 transition-colors hover:text-zinc-100 ${
      active ? "text-emerald-500" : "text-zinc-400"
    }`;

  return (
    <footer className="border-t border-zinc-800 bg-zinc-900 px-4 py-3">
      <div className="flex items-center gap-4">
        <div className="flex w-64 min-w-0 items-center gap-3">
          <CoverImage albumId={track.album?.id} className="h-12 w-12 shrink-0 rounded" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-100">{track.title}</p>
            {track.artist ? (
              <Link
                to={`/artists/${track.artist.id}`}
                className="block truncate text-xs text-zinc-400 hover:text-zinc-100 hover:underline"
              >
                {track.artist.name}
              </Link>
            ) : (
              <p className="truncate text-xs text-zinc-400">Unknown artist</p>
            )}
          </div>
          <FavoriteButton trackId={track.id} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleShuffle}
              className={toggleClass(shuffle)}
              aria-label="Toggle shuffle"
            >
              <Shuffle className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={restartOrPrevious}
              className="rounded-full p-2 text-zinc-300 transition-colors hover:text-zinc-100"
              aria-label="Previous track"
            >
              <SkipBack className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className="rounded-full bg-zinc-100 p-2.5 text-zinc-900 transition-transform hover:scale-105"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 translate-x-px" />
              )}
            </button>
            <button
              type="button"
              onClick={() => next()}
              className="rounded-full p-2 text-zinc-300 transition-colors hover:text-zinc-100"
              aria-label="Next track"
            >
              <SkipForward className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={cycleRepeat}
              className={toggleClass(repeat !== "off")}
              aria-label="Cycle repeat mode"
            >
              {repeat === "one" ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex w-full max-w-xl items-center gap-2 text-xs tabular-nums text-zinc-400">
            <span className="w-10 text-right">{formatDuration(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.5}
              value={Math.min(currentTime, duration || 1)}
              onChange={(event) => seek(Number(event.target.value))}
              className="h-1 flex-1 cursor-pointer"
              aria-label="Seek"
            />
            <span className="w-10">{formatDuration(duration)}</span>
          </div>
        </div>

        <div className="flex w-40 items-center justify-end gap-2 text-zinc-400">
          <Volume2 className="h-4 w-4" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            className="h-1 w-24 cursor-pointer"
            aria-label="Volume"
          />
        </div>
      </div>
    </footer>
  );
}
