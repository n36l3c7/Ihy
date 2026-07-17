import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useState } from "react";

import { getHistory } from "../../api/userLibrary";
import { Pagination } from "../../components/Pagination";
import { PageSpinner } from "../../components/Spinner";
import { TrackList } from "./TrackList";

const PAGE_SIZE = 50;

export function HistoryPage() {
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ["history", page],
    queryFn: () => getHistory({ limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-zinc-800">
          <History className="h-5 w-5 text-zinc-300" />
        </div>
        <h1 className="text-2xl font-bold">Recently played</h1>
      </div>

      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <p className="py-12 text-center text-red-400">Failed to load history.</p>
      ) : query.data.items.length === 0 ? (
        <p className="py-12 text-center text-zinc-500">No listening history yet.</p>
      ) : (
        <>
          <TrackList tracks={query.data.items.map((entry) => entry.track)} />
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
