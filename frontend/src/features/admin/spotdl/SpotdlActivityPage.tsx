import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DownloadCloud, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  deleteFix,
  type DownloadFix,
  getDownloadLog,
  getDownloadSettings,
  getDownloadStatus,
  getFixes,
  getWatches,
  runDownloads,
  updateDownloadSettings,
  updateFix,
} from "../../../api/downloads";
import { ApiError } from "../../../api/http";
import { buttonClass, inputClass } from "../../auth/LoginPage";

function FixRow({ fix }: { fix: DownloadFix }) {
  const queryClient = useQueryClient();
  const [spotifyUrl, setSpotifyUrl] = useState(fix.spotify_url ?? "");
  const [youtubeUrl, setYoutubeUrl] = useState(fix.youtube_url ?? "");

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["download-fixes"] });

  const saveMutation = useMutation({
    mutationFn: () =>
      updateFix(fix.id, {
        spotify_url: spotifyUrl.trim() || null,
        youtube_url: youtubeUrl.trim() || null,
      }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({ mutationFn: () => deleteFix(fix.id), onSuccess: invalidate });

  const ready = Boolean(fix.spotify_url && fix.youtube_url);
  const dirty = spotifyUrl !== (fix.spotify_url ?? "") || youtubeUrl !== (fix.youtube_url ?? "");

  return (
    <li className="px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100" title={fix.error ?? ""}>
          {fix.song}
        </p>
        {fix.watch_name && (
          <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
            {fix.watch_name}
          </span>
        )}
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
            ready ? "bg-emerald-600/20 text-emerald-400" : "bg-amber-600/20 text-amber-400"
          }`}
        >
          {ready ? "fix active" : "needs URL"}
        </span>
      </div>
      {fix.error && (
        <p className="mb-2 truncate text-xs text-zinc-500" title={fix.error}>
          {fix.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${inputClass} min-w-44 flex-1 py-1 font-mono text-xs`}
          placeholder="https://open.spotify.com/track/..."
          value={spotifyUrl}
          onChange={(event) => setSpotifyUrl(event.target.value)}
        />
        <input
          className={`${inputClass} min-w-44 flex-1 py-1 font-mono text-xs`}
          placeholder="https://youtube.com/watch?v=..."
          value={youtubeUrl}
          onChange={(event) => setYoutubeUrl(event.target.value)}
        />
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || saveMutation.isPending}
          className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-emerald-400 disabled:opacity-30"
          aria-label="Save fix"
          title="Save"
        >
          <Save className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => deleteMutation.mutate()}
          disabled={deleteMutation.isPending}
          className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
          aria-label="Delete fix"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

export function SpotdlActivityPage() {
  const queryClient = useQueryClient();
  const [interval, setIntervalHours] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ["download-status"],
    queryFn: getDownloadStatus,
    refetchInterval: (q) => (q.state.data?.running ? 2000 : 10_000),
  });
  const running = status.data?.running ?? false;

  const log = useQuery({
    queryKey: ["download-log"],
    queryFn: getDownloadLog,
    refetchInterval: running ? 1000 : 15_000,
  });

  // Follow the log like a terminal: stick to the bottom as new lines arrive
  const logRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log.data]);

  const settings = useQuery({
    queryKey: ["download-settings"],
    queryFn: getDownloadSettings,
  });

  const watches = useQuery({ queryKey: ["download-watches"], queryFn: getWatches });
  const failing = watches.data?.filter((watch) => watch.last_status === "error") ?? [];

  const fixes = useQuery({
    queryKey: ["download-fixes"],
    queryFn: getFixes,
    refetchInterval: running ? 3000 : 15_000,
  });

  const runMutation = useMutation({
    mutationFn: runDownloads,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["download-status"] });
      void queryClient.invalidateQueries({ queryKey: ["download-log"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to start"),
  });

  const intervalMutation = useMutation({
    mutationFn: (hours: number) => updateDownloadSettings({ check_interval_hours: hours }),
    onSuccess: (data) => {
      queryClient.setQueryData(["download-settings"], data);
      setIntervalHours(null);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to save"),
  });

  const intervalValue = interval ?? settings.data?.check_interval_hours.toString() ?? "";

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div className="min-w-0">
        <div className="mb-6 rounded-lg border border-zinc-800 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-300">
                {running
                  ? `Checking now: ${status.data?.current_watch ?? "..."}`
                  : "Periodic check"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Watches are checked automatically for new releases. 0 hours disables the
                schedule.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                every
                <input
                  className={`${inputClass} w-20 py-1`}
                  value={intervalValue}
                  onChange={(event) => setIntervalHours(event.target.value)}
                  inputMode="numeric"
                />
                hours
              </label>
              <button
                type="button"
                onClick={() => {
                  const hours = Number(intervalValue);
                  if (Number.isInteger(hours) && hours >= 0) intervalMutation.mutate(hours);
                }}
                disabled={intervalMutation.isPending || interval === null}
                className={`${buttonClass} w-auto px-4`}
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => runMutation.mutate()}
                disabled={running || runMutation.isPending}
                className={`${buttonClass} w-auto px-4`}
              >
                <span className="flex items-center gap-2">
                  <DownloadCloud className={`h-4 w-4 ${running ? "animate-pulse" : ""}`} />
                  {running ? "Running..." : "Check now"}
                </span>
              </button>
            </div>
          </div>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </div>

        {failing.length > 0 && (
          <div className="mb-6 rounded-lg border border-red-900/50 p-4">
            <p className="mb-2 text-sm font-medium text-red-400">
              Watches with errors ({failing.length})
            </p>
            <ul className="flex flex-col gap-1 text-xs">
              {failing.map((watch) => (
                <li key={watch.id} className="truncate text-zinc-300" title={watch.last_error ?? ""}>
                  <span className="font-medium">{watch.name}</span>
                  <span className="text-zinc-500"> — {watch.last_error ?? "Unknown error"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-lg border border-zinc-800 p-4">
          <p className="mb-2 text-sm font-medium text-zinc-300">
            CLI log
            {running && (
              <span className="ml-2 animate-pulse text-xs text-emerald-500">● live</span>
            )}
          </p>
          {log.data && log.data.lines.length > 0 ? (
            <pre
              ref={logRef}
              className="h-[calc(100vh-30rem)] min-h-72 overflow-y-auto whitespace-pre-wrap rounded bg-zinc-950 p-3 font-mono text-xs leading-5 text-zinc-400"
            >
              {log.data.lines.join("\n")}
            </pre>
          ) : (
            <p className="text-xs text-zinc-500">No activity yet — run a check to see output.</p>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <div className="rounded-lg border border-zinc-800">
          <div className="border-b border-zinc-800 p-4">
            <p className="text-sm font-medium text-zinc-300">Failed songs</p>
            <p className="mt-1 text-xs text-zinc-500">
              Songs spotdl could not download. Paste the matching YouTube URL and save: fixes
              with both URLs are applied automatically on every check, so you only do this
              once.
            </p>
          </div>
          {fixes.isPending ? (
            <p className="p-4 text-xs text-zinc-500">Loading...</p>
          ) : fixes.isError ? (
            <p className="p-4 text-sm text-red-400">Failed to load.</p>
          ) : fixes.data.length === 0 ? (
            <p className="p-4 text-xs text-zinc-500">
              Nothing to fix — failed songs will appear here after a check.
            </p>
          ) : (
            <ul className="max-h-[calc(100vh-24rem)] divide-y divide-zinc-800 overflow-y-auto">
              {fixes.data.map((fix) => (
                <FixRow key={fix.id} fix={fix} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
