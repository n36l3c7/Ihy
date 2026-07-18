import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Play, Trash2 } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { deleteArtist, getArtist, getTracks } from "../../api/catalog";
import { uploadArtistImage } from "../../api/tags";
import { ArtistImage } from "../../components/ArtistImage";
import { CoverImage } from "../../components/CoverImage";
import { Pagination } from "../../components/Pagination";
import { PageSpinner } from "../../components/Spinner";
import { useAuthStore } from "../../stores/authStore";
import { usePlayerStore } from "../../stores/playerStore";
import { TrackList } from "./TrackList";

const PAGE_SIZES = [10, 25, 50];

export function ArtistDetailPage() {
  const { artistId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((state) => state.user?.role === "admin");
  const playQueue = usePlayerStore((state) => state.playQueue);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [imageVersion, setImageVersion] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const deleteMutation = useMutation({
    mutationFn: () => deleteArtist(Number(artistId)),
    onSuccess: () => {
      void queryClient.invalidateQueries();
      navigate("/artists", { replace: true });
    },
  });

  const imageMutation = useMutation({
    mutationFn: (file: File) => uploadArtistImage(Number(artistId), file),
    onSuccess: () => setImageVersion(Date.now()),
  });

  const query = useQuery({
    queryKey: ["artist", artistId],
    queryFn: () => getArtist(Number(artistId)),
  });

  const tracksQuery = useQuery({
    queryKey: ["artist-tracks", artistId, page, pageSize],
    queryFn: () =>
      getTracks({ artist_id: Number(artistId), limit: pageSize, offset: page * pageSize }),
    placeholderData: keepPreviousData,
  });

  const handlePlayAll = async () => {
    const result = await getTracks({ artist_id: Number(artistId), limit: 500 });
    playQueue(result.items);
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) imageMutation.mutate(file);
    event.target.value = "";
  };

  if (query.isPending) return <PageSpinner />;
  if (query.isError) {
    return <p className="py-12 text-center text-red-400">Failed to load artist.</p>;
  }
  const artist = query.data;

  return (
    <div>
      <div className="mb-8 flex items-end gap-6">
        <div className="group relative shrink-0">
          <ArtistImage
            artistId={artist.id}
            cacheKey={imageVersion}
            className="h-36 w-36 rounded-full"
          />
          {isAdmin && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleImageChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={imageMutation.isPending}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 text-zinc-100 opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Change artist image"
              >
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <ImagePlus className="h-4 w-4" />
                  {imageMutation.isPending ? "Uploading..." : "Change"}
                </span>
              </button>
            </>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Artist</p>
          <h1 className="mt-1 truncate text-4xl font-bold">{artist.name}</h1>
          <p className="mt-2 text-sm text-zinc-400">
            {artist.album_count} albums · {artist.track_count} tracks
          </p>
          {imageMutation.isError && (
            <p className="mt-1 text-sm text-red-400">Image upload failed.</p>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    `Delete artist "${artist.name}" and every credited track from disk?`,
                  )
                ) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
              className="rounded-full p-2.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
              aria-label="Delete artist from platform"
              title="Delete artist (files removed from disk)"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => void handlePlayAll()}
            className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
          >
            <Play className="h-4 w-4" />
            Play all
          </button>
        </div>
      </div>

      <div className="mb-10">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Tracks</h2>
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            per page
            <select
              className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(0);
              }}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
        {tracksQuery.isPending ? (
          <PageSpinner />
        ) : tracksQuery.isError ? (
          <p className="text-red-400">Failed to load tracks.</p>
        ) : (
          <>
            <TrackList tracks={tracksQuery.data.items} />
            <Pagination
              page={page}
              limit={pageSize}
              total={tracksQuery.data.total}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

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
