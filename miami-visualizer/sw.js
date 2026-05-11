// Service worker for caching Google Maps/Street View GET responses.
// This reduces repeat downloads for identical URLs (helpful when the Maps runtime
// or our UI triggers re-renders in bursts).

const CACHE_NAME = 'gmp-streetview-cache-v1';
const MAX_CACHE_ENTRIES = 300;

function isCacheableGoogleRequest(requestUrl) {
  try {
    const url = new URL(requestUrl);
    const path = url.pathname.toLowerCase();
    const host = url.hostname.toLowerCase();

    if (host.endsWith('streetviewpixels.googleapis.com')) return true;

    // Cache only the billing-relevant APIs we care about.
    if (host.endsWith('maps.googleapis.com')) {
      return (
        path.includes('/maps/api/streetview') ||
        path.includes('/maps/api/geocode') ||
        path.includes('/maps/api/place')
      );
    }
    return false;
  } catch {
    return false;
  }
}

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_CACHE_ENTRIES) return;
  // Cache API ordering isn't guaranteed, but this is still enough to cap growth.
  const overflow = keys.length - MAX_CACHE_ENTRIES;
  for (let i = 0; i < overflow; i++) {
    await cache.delete(keys[i]);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const urlStr = request.url;
  if (!isCacheableGoogleRequest(urlStr)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    // Only cache successful responses.
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
      // Best-effort eviction to keep cache bounded.
      trimCache(cache).catch(() => {});
    }
    return response;
  })());
});

