import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListMusic, Play, Save, Trash2, Volume2, X } from "lucide-react";
import { useMemo, useState } from "react";

import {
  deleteQueue,
  getQueues,
  type SavedQueueSummary,
  saveQueue,
  updateQueue,
} from "../../api/queues";
import { artistNames, formatDuration } from "../../lib/format";
import { usePlayerStore } from "../../stores/playerStore";
import { loadSavedQueue, queueSnapshot } from "./queueActions";

export function QueuePanel() {
  const queryClient = useQueryClient();
  // Subscribe to the stable references and derive the ordered list with
  // useMemo: selecting a freshly-built array from the store would make
  // every snapshot "new" and loop React into error #185.
  const queue = usePlayerStore((state) => state.queue);
  const order = usePlayerStore((state) => state.order);
  const orderedTracks = useMemo(() => order.map((index) => queue[index]), [queue, order]);
  const position = usePlayerStore((state) => state.position);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const jumpTo = usePlayerStore((state) => state.jumpTo);
  const removeAt = usePlayerStore((state) => state.removeAt);
  const moveTo = usePlayerStore((state) => state.moveTo);
  const activeSavedQueueId = usePlayerStore((state) => state.activeSavedQueueId);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const savedQueues = useQuery({ queryKey: ["saved-queues"], queryFn: getQueues });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["saved-queues"] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const name = window.prompt("Queue name:");
      if (!name?.trim()) return null;
      return saveQueue({ name: name.trim(), ...queueSnapshot() });
    },
    onSuccess: (created) => {
      if (created) {
        usePlayerStore.getState().setActiveSavedQueueId(created.id);
        invalidate();
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => updateQueue(activeSavedQueueId as number, queueSnapshot()),
    onSuccess: invalidate,
  });

  const loadQueue = async (summary: SavedQueueSummary) => {
    await loadSavedQueue(summary.id);
    invalidate();
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteQueue(id),
    onSuccess: (_data, id) => {
      if (usePlayerStore.getState().activeSavedQueueId === id) {
        usePlayerStore.getState().setActiveSavedQueueId(null);
      }
      invalidate();
    },
  });

  return (
    <aside className="fixed inset-0 z-40 flex w-full shrink-0 flex-col border-zinc-800 bg-zinc-900 md:static md:z-auto md:w-80 md:border-l md:bg-zinc-900/40">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <p className="text-sm font-semibold text-zinc-100">Queue</p>
        <div className="flex items-center gap-1">
          {activeSavedQueueId !== null && orderedTracks.length > 0 && (
            <button
              type="button"
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
              className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-emerald-400"
              title="Update the saved queue with the current state"
              aria-label="Update saved queue"
            >
              <Save className="h-4 w-4" />
            </button>
          )}
          {orderedTracks.length > 0 && (
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="rounded-full px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            >
              Save as...
            </button>
          )}
          <button
            type="button"
            onClick={() => usePlayerStore.getState().toggleQueueOpen()}
            className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 md:hidden"
            aria-label="Close queue"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {orderedTracks.length === 0 ? (
          <p className="p-4 text-xs text-zinc-500">The queue is empty — play something.</p>
        ) : (
          <ul>
            {orderedTracks.map((track, index) => (
              <li
                key={`${track.id}-${index}`}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropIndex(index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragIndex !== null && dragIndex !== index) moveTo(dragIndex, index);
                  setDragIndex(null);
                  setDropIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDropIndex(null);
                }}
                className={`group flex cursor-pointer select-none items-center gap-2 px-3 py-1.5 transition-colors hover:bg-zinc-800/60 ${
                  index === position ? "bg-emerald-600/10" : ""
                } ${
                  dropIndex === index && dragIndex !== null && dragIndex !== index
                    ? "border-t-2 border-emerald-500"
                    : ""
                } ${dragIndex === index ? "opacity-40" : ""}`}
                onClick={() => jumpTo(index)}
              >
                <span className="w-5 shrink-0 text-center text-xs text-zinc-500">
                  {index === position && isPlaying ? (
                    <Volume2 className="mx-auto h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-xs font-medium ${
                      index === position ? "text-emerald-400" : "text-zinc-100"
                    }`}
                  >
                    {track.title}
                  </span>
                  <span className="block truncate text-[11px] text-zinc-500">
                    {artistNames(track.artists)}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">
                  {formatDuration(track.duration)}
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeAt(index);
                  }}
                  className="shrink-0 rounded-full p-1 text-zinc-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                  aria-label={`Remove ${track.title} from queue`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-zinc-800">
        <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Saved queues
        </p>
        <div className="max-h-48 overflow-y-auto pb-2">
          {savedQueues.data?.length ? (
            savedQueues.data.map((saved) => (
              <div
                key={saved.id}
                className={`group flex items-center gap-2 px-4 py-1.5 transition-colors hover:bg-zinc-800/60 ${
                  saved.id === activeSavedQueueId ? "text-emerald-400" : "text-zinc-300"
                }`}
              >
                <ListMusic className="h-3.5 w-3.5 shrink-0" />
                <button
                  type="button"
                  onClick={() => void loadQueue(saved)}
                  className="min-w-0 flex-1 truncate text-left text-xs hover:underline"
                  title={`Load "${saved.name}" (${saved.track_count} tracks)`}
                >
                  {saved.name}
                  <span className="ml-1 text-zinc-500">({saved.track_count})</span>
                </button>
                <button
                  type="button"
                  onClick={() => void loadQueue(saved)}
                  className="shrink-0 rounded-full p-1 text-zinc-600 opacity-0 transition-all hover:text-emerald-400 group-hover:opacity-100"
                  aria-label={`Play queue ${saved.name}`}
                >
                  <Play className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(saved.id)}
                  className="shrink-0 rounded-full p-1 text-zinc-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                  aria-label={`Delete queue ${saved.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          ) : (
            <p className="px-4 py-1 text-xs text-zinc-600">
              None yet — save the current queue to switch between listening sessions.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
