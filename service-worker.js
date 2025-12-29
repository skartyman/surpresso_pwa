const APP_VERSION = "1.1.3";
const CACHE_NAME = `surpresso-cache-${APP_VERSION}`;

// ===== INSTALL =====
self.addEventListener("install", event => {
  self.skipWaiting(); // сразу активируем новый SW

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll([
        "/",
        "/index.html?v=" + APP_VERSION,
        "/equipment.html?v=" + APP_VERSION,
        "/style.css?v=" + APP_VERSION,
        "/app.js?v=" + APP_VERSION,
        "/manifest.json?v=" + APP_VERSION
        // ❌ НЕ кешируем иконки тут
      ])
    )
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

// ===== FETCH =====
self.addEventListener("fetch", event => {
  const url = event.request.url;

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
