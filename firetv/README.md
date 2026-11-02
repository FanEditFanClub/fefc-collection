# FEFC Collection for Fire TV / Android TV

A minimal native Android WebView wrapper around the live site
<https://collection.faneditfanclub.com>. The app always loads the live site, so any change deployed to
the web app shows up on the TV the next time the app opens (no reinstall needed).

- Package `com.faneditfanclub.collection`, label "FEFC Collection", versionCode 8 (1.0.7). Playback tries the site `/api/stream/:id` proxy first, then the direct Drive URL.
- Leanback launcher (`LEANBACK_LAUNCHER`). The banner is full-bleed: `drawable-xhdpi/banner.png` is 320×180 and `drawable-xxhdpi/banner.png` is 480×270, so the Fire TV home tile has no letterbox. Touchscreen not required; landscape, fullscreen, keeps the screen on.
- WebView with JavaScript, DOM storage, autoplay allowed, hardware acceleration. The user agent adds `Android TV FEFCFireTV/1.0`, and the start URL has `?tv=1`, so the web app uses its TV layout.
- Remote: D-pad and Select go to the page (focus navigation). Back sends the web app's own Back (`GoBack`, which closes the player or details page or goes up a level using history); on the Home screen, press Back twice to exit. Home exits as usual. Play/Pause, Next and Previous are passed to the page. Menu is forwarded as a DOM key `Menu` (keyCode 82) and opens search. Gamepad Y is still forwarded as `y` and also opens search.
- Cache: default WebView policy; the site sends `Cache-Control: no-cache` and its service worker is network-first, so updates show. Offline: a Retry screen (it retries on its own when you return to the app).
- Links: `target=_blank` / `window.open` links (Open in Drive, doc links) open in an installed browser (Silk if present), otherwise in the app's own WebView. The Play button uses the site's embedded Drive preview inside the WebView. Because a remote can't click inside that cross-origin iframe, the web app exposes a focusable overlay and the app's `FEFCNative` JavaScript bridge taps the middle of the video when you press OK (v1.0.3+); a "TV PLAYER" button plays the Drive file in a native full-screen player (`PlayerActivity`: OK pause/play, Left/Right seek, Back close).
- Sync My List: Google's own sign-in is blocked inside WebViews, so on the TV use My List > Sync My List: Google TV code, QR code, or a 6-digit sync code (see `SYNC-SETUP.md` at the repo root). A direct Google sign-in attempt shows a notice pointing there.

## Build

Needs JDK 17 and the Android SDK (platform 34, build-tools 34.0.0).

```
echo "sdk.dir=/path/to/android-sdk" > local.properties
# create signing.properties (git-ignored) with storeFile, storePassword, keyAlias
./gradlew assembleRelease
```

The signing keystore and its password are NOT in this repo. Keep a copy; an update must be signed with the same key to install over the old one.

## In-app updater (1.0.6+)

- `Updater.prefetch()` fetches `https://collection.faneditfanclub.com/firetv/version.json` (`{versionCode, versionName, url, notes, size, sha256}`, never cached) as soon as the activity starts, while the site intro is playing. `revealAfterIntro()` runs only after the page reports the intro is done (`body.intro-done` / `body.no-intro`, or the intro element has class `done`). A missing intro element before that is treated as "page still loading", not "intro finished", so the dialog cannot appear on a blank WebView and then sit through the animation. A higher versionCode shows an Update / Later dialog (D-pad focusable, Back = Later). If the fetch is still in flight when the intro ends, the dialog waits for it. A manual check (My List → Check for updates, `FEFCNative.checkUpdate()`) uses the same result and, if it is asked during the intro, also waits until the intro ends.
- Update downloads to the app's external files dir (`updates/`), verifies size/sha256, package name and signing certificate, then starts the installer with a content URI from `ApkProvider` (our own minimal FileProvider; ACTION_VIEW, fallback ACTION_INSTALL_PACKAGE). If "Install unknown apps" isn't allowed yet it opens Settings (`ACTION_MANAGE_UNKNOWN_APP_SOURCES`) and continues when you come back.
- The download URL must be https on collection.faneditfanclub.com; a version.json can't redirect the updater elsewhere.
- Publishing: `./gradlew --offline assembleRelease` (needs `signing.properties`) also writes `version.json` and `FEFC-Collection.apk` into `firetv/`; release text comes from `release-notes.txt`. The APK must be signed with the same key and have a higher versionCode, or Android rejects the update.
- Tests without a device: `tests/run-update-tests.sh` (JDK + org.json jar). The dialog, permission flow and installer hand-off are Android UI and are NOT covered; they have not been run on a device or emulator from the build box.

## Release 1.0.7 (versionCode 8) — build and sign

The signing keystore is not in git. Updates must be signed with the same key as the installed app (`/workspace/fefc-firetv/keystore` on the owner's machine, or wherever that keystore was backed up). Do not deploy `firetv/version.json` from this commit as-is: `size` is `0` and `sha256` is empty until a signed build fills them. An empty checksum skips the hash check, and the APK currently in git is still 1.0.6, so shipping this manifest ahead of the signed APK would offer an update the installer then rejects.

On the machine that has the keystore, JDK 17, and Android SDK 34 (build-tools 34.0.0):

```
cd firetv
echo "sdk.dir=/path/to/android-sdk" > local.properties
# signing.properties (git-ignored), next to settings.gradle:
#   storeFile=/absolute/path/to/the.keystore
#   storePassword=...
#   keyAlias=...
./gradlew --offline assembleRelease
```

`assembleRelease` is finalized by `publishUpdateMeta`, which copies the signed APK to `firetv/FEFC-Collection.apk` and rewrites `firetv/version.json` with versionCode 8, the real byte size, and the real sha256. Confirm the rewritten `sha256` is 64 hex characters and `size` matches `FEFC-Collection.apk`. Commit those two files. Deploy them together with the web app (Pages zip includes only `firetv/FEFC-Collection.apk` from this folder, plus `firetv/version.json`). Do not run a signing step in CI and do not invent a new keystore.

Installed 1.0.6 builds will prompt on next open. Anything older than 1.0.6 has no updater and needs one manual sideload of this APK.

## Version notes

- 1.0.7: full-bleed home-tile banner; Menu key opens search; update check runs during the intro and the dialog waits until the intro ends.
- 1.0.6: in-app updater.
- 1.0.5: the TV player is launched natively straight from the Play button (fixes the black picture / slow start); stream proxy pre-warm.
- 1.0.4: native player tries the `/api/stream` proxy first.
- The site loads `?tv=1`; D-pad uses a model-based navigator in the web app (no native key handling needed).

## Limitations

- Direct Google sign-in (the web button's popup flow) can't run in an embedded WebView: Google rejects it (`disallowed_useragent`). On the TV the site hides that option and offers Google TV code, QR code and 6-digit sync code instead. These need the Cloudflare KV binding (and, for the TV code, the Google TV OAuth client secrets) from `SYNC-SETUP.md`.
- Drive files that need a Google login to view won't play in the embedded preview; files shared with "anyone with the link" do.
- The APK has been built and verified (signature, manifest, leanback banner) but not run on a physical Fire TV from this build box.
