import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { Link, useParams } from "react-router";

import { getAlbum } from "../../api/catalog";
import { CoverImage } from "../../components/CoverImage";
import { PageSpinner } from "../../components/Spinner";
import { formatTotalDuration } from "../../lib/format";
import { usePlayerStore } from "../../stores/playerStore";
import { TrackList } from "./TrackList";

export function AlbumDetailPage() {
  const { albumId } = useParams();
  const playQueue = usePlayerStore((state) => state.playQueue);

  const query = useQuery({
    queryKey: ["album", albumId],
    queryFn: () => getAlbum(Number(albumId)),
  });

  if (query.isPending) return <PageSpinner />;
  if (query.isError) {
    return <p className="py-12 text-center text-red-400">Failed to load album.</p>;
  }
  const album = query.data;
  const totalDuration = album.tracks.reduce((sum, track) => sum + track.duration, 0);

  return (
    <div>
      <div className="mb-8 flex items-end gap-6">
        <CoverImage albumId={album.id} className="h-44 w-44 shrink-0 rounded-lg shadow-lg" />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Album</p>
          <h1 className="mt-1 truncate text-4xl font-bold">{album.title}</h1>
          <p className="mt-2 text-sm text-zinc-400">
            {album.artist ? (
              <Link
                to={`/artists/${album.artist.id}`}
                className="font-medium text-zinc-100 hover:underline"
              >
                {album.artist.name}
              </Link>
            ) : (
              "Unknown artist"
            )}
            {album.year ? ` · ${album.year}` : ""} · {album.tracks.length} tracks ·{" "}
            {formatTotalDuration(totalDuration)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => playQueue(album.tracks)}
          className="ml-auto flex shrink-0 items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
        >
          <Play className="h-4 w-4" />
          Play
        </button>
      </div>

      <TrackList tracks={album.tracks} showAlbum={false} showCover={false} showNumbers />
    </div>
  );
}
