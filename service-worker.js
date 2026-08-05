/**
 * service-worker.js
 * -----------------------------------------------------------------------
 * Bu, çox sadə (minimal) bir "service worker"dır. Yeganə vəzifəsi
 * brauzerə (Chrome/Android) "bu səhifə əsl tətbiq kimi ana ekrana əlavə
 * oluna bilər" demməkdir. Offline keşləmə etmir — çünki bu tətbiq həmişə
 * canlı backend-ə (FastAPI) ehtiyac duyur, offline işləyə bilməz.
 * -----------------------------------------------------------------------
 */

self.addEventListener("install", (event) => {
  // Yeni service worker dərhal aktivləşsin
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Sorğuları sadəcə şəbəkəyə ötürürük (keşləmə yoxdur).
// Bu handler-in mövcudluğu Chrome-un "quraşdırıla bilər" şərtini ödəyir.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
