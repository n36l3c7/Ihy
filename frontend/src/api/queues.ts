import { api } from "./http";
import type { Track } from "./types";

export interface SavedQueueSummary {
  id: number;
  name: string;
  current_index: number;
  updated_at: string;
  track_count: number;
}

export interface SavedQueueDetail {
  id: number;
  name: string;
  current_index: number;
  current_seconds: number;
  tracks: Track[];
}

export interface QueueSavePayload {
  name: string;
  track_ids: number[];
  current_index: number;
  current_seconds: number;
}

export const getQueues = () => api<SavedQueueSummary[]>("/queues");

export const getQueue = (id: number) => api<SavedQueueDetail>(`/queues/${id}`);

export const saveQueue = (payload: QueueSavePayload) =>
  api<SavedQueueDetail>("/queues", { method: "POST", body: JSON.stringify(payload) });

export const updateQueue = (id: number, changes: Partial<QueueSavePayload>) =>
  api<SavedQueueDetail>(`/queues/${id}`, { method: "PUT", body: JSON.stringify(changes) });

export const deleteQueue = (id: number) => api<void>(`/queues/${id}`, { method: "DELETE" });
