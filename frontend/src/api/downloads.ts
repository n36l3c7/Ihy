import { api } from "./http";

export interface DownloadWatch {
  id: number;
  name: string;
  query: string;
  source_id: number;
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  created_at: string;
}

export interface DownloadStatus {
  available: boolean;
  running: boolean;
  current_watch: string | null;
  last_finished_at: string | null;
}

export interface DownloadSettings {
  check_interval_hours: number;
}

export const getWatches = () => api<DownloadWatch[]>("/downloads/watches");

export const createWatch = (payload: { name: string; query: string; source_id: number }) =>
  api<DownloadWatch>("/downloads/watches", { method: "POST", body: JSON.stringify(payload) });

export const updateWatch = (
  id: number,
  changes: Partial<Pick<DownloadWatch, "name" | "query" | "source_id" | "enabled">>,
) => api<DownloadWatch>(`/downloads/watches/${id}`, {
  method: "PATCH",
  body: JSON.stringify(changes),
});

export const deleteWatch = (id: number) =>
  api<void>(`/downloads/watches/${id}`, { method: "DELETE" });

export const getDownloadStatus = () => api<DownloadStatus>("/downloads/status");

export const runDownloads = () => api<DownloadStatus>("/downloads/run", { method: "POST" });

export const getDownloadSettings = () => api<DownloadSettings>("/settings/downloads");

export const updateDownloadSettings = (settings: DownloadSettings) =>
  api<DownloadSettings>("/settings/downloads", {
    method: "PUT",
    body: JSON.stringify(settings),
  });

export interface SpotdlOptions {
  output_format: "mp3" | "flac" | "ogg" | "opus" | "m4a" | null;
  bitrate: string | null;
  threads: number | null;
  extra_args: string;
  client_id: string;
  client_secret: string;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  url: string;
  image: string | null;
  followers: number | null;
}

export const getSpotdlOptions = () => api<SpotdlOptions>("/settings/spotdl");

export const updateSpotdlOptions = (options: SpotdlOptions) =>
  api<SpotdlOptions>("/settings/spotdl", { method: "PUT", body: JSON.stringify(options) });

export const searchSpotifyArtists = (q: string) =>
  api<SpotifyArtist[]>(`/downloads/spotify/search?q=${encodeURIComponent(q)}`);

export const getDownloadLog = () => api<{ lines: string[] }>("/downloads/log");
