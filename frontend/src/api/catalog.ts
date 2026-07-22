import { api } from "./http";
import type { Album, AlbumDetail, Artist, ArtistDetail, Genre, Page, Track } from "./types";

export function qs(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, string | number | undefined][]) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export interface TrackFilters {
  q?: string;
  artist_id?: number;
  album_id?: number;
  genre_id?: number;
  ids?: string;
  sort?: "title" | "recent" | "random";
  never_played?: boolean;
  limit?: number;
  offset?: number;
}

export const getTracks = (filters: TrackFilters) => api<Page<Track>>(`/tracks${qs(filters)}`);

export const getArtists = (params: { q?: string; limit?: number; offset?: number }) =>
  api<Page<Artist>>(`/artists${qs(params)}`);

export const getArtist = (id: number) => api<ArtistDetail>(`/artists/${id}`);

export interface ArtistInfoData {
  bio: string | null;
  url: string | null;
  source: string | null;
  fetched_at: string;
}

export const getArtistInfo = (id: number) => api<ArtistInfoData>(`/artists/${id}/info`);

export const getWaveform = (trackId: number) =>
  api<{ peaks: number[] }>(`/tracks/${trackId}/waveform`);

export const getRadioTracks = (seedTrackId: number, excludeIds: number[]) =>
  api<Track[]>(
    `/tracks/${seedTrackId}/radio${qs({ limit: 20, exclude: excludeIds.slice(0, 500).join(",") })}`,
  );

export const getAlbums = (params: {
  q?: string;
  artist_id?: number;
  sort?: "title" | "recent" | "random";
  limit?: number;
  offset?: number;
}) => api<Page<Album>>(`/albums${qs(params)}`);

export const getAlbum = (id: number) => api<AlbumDetail>(`/albums/${id}`);

export const getGenres = () => api<Genre[]>("/genres");

export interface LibraryDeleteResult {
  deleted_files: number;
  errors: string[];
}

export const deleteTrack = (id: number) =>
  api<LibraryDeleteResult>(`/tracks/${id}`, { method: "DELETE" });

export const deleteAlbum = (id: number) =>
  api<LibraryDeleteResult>(`/albums/${id}`, { method: "DELETE" });

export const deleteArtist = (id: number) =>
  api<LibraryDeleteResult>(`/artists/${id}`, { method: "DELETE" });
