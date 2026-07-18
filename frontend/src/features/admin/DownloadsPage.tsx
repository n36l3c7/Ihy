import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, DownloadCloud, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { getSources } from "../../api/admin";
import {
  createWatch,
  deleteWatch,
  getDownloadSettings,
  getDownloadStatus,
  getWatches,
  runDownloads,
  updateDownloadSettings,
  updateWatch,
} from "../../api/downloads";
import { ApiError } from "../../api/http";
import { PageSpinner } from "../../components/Spinner";
import { buttonClass, inputClass } from "../auth/LoginPage";

export function DownloadsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [sourceId, setSourceId] = useState<string>("");
  const [interval, setIntervalHours] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sources = useQuery({ queryKey: ["sources"], queryFn: getSources });
  const watches = useQuery({ queryKey: ["download-watches"], queryFn: getWatches });
  const status = useQuery({
    queryKey: ["download-status"],
    queryFn: getDownloadStatus,
    refetchInterval: (q) => (q.state.data?.running ? 2000 : false),
  });
  const settings = useQuery({
    queryKey: ["download-settings"],
    queryFn: getDownloadSettings,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["download-watches"] });
    void queryClient.invalidateQueries({ queryKey: ["download-status"] });
  };
  const onError = (err: unknown) =>
    setError(err instanceof ApiError ? err.message : "Operation failed");

  const addMutation = useMutation({
    mutationFn: () =>
      createWatch({ name: name.trim(), query: query.trim(), source_id: Number(sourceId) }),
    onSuccess: () => {
      setName("");
      setQuery("");
      setError(null);
      invalidate();
    },
    onError,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      updateWatch(id, { enabled }),
    onSuccess: invalidate,
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWatch,
    onSuccess: invalidate,
    onError,
  });

  const runMutation = useMutation({ mutationFn: runDownloads, onSettled: invalidate, onError });

  const intervalMutation = useMutation({
    mutationFn: (hours: number) => updateDownloadSettings({ check_interval_hours: hours }),
    onSuccess: (data) => {
      queryClient.setQueryData(["download-settings"], data);
      setIntervalHours(null);
      setError(null);
    },
    onError,
  });

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    addMutation.mutate();
  };

  const running = status.data?.running ?? false;
  const available = status.data?.available ?? true;
  const sourceName = (id: number) =>
    sources.data?.find((source) => source.id === id)?.name ?? `#${id}`;
  const intervalValue =
    interval ?? settings.data?.check_interval_hours.toString() ?? "";

  return (
    <div className="max-w-4xl">
      {!available && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-600/40 bg-amber-600/10 p-4 text-sm text-amber-400">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          spotdl is not installed on the server. Watches can be configured but downloads will
          not run. In Docker the image ships with spotdl included.
        </div>
      )}

      <form onSubmit={handleAdd} className="mb-8 rounded-lg border border-zinc-800 p-4">
        <p className="mb-1 text-sm font-medium text-zinc-300">Watch an artist or album</p>
        <p className="mb-3 text-xs text-zinc-500">
          New releases are downloaded automatically into the chosen source folder; existing
          files are skipped.
        </p>
        <div className="flex flex-wrap gap-3">
          <input
            className={`${inputClass} w-44 flex-none`}
            placeholder="Display name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <input
            className={`${inputClass} min-w-64 flex-1`}
            placeholder="Spotify URL or search (e.g. artist name)"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            required
          />
          <select
            className={`${inputClass} w-44 flex-none`}
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
            required
          >
            <option value="" disabled>
              Download into...
            </option>
            {sources.data?.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={addMutation.isPending}
            className={`${buttonClass} w-auto px-4`}
          >
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Watch
            </span>
          </button>
        </div>
      </form>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {watches.isPending ? (
        <PageSpinner />
      ) : watches.isError ? (
        <p className="text-red-400">Failed to load watches.</p>
      ) : watches.data.length === 0 ? (
        <p className="mb-8 text-zinc-500">Nothing watched yet.</p>
      ) : (
        <ul className="mb-8 divide-y divide-zinc-800 rounded-lg border border-zinc-800">
          {watches.data.map((watch) => (
            <li key={watch.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-100">{watch.name}</p>
                <p className="truncate text-xs text-zinc-500">
                  {watch.query} → {sourceName(watch.source_id)}
                </p>
                {watch.last_status === "error" && watch.last_error && (
                  <p className="mt-1 truncate text-xs text-red-400" title={watch.last_error}>
                    {watch.last_error}
                  </p>
                )}
              </div>
              {watch.last_status && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                    watch.last_status === "ok"
                      ? "bg-emerald-600/20 text-emerald-400"
                      : "bg-red-600/20 text-red-400"
                  }`}
                >
                  {watch.last_status}
                </span>
              )}
              <label className="flex shrink-0 items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={watch.enabled}
                  onChange={(event) =>
                    toggleMutation.mutate({ id: watch.id, enabled: event.target.checked })
                  }
                  className="accent-emerald-500"
                />
                enabled
              </label>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(watch.id)}
                className="shrink-0 rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
                aria-label={`Delete watch ${watch.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-zinc-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-300">Automatic checks</p>
            <p className="mt-1 text-xs text-zinc-500">
              {running
                ? `Checking now: ${status.data?.current_watch ?? "..."}`
                : "How often watches are checked for new releases. 0 disables the schedule."}
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
              disabled={running || runMutation.isPending || !available}
              className={`${buttonClass} w-auto px-4`}
            >
              <span className="flex items-center gap-2">
                <DownloadCloud className={`h-4 w-4 ${running ? "animate-pulse" : ""}`} />
                {running ? "Running..." : "Check now"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
