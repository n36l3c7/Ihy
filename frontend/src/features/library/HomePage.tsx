import { useQuery } from "@tanstack/react-query";
import { ListMusic, Play } from "lucide-react";

import { getAlbums } from "../../api/catalog";
import { getQueues } from "../../api/queues";
import type { Track } from "../../api/types";
import { getHistory } from "../../api/userLibrary";
import { AlbumCard, CardShelf } from "../../components/AlbumCard";
import { CardPlayButton } from "../../components/CardPlayButton";
import { CoverImage } from "../../components/CoverImage";
import { artistNames } from "../../lib/format";
import { useAuthStore } from "../../stores/authStore";
import { usePlayerStore } from "../../stores/playerStore";
import { loadSavedQueue } from "../player/queueActions";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function HomePage() {
  const user = useAuthStore((state) => state.user);
  const playQueue = usePlayerStore((state) => state.playQueue);

  const queues = useQuery({ queryKey: ["saved-queues"], queryFn: getQueues });
  const history = useQuery({
    queryKey: ["history", "home"],
    queryFn: () => getHistory({ limit: 30 }),
  });
  const recentAlbums = useQuery({
    queryKey: ["albums", "recent-home"],
    queryFn: () => getAlbums({ sort: "recent", limit: 12 }),
  });

  const recentTracks: Track[] = [];
  if (history.data) {
    const seen = new Set<number>();
    for (const entry of history.data.items) {
      if (!seen.has(entry.track.id)) {
        seen.add(entry.track.id);
        recentTracks.push(entry.track);
      }
      if (recentTracks.length >= 12) break;
    }
  }

  const displayName = user?.first_name || user?.username || "";

  return (
    <div>
      <h1 className="mb-8 text-3xl font-bold">
        {greeting()}
        {displayName ? `, ${displayName}` : ""}
      </h1>

      {queues.data && queues.data.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold">Pick up where you left off</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {queues.data.slice(0, 4).map((queue) => (
              <button
                key={queue.id}
                type="button"
                onClick={() => void loadSavedQueue(queue.id)}
                className="group flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-left transition-colors hover:border-emerald-600/50 hover:bg-zinc-900"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-zinc-800">
                  <ListMusic className="h-5 w-5 text-emerald-500" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-100">
                    {queue.name}
                  </span>
                  <span className="text-xs text-zinc-500">{queue.track_count} tracks</span>
                </span>
                <Play className="h-4 w-4 shrink-0 text-zinc-600 transition-colors group-hover:text-emerald-500" />
              </button>
            ))}
          </div>
        </section>
      )}

      {recentTracks.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold">Recently played</h2>
          <CardShelf>
            {recentTracks.map((track, index) => (
              <button
                key={track.id}
                type="button"
                onClick={() => playQueue(recentTracks, index)}
                className="group w-40 shrink-0 rounded-lg p-3 text-left transition-colors hover:bg-zinc-900"
              >
                <div className="relative">
                  <CoverImage albumId={track.album?.id} className="aspect-square w-full rounded-md" />
                  <CardPlayButton onPlay={() => playQueue(recentTracks, index)} />
                </div>
                <p className="mt-2 truncate text-sm font-medium text-zinc-100">{track.title}</p>
                <p className="truncate text-xs text-zinc-500">{artistNames(track.artists)}</p>
              </button>
            ))}
          </CardShelf>
        </section>
      )}

      {recentAlbums.data && recentAlbums.data.items.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold">Recently added</h2>
          <CardShelf>
            {recentAlbums.data.items.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </CardShelf>
        </section>
      )}

      {recentTracks.length === 0 &&
        (!queues.data || queues.data.length === 0) &&
        recentAlbums.data?.items.length === 0 && (
          <p className="py-12 text-center text-zinc-500">
            Your home fills up as you listen — add a source and scan your library to begin.
          </p>
        )}
    </div>
  );
}
