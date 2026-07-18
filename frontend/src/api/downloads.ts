import { api } from "./http";

export interface CookiesStatus {
  uploaded: boolean;
  active: boolean;
}

export const getCookiesStatus = () => api<CookiesStatus>("/downloads/cookies");

export async function uploadCookies(file: File): Promise<CookiesStatus> {
  const form = new FormData();
  form.append("file", file);
  return api<CookiesStatus>("/downloads/cookies", { method: "POST", body: form });
}

export const deleteCookies = () =>
  api<CookiesStatus>("/downloads/cookies", { method: "DELETE" });

export interface SpotifyImportStatus {
  available: boolean;
  running: boolean;
  state: string;
  error: string | null;
  total: number;
  matched: number;
  playlist_id: number | null;
  playlist_name: string | null;
  log: string[];
}

export const getSpotifyImportStatus = () =>
  api<SpotifyImportStatus>("/downloads/spotify-playlist");

export const startSpotifyImport = (url: string, name?: string) =>
  api<SpotifyImportStatus>("/downloads/spotify-playlist", {
    method: "POST",
    body: JSON.stringify({ url, name: name || null }),
  });

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
  cron: string;
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
  audio_providers: string;
  lyrics_providers: string;
  output_template: string;
  album_type: "album" | "single" | "compilation" | null;
  overwrite: "skip" | "metadata" | "force" | null;
  restrict: "strict" | "ascii" | null;
  max_filename_length: number | null;
  sponsor_block: boolean;
  playlist_numbering: boolean;
  generate_lrc: boolean;
  print_errors: boolean;
  scan_for_songs: boolean;
  fetch_albums: boolean;
  proxy: string;
  cookie_file: string;
  yt_dlp_args: string;
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

export const resolveSpotifyUrl = (url: string) =>
  api<{ name: string }>(`/downloads/spotify/resolve?url=${encodeURIComponent(url)}`);

export const getDownloadLog = () => api<{ lines: string[] }>("/downloads/log");

export const runWatch = (watchId: number) =>
  api<DownloadStatus>(`/downloads/watches/${watchId}/run`, { method: "POST" });

export interface DownloadFix {
  id: number;
  watch_id: number;
  watch_name: string | null;
  song: string;
  spotify_url: string | null;
  youtube_url: string | null;
  error: string | null;
  created_at: string;
}

export const getFixes = () => api<DownloadFix[]>("/downloads/fixes");

export const updateFix = (
  id: number,
  changes: { spotify_url?: string | null; youtube_url?: string | null },
) => api<DownloadFix>(`/downloads/fixes/${id}`, { method: "PATCH", body: JSON.stringify(changes) });

export const deleteFix = (id: number) =>
  api<void>(`/downloads/fixes/${id}`, { method: "DELETE" });
