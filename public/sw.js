// spoonful's service worker: keeps a copy of the app so it opens and works without a connection.
// The build fills in the version and the file list; a new version replaces the old copy.
const VERSION = "__VERSION__";
const FILES = __FILES__;
const CACHE = `spoonful-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("spoonful-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Cache first (the app is the same until a new version is installed), falling back to the network.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((hit) => hit ?? fetch(request).catch(() => caches.match("./"))));
});
