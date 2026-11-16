// Minimal no-op service worker.
// The Construct 2 export calls navigator.serviceWorker.register("sw.js") for its
// built-in offline cache. That cache is pointless here (the files are already
// served locally), but registering a real file keeps the console free of a
// "Failed to register service worker" warning.
self.addEventListener("install", function () {
	self.skipWaiting();
});

self.addEventListener("activate", function (event) {
	event.waitUntil(self.clients.claim());
});
