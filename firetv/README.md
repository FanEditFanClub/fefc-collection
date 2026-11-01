# FEFC Collection for Fire TV / Android TV

A minimal native Android WebView wrapper around the live site
<https://collection.faneditfanclub.com>. The app always loads the live site, so any change deployed to
the web app shows up on the TV the next time the app opens (no reinstall needed).

- Package `com.faneditfanclub.collection`, label "FEFC Collection", versionCode 1.
- Leanback launcher (`LEANBACK_LAUNCHER`) with a 320x180 banner; touchscreen not required; landscape, fullscreen, keeps the screen on.
- WebView with JavaScript, DOM storage, autoplay allowed, hardware acceleration. The user agent adds `Android TV FEFCFireTV/1.0`, and the start URL has `?tv=1`, so the web app uses its TV layout.
- Remote: D-pad and Select go to the page (focus navigation). Back sends the web app's own Back (`GoBack`, which closes the player or details page or goes up a level using history); on the Home screen, press Back twice to exit. Home exits as usual. Play/Pause, Next and Previous are passed to the page. Menu (or gamepad Y) opens search (Y).
- Cache: default WebView policy; the site sends `Cache-Control: no-cache` and its service worker is network-first, so updates show. Offline: a Retry screen (it retries on its own when you return to the app).
- Links: `target=_blank` / `window.open` links (Open in Drive, doc links) open in an installed browser (Silk if present), otherwise in the app's own WebView. The Play button uses the site's embedded Drive preview inside the WebView.
- Sync My List: Google's own sign-in is blocked inside WebViews, so on the TV use My List > Sync My List: Google TV code, QR code, or a 6-digit sync code (see `SYNC-SETUP.md` at the repo root). A direct Google sign-in attempt shows a notice pointing there.

## Build

Needs JDK 17 and the Android SDK (platform 34, build-tools 34.0.0).

```
echo "sdk.dir=/path/to/android-sdk" > local.properties
# create signing.properties (git-ignored) with storeFile, storePassword, keyAlias
./gradlew assembleRelease
```

The signing keystore and its password are NOT in this repo. Keep a copy; an update must be signed with the same key to install over the old one.

## Limitations

- Direct Google sign-in (the web button's popup flow) can't run in an embedded WebView: Google rejects it (`disallowed_useragent`). On the TV the site hides that option and offers Google TV code, QR code and 6-digit sync code instead. These need the Cloudflare KV binding (and, for the TV code, the Google TV OAuth client secrets) from `SYNC-SETUP.md`.
- Drive files that need a Google login to view won't play in the embedded preview; files shared with "anyone with the link" do.
- The APK has been built and verified (signature, manifest, leanback banner) but not run on a physical Fire TV from this build box.
