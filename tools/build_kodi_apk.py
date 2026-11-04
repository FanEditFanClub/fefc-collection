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
# NOTE: the package MUST stay org.xbmc.kodi: libkodi.so derives its Java class names from the package name at runtime
# (a renamed package crashes at start: JNI 'java_class == null'), so a distinct package id is not possible without rebuilding Kodi.
PKG = os.environ.get('FEFC_KODI_PACKAGE', 'org.xbmc.kodi')
tmp = tempfile.mkdtemp(); dec = os.path.join(tmp, 'dec')
run = lambda *a, **k: subprocess.run(list(a), check=True, **k)
run('java', '-jar', apktool, 'd', '-s', '-f', '-o', dec, stock, stdout=subprocess.DEVNULL)
# manifest: package, provider authorities
mf = os.path.join(dec, 'AndroidManifest.xml'); s = open(mf, encoding='utf-8').read()
s = s.replace('package="org.xbmc.kodi"', 'package="%s"' % PKG)
s = s.replace('android:icon="@drawable/ic_launcher"', 'android:icon="@mipmap/ic_launcher"')
s = s.replace('<activity android:configChanges', '<activity android:banner="@drawable/banner" android:icon="@mipmap/ic_launcher" android:configChanges', 0)
s = re.sub(r'<activity ([^>]*android:name="org\.xbmc\.kodi\.Splash")', r'<activity android:banner="@drawable/banner" android:icon="@mipmap/ic_launcher" \1', s)
s = re.sub(r'android:authorities="org\.xbmc\.kodi\.', 'android:authorities="%s.' % PKG, s)
s = s.replace('org.xbmc.kodi.permission', PKG + '.permission')
if 'REQUEST_INSTALL_PACKAGES' not in s:  # lets the in-app updater hand the downloaded APK to Android's installer
    s = s.replace('<application', '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES"/>\n    <application', 1)
# FileProvider (androidx is already in Kodi's dex) so the downloaded update APK can be handed to Android's installer with a read grant
if 'fefc_update_paths' not in s:
    s = s.replace('</application>', '<provider android:name="androidx.core.content.FileProvider" android:authorities="%s.fefcupdate" android:exported="false" android:grantUriPermissions="true"><meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/fefc_update_paths"/></provider>\n    </application>' % PKG, 1)
os.makedirs(os.path.join(dec, 'res', 'xml'), exist_ok=True)
open(os.path.join(dec, 'res', 'xml', 'fefc_update_paths.xml'), 'w').write('<?xml version="1.0" encoding="utf-8"?>\n<paths>\n    <external-files-path name="ext" path="."/>\n    <external-cache-path name="extcache" path="."/>\n    <files-path name="int" path="."/>\n    <cache-path name="cache" path="."/>\n</paths>\n')
open(mf, 'w', encoding='utf-8').write(s)
# label "FEFC" in every locale
for f in glob.glob(os.path.join(dec, 'res', 'values*', 'strings.xml')):
    t = open(f, encoding='utf-8').read()
    t2 = re.sub(r'(<string name="(?:app_name|search_hint)">)[^<]*(</string>)', r'\1FEFC\2', t)
    if t2 != t: open(f, 'w', encoding='utf-8').write(t2)
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
bj = os.path.join(root, 'kodi-src', 'fefc-build.json')
if not os.path.exists(bj):
    open(bj, 'w').write('{"kodi": "21.3", "build": 0, "src": "local"}\n')
# app version shown in the app ("0.3 Beta"): kodi-src/fefc-version.txt, bumped by hand for every update
import json as _json
_b = _json.load(open(bj)); _vf = os.path.join(root, 'kodi-src', 'fefc-version.txt')
if os.path.exists(_vf): _b['version'] = open(_vf).read().strip()
open(os.path.join(A, 'fefc-build.json'), 'w').write(_json.dumps(_b) + '\n')
shutil.copy(os.path.join(root, 'kodi-src', 'FEFC-NOTICE.txt'), os.path.join(A, 'FEFC-NOTICE.txt'))
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
