/* Offline downloads: full audio files stored in Cache Storage under
 * token-free synthetic keys (/offline/track/{id}); the service worker serves
 * them for stream requests (with Range support), so downloaded tracks play
 * with no network. A small index in localStorage drives the Downloads UI. */

import { useAuthStore } from "../stores/authStore";
import type { Track } from "../api/types";

const CACHE_NAME = "ihy-offline-audio-v1";
const INDEX_KEY = "ihy-offline-index";

export interface OfflineEntry {
  id: number;
  title: string;
  artists: string;
  savedAt: number;
}

export function offlineSupported(): boolean {
  return "caches" in window;
}

export function listDownloads(): OfflineEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as OfflineEntry[]) : [];
  } catch {
    return [];
  }
}

function saveIndex(entries: OfflineEntry[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
}

export function isDownloaded(trackId: number): boolean {
  return listDownloads().some((entry) => entry.id === trackId);
}

export async function downloadTracks(
  tracks: Track[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ done: number; failed: number }> {
  if (!offlineSupported()) throw new Error("Cache Storage is not available");
  const cache = await caches.open(CACHE_NAME);
  const token = useAuthStore.getState().accessToken ?? "";
  let done = 0;
  let failed = 0;
  const index = listDownloads();
  for (const track of tracks) {
    if (!index.some((entry) => entry.id === track.id)) {
      try {
        const response = await fetch(`/api/v1/tracks/${track.id}/stream`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(String(response.status));
        await cache.put(`/offline/track/${track.id}`, response);
        index.push({
          id: track.id,
          title: track.title,
          artists: track.artists.map((artist) => artist.name).join(", "),
          savedAt: Date.now(),
        });
        saveIndex(index);
      } catch {
        failed += 1;
      }
    }
    done += 1;
    onProgress?.(done, tracks.length);
  }
  return { done, failed };
}

export async function removeDownload(trackId: number): Promise<void> {
  if (offlineSupported()) {
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(`/offline/track/${trackId}`);
  }
  saveIndex(listDownloads().filter((entry) => entry.id !== trackId));
}

export async function clearDownloads(): Promise<void> {
  if (offlineSupported()) {
    await caches.delete(CACHE_NAME);
  }
  saveIndex([]);
}
