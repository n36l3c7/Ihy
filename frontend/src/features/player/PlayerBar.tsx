import {
  BookmarkPlus,
  Cast,
  ListOrdered,
  MicVocal,
  Moon,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersVertical,
  Volume2,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { createBookmark } from "../../api/wave3";
import { CoverImage } from "../../components/CoverImage";
import { FavoriteButton } from "../../components/FavoriteButton";
import { castStop, requestCastSession } from "../../lib/cast";
import { formatDuration } from "../../lib/format";
import { useCastStore } from "../../stores/castStore";
import { useEqStore } from "../../stores/eqStore";
import { selectCurrentTrack, usePlayerStore } from "../../stores/playerStore";
import { EqualizerDialog } from "./EqualizerDialog";
import { LyricsDialog } from "./LyricsDialog";
import { NowPlayingView } from "./NowPlayingView";
import { usePlayerAudio } from "./usePlayerAudio";

const SLEEP_OPTIONS = [15, 30, 45, 60, 90];
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const CROSSFADE_OPTIONS = [0, 3, 6, 9, 12];

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
  const queueOpen = usePlayerStore((state) => state.queueOpen);
  const toggleQueueOpen = usePlayerStore((state) => state.toggleQueueOpen);
  const crossfadeSeconds = usePlayerStore((state) => state.crossfadeSeconds);
  const setCrossfadeSeconds = usePlayerStore((state) => state.setCrossfadeSeconds);
  const normalizeVolume = usePlayerStore((state) => state.normalizeVolume);
  const setNormalizeVolume = usePlayerStore((state) => state.setNormalizeVolume);
  const autoplayRadio = usePlayerStore((state) => state.autoplayRadio);
  const setAutoplayRadio = usePlayerStore((state) => state.setAutoplayRadio);
  const streamQuality = usePlayerStore((state) => state.streamQuality);
  const setStreamQuality = usePlayerStore((state) => state.setStreamQuality);
  const { currentTime, duration, seek, restartOrPrevious } = usePlayerAudio();
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [eqOpen, setEqOpen] = useState(false);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const eqEnabled = useEqStore((state) => state.enabled);
  const syncRole = usePlayerStore((state) => state.syncRole);
  const takeOver = usePlayerStore((state) => state.takeOver);
  const castAvailable = useCastStore((state) => state.available);
  const castConnected = useCastStore((state) => state.connected);
  const castDeviceName = useCastStore((state) => state.deviceName);

  if (!track) return null;

  const handleBookmark = () => {
    const note = window.prompt(
      `Bookmark "${track.title}" at ${formatDuration(currentTime)} — note (optional):`,
    );
    if (note === null) return; // cancelled
    void createBookmark(track.id, currentTime, note.trim() || undefined);
  };

  const sleepActive = sleepEndsAt !== null || stopAfterTrack;
  const sleepRemaining =
    sleepEndsAt !== null ? Math.max(0, Math.round((sleepEndsAt - Date.now()) / 60000)) : null;

  const toggleClass = (active: boolean) =>
    `rounded-full p-2 transition-colors hover:text-zinc-100 ${
      active ? "text-emerald-500" : "text-zinc-400"
    }`;

  return (
    <footer className="relative border-t border-zinc-800 bg-zinc-900 px-4 py-3">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-zinc-800 md:hidden">
        <div
          className="h-full bg-emerald-500"
          style={{ width: `${duration ? Math.min(100, (currentTime / duration) * 100) : 0}%` }}
        />
      </div>
      {castConnected && (
        <div className="mb-2 flex items-center justify-center gap-3 rounded-md bg-emerald-600/10 py-1 text-xs text-emerald-400">
          Playing on {castDeviceName ?? "Chromecast"}
          <button
            type="button"
            onClick={castStop}
            className="rounded-full border border-emerald-600/50 px-3 py-0.5 font-medium transition-colors hover:bg-emerald-600/20"
          >
            Stop casting
          </button>
        </div>
      )}
      {syncRole === "remote" && (
        <div className="mb-2 flex items-center justify-center gap-3 rounded-md bg-emerald-600/10 py-1 text-xs text-emerald-400">
          Playing in another tab — this tab is a remote control
          <button
            type="button"
            onClick={takeOver}
            className="rounded-full border border-emerald-600/50 px-3 py-0.5 font-medium transition-colors hover:bg-emerald-600/20"
          >
            Play here
          </button>
        </div>
      )}
      <div className="flex items-center gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3 md:w-64 md:flex-none">
          <button
            type="button"
            onClick={() => setNowPlayingOpen(true)}
            className="shrink-0 transition-transform hover:scale-105"
            aria-label="Open now playing view"
            title="Now playing"
          >
            <CoverImage albumId={track.album?.id} className="h-12 w-12 rounded" />
          </button>
          <div
            className="min-w-0 flex-1 md:flex-none"
            onClick={(event) => {
              // On mobile the whole label opens Now Playing (artist links excluded)
              if (window.innerWidth < 768 && (event.target as HTMLElement).tagName !== "A") {
                setNowPlayingOpen(true);
              }
            }}
          >
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
          <span className="hidden md:block">
            <FavoriteButton trackId={track.id} />
          </span>
          <div className="flex shrink-0 items-center gap-1 md:hidden">
            <button
              type="button"
              onClick={togglePlay}
              className="rounded-full bg-zinc-100 p-2 text-zinc-900"
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
              className="rounded-full p-2 text-zinc-300"
              aria-label="Next track"
            >
              <SkipForward className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="hidden min-w-0 flex-1 flex-col items-center gap-1 md:flex">
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

        <div className="hidden w-64 items-center justify-end gap-1 text-zinc-400 md:flex">
          <BarMenu
            trigger={<span className="text-xs font-semibold tabular-nums">{playbackRate}x</span>}
            ariaLabel="Playback settings"
            active={playbackRate !== 1 || crossfadeSeconds > 0 || normalizeVolume || autoplayRadio}
          >
            {(close) => (
              <>
                <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Speed
                </p>
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
                <p className="border-t border-zinc-800 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Crossfade
                </p>
                {CROSSFADE_OPTIONS.map((seconds) => (
                  <button
                    key={seconds}
                    type="button"
                    className={barMenuItemClass}
                    onClick={() => setCrossfadeSeconds(seconds)}
                  >
                    {seconds === 0 ? "Off (gapless)" : `${seconds} seconds`}
                    {seconds === crossfadeSeconds && <span className="text-emerald-500">●</span>}
                  </button>
                ))}
                <p className="border-t border-zinc-800 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Quality
                </p>
                {[
                  { id: "original", label: "Original" },
                  { id: "192", label: "High (Opus 192k)" },
                  { id: "128", label: "Normal (Opus 128k)" },
                  { id: "96", label: "Data saver (Opus 96k)" },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={barMenuItemClass}
                    onClick={() => setStreamQuality(option.id)}
                  >
                    {option.label}
                    {option.id === streamQuality && <span className="text-emerald-500">●</span>}
                  </button>
                ))}
                <div className="border-t border-zinc-800">
                  <button
                    type="button"
                    className={barMenuItemClass}
                    onClick={() => setNormalizeVolume(!normalizeVolume)}
                  >
                    Normalize volume
                    {normalizeVolume && <span className="text-emerald-500">●</span>}
                  </button>
                  <button
                    type="button"
                    className={barMenuItemClass}
                    onClick={() => setAutoplayRadio(!autoplayRadio)}
                  >
                    Autoplay similar
                    {autoplayRadio && <span className="text-emerald-500">●</span>}
                  </button>
                </div>
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
            onClick={handleBookmark}
            className="rounded-full p-2 transition-colors hover:text-zinc-100"
            aria-label="Bookmark current position"
            title="Bookmark current position"
          >
            <BookmarkPlus className="h-4 w-4" />
          </button>
          {castAvailable && (
            <button
              type="button"
              onClick={() => (castConnected ? castStop() : requestCastSession())}
              className={`rounded-full p-2 transition-colors hover:text-zinc-100 ${
                castConnected ? "text-emerald-500" : ""
              }`}
              aria-label={castConnected ? "Stop casting" : "Cast to device"}
              title={castConnected ? `Casting to ${castDeviceName ?? "device"}` : "Cast"}
            >
              <Cast className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setEqOpen(true)}
            className={`rounded-full p-2 transition-colors hover:text-zinc-100 ${
              eqEnabled ? "text-emerald-500" : ""
            }`}
            aria-label="Equalizer"
          >
            <SlidersVertical className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setLyricsOpen(true)}
            className="rounded-full p-2 transition-colors hover:text-zinc-100"
            aria-label="Show lyrics"
          >
            <MicVocal className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleQueueOpen}
            className={`rounded-full p-2 transition-colors hover:text-zinc-100 ${
              queueOpen ? "text-emerald-500" : ""
            }`}
            aria-label="Toggle queue panel"
          >
            <ListOrdered className="h-4 w-4" />
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
      {eqOpen && <EqualizerDialog onClose={() => setEqOpen(false)} />}
      {nowPlayingOpen && (
        <NowPlayingView
          track={track}
          currentTime={currentTime}
          duration={duration}
          seek={seek}
          restartOrPrevious={restartOrPrevious}
          onClose={() => setNowPlayingOpen(false)}
        />
      )}
    </footer>
  );
}
