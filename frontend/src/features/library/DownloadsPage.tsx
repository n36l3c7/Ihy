import { useQuery } from "@tanstack/react-query";
import { HardDriveDownload, Trash2, X } from "lucide-react";
import { useState } from "react";

import { getTracks } from "../../api/catalog";
import { PageSpinner } from "../../components/Spinner";
import {
  clearDownloads,
  listDownloads,
  offlineSupported,
  removeDownload,
} from "../../lib/offline";
import { TrackList } from "./TrackList";

export function DownloadsPage() {
  const [entries, setEntries] = useState(listDownloads);

  const tracks = useQuery({
    queryKey: ["downloaded-tracks", entries.map((entry) => entry.id).join(",")],
    queryFn: () =>
      entries.length > 0
        ? getTracks({ ids: entries.map((entry) => entry.id).join(","), limit: 1000 })
        : Promise.resolve({ items: [], total: 0, limit: 0, offset: 0 }),
  });

  if (!offlineSupported()) {
    return (
      <p className="py-12 text-center text-zinc-500">
        Offline downloads need a secure context (HTTPS) with Cache Storage support.
      </p>
    );
  }

  const handleRemove = async (trackId: number) => {
    await removeDownload(trackId);
    setEntries(listDownloads());
  };

  const handleClear = async () => {
    if (!window.confirm("Remove all offline downloads?")) return;
    await clearDownloads();
    setEntries([]);
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HardDriveDownload className="h-7 w-7 text-emerald-500" />
          <div>
            <h1 className="text-2xl font-bold">Downloads</h1>
            <p className="text-sm text-zinc-400">
              {entries.length} tracks stored in this browser for offline playback.
            </p>
          </div>
        </div>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={() => void handleClear()}
            className="flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
            Clear all
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="py-12 text-center text-zinc-500">
          Nothing downloaded yet — use the download button on a playlist or album.
        </p>
      ) : tracks.isPending ? (
        <PageSpinner />
      ) : (
        <TrackList
          tracks={tracks.data?.items ?? []}
          trailing={(track) => (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void handleRemove(track.id);
              }}
              className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700/50 hover:text-red-400"
              aria-label="Remove download"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        />
      )}
    </div>
  );
}
