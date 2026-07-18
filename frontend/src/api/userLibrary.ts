import { qs } from "./catalog";
import { api } from "./http";
import type {
  Page,
  PlayHistoryEntry,
  Playlist,
  PlaylistDetail,
  PlaylistItem,
  Track,
} from "./types";

// --- Favorites ---

export const getFavoriteIds = () => api<number[]>("/favorites/ids");

export const getFavorites = (params: { limit?: number; offset?: number }) =>
  api<Page<Track>>(`/favorites${qs(params)}`);

export const addFavorite = (trackId: number) =>
  api<void>(`/favorites/${trackId}`, { method: "PUT" });

export const removeFavorite = (trackId: number) =>
  api<void>(`/favorites/${trackId}`, { method: "DELETE" });

// --- Playlists ---

export const getPlaylists = () => api<Playlist[]>("/playlists");

export const createPlaylist = (name: string) =>
  api<Playlist>("/playlists", { method: "POST", body: JSON.stringify({ name }) });

export const getPlaylist = (id: number) => api<PlaylistDetail>(`/playlists/${id}`);

export const renamePlaylist = (id: number, name: string) =>
  api<Playlist>(`/playlists/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });

export const deletePlaylist = (id: number) => api<void>(`/playlists/${id}`, { method: "DELETE" });

export const addTrackToPlaylist = (playlistId: number, trackId: number) =>
  api<PlaylistItem>(`/playlists/${playlistId}/tracks`, {
    method: "POST",
    body: JSON.stringify({ track_id: trackId }),
  });

export const removePlaylistItem = (playlistId: number, itemId: number) =>
  api<void>(`/playlists/${playlistId}/tracks/${itemId}`, { method: "DELETE" });

export const updatePlaylistOrder = (playlistId: number, itemIds: number[]) =>
  api<void>(`/playlists/${playlistId}/order`, {
    method: "PUT",
    body: JSON.stringify({ item_ids: itemIds }),
  });

export interface TrackLyrics {
  content: string | null;
  synced_content: string | null;
  source: string | null;
  fetched_at: string;
}

export const getLyrics = (trackId: number, refresh = false) =>
  api<TrackLyrics>(`/tracks/${trackId}/lyrics${refresh ? "?refresh=true" : ""}`);

// --- Play history ---

export const recordPlay = (trackId: number) =>
  api<void>("/history", { method: "POST", body: JSON.stringify({ track_id: trackId }) });

export const getHistory = (params: { limit?: number; offset?: number }) =>
  api<Page<PlayHistoryEntry>>(`/history${qs(params)}`);
