import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DownloadCloud, Music2, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { getSources } from "../../../api/admin";
import {
  createWatch,
  deleteWatch,
  getDownloadStatus,
  getSpotdlOptions,
  getWatches,
  resolveSpotifyUrl,
  runWatch,
  searchSpotifyArtists,
  updateWatch,
} from "../../../api/downloads";
import { ApiError } from "../../../api/http";
import { PageSpinner } from "../../../components/Spinner";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { buttonClass, inputClass } from "../../auth/LoginPage";

export function WatchesPage() {
  const queryClient = useQueryClient();
  const [sourceId, setSourceId] = useState<string>("");
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search, 400);
  const [manualName, setManualName] = useState("");
  const [manualQuery, setManualQuery] = useState("");
  const debouncedManualQuery = useDebouncedValue(manualQuery, 500);
  const [error, setError] = useState<string | null>(null);

  const sources = useQuery({ queryKey: ["sources"], queryFn: getSources });
  const watches = useQuery({ queryKey: ["download-watches"], queryFn: getWatches });
  const options = useQuery({ queryKey: ["spotdl-options"], queryFn: getSpotdlOptions });
  const hasCredentials = Boolean(options.data?.client_id && options.data?.client_secret);
  const status = useQuery({
    queryKey: ["download-status"],
    queryFn: getDownloadStatus,
    refetchInterval: (q) => (q.state.data?.running ? 2000 : false),
  });
  const running = status.data?.running ?? false;

  const runWatchMutation = useMutation({
    mutationFn: runWatch,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["download-status"] });
      void queryClient.invalidateQueries({ queryKey: ["download-watches"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to start"),
  });

  const spotifySearch = useQuery({
    queryKey: ["spotify-search", query],
    queryFn: () => searchSpotifyArtists(query),
    enabled: hasCredentials && query.trim().length >= 2,
    retry: false,
    staleTime: 60_000,
  });

  // Pasting a Spotify URL in the manual form resolves the display name
  // from the public page — no API credentials needed.
  useEffect(() => {
    const url = debouncedManualQuery.trim();
    if (!url.startsWith("https://open.spotify.com/")) return;
    let cancelled = false;
    resolveSpotifyUrl(url)
      .then((resolved) => {
        if (!cancelled) {
          setManualName((current) => current || resolved.name);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [debouncedManualQuery]);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["download-watches"] });
  const onError = (err: unknown) =>
    setError(err instanceof ApiError ? err.message : "Operation failed");

  const addMutation = useMutation({
    mutationFn: (payload: { name: string; query: string }) =>
      createWatch({ ...payload, source_id: Number(sourceId) }),
    onSuccess: () => {
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

  const watchedQueries = new Set(watches.data?.map((watch) => watch.query) ?? []);
  const canAdd = sourceId !== "";

  const handleManualAdd = (event: FormEvent) => {
    event.preventDefault();
    addMutation.mutate({ name: manualName.trim(), query: manualQuery.trim() });
    setManualName("");
    setManualQuery("");
  };

  const sourceName = (id: number) =>
    sources.data?.find((source) => source.id === id)?.name ?? `#${id}`;

  return (
    <div className="max-w-3xl">
      <div className="mb-6 rounded-lg border border-zinc-800 p-4">
        <p className="mb-1 text-sm font-medium text-zinc-300">Watch an artist</p>
        <p className="mb-3 text-xs text-zinc-500">
          New releases are downloaded automatically into the chosen source folder. Existing
          files are skipped.
        </p>
        <div className="mb-3 flex flex-wrap gap-3">
          <select
            className={`${inputClass} w-56 flex-none`}
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
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
          <input
            className={`${inputClass} min-w-64 flex-1 disabled:cursor-not-allowed disabled:opacity-50`}
            type="search"
            placeholder={
              hasCredentials
                ? "Search artists on Spotify..."
                : "Search disabled — Spotify API credentials missing"
            }
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            disabled={!hasCredentials}
          />
        </div>
        {!hasCredentials && (
          <p className="mb-3 text-xs text-amber-400">
            Real-time search needs Spotify API credentials (SpotDL → Settings). No credentials?
            Paste an artist URL from open.spotify.com below — the name fills in automatically.
          </p>
        )}

        {spotifySearch.isError && (
          <p className="mb-2 text-xs text-amber-400">
            {spotifySearch.error instanceof ApiError
              ? spotifySearch.error.message
              : "Spotify search failed"}
          </p>
        )}
        {spotifySearch.isFetching && <p className="mb-2 text-xs text-zinc-500">Searching...</p>}
        {spotifySearch.data && spotifySearch.data.length > 0 && (
          <ul className="mb-3 divide-y divide-zinc-800/60 rounded-md border border-zinc-800">
            {spotifySearch.data.map((artist) => {
              const alreadyWatched = watchedQueries.has(artist.url);
              return (
                <li key={artist.id}>
                  <button
                    type="button"
                    disabled={!canAdd || alreadyWatched || addMutation.isPending}
                    onClick={() => addMutation.mutate({ name: artist.name, query: artist.url })}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-zinc-800/60 disabled:cursor-not-allowed disabled:opacity-50"
                    title={
                      alreadyWatched
                        ? "Already watched"
                        : canAdd
                          ? `Watch ${artist.name}`
                          : "Choose a destination source first"
                    }
                  >
                    {artist.image ? (
                      <img src={artist.image} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800">
                        <Music2 className="h-4 w-4 text-zinc-500" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-zinc-100">{artist.name}</span>
                      {artist.followers !== null && (
                        <span className="block text-xs text-zinc-500">
                          {artist.followers.toLocaleString()} followers
                        </span>
                      )}
                    </span>
                    <Plus className="h-4 w-4 shrink-0 text-emerald-500" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t border-zinc-800 pt-3">
          <p className="mb-2 text-xs text-zinc-500">
            Add by URL (name resolves automatically) or free search text
          </p>
          <form onSubmit={handleManualAdd} className="flex flex-wrap gap-3">
            <input
              className={`${inputClass} min-w-56 flex-1`}
              placeholder="https://open.spotify.com/artist/... or search text"
              value={manualQuery}
              onChange={(event) => setManualQuery(event.target.value)}
              required
            />
            <input
              className={`${inputClass} w-40 flex-none`}
              placeholder="Display name"
              value={manualName}
              onChange={(event) => setManualName(event.target.value)}
              required
            />
            <button
              type="submit"
              disabled={!canAdd || addMutation.isPending}
              className={`${buttonClass} w-auto px-4`}
            >
              Add
            </button>
          </form>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {watches.isPending ? (
        <PageSpinner />
      ) : watches.isError ? (
        <p className="text-red-400">Failed to load watches.</p>
      ) : watches.data.length === 0 ? (
        <p className="text-zinc-500">Nothing watched yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
          {watches.data.map((watch) => (
            <li key={watch.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-100">{watch.name}</p>
                <p className="truncate text-xs text-zinc-500">
                  {watch.query} → {sourceName(watch.source_id)}
                </p>
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
                onClick={() => runWatchMutation.mutate(watch.id)}
                disabled={running || runWatchMutation.isPending}
                className="shrink-0 rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-emerald-400 disabled:opacity-30"
                aria-label={`Check ${watch.name} now`}
                title="Check this watch now"
              >
                <DownloadCloud className="h-4 w-4" />
              </button>
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
    </div>
  );
}
