const STALE_CACHE_PREFIXES = ["workbox-", "precache-", "runtime-", "api-cache"];

export async function cleanupLegacyServiceWorkers(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((cacheName) => STALE_CACHE_PREFIXES.some((prefix) => cacheName.startsWith(prefix)))
          .map((cacheName) => caches.delete(cacheName)),
      );
    }
  } catch (error) {
    console.warn("[service-worker] Legacy cleanup failed", error);
  }
}
