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
  sort?: "title" | "recent";
  limit?: number;
  offset?: number;
}

export const getTracks = (filters: TrackFilters) => api<Page<Track>>(`/tracks${qs(filters)}`);

export const getArtists = (params: { q?: string; limit?: number; offset?: number }) =>
  api<Page<Artist>>(`/artists${qs(params)}`);

export const getArtist = (id: number) => api<ArtistDetail>(`/artists/${id}`);

export const getAlbums = (params: {
  q?: string;
  artist_id?: number;
  limit?: number;
  offset?: number;
}) => api<Page<Album>>(`/albums${qs(params)}`);

export const getAlbum = (id: number) => api<AlbumDetail>(`/albums/${id}`);

export const getGenres = () => api<Genre[]>("/genres");
