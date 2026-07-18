import { api } from "./http";
import type { Track } from "./types";

export interface TrackTagsUpdate {
  title?: string | null;
  artists?: string[] | null;
  album?: string | null;
  album_artist?: string | null;
  genres?: string[] | null;
  year?: number | null;
  track_number?: number | null;
  disc_number?: number | null;
}

export type BatchTagChanges = Pick<
  TrackTagsUpdate,
  "artists" | "album" | "album_artist" | "genres" | "year"
>;

export interface BatchTagsResult {
  updated: number;
  errors: string[];
}

export const updateTrackTags = (trackId: number, changes: TrackTagsUpdate) =>
  api<Track>(`/tracks/${trackId}/tags`, { method: "PATCH", body: JSON.stringify(changes) });

export const batchUpdateTags = (trackIds: number[], changes: BatchTagChanges) =>
  api<BatchTagsResult>("/tracks/tags/batch", {
    method: "POST",
    body: JSON.stringify({ track_ids: trackIds, changes }),
  });

export async function uploadAlbumCover(albumId: number, file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  await api<void>(`/albums/${albumId}/cover`, { method: "PUT", body: form });
}
