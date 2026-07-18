import { api } from "./http";

export interface RatingEntry {
  track_id: number;
  rating: number;
}

export const getRatings = () => api<RatingEntry[]>("/ratings");

export const setRating = (trackId: number, rating: number) =>
  api<void>(`/ratings/${trackId}`, { method: "PUT", body: JSON.stringify({ rating }) });
