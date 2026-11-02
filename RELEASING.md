# Releasing FEFC Collection (web + Fire TV)

## Single version source of truth

Edit **`VERSION`** at the repo root only:

```json
{ "versionCode": 10, "versionName": "0.8.2" }
```

| Consumer | How it gets the version |
|---|---|
| Fire TV APK | `firetv/app/build.gradle` reads `VERSION` into `defaultConfig.versionCode` / `versionName` |
| In-app updater + web home badge | `./gradlew assembleRelease` → `publishUpdateMeta` writes `firetv/version.json` from those same values (plus APK `size`/`sha256`/`notes`) |
| Web fallback before fetch | `npm run build` stamps `HOME_VER_FALLBACK` in `src/app.js` from `VERSION` |
| Live web badge | `resolveHomeVer()` paints from `FEFCNative.version()` on Fire TV, else fetches `/firetv/version.json` |

Web and Fire TV **must** show the same `versionName`. Never edit `versionCode`/`versionName` in `build.gradle`, `HOME_VER_FALLBACK`, or `firetv/version.json` by hand — change `VERSION`, then rebuild / sync as below.

### Standing rule: bump on every ship

- **Every ship** (web-only or APK) bumps `versionName` in `VERSION` (patch `0.8.x` scaled to the change size). Keep web badge + `firetv/version.json` `versionName` in sync.
- Bump **`versionCode` only when the APK is rebuilt** (Android updates key off `versionCode`; the in-app updater offers an update only when remote `versionCode` is higher).
- Stay on the `0.8.x` beta line. If a release feels big enough for `0.9`, **do not bump to 0.9 yourself** — flag it as a suggestion. Never ship `1.0` while still in beta.
- Report the shipped `versionName` with each ship.

### Web-only deploy (no APK)

1. Patch-bump `versionName` in `VERSION` (leave `versionCode` unchanged).
2. Sync `versionName` (and release `notes` text) into `firetv/version.json` — keep existing `versionCode` / `url` / `size` / `sha256` so Fire TV does **not** offer a fake APK update.
3. `npm run build` (stamps `HOME_VER_FALLBACK` + SW).
4. Commit `VERSION`, `firetv/version.json`, and built web assets together.
5. Deploy Cloudflare Pages (include `firetv/version.json`).
6. Append one line to `FanEditFanClub/fanedit-daily-changelog` `changelog/entries.jsonl`.
7. Verify home badge shows `vX.Y.Z beta` matching `VERSION.versionName`.

### APK + web release

1. Bump `versionCode` (required for Android updates) and `versionName` in `VERSION`.
2. Update `firetv/release-notes.txt` (updater dialog).
3. `cd firetv && ./gradlew assembleRelease` (needs `signing.properties` / same keystore).
4. Confirm `firetv/version.json` has the new `versionCode`/`versionName`, non-zero `size`, and 64-char `sha256`.
5. `npm run build` (stamps web fallback + SW).
6. Commit `VERSION`, `firetv/version.json`, `firetv/FEFC-Collection.apk`, and built web assets together.
7. Deploy Cloudflare Pages (include `firetv/version.json` + `firetv/FEFC-Collection.apk`).
8. Append one line to `FanEditFanClub/fanedit-daily-changelog` `changelog/entries.jsonl`.
9. Verify: open https://collection.faneditfanclub.com/ (no `?tv=1`) → home shows `vX.Y.Z beta` matching `VERSION.versionName`; Fire TV APK `versionName` matches.

### PWA note (Pixel Fold)

If Chrome’s ⋮ menu lacks **Install app**, clear site data for collection.faneditfanclub.com and remove any existing home-screen shortcut / WebAPK, then reload — CDP installability errors are empty when criteria are met; a prior A2HS install can hide the Install app item.
