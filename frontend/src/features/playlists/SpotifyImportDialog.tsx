import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudDownload, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import { getSpotifyImportStatus, startSpotifyImport } from "../../api/downloads";

const STATE_LABELS: Record<string, string> = {
  saving: "Reading the playlist from Spotify...",
  downloading: "Downloading tracks with spotdl...",
  scanning: "Scanning the library...",
  building: "Building your playlist...",
  done: "Done!",
  error: "Import failed",
};

/** Paste a Spotify playlist URL: spotdl downloads it and Ihy creates the
 *  matching playlist. Progress is polled while the job runs. */
export function SpotifyImportDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");

  const status = useQuery({
    queryKey: ["spotify-import"],
    queryFn: getSpotifyImportStatus,
    refetchInterval: (query) => (query.state.data?.running ? 2000 : false),
  });

  const startMutation = useMutation({
    mutationFn: () => startSpotifyImport(url.trim(), name.trim() || undefined),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["spotify-import"] }),
  });

  const data = status.data;
  const busy = data?.running === true;
  const finished = data?.state === "done" && data.playlist_id !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-900 p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
            <CloudDownload className="h-5 w-5 text-emerald-500" />
            Import from Spotify
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Paste a playlist link: the tracks are downloaded with spotdl into your
          library and a playlist with the same name and order is created.
        </p>

        {data && !data.available && (
          <p className="mt-3 text-sm text-amber-400">
            spotdl is not installed on the server.
          </p>
        )}

        {!busy && !finished && (
          <div className="mt-4 flex flex-col gap-2">
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://open.spotify.com/playlist/..."
              className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-600"
            />
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Playlist name (optional, defaults to the Spotify name)"
              maxLength={100}
              className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-600"
            />
            <button
              type="button"
              onClick={() => startMutation.mutate()}
              disabled={
                !url.includes("spotify.com") ||
                startMutation.isPending ||
                data?.available === false
              }
              className="mt-1 self-start rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              Import
            </button>
            {startMutation.isError && (
              <p className="text-sm text-red-400">
                {startMutation.error instanceof Error
                  ? startMutation.error.message
                  : "Could not start the import."}
              </p>
            )}
          </div>
        )}

        {data && (busy || data.state !== "idle") && (
          <div className="mt-4">
            <p className="text-sm font-medium text-zinc-200">
              {STATE_LABELS[data.state] ?? data.state}
              {data.total > 0 && ` (${data.total} tracks)`}
            </p>
            {data.error && <p className="mt-1 text-sm text-red-400">{data.error}</p>}
            {data.log.length > 0 && (
              <pre className="mt-2 max-h-40 overflow-y-auto rounded-md bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-400">
                {data.log.join("\n")}
              </pre>
            )}
            {finished && (
              <button
                type="button"
                onClick={() => {
                  void queryClient.invalidateQueries({ queryKey: ["playlists"] });
                  navigate(`/playlists/${data.playlist_id}`);
                  onClose();
                }}
                className="mt-3 rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                Open "{data.playlist_name}" ({data.matched}/{data.total} matched)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
