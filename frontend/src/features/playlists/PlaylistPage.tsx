import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListMusic, Play, Trash2, X } from "lucide-react";
import { type MouseEvent, useState } from "react";
import { useNavigate, useParams } from "react-router";

import {
  deletePlaylist,
  getPlaylist,
  removePlaylistItem,
  renamePlaylist,
  updatePlaylistOrder,
} from "../../api/userLibrary";
import { PageSpinner } from "../../components/Spinner";
import { formatTotalDuration } from "../../lib/format";
import { usePlayerStore } from "../../stores/playerStore";
import { TrackList } from "../library/TrackList";

export function PlaylistPage() {
  const { playlistId } = useParams();
  const id = Number(playlistId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const playQueue = usePlayerStore((state) => state.playQueue);
  const [editedName, setEditedName] = useState<string | null>(null);

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

  if (query.isPending) return <PageSpinner />;
  if (query.isError) {
    return <p className="py-12 text-center text-red-400">Failed to load playlist.</p>;
  }
  const playlist = query.data;
  const tracks = playlist.items.map((item) => item.track);
  const totalDuration = tracks.reduce((sum, track) => sum + track.duration, 0);

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

  return (
    <div>
      <div className="mb-8 flex items-end gap-6">
        <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-500">
          <ListMusic className="h-14 w-14" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Playlist</p>
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
          <p className="mt-2 text-sm text-zinc-400">
            {tracks.length} tracks · {formatTotalDuration(totalDuration)}
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
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-full p-2.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
            aria-label="Delete playlist"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>

      {tracks.length === 0 ? (
        <p className="py-12 text-center text-zinc-500">
          This playlist is empty — add tracks from the library.
        </p>
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
