import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyX, FileWarning, Trash2 } from "lucide-react";

import { cleanupBrokenFiles, getBrokenFiles, getDuplicates } from "../../api/admin";
import { deleteTrack } from "../../api/catalog";
import type { Track } from "../../api/types";
import { PageSpinner } from "../../components/Spinner";
import { artistNames, formatDuration } from "../../lib/format";

function trackMeta(track: Track): string {
  const bitrate = track.bitrate ? `${Math.round(track.bitrate / 1000)} kbps` : "?";
  return `${track.format.toUpperCase()} · ${bitrate} · ${formatDuration(track.duration)}`;
}

export function HealthPage() {
  const queryClient = useQueryClient();
  const duplicates = useQuery({ queryKey: ["duplicates"], queryFn: getDuplicates });
  const broken = useQuery({ queryKey: ["broken-files"], queryFn: getBrokenFiles });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["duplicates"] });
    void queryClient.invalidateQueries({ queryKey: ["broken-files"] });
  };

  const deleteMutation = useMutation({
    mutationFn: (trackId: number) => deleteTrack(trackId),
    onSuccess: invalidate,
  });

  const cleanupMutation = useMutation({
    mutationFn: cleanupBrokenFiles,
    onSuccess: invalidate,
  });

  const handleDelete = (track: Track) => {
    if (
      window.confirm(
        `Delete "${track.title}" (${track.format.toUpperCase()})? The file is removed from disk.`,
      )
    ) {
      deleteMutation.mutate(track.id);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="rounded-lg border border-zinc-800 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-zinc-300">
          <CopyX className="h-4 w-4 text-emerald-500" />
          Duplicate tracks
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Tracks sharing the same title and artists. The best copy (highest bitrate)
          is listed first — delete the others to reclaim space.
        </p>
        {duplicates.isPending ? (
          <PageSpinner />
        ) : duplicates.data?.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">No duplicates found.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {duplicates.data?.map((group) => (
              <div
                key={group[0].id}
                className="rounded-md border border-zinc-800/70 bg-zinc-900/40"
              >
                <p className="border-b border-zinc-800/70 px-4 py-2 text-sm font-medium text-zinc-200">
                  {group[0].title}
                  <span className="ml-2 text-xs text-zinc-500">
                    {artistNames(group[0].artists)}
                  </span>
                </p>
                <ul className="divide-y divide-zinc-800/50">
                  {group.map((track, index) => (
                    <li key={track.id} className="flex items-center gap-3 px-4 py-2">
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          index === 0
                            ? "bg-emerald-600/15 text-emerald-400"
                            : "bg-zinc-800 text-zinc-500"
                        }`}
                      >
                        {index === 0 ? "best" : "copy"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">
                        {trackMeta(track)}
                        {track.album && ` · ${track.album.title}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(track)}
                        disabled={deleteMutation.isPending}
                        className="shrink-0 rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
                        aria-label={`Delete this copy of ${track.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-zinc-800 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-zinc-300">
          <FileWarning className="h-4 w-4 text-amber-400" />
          Missing files
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Library entries whose audio file no longer exists on disk (deleted or moved
          outside Ihy). Unreachable sources are excluded, so an unmounted share never
          triggers false positives.
        </p>
        {broken.isPending ? (
          <PageSpinner />
        ) : (
          <>
            {broken.data && broken.data.offline_sources.length > 0 && (
              <p className="mt-3 rounded-md border border-amber-600/40 bg-amber-600/10 px-3 py-2 text-xs text-amber-300">
                Skipped unreachable source
                {broken.data.offline_sources.length > 1 ? "s" : ""}:{" "}
                {broken.data.offline_sources
                  .map((source) => `${source.name} (${source.path})`)
                  .join(", ")}
              </p>
            )}
            {broken.data?.broken.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-500">
                No missing files.
              </p>
            ) : (
              <>
                <ul className="mt-3 divide-y divide-zinc-800/50">
                  {broken.data?.broken.map((track) => (
                    <li key={track.id} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-zinc-200">
                          {track.title}
                          <span className="ml-2 text-xs text-zinc-500">
                            {artistNames(track.artists)}
                          </span>
                        </span>
                        <span className="block truncate font-mono text-[11px] text-zinc-600">
                          {/* file_path is not exposed; show what we know */}
                          {trackMeta(track)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => cleanupMutation.mutate()}
                  disabled={cleanupMutation.isPending}
                  className="mt-4 flex items-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:border-red-500 hover:text-red-400 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove {broken.data?.broken.length} broken entr
                  {broken.data && broken.data.broken.length === 1 ? "y" : "ies"}
                </button>
                {cleanupMutation.isSuccess && (
                  <p className="mt-2 text-sm text-emerald-500">
                    Removed {cleanupMutation.data.removed} entries.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>

      <p className="mt-6 text-xs text-zinc-500">
        Source folders are also watched live: new or changed audio files trigger an
        automatic incremental scan (disable with <code>IHY_WATCH_FOLDERS=false</code>).
      </p>
    </div>
  );
}
