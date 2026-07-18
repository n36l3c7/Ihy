import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Pencil, Play } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import { Link, useParams } from "react-router";

import { getAlbum } from "../../api/catalog";
import { uploadAlbumCover } from "../../api/tags";
import { CoverImage } from "../../components/CoverImage";
import { PageSpinner } from "../../components/Spinner";
import { formatTotalDuration } from "../../lib/format";
import { useAuthStore } from "../../stores/authStore";
import { usePlayerStore } from "../../stores/playerStore";
import { BatchTagsDialog } from "../tag-editor/BatchTagsDialog";
import { TrackList } from "./TrackList";

export function AlbumDetailPage() {
  const { albumId } = useParams();
  const playQueue = usePlayerStore((state) => state.playQueue);
  const isAdmin = useAuthStore((state) => state.user?.role === "admin");
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [coverVersion, setCoverVersion] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: ["album", albumId],
    queryFn: () => getAlbum(Number(albumId)),
  });

  const coverMutation = useMutation({
    mutationFn: (file: File) => uploadAlbumCover(Number(albumId), file),
    onSuccess: () => {
      setCoverVersion(Date.now());
      void queryClient.invalidateQueries({ queryKey: ["album", albumId] });
    },
  });

  const handleCoverChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) coverMutation.mutate(file);
    event.target.value = "";
  };

  if (query.isPending) return <PageSpinner />;
  if (query.isError) {
    return <p className="py-12 text-center text-red-400">Failed to load album.</p>;
  }
  const album = query.data;
  const totalDuration = album.tracks.reduce((sum, track) => sum + track.duration, 0);

  return (
    <div>
      {editOpen && (
        <BatchTagsDialog
          tracks={album.tracks}
          heading={`Edit tags for all ${album.tracks.length} tracks`}
          albumArtist={album.artist?.name ?? ""}
          onClose={() => setEditOpen(false)}
        />
      )}
      <div className="mb-8 flex items-end gap-6">
        <div className="group relative shrink-0">
          <CoverImage
            albumId={album.id}
            cacheKey={coverVersion}
            className="h-44 w-44 rounded-lg shadow-lg"
          />
          {isAdmin && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleCoverChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={coverMutation.isPending}
                className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60 text-zinc-100 opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Change cover"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <ImagePlus className="h-5 w-5" />
                  {coverMutation.isPending ? "Uploading..." : "Change cover"}
                </span>
              </button>
            </>
          )}
        </div>
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
          {coverMutation.isError && (
            <p className="mt-2 text-sm text-red-400">Cover upload failed.</p>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-2 rounded-full border border-zinc-700 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
            >
              <Pencil className="h-4 w-4" />
              Edit album
            </button>
          )}
          <button
            type="button"
            onClick={() => playQueue(album.tracks)}
            className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
          >
            <Play className="h-4 w-4" />
            Play
          </button>
        </div>
      </div>

      <TrackList tracks={album.tracks} showAlbum={false} showCover={false} showNumbers />
    </div>
  );
}
