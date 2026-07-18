import { api } from "./http";
import type { Track } from "./types";

export interface SmartRule {
  field: string;
  op: string;
  value: string | number | boolean;
}

export interface SmartPlaylistPayload {
  name: string;
  match: "all" | "any";
  rules: SmartRule[];
  sort: string;
  max_tracks: number;
}

export interface SmartPlaylist extends SmartPlaylistPayload {
  id: number;
}

export const getSmartPlaylists = () => api<SmartPlaylist[]>("/smart-playlists");

export const getSmartPlaylist = (id: number) => api<SmartPlaylist>(`/smart-playlists/${id}`);

export const createSmartPlaylist = (payload: SmartPlaylistPayload) =>
  api<SmartPlaylist>("/smart-playlists", { method: "POST", body: JSON.stringify(payload) });

export const updateSmartPlaylist = (id: number, payload: SmartPlaylistPayload) =>
  api<SmartPlaylist>(`/smart-playlists/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const deleteSmartPlaylist = (id: number) =>
  api<void>(`/smart-playlists/${id}`, { method: "DELETE" });

export const getSmartPlaylistTracks = (id: number) =>
  api<Track[]>(`/smart-playlists/${id}/tracks`);
