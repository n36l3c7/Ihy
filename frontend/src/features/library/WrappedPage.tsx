import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Crown, Disc3, Hourglass, Mic2, Music2, Tags } from "lucide-react";
import { useState } from "react";

import { api } from "../../api/http";
import { PageSpinner } from "../../components/Spinner";

interface WrappedItem {
  id: number;
  name: string;
  plays: number;
}

interface Wrapped {
  year: number;
  total_plays: number;
  total_minutes: number;
  distinct_tracks: number;
  distinct_artists: number;
  top_artists: WrappedItem[];
  top_tracks: WrappedItem[];
  top_albums: WrappedItem[];
  top_genres: WrappedItem[];
  busiest_month: string | null;
  available_years: number[];
}

const getWrapped = (year?: number) =>
  api<Wrapped>(`/stats/wrapped${year ? `?year=${year}` : ""}`);

function TopList({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: typeof Mic2;
  items: WrappedItem[];
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-400">
        <Icon className="h-4 w-4 text-emerald-500" />
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-600">Nothing yet.</p>
      ) : (
        <ol className="space-y-2">
          {items.map((item, index) => (
            <li key={item.id} className="flex items-baseline gap-3">
              <span
                className={`w-5 shrink-0 text-right font-bold tabular-nums ${
                  index === 0 ? "text-emerald-500" : "text-zinc-600"
                }`}
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                {item.name}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-zinc-500">
                {item.plays} plays
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function WrappedPage() {
  const [year, setYear] = useState<number | undefined>(undefined);
  const wrapped = useQuery({
    queryKey: ["wrapped", year],
    queryFn: () => getWrapped(year),
    placeholderData: keepPreviousData,
  });

  if (wrapped.isPending) return <PageSpinner />;
  if (wrapped.isError) {
    return <p className="py-12 text-center text-red-400">Failed to load your recap.</p>;
  }
  const data = wrapped.data;

  const headline = [
    { label: "plays", value: data.total_plays.toLocaleString() },
    { label: "minutes", value: data.total_minutes.toLocaleString() },
    { label: "tracks", value: data.distinct_tracks.toLocaleString() },
    { label: "artists", value: data.distinct_artists.toLocaleString() },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="rounded-2xl border border-amber-600/30 bg-gradient-to-br from-amber-500/10 via-zinc-900 to-zinc-950 p-8 text-center">
        <Crown className="mx-auto h-8 w-8 text-amber-400" />
        <h1 className="mt-3 text-3xl font-bold tracking-tight">
          Your {data.year} in the temple
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {data.busiest_month
            ? `Loudest month: ${data.busiest_month}`
            : "The scribes found no plays this year."}
        </p>
        {data.available_years.length > 1 && (
          <div className="mt-4 flex justify-center gap-2">
            {data.available_years.map((available) => (
              <button
                key={available}
                type="button"
                onClick={() => setYear(available)}
                className={`rounded-full px-4 py-1 text-sm font-semibold transition-colors ${
                  available === data.year
                    ? "bg-amber-500/20 text-amber-300"
                    : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                {available}
              </button>
            ))}
          </div>
        )}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {headline.map((stat) => (
            <div key={stat.label}>
              <p className="text-3xl font-bold tabular-nums text-zinc-100">
                {stat.value}
              </p>
              <p className="text-xs uppercase tracking-wider text-zinc-500">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
        {data.total_minutes >= 60 && (
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-zinc-400">
            <Hourglass className="h-4 w-4 text-amber-400" />
            That is about {Math.round(data.total_minutes / 60)} hours of music.
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <TopList title="Top artists" icon={Mic2} items={data.top_artists} />
        <TopList title="Top tracks" icon={Music2} items={data.top_tracks} />
        <TopList title="Top albums" icon={Disc3} items={data.top_albums} />
        <TopList title="Top genres" icon={Tags} items={data.top_genres} />
      </div>
    </div>
  );
}
