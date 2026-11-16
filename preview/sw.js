/* English Learning Hub — service worker (REMINDER-BELL)
   - makes the app installable / usable offline (network-first, same-origin GET only)
   - shows reminder notifications: Web Push from the GitHub Actions sender, and
     periodicsync (Chrome, installed app) as a server-free fallback
   - notification tap opens the app at the unfinished lesson */
'use strict';
var CACHE = 'eh-app-v1', REM_CACHE = 'eh-rem', REM_URL = './__eh_rem.json';
var TITLE = 'منصة تعلّم الإنجليزية';

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(['./', 'manifest.json', 'icons/icon-192.png']); }).catch(function () {}).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE && k !== REM_CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.indexOf('__eh_rem') >= 0) return; /* never touch Firebase / Google / CDN */
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok && res.type === 'basic') { var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(req.mode === 'navigate' ? './' : req, cp); }); }
    return res;
  }).catch(function () {
    return caches.match(req.mode === 'navigate' ? './' : req, { ignoreSearch: req.mode === 'navigate' }).then(function (r) { return r || Response.error(); });
  }));
});

/* ---------- reminder state written by the page ---------- */
function pad(n) { return (n < 10 ? '0' : '') + n; }
function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function readState() { return caches.open(REM_CACHE).then(function (c) { return c.match(REM_URL); }).then(function (r) { return r ? r.json() : null; }).catch(function () { return null; }); }
function writeState(st) { return caches.open(REM_CACHE).then(function (c) { return c.put(REM_URL, new Response(JSON.stringify(st), { headers: { 'content-type': 'application/json' } })); }).catch(function () {}); }
function lessonUrl(id) { return new URL(id ? './#lesson-' + id : './', self.registration.scope).href; }
function show(body, id) {
  return self.registration.showNotification(TITLE, {
    body: body || 'كمّل درسك اليوم 📚', tag: 'eh-reminder', renotify: false, lang: 'ar', dir: 'rtl',
    icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { url: lessonUrl(id), id: id || '' }
  });
}
function due(st) {
  if (!st || !st.on) return false;
  var t = today(); if (st.sent === t || st.lastDay === t) return false;
  var p = String(st.time || '20:00').split(':'), at = (+p[0]) * 60 + (+p[1] || 0), d = new Date(), now = d.getHours() * 60 + d.getMinutes();
  return now >= at && now < at + 240;
}

self.addEventListener('push', function (e) {
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(readState().then(function (st) {
    if (st) { st.sent = today(); writeState(st); }
    return show(d.body, d.id);
  }));
});
self.addEventListener('periodicsync', function (e) {
  if (e.tag !== 'eh-reminder') return;
  e.waitUntil(readState().then(function (st) {
    if (!due(st)) return;
    st.sent = today();
    return writeState(st).then(function () { return show(st.body, st.id); });
  }));
});
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'eh-show') e.waitUntil ? e.waitUntil(show(e.data.body, e.data.id)) : show(e.data.body, e.data.id);
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var data = e.notification.data || {}, url = data.url || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) { c.postMessage({ type: 'eh-open', id: data.id }); return c.focus(); }
    }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  }));
});
