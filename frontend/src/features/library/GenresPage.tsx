import { useQuery } from "@tanstack/react-query";
import { Tags } from "lucide-react";
import { Link } from "react-router";

import { getGenres } from "../../api/catalog";
import { PageSpinner } from "../../components/Spinner";

export function GenresPage() {
  const query = useQuery({ queryKey: ["genres"], queryFn: getGenres });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Genres</h1>
      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <p className="py-12 text-center text-red-400">Failed to load genres.</p>
      ) : query.data.length === 0 ? (
        <p className="py-12 text-center text-zinc-500">No genres found.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {query.data.map((genre) => (
            <Link
              key={genre.id}
              to={`/tracks?genre_id=${genre.id}&genre_name=${encodeURIComponent(genre.name)}`}
              className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:border-emerald-600/50 hover:bg-zinc-900"
            >
              <Tags className="h-5 w-5 shrink-0 text-emerald-500" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-100">{genre.name}</p>
                <p className="text-xs text-zinc-500">{genre.track_count} tracks</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
