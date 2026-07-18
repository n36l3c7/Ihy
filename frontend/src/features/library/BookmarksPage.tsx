import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Play, Trash2 } from "lucide-react";

import { type BookmarkData, deleteBookmark, getBookmarks } from "../../api/wave3";
import { CoverImage } from "../../components/CoverImage";
import { PageSpinner } from "../../components/Spinner";
import { artistNames, formatDuration } from "../../lib/format";
import { usePlayerStore } from "../../stores/playerStore";

export function BookmarksPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["bookmarks"], queryFn: getBookmarks });

  const deleteMutation = useMutation({
    mutationFn: deleteBookmark,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
  });

  const resume = (bookmark: BookmarkData) => {
    const store = usePlayerStore.getState();
    store.playQueue([bookmark.track]);
    store.setPendingSeekSeconds(bookmark.seconds);
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-zinc-800">
          <Bookmark className="h-5 w-5 text-emerald-500" />
        </div>
        <h1 className="text-2xl font-bold">Bookmarks</h1>
      </div>

      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <p className="py-12 text-center text-red-400">Failed to load bookmarks.</p>
      ) : query.data.length === 0 ? (
        <p className="py-12 text-center text-zinc-500">
          No bookmarks yet — save a position from the player bar while listening.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800/60 rounded-lg border border-zinc-800">
          {query.data.map((bookmark) => (
            <li key={bookmark.id} className="flex items-center gap-4 px-4 py-3">
              <CoverImage
                albumId={bookmark.track.album?.id}
                className="h-10 w-10 shrink-0 rounded"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-100">
                  {bookmark.track.title}
                  <span className="ml-2 text-xs text-emerald-500">
                    @ {formatDuration(bookmark.seconds)}
                  </span>
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {artistNames(bookmark.track.artists)}
                  {bookmark.note ? ` — "${bookmark.note}"` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => resume(bookmark)}
                className="shrink-0 rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-emerald-400"
                aria-label={`Resume ${bookmark.track.title} at ${formatDuration(bookmark.seconds)}`}
                title="Resume from here"
              >
                <Play className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(bookmark.id)}
                className="shrink-0 rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
                aria-label="Delete bookmark"
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
