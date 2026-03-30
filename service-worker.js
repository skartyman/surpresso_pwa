const APP_VERSION = "1.1.7";
const CACHE_NAME = `surpresso-cache-${APP_VERSION}`;
const STATIC_ASSETS = [
  "/",
  "/index.html?v=" + APP_VERSION,
  "/equipment.html?v=" + APP_VERSION,
  "/diagrams.html?v=" + APP_VERSION,
  "/diagrams.js?v=" + APP_VERSION,
  "/style.css?v=" + APP_VERSION,
  "/gradient.css?v=" + APP_VERSION,
  "/app.js?v=" + APP_VERSION,
  "/manifest.json?v=" + APP_VERSION
];

// ===== INSTALL =====
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

// ===== ACTIVATE =====
self.addEventListener("activate", event => {
  event.waitUntil(
    Promise.all([
      // удаляем старые кеши
      caches.keys().then(keys =>
        Promise.all(
          keys.map(key => {
            if (key !== CACHE_NAME) return caches.delete(key);
          })
        )
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ===== FETCH =====
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = event.request.url;
  const requestUrl = new URL(url);
  const isNavigation = event.request.mode === "navigate";

  // ✅ HTML-навигации всегда из сети (чтобы не залипать на старом shell)
  if (isNavigation || requestUrl.pathname.endsWith(".html")) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/index.html?v=" + APP_VERSION))
    );
    return;
  }

  // ❌ НИКОГДА не кешируем CSV
  if (url.includes("export?format=csv")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // ❌ НЕ кешируем иконки и manifest
  if (
    url.includes("/icons/") ||
    url.includes("manifest.json")
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // ✅ cache-first для остального
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
