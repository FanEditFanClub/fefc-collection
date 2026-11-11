# FEFC on Mac, LG webOS, and Samsung Tizen

These packages follow the same FEFC release as the Android Kodi apps (`org.xbmc.kodi` and `com.fefc.kodi`). The shared record is `https://fefc-collection.pages.dev/kodi-app/version.json`.

Android keeps the fields it already reads: `version`, `build`, `url`, `sha256`, `size`, and `packages`. Mac, webOS, and Tizen read `platforms` and do not download the Android APK. Until publishing is turned on, `platforms` is absent and the new apps report that the version is published but their file is not on the server yet.

The app version string is `kodi-src/fefc-version.txt` (currently `0.6 Beta`). It is not the web app's `0.8.x` number and it is not changed by these packages.

## What each package is

| Platform | Package | How it is made | Signing |
| --- | --- | --- | --- |
| Mac, Apple Silicon | `FEFC-macOS-arm64.dmg` | Stock Kodi 21.3 arm64 app, FEFC skin and add-on injected | Unsigned. No Developer ID, no notarization |
| Mac, Intel | `FEFC-macOS-x86_64.dmg` | Stock Kodi 21.3 x86_64 app, same injection | Unsigned |
| LG webOS | `FEFC-webOS.ipk` | Newest **stable** Kodi webOS IPK. The mirror has 21.0, not 21.3 | Unsigned. Developer Mode install. App id stays `org.xbmc.kodi` |
| Samsung Tizen | `FEFC.wgt` | Web wrapper around `https://collection.faneditfanclub.com/?tv=1&tizen=1` | Unsigned. Needs a Samsung certificate before the TV will install it |

`plugin.video.fefc`, `repository.fefc`, `skin.fefc`, and `resource.uisounds.fefc` are Python, XML, and wav. They do not ship `.so` libraries. webOS cannot load binary add-ons; FEFC does not need one. Playback is a direct file URL (`video/mp4` or `video/x-matroska`) through Kodi's own player.

The intro file copied into the Kodi packages is `assets/intro-tv.mp4` unchanged.

## Build on a computer

From the repo root, with Python 3, Pillow, numpy, ffmpeg, and the system `ar` tool:

```bash
python3 tools/build_tizen_wgt.py --out dist/FEFC.wgt
python3 tools/build_kodi_webos.py --stock /path/to/org.xbmc.kodi-webos_21.0.ipk --kodi-version 21.0 --out dist/FEFC-webOS.ipk
python3 tools/build_kodi_macos.py --arch all --cache /path/to/dmgs --kodi-version 21.3 --out dist
```

The macOS script uses `hdiutil` when it is on a Mac (a UDZO disk image). On Linux it unpacks the stock image with `7z`, then writes an ISO 9660 volume and wraps it with the `dmg` tool from libdmg-hfsplus (`FEFC_DMG_TOOL`). Disk Utility can open that file. The GitHub Actions job `macos` runs on a Mac and produces the native image.

CI builds all three on a push to `main` that touches these sources, and uploads them as Actions artifacts. It does not upload them to R2.

## Publishing (leave this off)

The job `publish` runs only when the repository variable `FEFC_PUBLISH_NEW_PLATFORMS` is exactly `true`. `tools/publish_kodi_platforms.py` also exits unless that variable is set. Turning it on copies `platforms` into `version.json` and uploads:

- `kodi/FEFC-macOS-arm64.dmg`
- `kodi/FEFC-macOS-x86_64.dmg`
- `kodi/FEFC-webOS.ipk`
- `kodi/FEFC.wgt`
- `kodi/version.json` (Android `url`, `packages`, `sha256`, `size`, `version`, and `build` kept as they were)

Do not set that variable until the packages have been installed on a real Mac, a real LG TV, and a real Samsung TV.

## Mac

An Apple Developer ID Application certificate is not in this project. These disk images are unsigned and not notarized. Gatekeeper will block the first open. That is expected.

To put the app on a Mac:

1. Download `FEFC-macOS-arm64.dmg` on an Apple Silicon Mac, or `FEFC-macOS-x86_64.dmg` on an Intel Mac. They are not interchangeable.
2. Open the disk image and drag `FEFC.app` to Applications. Replace the old app if asked.
3. The stock Kodi signature no longer matches, because the app was modified. In Terminal:

   ```bash
   codesign --remove-signature /Applications/FEFC.app
   xattr -dr com.apple.quarantine /Applications/FEFC.app
   ```

4. Right-click `FEFC.app`, choose Open, then Open. The System Settings path is Privacy & Security, then Open Anyway.
5. Open FEFC. The bundle id stays the stock Kodi id so the binary's own checks still match. The name on screen is FEFC.

A signed build for other people needs an Apple Developer Program membership, a Developer ID Application certificate, `codesign` of `FEFC.app` and its frameworks, then `notarytool` submit and `stapler`. This repo does not have that certificate and the workflow does not sign.

The in-app updater reads `version.json`. When `platforms.macos.arch.arm64` or `x86_64` is present it downloads that dmg, checks the sha256, and opens it. You still drag the new app into Applications. It will not replace the app silently.

## LG webOS

Kodi's webOS port is for webOS 4 and newer, except sets with the K5LP chip (some 2016 models). Confirm the set against [Kodi's webOS install page](https://kodi.wiki/view/HOW-TO:Install_Kodi_for_webOS) before sideloading. The stable package on the Kodi mirror is `org.xbmc.kodi-webos_21.0.ipk`, 32-bit arm. There is no Kodi 21.3 webOS IPK. A TV that only runs 64-bit apps cannot install this file.

The repacked IPK is not signed by LG. Developer Mode accepts it. The store will not.

1. On the TV, install the **Developer Mode** app from the LG Content Store. Sign in with an LG account, turn Developer Mode on, and read the passphrase and the TV's IP. The TV restarts.
2. On a computer, install either [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop) or the webOS CLI (`ares-setup-device`, `ares-install`).
3. Add the TV with that IP and passphrase.
4. Install `FEFC-webOS.ipk`. Dev Manager has an Install button. The CLI is `ares-install -d <tv-name> FEFC-webOS.ipk`.
5. The home-screen title is FEFC. The app id is still `org.xbmc.kodi`, so this replaces a stock Kodi webOS install rather than sitting beside it.
6. Developer Mode sessions expire (the Developer Mode app shows the remaining time). Extend the session before it runs out, or the sideloaded app will not start.

The in-app updater downloads the IPK and tries `luna-send` to `com.webos.appInstallService/dev/install`. That works only while Developer Mode is on. If it does not, the dialog shows the file path for Dev Manager or `ares-install`.

## Samsung Tizen

Kodi has no Tizen build. `FEFC.wgt` is a TV web app. It opens the live FEFC site in TV layout (`?tv=1&tizen=1`), registers the remote keys the site already understands (arrows, Enter, Return key 10009), and asks the page to hand a stream to Samsung AVPlay when the TV provides `webapis.avplay`. If AVPlay is missing or refuses the URL, the page keeps its normal HTML5 player. The intro video is the site's own intro; the shell waits for it, or 25 seconds, before it talks about an update.

The `.wgt` in this repo is **not signed**. A Samsung TV rejects an unsigned widget.

1. Install [Tizen Studio](https://developer.tizen.org/development/tizen-studio) with the TV extension and the TV certificate tools.
2. On the TV: open Apps and enter `12345` (2016–2019 sets) or `123456` (2020 and newer) to open the developer menu. Turn Developer Mode on and enter this computer's IP. Reboot the TV. Note the DUID if the certificate window asks for it.
3. In Tizen Studio, open Certificate Manager and create a Samsung certificate profile. Sign in with a Samsung account. The distributor certificate has to list this TV's DUID. Keep that profile. An update must be signed with the same author certificate or the TV treats it as a different app.
4. From a shell where `tizen` is on the PATH, with the profile name from Certificate Manager:

   ```bash
   tizen package -t wgt -s <profile-name> -- tizen/app
   ```

   Or sign the already built `dist/FEFC.wgt` with the same `tizen package` / `tizen security-profiles` flow your Tizen Studio version documents. The signed widget contains `author-signature.xml` and `signature1.xml`. The file this repo builds does not.
5. Connect and install:

   ```bash
   sdb connect <tv-ip>
   tizen install -n FEFC.wgt -t <tv-name>
   ```

6. Launch FEFC from the TV's app list. The D-pad moves through the site. Back is the remote Return key. Play tries AVPlay and falls back to the browser player.

The widget's own version number is three digits (`0.6.0` for `0.6 Beta` build 0, then the FEFC build number). The words on screen follow `version.json`, the same `0.6 Beta` string as the Kodi apps. Tizen will not install a signed update over itself unless that three-digit version increases and the certificate matches. The TV cannot install a new `.wgt` from inside the app. The update screen says when a build is published and where the file will be once publishing is on.

## Checks that do not need a TV or a Mac

`node --test tests/platforms.test.js` checks the version rules, that Android's package picker ignores `platforms`, that the add-ons stay script-only, that the intro bytes are copied unchanged, and that the Tizen zip is unsigned.

Opening the dmg, installing the IPK, and running the widget were not done here. There is no Mac, no LG TV, and no Samsung TV in this environment.
