import { useQuery } from "@tanstack/react-query";
import { CircleDashed, Play, Shuffle, Sparkles, Tags } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { getAlbums, getGenres, getTracks } from "../../api/catalog";
import { getRecommendedTracks } from "../../api/mixes";
import { AlbumCard, CardShelf } from "../../components/AlbumCard";
import { PageSpinner } from "../../components/Spinner";
import { TrackCard } from "../../components/TrackCard";
import { usePlayerStore } from "../../stores/playerStore";

const NEVER_PLAYED_PREVIEW = 10;

export function ExplorePage() {
  const [rediscoverNonce, setRediscoverNonce] = useState(0);
  const playQueue = usePlayerStore((state) => state.playQueue);

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
  const recommended = useQuery({
    queryKey: ["tracks", "recommended"],
    queryFn: getRecommendedTracks,
  });
  const neverPlayed = useQuery({
    queryKey: ["tracks", "never-played", "preview"],
    queryFn: () => getTracks({ never_played: true, sort: "random", limit: NEVER_PLAYED_PREVIEW }),
  });

  return (
    <div>
      <h1 className="mb-8 text-2xl font-bold">Explore</h1>

      {recommended.data && recommended.data.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-4 w-4 text-emerald-500" />
            Recommended for you
          </h2>
          <CardShelf>
            {recommended.data.map((track, index) => (
              <TrackCard key={track.id} track={track} tracks={recommended.data} index={index} />
            ))}
          </CardShelf>
        </section>
      )}

      {neverPlayed.data && neverPlayed.data.total > 0 && (
        <section className="mb-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <CircleDashed className="h-4 w-4 text-emerald-500" />
              Never played
              <span className="text-sm font-normal text-zinc-500">
                ({neverPlayed.data.total} tracks)
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => playQueue(neverPlayed.data.items)}
                className="flex items-center gap-1.5 rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 transition-colors hover:border-emerald-600 hover:text-emerald-400"
              >
                <Play className="h-3.5 w-3.5" />
                Play all
              </button>
              <Link
                to="/never-played"
                className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
              >
                See all
              </Link>
            </div>
          </div>
          <CardShelf>
            {neverPlayed.data.items.map((track, index) => (
              <TrackCard
                key={track.id}
                track={track}
                tracks={neverPlayed.data.items}
                index={index}
              />
            ))}
          </CardShelf>
        </section>
      )}

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
