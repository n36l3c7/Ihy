import { useQuery } from "@tanstack/react-query";
import { Mic2, Play } from "lucide-react";
import { Link, useParams } from "react-router";

import { getArtist, getTracks } from "../../api/catalog";
import { CoverImage } from "../../components/CoverImage";
import { PageSpinner } from "../../components/Spinner";
import { usePlayerStore } from "../../stores/playerStore";
import { TrackList } from "./TrackList";

export function ArtistDetailPage() {
  const { artistId } = useParams();
  const playQueue = usePlayerStore((state) => state.playQueue);

  const query = useQuery({
    queryKey: ["artist", artistId],
    queryFn: () => getArtist(Number(artistId)),
  });

  const tracksQuery = useQuery({
    queryKey: ["artist-tracks", artistId],
    queryFn: () => getTracks({ artist_id: Number(artistId), limit: 100 }),
  });

  const handlePlayAll = async () => {
    const page = await getTracks({ artist_id: Number(artistId), limit: 500 });
    playQueue(page.items);
  };

  if (query.isPending) return <PageSpinner />;
  if (query.isError) {
    return <p className="py-12 text-center text-red-400">Failed to load artist.</p>;
  }
  const artist = query.data;

  return (
    <div>
      <div className="mb-8 flex items-end gap-6">
        <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-500">
          <Mic2 className="h-14 w-14" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Artist</p>
          <h1 className="mt-1 truncate text-4xl font-bold">{artist.name}</h1>
          <p className="mt-2 text-sm text-zinc-400">
            {artist.album_count} albums · {artist.track_count} tracks
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handlePlayAll()}
          className="ml-auto flex shrink-0 items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
        >
          <Play className="h-4 w-4" />
          Play all
        </button>
      </div>

      {tracksQuery.data && tracksQuery.data.items.length > 0 && (
        <div className="mb-10">
          <h2 className="mb-4 text-lg font-semibold">Tracks</h2>
          <TrackList tracks={tracksQuery.data.items} />
        </div>
      )}

      <h2 className="mb-4 text-lg font-semibold">Albums</h2>
      {artist.albums.length === 0 ? (
        <p className="text-zinc-500">No albums.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {artist.albums.map((album) => (
            <Link
              key={album.id}
              to={`/albums/${album.id}`}
              className="group rounded-lg p-3 transition-colors hover:bg-zinc-900"
            >
              <CoverImage albumId={album.id} className="aspect-square w-full rounded-md" />
              <p className="mt-3 truncate text-sm font-medium text-zinc-100">{album.title}</p>
              <p className="text-xs text-zinc-500">
                {album.year ? `${album.year} · ` : ""}
                {album.track_count} tracks
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
