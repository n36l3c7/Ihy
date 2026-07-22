import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListPlus, Mic2, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { deleteAlbum, getAlbum } from "../api/catalog";
import type { Album } from "../api/types";
import { addTrackToPlaylist, getPlaylists } from "../api/userLibrary";
import { useAuthStore } from "../stores/authStore";
import { usePlayerStore } from "../stores/playerStore";
import { CardPlayButton } from "./CardPlayButton";
import { ContextMenu, contextMenuItemClass } from "./ContextMenu";
import { CoverImage } from "./CoverImage";

/** Compact album card for horizontal shelves (Home / Explore), with the
 *  same right-click menu available in the full Albums grid. */
export function AlbumCard({ album }: { album: Album }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((state) => state.user?.role === "admin");
  const playQueue = usePlayerStore((state) => state.playQueue);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const menuPlaylists = useQuery({
    queryKey: ["playlists"],
    queryFn: getPlaylists,
    enabled: menu !== null,
  });

  const playAlbum = async () => {
    const detail = await getAlbum(album.id);
    playQueue(detail.tracks);
  };

  const addAlbumToPlaylist = async (playlistId: number) => {
    const detail = await getAlbum(album.id);
    for (const track of detail.tracks) {
      await addTrackToPlaylist(playlistId, track.id);
    }
    void queryClient.invalidateQueries({ queryKey: ["playlists"] });
    void queryClient.invalidateQueries({ queryKey: ["playlist", String(playlistId)] });
  };

  const deleteMutation = useMutation({
    mutationFn: () => deleteAlbum(album.id),
    onSuccess: () => void queryClient.invalidateQueries(),
  });

  const handleDelete = () => {
    if (window.confirm(`Delete album "${album.title}" and its files from disk?`)) {
      deleteMutation.mutate();
    }
  };

  const openMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY });
  };
  const closeMenu = () => setMenu(null);

  return (
    <div className="relative">
      <Link
        to={`/albums/${album.id}`}
        onContextMenu={openMenu}
        className="group block w-40 shrink-0 rounded-lg p-3 transition-colors hover:bg-zinc-900"
      >
        <div className="relative">
          <CoverImage albumId={album.id} className="aspect-square w-full rounded-md" />
          <CardPlayButton onPlay={() => void playAlbum()} />
        </div>
        <p className="mt-2 truncate text-sm font-medium text-zinc-100">{album.title}</p>
        <p className="truncate text-xs text-zinc-500">{album.artist?.name ?? "Unknown artist"}</p>
      </Link>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={closeMenu}>
          <button
            type="button"
            className={contextMenuItemClass}
            onClick={() => {
              void playAlbum();
              closeMenu();
            }}
          >
            <Play className="h-4 w-4" />
            Play album
          </button>
          {album.artist && (
            <button
              type="button"
              className={contextMenuItemClass}
              onClick={() => {
                navigate(`/artists/${album.artist?.id}`);
                closeMenu();
              }}
            >
              <Mic2 className="h-4 w-4" />
              Go to artist
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              className={`${contextMenuItemClass} text-red-400 hover:text-red-300`}
              onClick={() => {
                handleDelete();
                closeMenu();
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete album
            </button>
          )}
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
                  void addAlbumToPlaylist(playlist.id);
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

export function CardShelf({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 overflow-x-auto pb-2">{children}</div>;
}
