import { useQuery } from "@tanstack/react-query";
import { ChartColumn } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { getStats } from "../../api/wave3";
import { PageSpinner } from "../../components/Spinner";
import { formatTotalDuration } from "../../lib/format";
import { usePlayerStore } from "../../stores/playerStore";

const PERIODS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "All time", days: undefined },
];

export function StatsPage() {
  const [days, setDays] = useState<number | undefined>(30);
  const playQueue = usePlayerStore((state) => state.playQueue);

  const query = useQuery({
    queryKey: ["stats", days ?? "all"],
    queryFn: () => getStats(days),
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-zinc-800">
            <ChartColumn className="h-5 w-5 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold">Statistics</h1>
        </div>
        <div className="flex gap-1 rounded-md border border-zinc-800 p-0.5">
          {PERIODS.map((period) => (
            <button
              key={period.label}
              type="button"
              onClick={() => setDays(period.days)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                days === period.days
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-100"
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <p className="py-12 text-center text-red-400">Failed to load statistics.</p>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: "Plays", value: query.data.total_plays.toLocaleString() },
              { label: "Different tracks", value: query.data.distinct_tracks.toLocaleString() },
              { label: "Listening time", value: formatTotalDuration(query.data.total_seconds) },
            ].map((card) => (
              <div key={card.label} className="rounded-lg border border-zinc-800 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">{card.label}</p>
                <p className="mt-1 text-3xl font-bold text-zinc-100">{card.value}</p>
              </div>
            ))}
          </div>

          {query.data.plays_by_day.length > 0 && (
            <div className="mb-8 rounded-lg border border-zinc-800 p-4">
              <p className="mb-3 text-sm font-medium text-zinc-300">Last 30 days</p>
              <div className="flex h-24 items-end gap-1">
                {query.data.plays_by_day.map((entry) => {
                  const max = Math.max(...query.data.plays_by_day.map((d) => d.plays));
                  return (
                    <div
                      key={entry.day}
                      title={`${entry.day}: ${entry.plays} plays`}
                      className="min-w-1.5 flex-1 rounded-t bg-emerald-600/70 transition-colors hover:bg-emerald-500"
                      style={{ height: `${Math.max(6, (entry.plays / max) * 100)}%` }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-lg border border-zinc-800 p-4">
              <p className="mb-3 text-sm font-medium text-zinc-300">Top tracks</p>
              {query.data.top_tracks.length === 0 ? (
                <p className="text-xs text-zinc-500">No plays yet.</p>
              ) : (
                <ol className="flex flex-col gap-1.5">
                  {query.data.top_tracks.map((entry, index) => (
                    <li key={entry.track.id} className="flex items-center gap-2 text-sm">
                      <span className="w-5 shrink-0 text-right text-xs text-zinc-600">
                        {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          playQueue(
                            query.data.top_tracks.map((top) => top.track),
                            index,
                          )
                        }
                        className="min-w-0 flex-1 truncate text-left text-zinc-200 hover:text-emerald-400"
                      >
                        {entry.track.title}
                      </button>
                      <span className="shrink-0 text-xs text-zinc-500">{entry.plays}×</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="rounded-lg border border-zinc-800 p-4">
              <p className="mb-3 text-sm font-medium text-zinc-300">Top artists</p>
              {query.data.top_artists.length === 0 ? (
                <p className="text-xs text-zinc-500">No plays yet.</p>
              ) : (
                <ol className="flex flex-col gap-1.5">
                  {query.data.top_artists.map((entry, index) => (
                    <li key={entry.id} className="flex items-center gap-2 text-sm">
                      <span className="w-5 shrink-0 text-right text-xs text-zinc-600">
                        {index + 1}
                      </span>
                      <Link
                        to={`/artists/${entry.id}`}
                        className="min-w-0 flex-1 truncate text-zinc-200 hover:text-emerald-400"
                      >
                        {entry.name}
                      </Link>
                      <span className="shrink-0 text-xs text-zinc-500">{entry.plays}×</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="rounded-lg border border-zinc-800 p-4">
              <p className="mb-3 text-sm font-medium text-zinc-300">Top albums</p>
              {query.data.top_albums.length === 0 ? (
                <p className="text-xs text-zinc-500">No plays yet.</p>
              ) : (
                <ol className="flex flex-col gap-1.5">
                  {query.data.top_albums.map((entry, index) => (
                    <li key={entry.id} className="flex items-center gap-2 text-sm">
                      <span className="w-5 shrink-0 text-right text-xs text-zinc-600">
                        {index + 1}
                      </span>
                      <Link
                        to={`/albums/${entry.id}`}
                        className="min-w-0 flex-1 truncate text-zinc-200 hover:text-emerald-400"
                      >
                        {entry.title}
                      </Link>
                      <span className="shrink-0 text-xs text-zinc-500">{entry.plays}×</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
