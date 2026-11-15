# FEFC Handoff for Muse

Written on Nov 14, 2026, 7:50 PM ET (UTC-5) by Grok Bot for Fan Edit Fan Club (Carson). Authorization for the current release: pt643u.

## Repos and pipeline
- App repo: FanEditFanClub/fefc-collection. Work branch: `icon-work` (commit 3c4e6c1 holds all 0.6.6 fixes). `main` publishes.
- `.github/workflows/kodi-apk.yml` has 3 jobs:
  - **build**: Fire TV/Android APKs. Keep the signing cert (prefix e3890a8c) and the versionCode sequence unchanged.
  - **mac**: FEFC-Mac.dmg (Apple Silicon) and FEFC-Mac-Intel.dmg. Kodi 21.3, ad-hoc signed, dmgbuild drag-install window. It verifies the icon, the plist and the DMG background, and runs a launch test.
  - **publish**: uploads the APKs, both DMGs and kodi-repo to R2. It writes `version.json` last.
- Branch test: `gh workflow run kodi-apk.yml -R FanEditFanClub/fefc-collection --ref <branch> -f force=true -f publish=false`. A push to main builds and publishes.
- `deploy-site.yml` (workflow_dispatch) deploys the web app and worker as they are in the repo. The root `app.js` is the file that is served; `src/app.js` is edited in parallel by hand. Do NOT run `npm run build`.
- Add-on repo: after you change `kodi-src/plugin.video.fefc`, bump `addon.xml` and run `python3 tools/build_kodi_repo.py`. The test `tests/kodi-release-sync.test.mjs` fails if kodi-repo is stale.
- In-app changelog: `kodi-src/fefc-changelog.json`. App label: `kodi-src/fefc-version.txt`.
- Tests: `node --test tests/*.test.js tests/*.test.mjs`, plus `node --check _worker.js app.js src/app.js`.
- Public changelog: repo FanEditFanClub/fanedit-daily-changelog, `changelog/entries.jsonl`. Add ONE line per release. NEVER edit its workflow or the `state/changelog.json` watermark.
- Live URLs:
  - https://fefc-collection.pages.dev/kodi-app/version.json
  - /kodi-app/FEFC-Mac.dmg
  - /kodi-app/FEFC-Mac-Intel.dmg
  - /kodi-repo/
  - Short link is.gd/8la6gb (must keep working)

## Standing rules
- Version labels are "X Beta". Stay on 0.6.6 Beta. If a bump is needed, use 0.6.7 Beta. ASK before any 0.7.
- Tile shapes: folders and action tiles are landscape, videos are portrait.
- No Google Drive edits to the collection. No DNS changes. Never read, print or commit secrets.
- Performance must hold on Fire Stick-class hardware.
- Files and accounts live under faneditfanclub@gmail.com.
- Samsung/Tizen is out of scope; don't break the .wgt.
- Keep a rollback deployment URL for each deploy-site run.
- Commit as "Fan Edit Fan Club" <faneditfanclub@gmail.com> and cite authorized_by ids.

## Status of the 0.6.6 request items (all on `icon-work`, commit 3c4e6c1; ships when merged to main)
| Item | Status | Notes |
|---|---|---|
| Mac DMG Applications shortcut + app icon | Done; CI run 43659779766 verifying | .icns 16–1024, CFBundleIconFile set, CFBundleIconName removed, re-signed. Window 660x560 so the Read Me shows with no scroll bar (needs a look at the CI screenshot). |
| Touch/mouse hit offset (Android + Mac) | Partly fixed | Desktop Kodi hit rects match the drawn rects. Root cause found on Home: on non-16:9 screens (Mac 16:10, phones) the wall video was letterboxed while the skin was stretched. Fixed with Player.SetViewMode stretch16x9 in service.py. Still needs a test on a real Android touch device and a Mac. |
| Next/previous page buttons at the bottom | Done | router._pager + shapes KIND_PAGER |
| New Arrivals root-only | Done | catalog.in_main_collection; test in genre-sfx.test.js |
| Genres left/right tap arrows | Done | DialogGenres.xml 9160/9161, genreshow.py |
| Genre sfx only from members (Alien in Comedy) | Done (Kodi + web) | Cause: the "Alien & Aliens Double Feature" file is tagged Sci-Fi+Comedy. A clip now needs at least 50% of its users in that genre. |
| Seinfeld/Curb sfx | Mostly done | Added: bass riff, No soup for you, Curb Frolic, Pretty pretty pretty good (assets/sfx, data/folder-sfx.json). MISSING: Curb "suspicious stare" music; no source found. |
| Remove "Add to favourites" | Done | Root cause: Kodi loads keymaps by file name and the stock maps overrode FEFC's. The file is now installed as zz-fefc-nav.xml. Verified with right-click in test Kodi; test keymap-order.test.js. |
| Downloads dialog readability + X close; X on other dialogs | Done | updatepopup.py, closebtn.py |
| Home hubs reset to first page | Done | `&hub=$INFO[System.Time(hh:mm:ss)]` nonce in Home.xml |
| Optimus legs stutter | Done, small residual | 45 frames repaired (tools/fix_support_legs.py), double buffer, no thumbnail cache. Slight leg variation remains in frames 206–222. |
| Ticker social icons (X, Discord) | Done in Kodi | The web ticker already had its SVG icons. |
| Bottom bar orange focus border | Done | chrome btn-*-on.png |
| "Up to date" tile icon | Done | Check-in-circle when up to date; download icon when an update is available. |
| Home mosaic: slivers, frozen corners, side tile alignment | Done | Mask group 8980 + stretched wall. Not done: Genres mode doesn't cover the bottom-centre video. |

## Known observations, not fixed
- Back on Home switches to the fullscreen wall video (Kodi default behaviour).
- Genres side clips are not row-aligned.

## Next steps if the release did not finish
1. Check the CI result for icon-work.
2. Merge icon-work to main (authorized_by pt643u). The publish job ships build 60+.
3. Run deploy-site (app.js, folder-sfx.json and sfx changed) and record the rollback URL.
4. Verify version.json against the live DMG/APK sizes and sha256, plus cert e3890a8c, is.gd/8la6gb and kodi-repo 1.5.16.
5. Add one changelog line in fanedit-daily-changelog.
