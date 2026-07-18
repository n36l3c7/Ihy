import { useAuthStore } from "../stores/authStore";
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

export const getSharedPlaylists = () => api<Playlist[]>("/playlists/shared");

export const setPlaylistPublic = (id: number, isPublic: boolean) =>
  api<Playlist>(`/playlists/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ is_public: isPublic }),
  });

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

export interface PlaylistImportResult {
  playlist: Playlist;
  matched: number;
  total: number;
}

export async function importPlaylistFile(file: File): Promise<PlaylistImportResult> {
  const form = new FormData();
  form.append("file", file);
  return api<PlaylistImportResult>("/playlists/import", { method: "POST", body: form });
}

/** Download a playlist as an .m3u8 file (raw fetch: the response is plain text). */
export async function downloadPlaylistExport(id: number, name: string): Promise<void> {
  const token = useAuthStore.getState().accessToken;
  const response = await fetch(`/api/v1/playlists/${id}/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) throw new Error(`Export failed (${response.status})`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name || "playlist"}.m3u8`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// --- Play history ---

export const recordPlay = (trackId: number) =>
  api<void>("/history", { method: "POST", body: JSON.stringify({ track_id: trackId }) });

export const getHistory = (params: { limit?: number; offset?: number }) =>
  api<Page<PlayHistoryEntry>>(`/history${qs(params)}`);
