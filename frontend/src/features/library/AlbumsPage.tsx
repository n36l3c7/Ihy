import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListPlus, Mic2, Play, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { deleteAlbum, getAlbum, getAlbums } from "../../api/catalog";
import type { Album } from "../../api/types";
import { addTrackToPlaylist, getPlaylists } from "../../api/userLibrary";
import { ContextMenu, contextMenuItemClass } from "../../components/ContextMenu";
import { CoverImage } from "../../components/CoverImage";
import { Pagination } from "../../components/Pagination";
import { SearchInput } from "../../components/SearchInput";
import { PageSpinner } from "../../components/Spinner";
import { useViewMode, ViewToggle } from "../../components/ViewToggle";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useAuthStore } from "../../stores/authStore";
import { usePlayerStore } from "../../stores/playerStore";

const PAGE_SIZE = 60;

export function AlbumsPage() {
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search);
  const [page, setPage] = useState(0);
  const [view, setView] = useViewMode("ihy-albums-view");
  const [menu, setMenu] = useState<{ x: number; y: number; album: Album } | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((state) => state.user?.role === "admin");
  const playQueue = usePlayerStore((state) => state.playQueue);

  useEffect(() => setPage(0), [q]);

  const query = useQuery({
    queryKey: ["albums", q, page],
    queryFn: () => getAlbums({ q: q || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const menuPlaylists = useQuery({
    queryKey: ["playlists"],
    queryFn: getPlaylists,
    enabled: menu !== null,
  });

  const openMenu = (event: React.MouseEvent, album: Album) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, album });
  };

  const playAlbum = async (album: Album) => {
    const detail = await getAlbum(album.id);
    playQueue(detail.tracks);
  };

  const addAlbumToPlaylist = async (album: Album, playlistId: number) => {
    const detail = await getAlbum(album.id);
    for (const track of detail.tracks) {
      await addTrackToPlaylist(playlistId, track.id);
    }
    void queryClient.invalidateQueries({ queryKey: ["playlists"] });
    void queryClient.invalidateQueries({ queryKey: ["playlist", String(playlistId)] });
  };

  const handleDelete = async (album: Album) => {
    if (window.confirm(`Delete album "${album.title}" and its files from disk?`)) {
      await deleteAlbum(album.id);
      void queryClient.invalidateQueries();
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Albums</h1>
        <div className="flex items-center gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search albums..." />
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <p className="py-12 text-center text-red-400">Failed to load albums.</p>
      ) : query.data.items.length === 0 ? (
        <p className="py-12 text-center text-zinc-500">No albums found.</p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {query.data.items.map((album) => (
            <Link
              key={album.id}
              to={`/albums/${album.id}`}
              onContextMenu={(event) => openMenu(event, album)}
              className="group rounded-lg p-3 transition-colors hover:bg-zinc-900"
            >
              <CoverImage albumId={album.id} className="aspect-square w-full rounded-md" />
              <p className="mt-3 truncate text-sm font-medium text-zinc-100">{album.title}</p>
              <p className="truncate text-xs text-zinc-500">
                {album.artist?.name ?? "Unknown artist"}
                {album.year ? ` · ${album.year}` : ""}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-zinc-800/60 rounded-lg border border-zinc-800">
          {query.data.items.map((album) => (
            <li key={album.id}>
              <Link
                to={`/albums/${album.id}`}
                onContextMenu={(event) => openMenu(event, album)}
                className="flex items-center gap-4 px-4 py-2 transition-colors hover:bg-zinc-800/60"
              >
                <CoverImage albumId={album.id} className="h-10 w-10 shrink-0 rounded" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-100">
                    {album.title}
                  </span>
                  <span className="block truncate text-xs text-zinc-500">
                    {album.artist?.name ?? "Unknown artist"}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-zinc-500">
                  {album.year ? `${album.year} · ` : ""}
                  {album.track_count} tracks
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {query.data && (
        <Pagination page={page} limit={PAGE_SIZE} total={query.data.total} onPageChange={setPage} />
      )}

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <button
            type="button"
            className={contextMenuItemClass}
            onClick={() => {
              void playAlbum(menu.album);
              setMenu(null);
            }}
          >
            <Play className="h-4 w-4" />
            Play album
          </button>
          {menu.album.artist && (
            <button
              type="button"
              className={contextMenuItemClass}
              onClick={() => {
                navigate(`/artists/${menu.album.artist?.id}`);
                setMenu(null);
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
                void handleDelete(menu.album);
                setMenu(null);
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
                  void addAlbumToPlaylist(menu.album, playlist.id);
                  setMenu(null);
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
