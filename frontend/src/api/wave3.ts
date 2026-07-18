import { qs } from "./catalog";
import { api } from "./http";
import type { Track } from "./types";

// --- Listening statistics ---

export interface StatsData {
  total_plays: number;
  distinct_tracks: number;
  total_seconds: number;
  top_tracks: { track: Track; plays: number }[];
  top_artists: { id: number; name: string; plays: number }[];
  top_albums: { id: number; title: string; plays: number }[];
  plays_by_day: { day: string; plays: number }[];
}

export const getStats = (days?: number) =>
  api<StatsData>(`/stats${days ? `?days=${days}` : ""}`);

// --- Folder browsing ---

export interface BrowseData {
  sources: { id: number; name: string }[];
  path: string;
  folders: string[];
  tracks: Track[];
}

export const browseLibrary = (params: { source_id?: number; path?: string }) =>
  api<BrowseData>(`/library/browse${qs(params)}`);

// --- Bookmarks ---

export interface BookmarkData {
  id: number;
  seconds: number;
  note: string | null;
  created_at: string;
  track: Track;
}

export const getBookmarks = () => api<BookmarkData[]>("/bookmarks");

export const createBookmark = (trackId: number, seconds: number, note?: string) =>
  api<BookmarkData>("/bookmarks", {
    method: "POST",
    body: JSON.stringify({ track_id: trackId, seconds, note: note || null }),
  });

export const deleteBookmark = (id: number) =>
  api<void>(`/bookmarks/${id}`, { method: "DELETE" });
