import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { deleteArtist, getArtists, getTracks } from "../../api/catalog";
import type { Artist } from "../../api/types";
import { ArtistImage } from "../../components/ArtistImage";
import { ContextMenu, contextMenuItemClass } from "../../components/ContextMenu";
import { Pagination } from "../../components/Pagination";
import { SearchInput } from "../../components/SearchInput";
import { PageSpinner } from "../../components/Spinner";
import { useViewMode, ViewToggle } from "../../components/ViewToggle";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useAuthStore } from "../../stores/authStore";
import { usePlayerStore } from "../../stores/playerStore";

const PAGE_SIZE = 60;

export function ArtistsPage() {
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search);
  const [page, setPage] = useState(0);
  const [view, setView] = useViewMode("ihy-artists-view");
  const [menu, setMenu] = useState<{ x: number; y: number; artist: Artist } | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((state) => state.user?.role === "admin");
  const playQueue = usePlayerStore((state) => state.playQueue);

  useEffect(() => setPage(0), [q]);

  const query = useQuery({
    queryKey: ["artists", q, page],
    queryFn: () => getArtists({ q: q || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const openMenu = (event: React.MouseEvent, artist: Artist) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, artist });
  };

  const playAll = async (artist: Artist) => {
    const tracks = await getTracks({ artist_id: artist.id, limit: 500 });
    playQueue(tracks.items);
  };

  const handleDelete = async (artist: Artist) => {
    if (
      window.confirm(
        `Delete artist "${artist.name}" and every credited track from disk?`,
      )
    ) {
      await deleteArtist(artist.id);
      void queryClient.invalidateQueries();
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Artists</h1>
        <div className="flex items-center gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search artists..." />
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <p className="py-12 text-center text-red-400">Failed to load artists.</p>
      ) : query.data.items.length === 0 ? (
        <p className="py-12 text-center text-zinc-500">No artists found.</p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {query.data.items.map((artist) => (
            <Link
              key={artist.id}
              to={`/artists/${artist.id}`}
              onContextMenu={(event) => openMenu(event, artist)}
              className="group flex flex-col items-center gap-3 rounded-lg p-4 text-center transition-colors hover:bg-zinc-900"
            >
              <ArtistImage artistId={artist.id} className="h-24 w-24 rounded-full" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-100">{artist.name}</p>
                <p className="text-xs text-zinc-500">
                  {artist.album_count} albums · {artist.track_count} tracks
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-zinc-800/60 rounded-lg border border-zinc-800">
          {query.data.items.map((artist) => (
            <li key={artist.id}>
              <Link
                to={`/artists/${artist.id}`}
                onContextMenu={(event) => openMenu(event, artist)}
                className="flex items-center gap-4 px-4 py-2 transition-colors hover:bg-zinc-800/60"
              >
                <ArtistImage artistId={artist.id} className="h-10 w-10 shrink-0 rounded-full" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
                  {artist.name}
                </span>
                <span className="shrink-0 text-xs text-zinc-500">
                  {artist.album_count} albums · {artist.track_count} tracks
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
              void playAll(menu.artist);
              setMenu(null);
            }}
          >
            <Play className="h-4 w-4" />
            Play all
          </button>
          <button
            type="button"
            className={contextMenuItemClass}
            onClick={() => {
              navigate(`/artists/${menu.artist.id}`);
              setMenu(null);
            }}
          >
            Go to artist
          </button>
          {isAdmin && (
            <button
              type="button"
              className={`${contextMenuItemClass} text-red-400 hover:text-red-300`}
              onClick={() => {
                void handleDelete(menu.artist);
                setMenu(null);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete artist
            </button>
          )}
        </ContextMenu>
      )}
    </div>
  );
}
