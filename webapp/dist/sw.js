self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.registration.unregister(),
      caches.keys().then((cacheNames) => Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))),
      self.clients.matchAll({ type: "window" }).then((clients) => Promise.all(clients.map((client) => client.navigate(client.url)))),
    ]),
  );
});
