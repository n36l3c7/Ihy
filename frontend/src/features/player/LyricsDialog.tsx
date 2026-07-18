import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Track } from "../../api/types";
import { getLyrics } from "../../api/userLibrary";
import { Modal } from "../../components/Modal";
import { PageSpinner } from "../../components/Spinner";
import { artistNames } from "../../lib/format";
import { activeLrcIndex, parseLrc } from "../../lib/lrc";

interface LyricsDialogProps {
  track: Track;
  currentTime: number;
  onSeek: (time: number) => void;
  onClose: () => void;
}

export function LyricsDialog({ track, currentTime, onSeek, onClose }: LyricsDialogProps) {
  const queryClient = useQueryClient();
  const [preferSynced, setPreferSynced] = useState(true);
  const activeLineRef = useRef<HTMLButtonElement>(null);

  const query = useQuery({
    queryKey: ["lyrics", track.id],
    queryFn: () => getLyrics(track.id),
    staleTime: Infinity,
  });

  const syncedLines = useMemo(
    () => (query.data?.synced_content ? parseLrc(query.data.synced_content) : []),
    [query.data?.synced_content],
  );
  const showSynced = preferSynced && syncedLines.length > 0;
  const activeIndex = showSynced ? activeLrcIndex(syncedLines, currentTime) : -1;

  // Follow the song like karaoke
  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex]);

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
      ) : showSynced ? (
        <>
          <div className="max-h-[60vh] overflow-y-auto py-4">
            {syncedLines.map((line, index) => (
              <button
                key={`${line.time}-${index}`}
                ref={index === activeIndex ? activeLineRef : undefined}
                type="button"
                onClick={() => onSeek(line.time)}
                className={`block w-full py-1.5 text-left text-sm leading-6 transition-colors ${
                  index === activeIndex
                    ? "font-semibold text-emerald-400"
                    : index < activeIndex
                      ? "text-zinc-600"
                      : "text-zinc-300"
                } hover:text-zinc-100`}
              >
                {line.text}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
            <span>Synced lyrics from lrclib.net — click a line to jump there</span>
            {query.data.content && (
              <button
                type="button"
                onClick={() => setPreferSynced(false)}
                className="hover:text-zinc-200"
              >
                Show plain text
              </button>
            )}
          </div>
        </>
      ) : query.data.content ? (
        <>
          <p className="max-h-[60vh] overflow-y-auto whitespace-pre-line text-sm leading-7 text-zinc-200">
            {query.data.content}
          </p>
          <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
            <span>
              {query.data.source === "file"
                ? "Lyrics embedded in the audio file"
                : "Lyrics from lrclib.net"}
            </span>
            {syncedLines.length > 0 && (
              <button
                type="button"
                onClick={() => setPreferSynced(true)}
                className="hover:text-zinc-200"
              >
                Show synced lyrics
              </button>
            )}
          </div>
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
