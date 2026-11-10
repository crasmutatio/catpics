# Random Cats 🐱

A tiny PWA that shows random cat pictures (via [cataas.com](https://cataas.com)).
Plain HTML/CSS/JS — no build step.

## Run locally

    python3 -m http.server 8000

Then open http://localhost:8000 (localhost is a secure context, so the
service worker and offline support work in desktop browsers).

## Use it on an iPhone

iOS only allows service workers (offline support) over HTTPS, so expose the
local server through a temporary tunnel:

    cloudflared tunnel --url http://localhost:8000

Open the printed `https://…trycloudflare.com` URL in Safari on the phone,
then **Share → Add to Home Screen**. The installed app starts offline and
replays the last 10 cats you loaded while online.

## Files

- `index.html` / `styles.css` / `app.js` — the app
- `manifest.json` — PWA manifest
- `sw.js` — service worker (precached app shell)
- `icons/` — app icons, generated with `make_icons.py` logic (cat photo from cataas)

## Notes

- Cat images are fetched as blobs and kept in the Cache API (`cat-images-v1`),
  capped at the 10 most recent.
- To ship an update, bump `VERSION` in `sw.js` (and keep `CAT_CACHE` in
  `app.js`/`sw.js` in sync) so caches refresh.
