/* Ihy service worker: app-shell caching, offline library browsing and
 * offline audio playback (tracks saved by the in-app download manager). */

const STATIC_CACHE = "ihy-static-v1";
const API_CACHE = "ihy-api-v1";
const AUDIO_CACHE = "ihy-offline-audio-v1";
const KEEP = [STATIC_CACHE, API_CACHE, AUDIO_CACHE];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (!KEEP.includes(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

/** Offline audio is stored under a token-free synthetic URL per track. */
function offlineAudioKey(trackId) {
  return `/offline/track/${trackId}`;
}

function streamTrackId(pathname) {
  const match = /^\/api\/v1\/tracks\/(\d+)\/stream$/.exec(pathname);
  return match ? match[1] : null;
}

/** Serve a cached full response honouring HTTP Range requests. */
async function withRangeSupport(request, response) {
  const rangeHeader = request.headers.get("range");
  if (!rangeHeader) return response;
  const blob = await response.blob();
  const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
  if (!match) return response;
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), blob.size - 1) : blob.size - 1;
  const chunk = blob.slice(start, end + 1);
  return new Response(chunk, {
    status: 206,
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "audio/mpeg",
      "Content-Range": `bytes ${start}-${end}/${blob.size}`,
      "Content-Length": String(chunk.size),
      "Accept-Ranges": "bytes",
    },
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Track streams: offline copy first, then network
  const trackId = streamTrackId(url.pathname);
  if (trackId !== null) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(AUDIO_CACHE);
        const cached = await cache.match(offlineAudioKey(trackId));
        if (cached) return withRangeSupport(request, cached);
        return fetch(request);
      })(),
    );
    return;
  }

  // SPA navigations: network first, cached shell as offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(STATIC_CACHE);
          void cache.put("/index.html", response.clone());
          return response;
        } catch {
          const cached = await caches.match("/index.html");
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Hashed build assets and icons: cache first (immutable)
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(STATIC_CACHE);
          void cache.put(request, response.clone());
        }
        return response;
      })(),
    );
    return;
  }

  // Library API and covers: network first, cache fallback for offline.
  // Covers/images are keyed without the auth token query string.
  if (url.pathname.startsWith("/api/v1/")) {
    const isImage = /\/(cover|image)$/.test(url.pathname);
    const cacheKey = isImage ? url.origin + url.pathname : request.url;
    event.respondWith(
      (async () => {
        const cache = await caches.open(API_CACHE);
        try {
          const response = await fetch(request);
          if (response.ok) void cache.put(cacheKey, response.clone());
          return response;
        } catch {
          const cached = await cache.match(cacheKey);
          return cached ?? Response.error();
        }
      })(),
    );
  }
});
