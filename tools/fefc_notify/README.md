# FefcNotifyActivity (com.fefc.kodi only)

Transparent Android activity injected into the phone/tablet APK by `build_kodi_apk.py`.

- `fefcnotify://notify?kind=&title=&text=&nid=` — post a shade notification
- `fefcnotify://open?kind=files|update` — notification tap; writes `fefc-pending-nav.txt` and launches Splash

`service.py` starts the notify URI via `StartAndroidActivity` and polls
`https://fefc-collection.pages.dev/kodi-app/new-files.json` (published by the
Fan Edit notifier when it posts).

Rebuild smali after editing the Java:

```bash
# needs javac + android.jar + d8 + baksmali (see agent notes)
javac -source 1.8 -target 1.8 -bootclasspath android.jar -classpath android.jar \
  -d classes src/com/fefc/kodi/FefcNotifyActivity.java
d8 --min-api 21 --output out_dex classes/com/fefc/kodi/*.class
baksmali d out_dex/classes.dex -o smali_out
cp smali_out/com/fefc/kodi/FefcNotifyActivity.smali smali/com/fefc/kodi/
```
