#!/usr/bin/env python3
"""Build the branded FEFC app (a re-signed, re-branded, preconfigured build of stock Kodi, GPL-2.0-or-later).
 stock Kodi APK -> apktool decode (dex untouched) -> package com.faneditfanclub.kodi, label FEFC, FEFC icons/banner/splash,
 bundled add-ons (plugin.video.fefc, repository.fefc, skin.fefc), default userdata -> build -> zipalign -> sign with the DEDICATED
 Kodi keystore (FEFC_KODI_KEYSTORE / FEFC_KODI_KS_PASS / FEFC_KODI_KEY_ALIAS). Never the FEFC WebView app's key.
usage: build_kodi_apk.py stock.apk out.apk      env: BUILD_TOOLS, APKTOOL (jar), JAVA on PATH"""
import os, re, shutil, subprocess, sys, tempfile, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kodi_brand
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
stock, out = sys.argv[1], os.path.abspath(sys.argv[2])
bt, apktool = os.environ['BUILD_TOOLS'], os.environ['APKTOOL']
# libkodi.so derives its Java class names from getPackageName() at runtime (a manifest-only rename crashes at start:
# JNI 'java_class == null'). So a different package (FEFC_KODI_PACKAGE) also moves Kodi's Java classes in the dex
# (smali org/xbmc/kodi -> new/package/path) so the runtime lookups match. Default stays org.xbmc.kodi (legacy installs).
PKG = os.environ.get('FEFC_KODI_PACKAGE', 'org.xbmc.kodi')
RENAME = PKG != 'org.xbmc.kodi'
tmp = tempfile.mkdtemp(); dec = os.path.join(tmp, 'dec')
run = lambda *a, **k: subprocess.run(list(a), check=True, **k)
_NEED_SMALI = RENAME or os.path.isdir(os.path.join(root, 'tools', 'fefc_input', 'smali'))  # 0.3.22: OS keyboard on both packages
run('java', '-jar', apktool, 'd', *([] if _NEED_SMALI else ['-s']), '-f', '-o', dec, stock, stdout=subprocess.DEVNULL)
if RENAME:
    old_s, new_s = 'org/xbmc/kodi', PKG.replace('.', '/')
    for sd in glob.glob(os.path.join(dec, 'smali*')):
        src = os.path.join(sd, *old_s.split('/'))
        if os.path.isdir(src):
            dstd = os.path.join(sd, *new_s.split('/')); os.makedirs(os.path.dirname(dstd), exist_ok=True); shutil.move(src, dstd)
        for dp, _, fs in os.walk(sd):
            for fn in fs:
                if fn.endswith('.smali'):
                    fp = os.path.join(dp, fn); t = open(fp, encoding='utf-8').read()
                    t2 = t.replace('L' + old_s + '/', 'L' + new_s + '/').replace('"' + old_s + '/', '"' + new_s + '/').replace('org.xbmc.kodi', PKG)
                    if t2 != t: open(fp, 'w', encoding='utf-8').write(t2)
# manifest: package, provider authorities
mf = os.path.join(dec, 'AndroidManifest.xml'); s = open(mf, encoding='utf-8').read()
s = s.replace('package="org.xbmc.kodi"', 'package="%s"' % PKG)
s = s.replace('android:icon="@drawable/ic_launcher"', 'android:icon="@mipmap/ic_launcher"')
s = re.sub(r'(<application [^>]*?)android:banner="[^"]*"', r'\1', s)
s = re.sub(r'(<application [^>]*?)android:logo="[^"]*"', r'\1', s)
s = s.replace('<application ', '<application android:banner="@drawable/banner" android:logo="@drawable/banner" android:enableOnBackInvokedCallback="false" ', 1)
s = s.replace('<activity android:configChanges', '<activity android:banner="@drawable/banner" android:icon="@mipmap/ic_launcher" android:configChanges', 0)
s = re.sub(r'<activity ([^>]*android:name="[A-Za-z0-9_.]*\.Splash")', r'<activity android:banner="@drawable/banner" android:icon="@mipmap/ic_launcher" \1', s)
s = re.sub(r'android:authorities="org\.xbmc\.kodi\.', 'android:authorities="%s.' % PKG, s)
if RENAME:  # activity/service/receiver class names move with the dex classes
    s = s.replace('org.xbmc.kodi.', PKG + '.')
s = s.replace('org.xbmc.kodi.permission', PKG + '.permission')
if 'REQUEST_INSTALL_PACKAGES' not in s:  # lets the in-app updater hand the downloaded APK to Android's installer
    s = s.replace('<application', '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES"/>\n    <application', 1)
# FileProvider (androidx is already in Kodi's dex) so the downloaded update APK can be handed to Android's installer with a read grant
if 'fefc_update_paths' not in s:
    s = s.replace('</application>', '<provider android:name="androidx.core.content.FileProvider" android:authorities="%s.fefcupdate" android:exported="false" android:grantUriPermissions="true"><meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/fefc_update_paths"/></provider>\n    </application>' % PKG, 1)
os.makedirs(os.path.join(dec, 'res', 'xml'), exist_ok=True)
open(os.path.join(dec, 'res', 'xml', 'fefc_update_paths.xml'), 'w').write('<?xml version="1.0" encoding="utf-8"?>\n<paths>\n    <external-files-path name="ext" path="."/>\n    <external-cache-path name="extcache" path="."/>\n    <files-path name="int" path="."/>\n    <cache-path name="cache" path="."/>\n</paths>\n')
open(mf, 'w', encoding='utf-8').write(s)
# Phone/tablet package only: transparent activity that posts true Android shade notifications
# (service.py starts fefcnotify://notify?... via StartAndroidActivity). Legacy Fire TV APK is unchanged.
if PKG == 'com.fefc.kodi':
    _nf_smali = os.path.join(root, 'tools', 'fefc_notify', 'smali', 'com', 'fefc', 'kodi', 'FefcNotifyActivity.smali')
    if os.path.isfile(_nf_smali):
        _dest_dir = None
        for sd in sorted(glob.glob(os.path.join(dec, 'smali*'))):
            _dest_dir = os.path.join(sd, 'com', 'fefc', 'kodi')
        assert _dest_dir, 'no smali* dir to inject FefcNotifyActivity'
        os.makedirs(_dest_dir, exist_ok=True)
        shutil.copy(_nf_smali, os.path.join(_dest_dir, 'FefcNotifyActivity.smali'))
        s = open(mf, encoding='utf-8').read()
        if 'POST_NOTIFICATIONS' not in s:
            s = s.replace('<application', '<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>\n    <application', 1)
        if 'FefcNotifyActivity' not in s:
            s = s.replace('</application>',
                '<activity android:name="com.fefc.kodi.FefcNotifyActivity" android:exported="false" '
                'android:excludeFromRecents="true" android:taskAffinity="" '
                'android:theme="@android:style/Theme.Translucent.NoTitleBar">'
                '<intent-filter><action android:name="android.intent.action.VIEW"/>'
                '<category android:name="android.intent.category.DEFAULT"/>'
                '<data android:scheme="fefcnotify"/></intent-filter></activity>\n    </application>', 1)
        open(mf, 'w', encoding='utf-8').write(s)
        print('injected FefcNotifyActivity for com.fefc.kodi')
# Both packages: system-keyboard text entry (Android / Fire TV IME, Gboard voice typing) for Search and every
# FEFC text field; Python falls back to Kodi's keyboard if this activity does not open.
_in_dir = os.path.join(root, 'tools', 'fefc_input', 'smali', 'com', 'fefc', 'kodi')
if os.path.isdir(_in_dir):
    _dest_dir = None
    for sd in sorted(glob.glob(os.path.join(dec, 'smali*'))):
        _dest_dir = os.path.join(sd, 'com', 'fefc', 'kodi')
    assert _dest_dir, 'no smali* dir to inject FefcInputActivity'
    os.makedirs(_dest_dir, exist_ok=True)
    for f in glob.glob(os.path.join(_in_dir, '*.smali')):
        shutil.copy(f, os.path.join(_dest_dir, os.path.basename(f)))
    s = open(mf, encoding='utf-8').read()
    if 'FefcInputActivity' not in s:
        s = s.replace('</application>',
            '<activity android:name="com.fefc.kodi.FefcInputActivity" android:exported="false" '
            'android:excludeFromRecents="true" android:noHistory="true" '
            'android:windowSoftInputMode="stateAlwaysVisible|adjustResize" '
            'android:configChanges="keyboard|keyboardHidden|orientation|screenSize|screenLayout|navigation" '
            'android:theme="@android:style/Theme.Translucent.NoTitleBar">'
            '<intent-filter><action android:name="android.intent.action.VIEW"/>'
            '<category android:name="android.intent.category.DEFAULT"/>'
            '<data android:scheme="fefcinput"/></intent-filter></activity>\n    </application>', 1)
    open(mf, 'w', encoding='utf-8').write(s)
    print('injected FefcInputActivity for', PKG)
# label "FEFC" in every locale
for f in glob.glob(os.path.join(dec, 'res', 'values*', 'strings.xml')):
    t = open(f, encoding='utf-8').read()
    t2 = re.sub(r'(<string name="(?:app_name|search_hint)">)[^<]*(</string>)', r'\1FEFC\2', t)
    if t2 != t: open(f, 'w', encoding='utf-8').write(t2)
# universal build: add another ABI's native libs from a second stock APK of the same Kodi version (FEFC_EXTRA_ABI_APK),
# e.g. armeabi-v7a libs into the arm64-v8a build so the new-package app installs on 64-bit-only phones and 32-bit devices.
_extra = os.environ.get('FEFC_EXTRA_ABI_APK')
if _extra:
    import zipfile
    with zipfile.ZipFile(_extra) as z:
        for n in z.namelist():
            if n.startswith('lib/') and not n.endswith('/') and not os.path.exists(os.path.join(dec, n)):
                os.makedirs(os.path.dirname(os.path.join(dec, n)), exist_ok=True)
                with z.open(n) as r, open(os.path.join(dec, n), 'wb') as w: shutil.copyfileobj(r, w)
# libkodi.so has the build-time package baked in (CCompileInfo::GetPackage() = "org.xbmc.kodi"); Kodi derives its JNI
# class path (GetClass(): org/xbmc/kodi) from it, so a renamed app crashes on launch unless that string matches.
# Patch it in place in every ABI: the new package must be exactly as long (13 chars, e.g. com.fefc.kodi).
if RENAME:
    assert len(PKG) == len('org.xbmc.kodi'), 'FEFC_KODI_PACKAGE must be 13 characters to patch libkodi.so'
    n_patched = 0
    for so in glob.glob(os.path.join(dec, 'lib', '*', '*.so')):
        b = open(so, 'rb').read()
        b2 = b.replace(b'org.xbmc.kodi', PKG.encode()).replace(b'org/xbmc/kodi', PKG.replace('.', '/').encode()).replace(b'org_xbmc_kodi', PKG.replace('.', '_').encode())
        if b2 != b:
            open(so, 'wb').write(b2); n_patched += 1
        assert b'org.xbmc.kodi' not in b2 and b'org/xbmc/kodi' not in b2, so
    print('patched package in %d native libs' % n_patched)
    assert n_patched >= 1
kodi_brand.brand_apk_tree(dec)
kodi_brand.adaptive(dec)
A = os.path.join(dec, 'assets')
for aid in ('plugin.video.fefc', 'repository.fefc', 'skin.fefc'):
    src = os.path.join(root, 'kodi-src', aid)
    if os.path.isdir(src):
        shutil.copytree(src, os.path.join(A, 'addons', aid), ignore=shutil.ignore_patterns('__pycache__'))
# skin.fefc: derived at build time from the stock APK's Estuary skin + kodi-src/skin-fefc overlay
import build_kodi_skin
est = os.path.join(A, 'addons', 'skin.estuary')
build_kodi_skin.build(est, os.path.join(A, 'addons', 'skin.fefc'))
# make skin.fefc the default skin (platform override of the lookandfeel.skin default)
ap = os.path.join(A, 'system', 'settings', 'android.xml'); t = open(ap, encoding='utf-8').read()
t = t.replace('  <section id="interface">\n', '  <section id="interface">\n    <category id="skin">\n      <group id="1">\n        <setting id="lookandfeel.skin">\n          <default>skin.fefc</default>\n        </setting>\n      </group>\n    </category>\n', 1)
assert 'skin.fefc' in t; open(ap, 'w', encoding='utf-8').write(t)

# Phone edge-swipe / gesture Back must pop history like the remote Back button.
# Android 13+ predictive back can swallow the event (GUI back sound plays, no navigate); opt out above.
# Also map one-finger swipe-left to Back on the windows users navigate in.
_km = os.path.join(A, 'system', 'keymaps')
os.makedirs(_km, exist_ok=True)
open(os.path.join(_km, 'fefc-touch.xml'), 'w', encoding='utf-8').write("""<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!-- FEFC: one-finger swipe left = Back (same as remote), so phone edge-swipe pops history. -->
<keymap>
  <global>
    <touch>
      <swipe direction=\"left\">Back</swipe>
    </touch>
  </global>
  <Home>
    <touch>
      <swipe direction=\"left\">Back</swipe>
    </touch>
  </Home>
  <MyVideoNav>
    <touch>
      <swipe direction=\"left\">Back</swipe>
    </touch>
  </MyVideoNav>
  <movieinformation>
    <touch>
      <swipe direction=\"left\">Back</swipe>
    </touch>
  </movieinformation>
</keymap>
""")
# FEFC navigation sounds (same as the web / Fire TV app) as the default UI sound add-on, played also while a video is paused
import kodi_navsfx
print('uisounds:', kodi_navsfx.build(os.path.join(A, 'addons', 'resource.uisounds.fefc')))
t = open(ap, encoding='utf-8').read()
t = t.replace('  <section id="system">\n', '  <section id="system">\n    <category id="audio">\n      <group id="2">\n        <setting id="audiooutput.guisoundmode">\n          <default>2</default>\n        </setting>\n        <setting id="lookandfeel.soundskin">\n          <default>resource.uisounds.fefc</default>\n        </setting>\n      </group>\n    </category>\n', 1)
assert 'resource.uisounds.fefc' in t; open(ap, 'w', encoding='utf-8').write(t)
# selecting a video opens its details page (Play is a button there): Kodi 'Select action' for videos = Show information (3)
t = open(ap, encoding='utf-8').read()
t = t.replace('</settings>', '  <section id="media">\n    <category id="video">\n      <group id="1">\n        <setting id="myvideos.selectaction">\n          <default>3</default>\n        </setting>\n      </group>\n    </category>\n  </section>\n</settings>', 1)
assert 'myvideos.selectaction' in t; open(ap, 'w', encoding='utf-8').write(t)
# enable the bundled add-ons by default (Kodi enables whatever addon-manifest.xml lists)
am = os.path.join(A, 'system', 'addon-manifest.xml'); t = open(am, encoding='utf-8').read()
extra = ''.join('  <addon>%s</addon>\n' % a for a in ('plugin.video.fefc', 'repository.fefc', 'skin.fefc', 'resource.uisounds.fefc') if os.path.isdir(os.path.join(A, 'addons', a)))
t = t.replace('</addons>', extra + '</addons>'); open(am, 'w', encoding='utf-8').write(t)
if os.path.exists(os.path.join(root, 'assets', 'intro-tv.mp4')):
    shutil.copy(os.path.join(root, 'assets', 'intro-tv.mp4'), os.path.join(A, 'media', 'fefc-intro.mp4'))
# 0.3.22: Home wall loop bundled for an instant start (with ambience + silent twin for the SOUND toggle)
for _src, _dst in (('home-wall.mp4', 'fefc-home-wall.mp4'), ('home-wall-silent.mp4', 'fefc-home-wall-silent.mp4')):
    if os.path.exists(os.path.join(root, 'assets', _src)):
        shutil.copy(os.path.join(root, 'assets', _src), os.path.join(A, 'media', _dst))
bj = os.path.join(root, 'kodi-src', 'fefc-build.json')
if not os.path.exists(bj):
    open(bj, 'w').write('{"kodi": "21.3", "build": 0, "src": "local"}\n')
# app version shown in the app ("0.3 Beta"): kodi-src/fefc-version.txt, bumped by hand for every update
import json as _json
_b = _json.load(open(bj)); _vf = os.path.join(root, 'kodi-src', 'fefc-version.txt')
if os.path.exists(_vf): _b['version'] = open(_vf).read().strip()
_b['pkg'] = PKG
open(os.path.join(A, 'fefc-build.json'), 'w').write(_json.dumps(_b) + '\n')
shutil.copy(os.path.join(root, 'kodi-src', 'FEFC-NOTICE.txt'), os.path.join(A, 'FEFC-NOTICE.txt'))
# versionCode must rise with every FEFC build: with the stock code (2103000) on every update, Android/Fire OS treat each
# install as the same version and the launcher keeps a stale cached icon/banner entry (the app tile shows no icon).
yml = os.path.join(dec, 'apktool.yml'); y = open(yml, encoding='utf-8').read()
_vc = re.search(r"versionCode: '?(\d+)'?", y)
if _vc:
    y = y.replace(_vc.group(0), "versionCode: %d" % (int(_vc.group(1)) + int(_b.get('build') or 0)))
    y = re.sub(r"versionName: .*", "versionName: %s-fefc-%s" % (_b.get('kodi', ''), str(_b.get('version', '')).replace(' ', '-')), y, 1)
    open(yml, 'w', encoding='utf-8').write(y)
# apktool 2.x keeps 'doNotCompress' for assets already; build
unsigned = os.path.join(tmp, 'u.apk')
run('java', '-jar', apktool, 'b', '--use-aapt2', '-o', unsigned, dec, stdout=subprocess.DEVNULL)
aligned = os.path.join(tmp, 'a.apk')
run(bt + '/zipalign', '-p', '-f', '4', unsigned, aligned)
run(bt + '/apksigner', 'sign', '--ks', os.environ['FEFC_KODI_KEYSTORE'], '--ks-pass', 'env:FEFC_KODI_KS_PASS',
    '--ks-key-alias', os.environ.get('FEFC_KODI_KEY_ALIAS', 'fefckodi'), '--key-pass', 'env:FEFC_KODI_KS_PASS',
    '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true', '--v3-signing-enabled', 'true', '--out', out, aligned)
run(bt + '/apksigner', 'verify', '--print-certs', out)
shutil.rmtree(tmp, ignore_errors=True)
