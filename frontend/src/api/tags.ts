import { api } from "./http";

export interface AutotagSuggestion {
  title: string;
  artists: string[];
  album: string | null;
  year: number | null;
  score: number;
  release_id: string | null;
  cover_url: string | null;
}

export const getAutotagSuggestions = (trackId: number) =>
  api<AutotagSuggestion[]>(`/tracks/${trackId}/autotag`);

export const applyAutotagCover = (trackId: number, releaseId: string) =>
  api<void>(`/tracks/${trackId}/autotag/cover`, {
    method: "POST",
    body: JSON.stringify({ release_id: releaseId }),
  });
import type { Track } from "./types";

export interface TrackTagsUpdate {
  title?: string | null;
  artists?: string[] | null;
  album?: string | null;
  album_artist?: string | null;
  genres?: string[] | null;
  year?: number | null;
  date?: string | null;
  track_number?: number | null;
  disc_number?: number | null;
  composer?: string | null;
  comment?: string | null;
  copyright?: string | null;
  isrc?: string | null;
  bpm?: string | null;
  conductor?: string | null;
  language?: string | null;
  publisher?: string | null;
  lyricist?: string | null;
  website?: string | null;
}

export interface TrackFileTags {
  artists: string[];
  genres: string[];
  title: string | null;
  album: string | null;
  album_artist: string | null;
  date: string | null;
  track_number: string | null;
  disc_number: string | null;
  composer: string | null;
  comment: string | null;
  copyright: string | null;
  isrc: string | null;
  bpm: string | null;
  conductor: string | null;
  language: string | null;
  publisher: string | null;
  lyricist: string | null;
  website: string | null;
}

export const getFileTags = (trackId: number) =>
  api<TrackFileTags>(`/tracks/${trackId}/tags/file`);

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

export async function uploadArtistImage(artistId: number, file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  await api<void>(`/artists/${artistId}/image`, { method: "PUT", body: form });
}
