self.addEventListener("install", event => {
  event.waitUntil(
    caches.open("surpresso-cache-v3").then(cache => {
      return cache.addAll([
        "/",
        "/index.html",
        "/equipment.html",
        "/style.css",
        "/app.js",
        "/manifest.json",
        "/icons/icon-192.png",
        "/icons/icon-512.png"
      ]);
    })
  );
});

// Чистка старых кэшей
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== "surpresso-cache-v3") {
            return caches.delete(key);
          }
        })
      )
    )
  );
});

// НЕ кешируем CSV
self.addEventListener("fetch", event => {
  const url = event.request.url;

  if (url.includes("export?format=csv")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // корректно работающий OFFLINE
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
