import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import type { Track } from "../../api/types";
import { getLyrics } from "../../api/userLibrary";
import { Modal } from "../../components/Modal";
import { PageSpinner } from "../../components/Spinner";
import { artistNames } from "../../lib/format";

interface LyricsDialogProps {
  track: Track;
  onClose: () => void;
}

export function LyricsDialog({ track, onClose }: LyricsDialogProps) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["lyrics", track.id],
    queryFn: () => getLyrics(track.id),
    staleTime: Infinity,
  });

  const handleRefresh = async () => {
    const refreshed = await getLyrics(track.id, true);
    queryClient.setQueryData(["lyrics", track.id], refreshed);
  };

  return (
    <Modal title={`${track.title} — ${artistNames(track.artists)}`} onClose={onClose}>
      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <p className="py-8 text-center text-red-400">Failed to load lyrics.</p>
      ) : query.data.content ? (
        <>
          <p className="max-h-[60vh] overflow-y-auto whitespace-pre-line text-sm leading-7 text-zinc-200">
            {query.data.content}
          </p>
          <p className="mt-4 text-xs text-zinc-500">
            {query.data.source === "file"
              ? "Lyrics embedded in the audio file"
              : "Lyrics from lrclib.net"}
          </p>
        </>
      ) : (
        <div className="py-8 text-center">
          <p className="text-zinc-500">No lyrics found for this track.</p>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            className="mx-auto mt-4 flex items-center gap-2 rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
          >
            <RefreshCw className="h-4 w-4" />
            Search again
          </button>
        </div>
      )}
    </Modal>
  );
}
