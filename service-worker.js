/* Drum and Race — service worker (offline play)
   Fixes "Response served by service worker has redirections" on iOS:
   pages are always fetched with redirect:'follow' and any redirected
   response is re-wrapped into a clean Response before it is returned. */
var CACHE = 'dnr-remaster-v3';
var CORE = ['./', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
var SONGS = ['m-drum-and-race.mp3', 'm-mordecai.mp3', 'm-sex-appeal.mp3', 'm-wrecked-4-luv.mp3', 'm-played-my-part.mp3',
  'm-sanctuary.mp3', 'm-berserk.mp3', 'm-riders-of-the-storm.mp3', 'm-need-for-speed.mp3', 'm-toxic.mp3'];

function clean(res) {
  if (!res || !res.redirected) return Promise.resolve(res);
  return res.blob().then(function (b) {
    return new Response(b, { status: res.status, statusText: res.statusText, headers: res.headers });
  });
}

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(CORE.map(function (u) {
      return fetch(u, { redirect: 'follow', cache: 'reload' }).then(clean).then(function (r) { if (r && r.ok) return c.put(u, r); }).catch(function () {});
    })).then(function () {
      /* songs download in the background so the game is fully playable offline */
      SONGS.forEach(function (u) { fetch(u).then(function (r) { if (r && r.ok) c.put(u, r); }).catch(function () {}); });
    });
  }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  /* the game page itself: network first, cached copy when offline */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req.url, { redirect: 'follow', credentials: 'same-origin' }).then(clean).then(function (r) {
        if (r && r.ok) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put('./', cp); }); }
        return r;
      }).catch(function () {
        return caches.match('./').then(function (r) { return r || caches.match('index.html'); });
      })
    );
    return;
  }

  /* fonts: cache first */
  if (url.hostname.indexOf('fonts.') === 0) {
    e.respondWith(caches.match(req).then(function (r) {
      return r || fetch(req).then(function (res) { var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); return res; });
    }).catch(function () { return new Response('', { status: 200 }); }));
    return;
  }

  if (url.origin !== self.location.origin) return;

  /* everything else on our site (songs, icons): cache first, then network */
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (r) {
    if (r) return r;
    return fetch(req).then(clean).then(function (res) {
      if (res && res.ok && res.status === 200) { var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); }
      return res;
    });
  }));
});
