import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DownloadCloud } from "lucide-react";
import { useState } from "react";

import {
  getDownloadLog,
  getDownloadSettings,
  getDownloadStatus,
  getWatches,
  runDownloads,
  updateDownloadSettings,
} from "../../../api/downloads";
import { ApiError } from "../../../api/http";
import { buttonClass, inputClass } from "../../auth/LoginPage";

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
    refetchInterval: running ? 2000 : 15_000,
  });

  const settings = useQuery({
    queryKey: ["download-settings"],
    queryFn: getDownloadSettings,
  });

  const watches = useQuery({ queryKey: ["download-watches"], queryFn: getWatches });
  const failing = watches.data?.filter((watch) => watch.last_status === "error") ?? [];

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
    <div className="max-w-3xl">
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
          <ul className="flex flex-col gap-2">
            {failing.map((watch) => (
              <li key={watch.id} className="text-xs">
                <span className="font-medium text-zinc-200">{watch.name}</span>
                <pre className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap rounded bg-zinc-950 p-2 text-red-300/80">
                  {watch.last_error ?? "Unknown error"}
                </pre>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 p-4">
        <p className="mb-2 text-sm font-medium text-zinc-300">CLI log</p>
        {log.data && log.data.lines.length > 0 ? (
          <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded bg-zinc-950 p-3 font-mono text-xs leading-5 text-zinc-400">
            {log.data.lines.join("\n")}
          </pre>
        ) : (
          <p className="text-xs text-zinc-500">No activity yet — run a check to see output.</p>
        )}
      </div>
    </div>
  );
}
