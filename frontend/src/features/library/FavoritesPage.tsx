import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { useState } from "react";

import { getFavorites } from "../../api/userLibrary";
import { Pagination } from "../../components/Pagination";
import { PageSpinner } from "../../components/Spinner";
import { TrackList } from "./TrackList";

const PAGE_SIZE = 50;

export function FavoritesPage() {
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ["favorites", page],
    queryFn: () => getFavorites({ limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-600/20">
          <Heart className="h-5 w-5 fill-emerald-500 text-emerald-500" />
        </div>
        <h1 className="text-2xl font-bold">Liked songs</h1>
      </div>

      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <p className="py-12 text-center text-red-400">Failed to load liked songs.</p>
      ) : query.data.items.length === 0 ? (
        <p className="py-12 text-center text-zinc-500">
          Nothing here yet — like some tracks and they will show up.
        </p>
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
