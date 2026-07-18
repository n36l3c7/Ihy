import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Globe,
  HardDriveDownload,
  ListMusic,
  Play,
  Trash2,
  X,
} from "lucide-react";
import { type MouseEvent, useState } from "react";
import { useNavigate, useParams } from "react-router";

import {
  deletePlaylist,
  downloadPlaylistExport,
  getPlaylist,
  removePlaylistItem,
  renamePlaylist,
  setPlaylistPublic,
  updatePlaylistOrder,
} from "../../api/userLibrary";
import { useAuthStore } from "../../stores/authStore";
import { PageSpinner } from "../../components/Spinner";
import { formatTotalDuration } from "../../lib/format";
import { downloadTracks, offlineSupported } from "../../lib/offline";
import { usePlayerStore } from "../../stores/playerStore";
import { TrackList } from "../library/TrackList";

export function PlaylistPage() {
  const { playlistId } = useParams();
  const id = Number(playlistId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const playQueue = usePlayerStore((state) => state.playQueue);
  const username = useAuthStore((state) => state.user?.username);
  const [editedName, setEditedName] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["playlist", playlistId],
    queryFn: () => getPlaylist(id),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["playlist", playlistId] });
    void queryClient.invalidateQueries({ queryKey: ["playlists"] });
  };

  const renameMutation = useMutation({
    mutationFn: (name: string) => renamePlaylist(id, name),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deletePlaylist(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["playlists"] });
      navigate("/tracks", { replace: true });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: (itemId: number) => removePlaylistItem(id, itemId),
    onSuccess: invalidate,
  });

  const reorderMutation = useMutation({
    mutationFn: (itemIds: number[]) => updatePlaylistOrder(id, itemIds),
    onSuccess: invalidate,
  });

  const publicMutation = useMutation({
    mutationFn: (isPublic: boolean) => setPlaylistPublic(id, isPublic),
    onSuccess: invalidate,
  });

  if (query.isPending) return <PageSpinner />;
  if (query.isError) {
    return <p className="py-12 text-center text-red-400">Failed to load playlist.</p>;
  }
  const playlist = query.data;
  const tracks = playlist.items.map((item) => item.track);
  const totalDuration = tracks.reduce((sum, track) => sum + track.duration, 0);
  // Shared playlists from other users are read-only
  const isOwner = !playlist.owner_username || playlist.owner_username === username;

  const handleReorder = (fromIndex: number, toIndex: number) => {
    const itemIds = playlist.items.map((item) => item.id);
    const [moved] = itemIds.splice(fromIndex, 1);
    itemIds.splice(toIndex, 0, moved);
    reorderMutation.mutate(itemIds);
  };

  const commitRename = () => {
    const name = editedName?.trim();
    setEditedName(null);
    if (name && name !== playlist.name) renameMutation.mutate(name);
  };

  const handleDelete = () => {
    if (window.confirm(`Delete playlist "${playlist.name}"?`)) deleteMutation.mutate();
  };

  const handleOfflineDownload = async () => {
    setDownloadProgress("0/" + tracks.length);
    try {
      const result = await downloadTracks(tracks, (done, total) =>
        setDownloadProgress(`${done}/${total}`),
      );
      setDownloadProgress(null);
      if (result.failed > 0) {
        window.alert(`${result.failed} tracks could not be downloaded.`);
      }
    } catch {
      setDownloadProgress(null);
      window.alert("Offline downloads need HTTPS (or localhost).");
    }
  };

  return (
    <div>
      <div className="mb-8 flex items-end gap-6">
        <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-500">
          <ListMusic className="h-14 w-14" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            {isOwner ? "Playlist" : `Shared by ${playlist.owner_username}`}
          </p>
          {isOwner ? (
            <input
              value={editedName ?? playlist.name}
              onChange={(event) => setEditedName(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") (event.target as HTMLInputElement).blur();
              }}
              className="mt-1 w-full truncate border-none bg-transparent text-4xl font-bold text-zinc-100 outline-none focus:ring-0"
              aria-label="Playlist name"
            />
          ) : (
            <h1 className="mt-1 truncate text-4xl font-bold text-zinc-100">
              {playlist.name}
            </h1>
          )}
          <p className="mt-2 text-sm text-zinc-400">
            {tracks.length} tracks · {formatTotalDuration(totalDuration)}
            {playlist.is_public && isOwner && (
              <span className="ml-2 text-emerald-500">· public</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => playQueue(tracks)}
            disabled={tracks.length === 0}
            className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
          >
            <Play className="h-4 w-4" />
            Play
          </button>
          {offlineSupported() && (
            <button
              type="button"
              onClick={() => void handleOfflineDownload()}
              disabled={tracks.length === 0 || downloadProgress !== null}
              className="flex items-center gap-1.5 rounded-full p-2.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40"
              aria-label="Download for offline playback"
              title="Download for offline playback"
            >
              <HardDriveDownload className="h-5 w-5" />
              {downloadProgress && (
                <span className="text-xs tabular-nums">{downloadProgress}</span>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => void downloadPlaylistExport(id, playlist.name)}
            disabled={tracks.length === 0}
            className="rounded-full p-2.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40"
            aria-label="Export playlist"
            title="Export as M3U"
          >
            <Download className="h-5 w-5" />
          </button>
          {isOwner && (
            <button
              type="button"
              onClick={() => publicMutation.mutate(!playlist.is_public)}
              disabled={publicMutation.isPending}
              className={`rounded-full p-2.5 transition-colors hover:bg-zinc-800 ${
                playlist.is_public
                  ? "text-emerald-500"
                  : "text-zinc-500 hover:text-zinc-100"
              }`}
              aria-label={playlist.is_public ? "Make private" : "Share with other users"}
              title={
                playlist.is_public
                  ? "Public — other users can see and play it"
                  : "Share with other users"
              }
            >
              <Globe className="h-5 w-5" />
            </button>
          )}
          {isOwner && (
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-full p-2.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
              aria-label="Delete playlist"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {tracks.length === 0 ? (
        <p className="py-12 text-center text-zinc-500">
          This playlist is empty — add tracks from the library.
        </p>
      ) : !isOwner ? (
        <TrackList tracks={tracks} />
      ) : (
        <TrackList
          tracks={tracks}
          onReorder={handleReorder}
          trailing={(_track, index) => {
            const item = playlist.items[index];
            const handleRemove = (event: MouseEvent) => {
              event.stopPropagation();
              removeItemMutation.mutate(item.id);
            };
            return (
              <button
                type="button"
                onClick={handleRemove}
                className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700/50 hover:text-red-400"
                aria-label="Remove from playlist"
              >
                <X className="h-4 w-4" />
              </button>
            );
          }}
        />
      )}
    </div>
  );
}
