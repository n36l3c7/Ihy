import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { getAlbums } from "../../api/catalog";
import { CoverImage } from "../../components/CoverImage";
import { Pagination } from "../../components/Pagination";
import { SearchInput } from "../../components/SearchInput";
import { PageSpinner } from "../../components/Spinner";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

const PAGE_SIZE = 60;

export function AlbumsPage() {
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search);
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [q]);

  const query = useQuery({
    queryKey: ["albums", q, page],
    queryFn: () => getAlbums({ q: q || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Albums</h1>
        <SearchInput value={search} onChange={setSearch} placeholder="Search albums..." />
      </div>

      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <p className="py-12 text-center text-red-400">Failed to load albums.</p>
      ) : query.data.items.length === 0 ? (
        <p className="py-12 text-center text-zinc-500">No albums found.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {query.data.items.map((album) => (
              <Link
                key={album.id}
                to={`/albums/${album.id}`}
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
