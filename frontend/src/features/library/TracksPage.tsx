import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { getTracks } from "../../api/catalog";
import { Pagination } from "../../components/Pagination";
import { SearchInput } from "../../components/SearchInput";
import { PageSpinner } from "../../components/Spinner";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { TrackList } from "./TrackList";

const PAGE_SIZE = 50;

export function TracksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const genreId = searchParams.get("genre_id");
  const genreName = searchParams.get("genre_name");
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search);
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [q, genreId]);

  const query = useQuery({
    queryKey: ["tracks", q, genreId, page],
    queryFn: () =>
      getTracks({
        q: q || undefined,
        genre_id: genreId ? Number(genreId) : undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Tracks</h1>
          {genreId && (
            <button
              type="button"
              onClick={() => setSearchParams({})}
              className="flex items-center gap-1 rounded-full bg-emerald-600/20 px-3 py-1 text-sm text-emerald-400 transition-colors hover:bg-emerald-600/30"
            >
              {genreName ?? `Genre #${genreId}`}
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search tracks..." />
      </div>

      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <p className="py-12 text-center text-red-400">Failed to load tracks.</p>
      ) : (
        <>
          <TrackList tracks={query.data.items} />
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
