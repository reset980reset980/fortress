const CACHE_NAME = 'portress-static-v5';
const PRECACHE = [
  '/sprites/ui/joystick-base.png',
  '/sprites/ui/joystick-knob.png',
  '/sprites/ui/button-fire.png',
  '/sprites/ui/weapon-shot1.png',
  '/sprites/ui/weapon-shot2.png',
  '/sprites/ui/weapon-ss.png',
  '/sprites/ui/facing-left.png',
  '/sprites/ui/facing-right.png',
  '/sprites/ui/item.png',
  '/sprites/ui/weather-clear.png',
  '/sprites/ui/weather-rain.png',
  '/sprites/ui/weather-gale.png',
  '/sprites/ui/weather-fog.png',
  '/sprites/ui/weather-snow.png',
  '/sprites/ui/weather-affinity.png',
  '/sprites/fx/weather-rain.png',
  '/sprites/fx/weather-snow.png',
  '/audio/sfx/aim_tick.mp3',
  '/audio/ambient/rain.mp3',
  '/audio/ambient/wind.mp3',
  '/sprites/ui/pwa-icon-192.png',
  '/sprites/ui/pwa-icon-512.png',
  '/sprites/ui/pwa-icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('portress-static-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const isStaticAsset = request.destination === 'image' || request.destination === 'audio' || request.destination === 'font';
  if (!isStaticAsset) return;
  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
    if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
    return response;
  })));
});
