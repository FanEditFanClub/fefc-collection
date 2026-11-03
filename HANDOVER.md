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
- Content comes from Google Drive (root folder `1kGaeK1unqWD1VOl3-DGWLAxISBhDR3cg`); the index in `data/` is rebuilt by a nightly GitHub Actions resync (`daily-resync.yml`, 7:00 AM ET / 12:00 UTC) so it finishes before the 9:00 AM ET collection file notifier.
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

## Video streaming proxy — `GET /api/stream/:id`
- `_worker.js` streams the file bytes through the Drive API (`files/ID?alt=media&key=…`) and honours `Range` (206 / `Content-Range`), so seeking works and Drive's virus-scan interstitial for big files is bypassed. Shortcut IDs are resolved to their target first (`shortcutDetails.targetId`, cached 6 h per isolate).
- **Preferred:** Pages secrets `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN` (faneditfanclub@gmail.com, scope `drive.readonly`) so `/api/stream` can read files shared with that account without viewer Google sign-in. See `STREAM-SETUP.md`. Never change Drive sharing from the app.
- **Also useful:** Pages secret `GOOGLE_API_KEY` (Pages > Settings > Variables and Secrets): a Google API key from project 965770773324 with the **Drive API enabled** (restrict it to the Drive API). Nothing is created automatically. Without it the endpoint answers `503 {"error":"not_configured"}`.
- Errors: `403 not_shared` (owner hasn't shared with "anyone with the link"), `429 quota_exceeded` (Drive download quota), `404 not_found`, `502 upstream`.
- Clients (web, Fire TV WebView, native `PlayerActivity` in APK v1.0.4+) try the proxy first and fall back to the Drive `/preview` iframe (or, in the APK's native player, the direct `drive.usercontent.google.com` URL) on any error.
- Only files shared "anyone with the link" can be streamed; files that are private to their (third-party) owner can't be played by anyone without the owner's sharing.

## Intro (canvas vs TV)
- Desktop/phone: the 26 s canvas intro (`src/intro.js`). Title (wordmark) enters at 6.9 s (after the logo has built and settled), subtitle at 8.0 s (`body.cintro.tg-run` in style.css).
- TV (`?tv=1` / TV UA): `assets/intro-tv.mp4` (the recorded desktop intro). If the video can't play, the CSS-only intro (`.tvi-*` in style.css) is the fallback: glow + rings 0–5.7 s, flash + logo 5.75 s, title 6.9 s, subtitle 8.0 s, hands off to Home at 9.6 s. `?fullintro=1` forces the canvas intro. `?novideo=1` forces the CSS fallback.

## Recent changes (Nov 1, 2026)
- **Fire TV v1.0.7** (versionCode 8) is prepared but not signed. v1.0.6 (versionCode 7) is the last signed APK in git. v1.0.5 made Play on TV launch the native TV player directly (no black WebView picture; stream pre-warmed).
- **Fire TV in-app updater**: on launch the app fetches `/firetv/version.json` immediately, in parallel with the site intro, and shows the Update / Later dialog only after the intro finishes. It downloads the APK (progress bar, checksum + signature checks) and opens the system installer through `ApkProvider`. First time only, Android asks to allow "Install unknown apps" for FEFC Collection. `./gradlew assembleRelease` regenerates `firetv/version.json` and copies the signed APK to `firetv/FEFC-Collection.apk`; edit `firetv/release-notes.txt` for the dialog text. To ship 1.0.7: the version bump is already in `firetv/app/build.gradle`; build with the SAME keystore (steps in `firetv/README.md`), then commit and deploy the rewritten `firetv/version.json` + `firetv/FEFC-Collection.apk` together. The version.json in git before that build has `size: 0` and an empty `sha256` on purpose — do not deploy it. Installs older than 1.0.6 have no updater and need one manual sideload. Tests: `firetv/tests/run-update-tests.sh`.
- **TV D-pad**: model-based navigation. Up leaves for the menu only from the first row of a grid, and from the topmost control on a video details page (so the top menu items can be selected). Arrow keys always `preventDefault`. On Fire TV the bottom hints use the remote's Back and Menu glyphs; Menu toggles star/My List (Search stays in the top menu). My List (wrapper only) has Check for updates at the bottom. Main Collection defaults to all folders A–Z, then all files A–Z; the Mixed pill in the sort bar restores the letter-by-letter mix (`localStorage.fefcAllLayout`).
- **TV intro**: `assets/intro-tv.mp4` (H.264 High L4.1, yuv420p, 1080p30, faststart, ~11 MB, cache-busted `?v=2`). The previous yuvj420p full-range L5.0 1080p60 file played audio with a black picture on the Fire TV WebView. CSS intro remains the fallback. `?nointro=1` skips it.
- **TV lag**: memoised `topFolder`, cached `genreList`, indexed `collVids` (`vidsByTop`). Genre route 2.0 s -> 0.57 s at 6x CPU throttle.
- **Folder classification**: `isFolder`/`isVid` hardened, `tools/classify.py` is repo-relative and incremental, regression test in `tests/`.
- **Easter-egg sounds**: every folder route resolves to a clip (`sfxResolve`/`sfxFallback` in `src/app.js`, defaults `assets/sfx/default-*`). `tests/sfx-coverage.test.js` checks every rule file exists and every route resolves. Root cause of the Dexter/Carrey regression: `navBack` stayed true after Back; it is now cleared in `go()` and by a timeout.
- **People tiles**: 16:9 face-centred crops, thumbs in `assets/people/t/`.
- **Search overlay (mobile)**: `.sp-opt` CSS collision with the Sync panel fixed (sync rules scoped to `.sp-opts`), `visualViewport` fit, LEAN rendering, 600-result cap, 220 ms debounce.
- **Install**: top-bar install button removed; the bottom legend "Install App" button and bottom card remain.
- **Fan edit ratings**: `tools/fanedit_ratings.py` writes `data/fanedit-ratings.json` (run nightly from `tools/daily_resync.py`, step 3b). Sources from Master Links registries: Movies Remastered / MRDb (polite 1 req/s sitemap crawl, cached in `data/.fanedit-ratings-cache.json`; title+path token match), FanEdit.org / IFDB scores + **Fan Edit Changes** (Cuts/Additions lists) from `data/editinfo.json` — Master Links has no separate Changes site. IFDB live pages sit behind Cloudflare; the tool detects challenges and skips (use `--from-dir` for saved HTML). Details page "Fan Edit Ratings" shows IFDB, MRDb, and Fan Edit Changes rows; Edit Notes lists change text.
- **Security**: Cloudflare deploy uses Actions secret `CLOUDFLARE_API_TOKEN` (and `CLOUDFLARE_ACCOUNT_ID`). The old hardcoded token was removed from `tools/daily_resync.py` — **owner should rotate that exposed token** in the Cloudflare dashboard.

