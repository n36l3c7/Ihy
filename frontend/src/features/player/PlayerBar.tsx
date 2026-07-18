import {
  MicVocal,
  Moon,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { CoverImage } from "../../components/CoverImage";
import { FavoriteButton } from "../../components/FavoriteButton";
import { formatDuration } from "../../lib/format";
import { selectCurrentTrack, usePlayerStore } from "../../stores/playerStore";
import { LyricsDialog } from "./LyricsDialog";
import { usePlayerAudio } from "./usePlayerAudio";

const SLEEP_OPTIONS = [15, 30, 45, 60, 90];
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Tiny upward dropdown for the player bar. */
function BarMenu({
  trigger,
  ariaLabel,
  active,
  children,
}: {
  trigger: ReactNode;
  ariaLabel: string;
  active?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`rounded-full p-2 transition-colors hover:text-zinc-100 ${
          active ? "text-emerald-500" : "text-zinc-400"
        }`}
        aria-label={ariaLabel}
      >
        {trigger}
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-30 mb-2 w-44 rounded-md border border-zinc-800 bg-zinc-900 py-1 shadow-2xl">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

const barMenuItemClass =
  "flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800";

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
  const playbackRate = usePlayerStore((state) => state.playbackRate);
  const setPlaybackRate = usePlayerStore((state) => state.setPlaybackRate);
  const sleepEndsAt = usePlayerStore((state) => state.sleepEndsAt);
  const setSleepEndsAt = usePlayerStore((state) => state.setSleepEndsAt);
  const stopAfterTrack = usePlayerStore((state) => state.stopAfterTrack);
  const setStopAfterTrack = usePlayerStore((state) => state.setStopAfterTrack);
  const { currentTime, duration, seek, restartOrPrevious } = usePlayerAudio();
  const [lyricsOpen, setLyricsOpen] = useState(false);

  if (!track) return null;

  const sleepActive = sleepEndsAt !== null || stopAfterTrack;
  const sleepRemaining =
    sleepEndsAt !== null ? Math.max(0, Math.round((sleepEndsAt - Date.now()) / 60000)) : null;

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
            <p className="truncate text-xs text-zinc-400">
              {track.artists.length > 0
                ? track.artists.map((artist, index) => (
                    <span key={artist.id}>
                      {index > 0 && ", "}
                      <Link
                        to={`/artists/${artist.id}`}
                        className="hover:text-zinc-100 hover:underline"
                      >
                        {artist.name}
                      </Link>
                    </span>
                  ))
                : "Unknown artist"}
            </p>
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

        <div className="flex w-64 items-center justify-end gap-1 text-zinc-400">
          <BarMenu
            trigger={<span className="text-xs font-semibold tabular-nums">{playbackRate}x</span>}
            ariaLabel="Playback speed"
            active={playbackRate !== 1}
          >
            {(close) => (
              <>
                {SPEED_OPTIONS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    className={barMenuItemClass}
                    onClick={() => {
                      setPlaybackRate(speed);
                      close();
                    }}
                  >
                    {speed}x{speed === playbackRate && <span className="text-emerald-500">●</span>}
                  </button>
                ))}
              </>
            )}
          </BarMenu>
          <BarMenu
            trigger={<Moon className="h-4 w-4" />}
            ariaLabel="Sleep timer"
            active={sleepActive}
          >
            {(close) => (
              <>
                <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Sleep timer
                  {sleepRemaining !== null && ` — ${sleepRemaining} min left`}
                </p>
                {SLEEP_OPTIONS.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    className={barMenuItemClass}
                    onClick={() => {
                      setSleepEndsAt(Date.now() + minutes * 60000);
                      close();
                    }}
                  >
                    In {minutes} minutes
                  </button>
                ))}
                <button
                  type="button"
                  className={barMenuItemClass}
                  onClick={() => {
                    setStopAfterTrack(true);
                    close();
                  }}
                >
                  End of this track
                  {stopAfterTrack && <span className="text-emerald-500">●</span>}
                </button>
                {sleepActive && (
                  <button
                    type="button"
                    className={`${barMenuItemClass} text-zinc-400`}
                    onClick={() => {
                      setSleepEndsAt(null);
                      close();
                    }}
                  >
                    Turn off
                  </button>
                )}
              </>
            )}
          </BarMenu>
          <button
            type="button"
            onClick={() => setLyricsOpen(true)}
            className="rounded-full p-2 transition-colors hover:text-zinc-100"
            aria-label="Show lyrics"
          >
            <MicVocal className="h-4 w-4" />
          </button>
          <Volume2 className="ml-1 h-4 w-4" />
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
      {lyricsOpen && (
        <LyricsDialog
          track={track}
          currentTime={currentTime}
          onSeek={seek}
          onClose={() => setLyricsOpen(false)}
        />
      )}
    </footer>
  );
}
