/* Random Cats — app logic
 *
 * Cats come from https://cataas.com (responses are `no-store` + CORS, so
 * every fetch is a fresh random cat). Images are fetched as blobs, shown
 * via object URLs, and saved into the Cache API so they can be replayed
 * when offline.
 */
(() => {
  'use strict';

  const CAT_API = 'https://cataas.com/cat';
  const IMG_WIDTH = 800;

  // Keep in sync with sw.js — the service worker must not garbage-collect it.
  const CAT_CACHE = 'cat-images-v1';
  const CAT_CACHE_LIMIT = 10;

  const catImg = document.getElementById('cat');
  const spinner = document.getElementById('spinner');
  const errorBox = document.getElementById('error');
  const retryBtn = document.getElementById('retry');
  const newCatBtn = document.getElementById('new-cat');
  const offlineBadge = document.getElementById('offline-badge');
  const iosHint = document.getElementById('ios-hint');
  const hintClose = document.getElementById('hint-close');

  const store = {
    get(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch { /* ignore */ }
    },
  };

  let pending = null;          // promise for the next cat: { blob } or { error }
  let busy = false;
  let currentObjectUrl = null;

  // ---- data layer ----

  function fetchCat() {
    const options = { cache: 'no-store', mode: 'cors' };
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
      options.signal = AbortSignal.timeout(20000);
    }
    return fetch(`${CAT_API}?width=${IMG_WIDTH}`, options)
      .then(async (response) => {
        if (!response.ok) throw new Error(`cataas responded ${response.status}`);
        const blob = await response.blob();
        if (!blob.size) throw new Error('cataas returned an empty image');
        await saveCat(blob);
        return { blob };
      });
  }

  async function saveCat(blob) {
    if (!('caches' in window)) return;
    try {
      const cache = await caches.open(CAT_CACHE);
      const id = `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const url = new URL(`cat-cache/${id}`, location.href).href;
      await cache.put(url, new Response(blob, { headers: { 'content-type': blob.type } }));
      // Keep only the most recent cats.
      const keys = await cache.keys();
      const excess = keys.length - CAT_CACHE_LIMIT;
      for (const key of keys.slice(0, Math.max(0, excess))) {
        await cache.delete(key);
      }
    } catch { /* cache unavailable or full — not fatal */ }
  }

  async function randomSavedCat() {
    if (!('caches' in window)) return null;
    try {
      const cache = await caches.open(CAT_CACHE);
      const keys = (await cache.keys()).filter((k) => k.url.includes('/cat-cache/'));
      if (keys.length === 0) return null;
      const key = keys[Math.floor(Math.random() * keys.length)];
      const response = await cache.match(key);
      return response ? await response.blob() : null;
    } catch {
      return null;
    }
  }

  // ---- UI ----

  function display(blob) {
    errorBox.hidden = true;
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = URL.createObjectURL(blob);
    catImg.classList.remove('visible');
    catImg.onload = () => requestAnimationFrame(() => catImg.classList.add('visible'));
    catImg.onerror = () => { errorBox.hidden = false; };
    catImg.src = currentObjectUrl;
  }

  function finish() {
    spinner.hidden = true;
    busy = false;
    newCatBtn.disabled = false;
  }

  function warmNext() {
    if (pending || !navigator.onLine) return;
    pending = fetchCat().catch((error) => ({ error }));
  }

  async function nextCat() {
    if (busy) return;
    busy = true;
    newCatBtn.disabled = true;
    spinner.hidden = false;
    errorBox.hidden = true;

    let candidate = pending || fetchCat().catch((error) => ({ error }));
    pending = null;

    // A single cataas request can fail; try a couple before giving up.
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await candidate;
      if (result.blob) {
        display(result.blob);
        finish();
        warmNext();
        return;
      }
      // Network hiccup or offline — replay a saved cat if we have one.
      const saved = await randomSavedCat();
      if (saved) {
        display(saved);
        finish();
        return;
      }
      candidate = fetchCat().catch((error) => ({ error }));
    }

    spinner.hidden = true;
    errorBox.hidden = false;
    busy = false;
    newCatBtn.disabled = false;
  }

  newCatBtn.addEventListener('click', nextCat);
  catImg.addEventListener('click', nextCat);
  retryBtn.addEventListener('click', nextCat);

  // ---- online/offline badge ----

  const updateOnlineStatus = () => {
    offlineBadge.hidden = navigator.onLine;
    if (navigator.onLine) warmNext();
  };
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  // ---- one-time iOS install hint (iOS has no install prompt API) ----

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPT|GSA/.test(ua);
  const isStandalone = navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
  if (isIOS && isSafari && !isStandalone && !store.get('cats-hint-dismissed')) {
    iosHint.hidden = false;
  }
  hintClose.addEventListener('click', () => {
    iosHint.hidden = true;
    store.set('cats-hint-dismissed', '1');
  });

  // ---- service worker (offline app shell) ----

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  nextCat();
})();
