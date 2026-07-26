// Echo — minimal offline shell cache.
// Note: the Whisper model itself is cached separately by Transformers.js
// (Cache Storage), this only covers the app's own HTML/JS/CSS/lang files.

const CACHE_NAME = "echo-shell-v11";
const SHELL_FILES = [
  "./index.html",
  "./manifest.json",
  "./lib/app.js",
  "./lib/audio-filename.js",
  "./lib/db.js",
  "./lib/errors.js",
  "./lib/modal.js",
  "./lib/recorder.js",
  "./lib/schema.js",
  "./lib/session.js",
  "./lib/toast.js",
  "./lib/transcriber.js",
  "./lib/transports/index.js",
  "./lib/transports/transport-interface.js",
  "./lib/transports/web-share.js",
  "./lib/transports/file-export.js",
  "./lib/transports/relay.js",
  "./lib/transports/cloud-folder.js",
  "./lang/index.js",
  "./lang/sl.json",
  "./lang/en.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/favicon.ico",
  "./icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  // Only handle same-origin GETs for the app shell; let everything else
  // (model downloads from the CDN, relay POSTs) pass through untouched.
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
