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
# enable the bundled add-ons by default (Kodi enables whatever addon-manifest.xml lists)
am = os.path.join(A, 'system', 'addon-manifest.xml'); t = open(am, encoding='utf-8').read()
extra = ''.join('  <addon>%s</addon>\n' % a for a in ('plugin.video.fefc', 'repository.fefc', 'skin.fefc') if os.path.isdir(os.path.join(A, 'addons', a)))
t = t.replace('</addons>', extra + '</addons>'); open(am, 'w', encoding='utf-8').write(t)
if os.path.exists(os.path.join(root, 'assets', 'intro-tv.mp4')):
    shutil.copy(os.path.join(root, 'assets', 'intro-tv.mp4'), os.path.join(A, 'media', 'fefc-intro.mp4'))
bj = os.path.join(root, 'kodi-src', 'fefc-build.json')
if not os.path.exists(bj):
    open(bj, 'w').write('{"kodi": "21.3", "build": 0, "src": "local"}\n')
shutil.copy(bj, os.path.join(A, 'fefc-build.json'))
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
