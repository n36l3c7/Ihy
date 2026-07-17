import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, RefreshCw, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { createSource, deleteSource, getScanStatus, getSources, startScan } from "../../api/admin";
import { ApiError } from "../../api/http";
import { PageSpinner } from "../../components/Spinner";
import { buttonClass, inputClass } from "../auth/LoginPage";

export function SourcesPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const sources = useQuery({ queryKey: ["sources"], queryFn: getSources });
  const scan = useQuery({
    queryKey: ["scan-status"],
    queryFn: getScanStatus,
    refetchInterval: (query) => (query.state.data?.running ? 1000 : false),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["sources"] });
    void queryClient.invalidateQueries({ queryKey: ["scan-status"] });
  };

  const addMutation = useMutation({
    mutationFn: () => createSource(name.trim(), path.trim()),
    onSuccess: () => {
      setName("");
      setPath("");
      setFormError(null);
      invalidate();
    },
    onError: (error) =>
      setFormError(error instanceof ApiError ? error.message : "Failed to add source"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSource,
    onSuccess: invalidate,
  });

  const scanMutation = useMutation({
    mutationFn: startScan,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["scan-status"] }),
  });

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    addMutation.mutate();
  };

  const scanStatus = scan.data;
  const scanning = scanStatus?.running ?? false;

  return (
    <div className="max-w-3xl">

      <form onSubmit={handleAdd} className="mb-8 rounded-lg border border-zinc-800 p-4">
        <p className="mb-3 text-sm font-medium text-zinc-300">Add a source folder</p>
        <div className="flex flex-wrap gap-3">
          <input
            className={`${inputClass} w-48 flex-none`}
            placeholder="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <input
            className={`${inputClass} min-w-64 flex-1`}
            placeholder="Absolute path (e.g. D:\Music or /music)"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            required
          />
          <button
            type="submit"
            disabled={addMutation.isPending}
            className={`${buttonClass} w-auto px-4`}
          >
            <span className="flex items-center gap-2">
              <FolderPlus className="h-4 w-4" />
              Add
            </span>
          </button>
        </div>
        {formError && <p className="mt-2 text-sm text-red-400">{formError}</p>}
      </form>

      {sources.isPending ? (
        <PageSpinner />
      ) : sources.isError ? (
        <p className="text-red-400">Failed to load sources.</p>
      ) : sources.data.length === 0 ? (
        <p className="mb-8 text-zinc-500">No sources configured yet. Add your music folder above.</p>
      ) : (
        <ul className="mb-8 divide-y divide-zinc-800 rounded-lg border border-zinc-800">
          {sources.data.map((source) => (
            <li key={source.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-100">{source.name}</p>
                <p className="truncate text-xs text-zinc-500">{source.path}</p>
              </div>
              <span className="shrink-0 text-xs text-zinc-400">{source.track_count} tracks</span>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(source.id)}
                disabled={deleteMutation.isPending}
                className="shrink-0 rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
                aria-label={`Delete source ${source.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-zinc-800 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-300">Library scan</p>
            <p className="mt-1 text-xs text-zinc-500">
              {scanning
                ? "Scan in progress..."
                : scanStatus?.error
                  ? `Last scan failed: ${scanStatus.error}`
                  : scanStatus?.last_result
                    ? `Last scan: ${scanStatus.last_result.added} added, ` +
                      `${scanStatus.last_result.updated} updated, ` +
                      `${scanStatus.last_result.removed} removed, ` +
                      `${scanStatus.last_result.errors} errors`
                    : "Never scanned yet"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => scanMutation.mutate()}
            disabled={scanning || scanMutation.isPending}
            className={`${buttonClass} w-auto px-4`}
          >
            <span className="flex items-center gap-2">
              <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
              {scanning ? "Scanning..." : "Scan now"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
