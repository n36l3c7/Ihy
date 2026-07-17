import { Play, Volume2 } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import type { Track } from "../../api/types";
import { CoverImage } from "../../components/CoverImage";
import { FavoriteButton } from "../../components/FavoriteButton";
import { artistNames, formatDuration } from "../../lib/format";
import { selectCurrentTrack, usePlayerStore } from "../../stores/playerStore";
import { AddToPlaylistMenu } from "../playlists/AddToPlaylistMenu";

interface TrackListProps {
  tracks: Track[];
  showAlbum?: boolean;
  showCover?: boolean;
  showNumbers?: boolean;
  /** Extra per-row action rendered before the duration (e.g. remove-from-playlist). */
  trailing?: (track: Track, index: number) => ReactNode;
}

export function TrackList({
  tracks,
  showAlbum = true,
  showCover = true,
  showNumbers = false,
  trailing,
}: TrackListProps) {
  const currentTrack = usePlayerStore(selectCurrentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const playQueue = usePlayerStore((state) => state.playQueue);

  if (tracks.length === 0) {
    return <p className="py-12 text-center text-zinc-500">No tracks found.</p>;
  }

  return (
    <ul className="divide-y divide-zinc-800/60">
      {tracks.map((track, index) => {
        const isCurrent = currentTrack?.id === track.id;
        return (
          <li key={`${track.id}-${index}`}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => playQueue(tracks, index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  playQueue(tracks, index);
                }
              }}
              className="group flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-zinc-800/60"
            >
              <span className="w-6 shrink-0 text-center text-sm text-zinc-500">
                {isCurrent && isPlaying ? (
                  <Volume2 className="mx-auto h-4 w-4 text-emerald-500" />
                ) : (
                  <>
                    <span className="group-hover:hidden">
                      {showNumbers ? (track.track_number ?? "–") : index + 1}
                    </span>
                    <Play className="mx-auto hidden h-4 w-4 group-hover:block" />
                  </>
                )}
              </span>
              {showCover && (
                <CoverImage albumId={track.album?.id} className="h-10 w-10 shrink-0 rounded" />
              )}
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-sm font-medium ${
                    isCurrent ? "text-emerald-500" : "text-zinc-100"
                  }`}
                >
                  {track.title}
                </span>
                <span className="block truncate text-xs text-zinc-400">
                  {artistNames(track.artists)}
                </span>
              </span>
              {showAlbum && (
                <span className="hidden w-1/4 min-w-0 md:block">
                  {track.album ? (
                    <Link
                      to={`/albums/${track.album.id}`}
                      onClick={(event) => event.stopPropagation()}
                      className="block truncate text-xs text-zinc-400 hover:text-zinc-100 hover:underline"
                    >
                      {track.album.title}
                    </Link>
                  ) : null}
                </span>
              )}
              <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <FavoriteButton trackId={track.id} />
                <AddToPlaylistMenu trackId={track.id} />
                {trailing?.(track, index)}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                {formatDuration(track.duration)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
