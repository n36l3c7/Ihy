import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CircleDashed, Play, Shuffle } from "lucide-react";
import { useEffect, useState } from "react";

import { getTracks } from "../../api/catalog";
import { Pagination } from "../../components/Pagination";
import { SearchInput } from "../../components/SearchInput";
import { PageSpinner } from "../../components/Spinner";
import { usePlayerStore } from "../../stores/playerStore";
import { TrackList } from "./TrackList";

const PAGE_SIZE = 50;

/** Every track the current user has never played — a self-maintaining
 *  "to listen" playlist: tracks drop out the moment they are played. */
export function NeverPlayedPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const playQueue = usePlayerStore((state) => state.playQueue);

  useEffect(() => setPage(0), [search]);

  const query = useQuery({
    queryKey: ["tracks", "never-played", search, page],
    queryFn: () =>
      getTracks({
        q: search || undefined,
        never_played: true,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const playShuffled = async () => {
    const all = await getTracks({ never_played: true, sort: "random", limit: 500 });
    playQueue(all.items);
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CircleDashed className="h-6 w-6 text-emerald-500" />
            Never played
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            {query.data ? `${query.data.total} tracks waiting for a first listen.` : " "}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void playShuffled()}
            disabled={!query.data || query.data.total === 0}
            className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
          >
            <Shuffle className="h-4 w-4" />
            Shuffle play
          </button>
          <SearchInput value={search} onChange={setSearch} placeholder="Search..." />
        </div>
      </div>

      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <p className="py-12 text-center text-red-400">Failed to load tracks.</p>
      ) : query.data.items.length === 0 ? (
        <p className="py-12 text-center text-zinc-500">
          {search
            ? "No unplayed tracks match your search."
            : "You have listened to everything in your library — nice work."}
        </p>
      ) : (
        <>
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => playQueue(query.data.items)}
              className="flex items-center gap-1.5 rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 transition-colors hover:border-emerald-600 hover:text-emerald-400"
            >
              <Play className="h-3.5 w-3.5" />
              Play this page
            </button>
          </div>
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
