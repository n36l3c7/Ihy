import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, ListPlus, Pencil, Play, SquareCheck, Volume2, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import type { Track } from "../../api/types";
import { addFavorite, addTrackToPlaylist, getPlaylists } from "../../api/userLibrary";
import { ContextMenu, contextMenuItemClass } from "../../components/ContextMenu";
import { CoverImage } from "../../components/CoverImage";
import { FavoriteButton } from "../../components/FavoriteButton";
import { artistNames, formatDuration } from "../../lib/format";
import { useAuthStore } from "../../stores/authStore";
import { selectCurrentTrack, usePlayerStore } from "../../stores/playerStore";
import { AddToPlaylistMenu, PlaylistDropdown } from "../playlists/AddToPlaylistMenu";
import { BatchTagsDialog } from "../tag-editor/BatchTagsDialog";
import { TagEditorDialog } from "../tag-editor/TagEditorDialog";

interface TrackListProps {
  tracks: Track[];
  showAlbum?: boolean;
  showCover?: boolean;
  showNumbers?: boolean;
  /** Extra per-row action rendered before the duration (e.g. remove-from-playlist). */
  trailing?: (track: Track, index: number) => ReactNode;
  /** When provided, rows become draggable and dropping calls this with the move. */
  onReorder?: (fromIndex: number, toIndex: number) => void;
}

interface MenuState {
  x: number;
  y: number;
  index: number;
}

export function TrackList({
  tracks,
  showAlbum = true,
  showCover = true,
  showNumbers = false,
  trailing,
  onReorder,
}: TrackListProps) {
  const currentTrack = usePlayerStore(selectCurrentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const playQueue = usePlayerStore((state) => state.playQueue);
  const isAdmin = useAuthStore((state) => state.user?.role === "admin");
  const queryClient = useQueryClient();

  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [batchEditTracks, setBatchEditTracks] = useState<Track[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [menu, setMenu] = useState<MenuState | null>(null);
  const lastToggledRef = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // A new list (page change, filters) resets the selection
  useEffect(() => {
    setSelected(new Set());
    setMenu(null);
    lastToggledRef.current = null;
  }, [tracks]);

  const menuPlaylists = useQuery({
    queryKey: ["playlists"],
    queryFn: getPlaylists,
    enabled: menu !== null,
  });

  const selectionActive = selected.size > 0;
  const selectedIndices = [...selected].sort((a, b) => a - b);

  const toggleSelect = (index: number, useRange: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (useRange && lastToggledRef.current !== null) {
        const from = Math.min(lastToggledRef.current, index);
        const to = Math.max(lastToggledRef.current, index);
        for (let i = from; i <= to; i++) next.add(i);
      } else if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
    lastToggledRef.current = index;
  };

  /** Right-click on a selected row targets the whole selection. */
  const targetsFor = (index: number): number[] =>
    selected.has(index) ? selectedIndices : [index];

  const addToPlaylist = async (playlistId: number, indices: number[]) => {
    for (const i of indices) {
      await addTrackToPlaylist(playlistId, tracks[i].id);
    }
    void queryClient.invalidateQueries({ queryKey: ["playlists"] });
    void queryClient.invalidateQueries({ queryKey: ["playlist", String(playlistId)] });
  };

  const likeMany = async (indices: number[]) => {
    await Promise.all(indices.map((i) => addFavorite(tracks[i].id)));
    void queryClient.invalidateQueries({ queryKey: ["favorite-ids"] });
    void queryClient.invalidateQueries({ queryKey: ["favorites"] });
  };

  const openEditorFor = (indices: number[]) => {
    if (indices.length === 1) {
      setEditingTrack(tracks[indices[0]]);
    } else {
      setBatchEditTracks(indices.map((i) => tracks[i]));
    }
  };

  if (tracks.length === 0) {
    return <p className="py-12 text-center text-zinc-500">No tracks found.</p>;
  }

  return (
    <>
      {editingTrack && (
        <TagEditorDialog track={editingTrack} onClose={() => setEditingTrack(null)} />
      )}
      {batchEditTracks && (
        <BatchTagsDialog
          tracks={batchEditTracks}
          heading={`Edit tags for ${batchEditTracks.length} tracks`}
          onClose={() => setBatchEditTracks(null)}
        />
      )}

      {selectionActive && (
        <div className="mb-2 flex flex-wrap items-center gap-3 rounded-md border border-emerald-600/40 bg-emerald-600/10 px-4 py-2 text-sm text-zinc-200">
          <span className="font-medium">{selected.size} selected</span>
          <PlaylistDropdown
            buttonContent={
              <span className="flex items-center gap-1.5">
                <ListPlus className="h-4 w-4" />
                Add to playlist
              </span>
            }
            buttonClassName="rounded-full px-3 py-1 text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
            ariaLabel="Add selection to playlist"
            onPick={(playlistId) => {
              void addToPlaylist(playlistId, selectedIndices);
              setSelected(new Set());
            }}
          />
          <button
            type="button"
            onClick={() => void likeMany(selectedIndices)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors hover:bg-zinc-800"
          >
            <Heart className="h-4 w-4" />
            Like all
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => openEditorFor(selectedIndices)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors hover:bg-zinc-800"
            >
              <Pencil className="h-4 w-4" />
              Edit tags
            </button>
          )}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
            Clear
          </button>
        </div>
      )}

      <ul className="divide-y divide-zinc-800/60">
        {tracks.map((track, index) => {
          const isCurrent = currentTrack?.id === track.id;
          const isSelected = selected.has(index);
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
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({ x: event.clientX, y: event.clientY, index });
                }}
                draggable={onReorder !== undefined}
                onDragStart={onReorder ? () => setDragIndex(index) : undefined}
                onDragOver={
                  onReorder
                    ? (event) => {
                        event.preventDefault();
                        setDropIndex(index);
                      }
                    : undefined
                }
                onDrop={
                  onReorder
                    ? (event) => {
                        event.preventDefault();
                        if (dragIndex !== null && dragIndex !== index) {
                          onReorder(dragIndex, index);
                        }
                        setDragIndex(null);
                        setDropIndex(null);
                      }
                    : undefined
                }
                onDragEnd={
                  onReorder
                    ? () => {
                        setDragIndex(null);
                        setDropIndex(null);
                      }
                    : undefined
                }
                className={`group flex w-full cursor-pointer select-none items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                  isSelected ? "bg-emerald-600/10" : "hover:bg-zinc-800/60"
                } ${
                  dropIndex === index && dragIndex !== null && dragIndex !== index
                    ? "border-t-2 border-emerald-500"
                    : ""
                } ${dragIndex === index ? "opacity-40" : ""}`}
              >
                <span
                  className={`w-5 shrink-0 ${
                    selectionActive ? "" : "opacity-0 group-hover:opacity-100"
                  }`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleSelect(index, event.shiftKey);
                    }}
                    className="cursor-pointer accent-emerald-500"
                    aria-label={`Select ${track.title}`}
                  />
                </span>
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
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditingTrack(track);
                      }}
                      className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700/50 hover:text-zinc-200"
                      aria-label="Edit tags"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
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

      {menu &&
        (() => {
          const targets = targetsFor(menu.index);
          const multi = targets.length > 1;
          const closeMenu = () => setMenu(null);
          return (
            <ContextMenu x={menu.x} y={menu.y} onClose={closeMenu}>
              <button
                type="button"
                className={contextMenuItemClass}
                onClick={() => {
                  if (multi) {
                    playQueue(targets.map((i) => tracks[i]));
                  } else {
                    playQueue(tracks, menu.index);
                  }
                  closeMenu();
                }}
              >
                <Play className="h-4 w-4" />
                {multi ? `Play ${targets.length} tracks` : "Play"}
              </button>
              <button
                type="button"
                className={contextMenuItemClass}
                onClick={() => {
                  void likeMany(targets);
                  closeMenu();
                }}
              >
                <Heart className="h-4 w-4" />
                Add to liked songs
              </button>
              {isAdmin && (
                <button
                  type="button"
                  className={contextMenuItemClass}
                  onClick={() => {
                    openEditorFor(targets);
                    closeMenu();
                  }}
                >
                  <Pencil className="h-4 w-4" />
                  {multi ? `Edit tags (${targets.length})` : "Edit tags"}
                </button>
              )}
              <button
                type="button"
                className={contextMenuItemClass}
                onClick={() => {
                  toggleSelect(menu.index, false);
                  closeMenu();
                }}
              >
                <SquareCheck className="h-4 w-4" />
                {selected.has(menu.index) ? "Deselect" : "Select"}
              </button>
              <div className="my-1 border-t border-zinc-800" />
              <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Add to playlist
              </p>
              {menuPlaylists.data?.length ? (
                menuPlaylists.data.map((playlist) => (
                  <button
                    key={playlist.id}
                    type="button"
                    className={contextMenuItemClass}
                    onClick={() => {
                      void addToPlaylist(playlist.id, targets);
                      closeMenu();
                    }}
                  >
                    <span className="truncate">{playlist.name}</span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-1.5 text-xs text-zinc-600">No playlists yet</p>
              )}
            </ContextMenu>
          );
        })()}
    </>
  );
}
