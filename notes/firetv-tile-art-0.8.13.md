# Fire TV / Cube sideloaded tile art (0.8.13 findings)

## Verdict
**Full-bleed launcher tile art is not achievable for a sideloaded APK on Fire OS.** The Amazon launcher ignores (or heavily pads) the Leanback `android:banner` for non-Appstore installs and shows the square `android:icon` / `android:logo` inside a framed tile instead.

## Evidence (0.8.12 APK aapt)
- `application-icon` → `@mipmap/ic_launcher` (square RGB 48–192)
- `android:banner` → `@drawable/banner` (320×180, xxhdpi 640×360) — correctly declared with LEANBACK
- No `amazon:banner` / Appstore CDN asset meta in the APK
- Real Cube after clear-data + reinstall still showed framed square icon, not banner full-bleed

## Sources
- Stack Overflow 78471388 (Fire TV sideload uses icon, not banner)
- react-native-tvos #37456
- better-xcloud #126
- NuvioTV #2347

## Path that *does* get full-bleed
Amazon Appstore listing CDN banner / TV banner assets uploaded through the developer console (not APK resources alone).

## 0.8.13 fallback
Intentional **logo-in-frame** square `ic_launcher`: FEFC mark centered on dark pad with safe margin so the launcher frame crops padding, not the logo. Do **not** claim full-bleed is fixed.
