import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, ListPlus, Play, Radio } from "lucide-react";
import { useState } from "react";

import { getRadioTracks } from "../api/catalog";
import type { Track } from "../api/types";
import { addFavorite, addTrackToPlaylist, getPlaylists } from "../api/userLibrary";
import { artistNames } from "../lib/format";
import { usePlayerStore } from "../stores/playerStore";
import { CardPlayButton } from "./CardPlayButton";
import { ContextMenu, contextMenuItemClass } from "./ContextMenu";
import { CoverImage } from "./CoverImage";

interface TrackCardProps {
  track: Track;
  /** The full list this card plays into, and the track's index in it. */
  tracks: Track[];
  index: number;
}

/** Compact track card for horizontal shelves (Home / Explore), with the
 *  same right-click menu available everywhere else in the app. */
export function TrackCard({ track, tracks, index }: TrackCardProps) {
  const queryClient = useQueryClient();
  const playQueue = usePlayerStore((state) => state.playQueue);
  const enqueueNext = usePlayerStore((state) => state.enqueueNext);
  const enqueueEnd = usePlayerStore((state) => state.enqueueEnd);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const menuPlaylists = useQuery({
    queryKey: ["playlists"],
    queryFn: getPlaylists,
    enabled: menu !== null,
  });

  const likeMutation = useMutation({
    mutationFn: () => addFavorite(track.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["favorite-ids"] });
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  const openMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY });
  };
  const closeMenu = () => setMenu(null);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => playQueue(tracks, index)}
        onContextMenu={openMenu}
        className="group w-40 shrink-0 rounded-lg p-3 text-left transition-colors hover:bg-zinc-900"
      >
        <div className="relative">
          <CoverImage albumId={track.album?.id} className="aspect-square w-full rounded-md" />
          <CardPlayButton onPlay={() => playQueue(tracks, index)} />
        </div>
        <p className="mt-2 truncate text-sm font-medium text-zinc-100">{track.title}</p>
        <p className="truncate text-xs text-zinc-500">{artistNames(track.artists)}</p>
      </button>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={closeMenu}>
          <button
            type="button"
            className={contextMenuItemClass}
            onClick={() => {
              playQueue(tracks, index);
              closeMenu();
            }}
          >
            <Play className="h-4 w-4" />
            Play
          </button>
          <button
            type="button"
            className={contextMenuItemClass}
            onClick={() => {
              enqueueNext([track]);
              closeMenu();
            }}
          >
            <Play className="h-4 w-4" />
            Play next
          </button>
          <button
            type="button"
            className={contextMenuItemClass}
            onClick={() => {
              enqueueEnd([track]);
              closeMenu();
            }}
          >
            <ListPlus className="h-4 w-4" />
            Add to queue
          </button>
          <button
            type="button"
            className={contextMenuItemClass}
            onClick={() => {
              void getRadioTracks(track.id, [track.id]).then((radio) =>
                playQueue([track, ...radio]),
              );
              closeMenu();
            }}
          >
            <Radio className="h-4 w-4" />
            Start radio
          </button>
          <button
            type="button"
            className={contextMenuItemClass}
            onClick={() => {
              likeMutation.mutate();
              closeMenu();
            }}
          >
            <Heart className="h-4 w-4" />
            Add to liked songs
          </button>
          <div className="my-1 border-t border-zinc-800" />
          <p className="flex items-center gap-2 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <ListPlus className="h-3.5 w-3.5" />
            Add to playlist
          </p>
          {menuPlaylists.data?.length ? (
            menuPlaylists.data.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                className={contextMenuItemClass}
                onClick={() => {
                  void addTrackToPlaylist(playlist.id, track.id).then(() => {
                    void queryClient.invalidateQueries({ queryKey: ["playlists"] });
                    void queryClient.invalidateQueries({
                      queryKey: ["playlist", String(playlist.id)],
                    });
                  });
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
      )}
    </div>
  );
}
