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

## Community ticker (Home screen) — `GET /api/feed`
Slim news-style bar at the bottom of Home (`src/ticker.js` + `#ticker` CSS in `style.css`): newest posts from our communities, each with the service's icon, plus "Join" items so every service always shows. Links open in a new tab (same as Support Us). On TV it is reached with D-pad Down from the bottom tile row (Left/Right between items, OK/Enter opens); auto-scroll pauses on hover/focus/touch and is off with `prefers-reduced-motion`.

Community links: Discord https://discord.gg/d8A9xHTey7 (guild 1529915531736383702, widget enabled) · X https://x.com/FanEditFanClub (user id 2072539271450312704) · Facebook Group https://www.facebook.com/groups/faneditfanclub (Page: https://www.facebook.com/FanEditFanClub/) · Reddit https://www.reddit.com/r/FanEditFanClub

Worker (`_worker.js`, `feedApi`): Cloudflare Cache API + `s-maxage=600`, merges newest first (max 4 posts/source), inserts a Join item after every 3 posts.
- **Reddit**: live, public Atom RSS `/r/FanEditFanClub/new/.rss` (no token). If Reddit blocks Cloudflare's IPs it falls back to the snapshot.
- **X**: live only if the Pages secret `X_BEARER_TOKEN` is set (X API v2 user timeline, originals only). Otherwise uses the snapshot.
- **Discord**: widget gives "Join our Discord · N online" (no token). Real messages need Pages secrets `DISCORD_BOT_TOKEN` (the existing bot's token works if it can read the channel) + `DISCORD_FEED_CHANNEL_ID` (e.g. an announcements channel).
- **Facebook**: anonymous reads redirect to the login wall, and the Groups Graph API is closed to new apps, so this is a "Join our Facebook Group" item only.
- Snapshot `data/community-feed.json` (refresh with `python3 tools/refresh_feed.py`; Reddit needs no token, X needs `X_BEARER_TOKEN` in env, otherwise existing entries are kept) is the fallback for the worker and for the client when `/api/feed` is unavailable (static hosting).
