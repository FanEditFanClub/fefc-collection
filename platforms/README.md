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

The same guide is the public page [collection.faneditfanclub.com/lg-update](https://collection.faneditfanclub.com/lg-update) (`lg-update.html`). When `version.json` is newer, the TV opens `DialogFEFCWebOSUpdate.xml` with the short form of these steps and a code for that page. None of this has been tried on a real LG TV.

Kodi's webOS port is for webOS 4 and newer, except sets with the K5LP chip. The package is 32-bit arm. A TV that only runs 64-bit apps cannot install it. The app id stays `org.xbmc.kodi`, so the new file replaces FEFC instead of adding a second icon. It is not signed for the LG store. Developer Mode accepts it.

### Why webOS Dev Manager

webOS Dev Manager is a desktop program. You add the TV with the IP address and the 6-character passphrase from the Developer Mode app, then you press Install and pick `FEFC-webOS.ipk`. No command line and no LG SDK.

`ares-install` uses that same connection as typed commands. It works. It is the wrong first explanation for someone who does not already use a terminal.

Homebrew Channel on a rooted TV can install an IPK from a URL with no computer. That service is not present on a normal Developer Mode set. Rooting is a separate exploit (`rootmy.tv`), and an LG update can close it. FEFC does not need it.

### What you need

- The LG TV, on, with FEFC already installed.
- A computer on the **same Wi-Fi**. Windows, Mac, or Linux.
- The Developer Mode app from the LG Content Store, signed in, with Dev Mode on.
- [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop/releases/latest) for that computer.

### Where the file is

The TV reads `platforms.webos` in [version.json](https://fefc-collection.pages.dev/kodi-app/version.json) and shows that URL on the update screen. When the entry is published, the file is [FEFC-webOS.ipk](https://fefc-collection.pages.dev/kodi-app/FEFC-webOS.ipk). If the link does not download, the LG package is not published yet. Do not install the Android APK.

### Install

1. On the TV, open Developer Mode. First time: install it from the Content Store, sign in with an LG account, turn Dev Mode on, and let the TV restart. Open the app again.
2. Turn **Key Server** on. Write down the IP address and the 6-character passphrase. The passphrase is case-sensitive.
3. On the computer, install webOS Dev Manager and open it.
4. Download `FEFC-webOS.ipk` from the link on the TV.
5. In Dev Manager, add the TV as a Developer Mode device. Host is the IP. Passphrase is the 6 characters.
6. Press **Install** and choose that file. Wait until it finishes. This replaces the current FEFC app.
7. Fully close FEFC and open it again.

### Keep Developer Mode from expiring

The Developer Mode app shows a countdown. [webOS Homebrew’s Dev Mode page](https://www.webosbrew.org/devmode/) currently describes that limit as 1000 hours. At zero, LG removes apps installed this way, including FEFC.

Before it runs out, open Developer Mode on the TV and extend the session from that screen. Or open the TV in Dev Manager and press **Renew session**. One LG account keeps Developer Mode on only one TV. Signing it in on a second set turns it off on the first.

### If the install fails

- Dev Manager cannot add the TV: same Wi-Fi, read the IP again, turn Key Server off and on, restart the TV and turn Key Server on again.
- It cannot fetch the key: on the computer open `http://<tv-ip>:9991/webos_rsa`. A key file should download. If the browser cannot connect, Key Server is off or the TV is on another network.
- Passphrase rejected: six characters, case-sensitive, copied from the Developer Mode screen.
- The ipk link 404s: the LG package is still unpublished. Use only the `platforms.webos` URL.
- Wrong package type: this file is 32-bit arm.
- FEFC still looks old: close it fully and open it again. If the tile is stale, power the TV off and on.
- FEFC is gone: the countdown hit zero, or the LG account was used on another TV. Turn Developer Mode back on and install the file again.

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
