import { useAuthStore } from "../stores/authStore";

export function albumCoverUrl(albumId: number): string {
  const token = useAuthStore.getState().accessToken ?? "";
  return `/api/v1/albums/${albumId}/cover?token=${encodeURIComponent(token)}`;
}

export function artistImageUrl(artistId: number): string {
  const token = useAuthStore.getState().accessToken ?? "";
  return `/api/v1/artists/${artistId}/image?token=${encodeURIComponent(token)}`;
}
