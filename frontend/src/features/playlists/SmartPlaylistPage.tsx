import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Play, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import {
  deleteSmartPlaylist,
  getSmartPlaylist,
  getSmartPlaylistTracks,
  type SmartPlaylistPayload,
  updateSmartPlaylist,
} from "../../api/smartPlaylists";
import { PageSpinner } from "../../components/Spinner";
import { formatTotalDuration } from "../../lib/format";
import { usePlayerStore } from "../../stores/playerStore";
import { TrackList } from "../library/TrackList";
import { SmartPlaylistDialog } from "./SmartPlaylistDialog";

export function SmartPlaylistPage() {
  const { smartId } = useParams();
  const id = Number(smartId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const playQueue = usePlayerStore((state) => state.playQueue);
  const [editing, setEditing] = useState(false);

  const playlist = useQuery({
    queryKey: ["smart-playlist", smartId],
    queryFn: () => getSmartPlaylist(id),
  });
  const tracks = useQuery({
    queryKey: ["smart-playlist-tracks", smartId],
    queryFn: () => getSmartPlaylistTracks(id),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["smart-playlist", smartId] });
    void queryClient.invalidateQueries({ queryKey: ["smart-playlist-tracks", smartId] });
    void queryClient.invalidateQueries({ queryKey: ["smart-playlists"] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: SmartPlaylistPayload) => updateSmartPlaylist(id, payload),
    onSuccess: invalidate,
  });

  const handleDelete = async () => {
    if (!playlist.data) return;
    if (!window.confirm(`Delete smart playlist "${playlist.data.name}"?`)) return;
    await deleteSmartPlaylist(id);
    void queryClient.invalidateQueries({ queryKey: ["smart-playlists"] });
    navigate("/tracks", { replace: true });
  };

  if (playlist.isPending) return <PageSpinner />;
  if (playlist.isError) {
    return <p className="py-12 text-center text-red-400">Failed to load smart playlist.</p>;
  }
  const data = playlist.data;
  const trackItems = tracks.data ?? [];
  const totalDuration = trackItems.reduce((sum, track) => sum + track.duration, 0);

  return (
    <div>
      <div className="mb-8 flex items-end gap-6">
        <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-emerald-500">
          <Sparkles className="h-14 w-14" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Smart playlist
          </p>
          <h1 className="mt-1 truncate text-4xl font-bold">{data.name}</h1>
          <p className="mt-2 text-sm text-zinc-400">
            {data.rules.length} rule{data.rules.length === 1 ? "" : "s"} · match {data.match} ·{" "}
            {trackItems.length} tracks · {formatTotalDuration(totalDuration)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => playQueue(trackItems)}
            disabled={trackItems.length === 0}
            className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
          >
            <Play className="h-4 w-4" />
            Play
          </button>
          <button
            type="button"
            onClick={() => void tracks.refetch()}
            className="rounded-full p-2.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Refresh"
            title="Re-evaluate rules"
          >
            <RefreshCw className={`h-5 w-5 ${tracks.isFetching ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-full p-2.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Edit rules"
          >
            <Pencil className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            className="rounded-full p-2.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
            aria-label="Delete smart playlist"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>

      {tracks.isPending ? (
        <PageSpinner />
      ) : trackItems.length === 0 ? (
        <p className="py-12 text-center text-zinc-500">
          No tracks match these rules yet — edit them with the pencil button.
        </p>
      ) : (
        <TrackList tracks={trackItems} />
      )}

      {editing && (
        <SmartPlaylistDialog
          initial={data}
          onSave={async (payload) => {
            await saveMutation.mutateAsync(payload);
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
