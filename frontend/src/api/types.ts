export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface User {
  id: number;
  username: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: "admin" | "user";
  is_active: boolean;
  created_at: string;
}

export interface SetupStatus {
  needs_setup: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ArtistBrief {
  id: number;
  name: string;
}

export interface AlbumBrief {
  id: number;
  title: string;
}

export interface Genre {
  id: number;
  name: string;
  track_count?: number;
}

export interface Track {
  id: number;
  title: string;
  duration: number;
  format: string;
  bitrate: number | null;
  sample_rate: number | null;
  track_number: number | null;
  disc_number: number | null;
  year: number | null;
  artists: ArtistBrief[];
  album: AlbumBrief | null;
  genres: Genre[];
}

export interface Artist {
  id: number;
  name: string;
  album_count: number;
  track_count: number;
}

export interface Album {
  id: number;
  title: string;
  year: number | null;
  artist: ArtistBrief | null;
  track_count: number;
}

export interface ArtistDetail extends Artist {
  albums: Album[];
}

export interface AlbumDetail extends Album {
  tracks: Track[];
}

export interface Playlist {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  track_count: number;
}

export interface PlaylistItem {
  id: number;
  position: number;
  added_at: string;
  track: Track;
}

export interface PlaylistDetail extends Playlist {
  items: PlaylistItem[];
}

export interface PlayHistoryEntry {
  id: number;
  played_at: string;
  track: Track;
}

export interface Source {
  id: number;
  name: string;
  path: string;
  enabled: boolean;
  last_scanned_at: string | null;
  created_at: string;
  track_count: number;
}

export interface ScanResult {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  errors: number;
}

export interface LibrarySettings {
  metadata_separators: string[];
}

export interface ScanStatus {
  running: boolean;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  last_result: ScanResult | null;
}
