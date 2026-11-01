# FEFC Collection – Handover

Live site: https://collection.faneditfanclub.com

## Hosting
- Cloudflare Pages project `fefc-collection`, on the faneditfanclub@gmail.com Cloudflare account.
- Deploy: build a clean zip of the repo and upload it under Pages > fefc-collection > Create deployment > Production.
- The zip EXCLUDES: `shots/ tools/ tests/ src/ node_modules .git package*.json`.
- `_worker.js` needs secret `GEMINI_API_KEY` (set in Pages > Settings > Variables and Secrets; never commit it). `config.js` keys stay blank in git.

## Domain
- faneditfanclub.com is registered via Cloudflare Registrar on the same account.

## Data
- Content comes from Google Drive (root folder `1kGaeK1unqWD1VOl3-DGWLAxISBhDR3cg`); the index in `data/` is rebuilt by a nightly resync (~3 AM ET).
- Count rules: resolve shortcuts; count videos only via `kind`; dedupe by size; drop samples, trailers and extras; exclude To Be Catalogued from Main.
- Don't modify Drive from the app.

## Discord bot
- Repo FanEditFanClub/Fan-Edit-Fan-Club-Collection-Discord-Channel-Bot, hosted on Render (auto-deploys on push).

## Changelog rule
- Log every update by appending a `{ts,text}` line to `changelog/entries.jsonl` in FanEditFanClub/fanedit-daily-changelog.
- Never touch that repo's workflow or `state/changelog.json`.

## Fire TV / Android TV app
- Source in `firetv/` (WebView wrapper that loads the live site; see `firetv/README.md`). Prebuilt APK: `firetv/FEFC-Collection.apk`, sideload steps in `firetv/SIDELOAD.md`.
- When deploying to Pages, the zip should include ONLY `firetv/FEFC-Collection.apk` from that folder (exclude `firetv/app`, `firetv/gradle*`, `firetv/*.md`, etc.). It is then served at https://collection.faneditfanclub.com/firetv/FEFC-Collection.apk.
- The signing keystore is NOT in git (kept on the box at /workspace/fefc-firetv/keystore). Back it up; updates must be signed with the same key.

## My List sync (Sync My List panel)
- Server code in `_worker.js` (`/api/sync/*`), UI in `src/sync.js`, `src/syncui.js`, `src/qrgen.js` (QR lib, MIT). Zip must include `qrgen.js`.
- Needs a KV binding `SYNC` and, for the Google TV code, secrets `GOOGLE_TV_CLIENT_ID` / `GOOGLE_TV_CLIENT_SECRET`. Full steps and design: `SYNC-SETUP.md`. Tests: `node tests/sync-server.test.mjs`.
