import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Mic2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { getArtists } from "../../api/catalog";
import { Pagination } from "../../components/Pagination";
import { SearchInput } from "../../components/SearchInput";
import { PageSpinner } from "../../components/Spinner";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

const PAGE_SIZE = 60;

export function ArtistsPage() {
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search);
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [q]);

  const query = useQuery({
    queryKey: ["artists", q, page],
    queryFn: () => getArtists({ q: q || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Artists</h1>
        <SearchInput value={search} onChange={setSearch} placeholder="Search artists..." />
      </div>

      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <p className="py-12 text-center text-red-400">Failed to load artists.</p>
      ) : query.data.items.length === 0 ? (
        <p className="py-12 text-center text-zinc-500">No artists found.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {query.data.items.map((artist) => (
              <Link
                key={artist.id}
                to={`/artists/${artist.id}`}
                className="group flex flex-col items-center gap-3 rounded-lg p-4 text-center transition-colors hover:bg-zinc-900"
              >
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-zinc-800 text-zinc-500 transition-colors group-hover:text-emerald-500">
                  <Mic2 className="h-10 w-10" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100">{artist.name}</p>
                  <p className="text-xs text-zinc-500">
                    {artist.album_count} albums · {artist.track_count} tracks
                  </p>
                </div>
              </Link>
            ))}
          </div>
          <Pagination
            page={page}
            limit={PAGE_SIZE}
            total={query.data.total}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
