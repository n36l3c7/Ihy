import { useQuery } from "@tanstack/react-query";
import { Shuffle, Tags } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { getAlbums, getGenres } from "../../api/catalog";
import { AlbumCard, CardShelf } from "../../components/AlbumCard";
import { PageSpinner } from "../../components/Spinner";

export function ExplorePage() {
  const [rediscoverNonce, setRediscoverNonce] = useState(0);

  const recent = useQuery({
    queryKey: ["albums", "explore-recent"],
    queryFn: () => getAlbums({ sort: "recent", limit: 12 }),
  });
  const random = useQuery({
    queryKey: ["albums", "explore-random", rediscoverNonce],
    queryFn: () => getAlbums({ sort: "random", limit: 12 }),
    staleTime: Infinity,
  });
  const genres = useQuery({ queryKey: ["genres"], queryFn: getGenres });

  return (
    <div>
      <h1 className="mb-8 text-2xl font-bold">Explore</h1>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">New in your library</h2>
        {recent.isPending ? (
          <PageSpinner />
        ) : (
          <CardShelf>
            {recent.data?.items.map((album) => <AlbumCard key={album.id} album={album} />)}
          </CardShelf>
        )}
      </section>

      <section className="mb-10">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-lg font-semibold">Rediscover</h2>
          <button
            type="button"
            onClick={() => setRediscoverNonce((nonce) => nonce + 1)}
            className="flex items-center gap-1.5 rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
          >
            <Shuffle className="h-3.5 w-3.5" />
            Shuffle
          </button>
        </div>
        {random.isPending ? (
          <PageSpinner />
        ) : (
          <CardShelf>
            {random.data?.items.map((album) => <AlbumCard key={album.id} album={album} />)}
          </CardShelf>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Browse by genre</h2>
        <div className="flex flex-wrap gap-2">
          {genres.data?.map((genre) => (
            <Link
              key={genre.id}
              to={`/tracks?genre_id=${genre.id}&genre_name=${encodeURIComponent(genre.name)}`}
              className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/40 px-4 py-2 text-sm text-zinc-200 transition-colors hover:border-emerald-600/50 hover:bg-zinc-900"
            >
              <Tags className="h-3.5 w-3.5 text-emerald-500" />
              {genre.name}
              <span className="text-xs text-zinc-500">{genre.track_count}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
