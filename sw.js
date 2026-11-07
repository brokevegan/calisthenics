/* Keeps the app's own files on the iPhone so it opens with no internet. Never holds workout records.
   A new version is picked up when opened with internet. Made by tools/make_site_files.py. */
const CACHE = "calisthenics-4f8e6cac3c85";
const FILES = ["./", "app.css", "figures.json", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "index.html", "js/app.js", "js/cues.js", "js/data.js", "js/engine.js", "js/runread.js", "js/session.js", "js/store.js", "manifest.webmanifest", "vendor/tesseract/eng.traineddata.gz", "vendor/tesseract/tesseract-core-simd-lstm.wasm.js", "vendor/tesseract/tesseract.min.js", "vendor/tesseract/worker.min.js"];

self.addEventListener("install", e => {
  // Fresh from the website: GitHub Pages lets browsers keep a file for 10 minutes, and an old one must never be saved as this version.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, {cache: "reload"})))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, {ignoreSearch: true}).then(hit => hit || fetch(e.request)));
});
