#!/usr/bin/env python3
"""Pick the stock Kodi package that matches the Android FEFC build.

Stable names follow the Android workflow: a plain version and codename, with no rc/beta suffix.
macOS has 21.3. The webOS mirror's newest stable IPK is 21.0 (there is no 21.3 IPK). Callers
record the version they actually packaged.
"""
import re

DMG_STABLE = re.compile(r'kodi-(\d+\.\d+(?:\.\d+)?)-([A-Za-z]+)-(arm64|x86_64)\.dmg')
WEBOS_NAME = re.compile(r'org\.xbmc\.kodi-webos_(\d+\.\d+(?:\.\d+)?)(?:~([A-Za-z0-9.]+))?\.ipk')
ANDROID_STABLE = re.compile(r'kodi-(\d+\.\d+(?:\.\d+)?)-([A-Za-z]+)-armeabi-v7a\.apk')


def version_tuple(text):
    return tuple(int(part) for part in str(text).split('.') if part.isdigit())


def stable_dmgs(names):
    """Map (version, arch) -> filename for stable macOS disk images."""
    found = {}
    for name in names:
        m = DMG_STABLE.search(name)
        # x86_64 contains an underscore. Release candidates look like Omega_rc1 and do not match.
        if not m or '~' in name:
            continue
        found[(m.group(1), m.group(3))] = m.group(0)
    return found


def stable_webos(names):
    """Map version -> filename. A '~rc' or '~b' suffix is not stable."""
    found = {}
    for name in names:
        m = WEBOS_NAME.search(name)
        if not m or m.group(2):
            continue
        found[m.group(1)] = m.group(0)
    return found


def stable_android_versions(names):
    found = set()
    for name in names:
        m = ANDROID_STABLE.search(name)
        if m and '_' not in name and '~' not in name:
            found.add(m.group(1))
    return found


def newest(versions):
    if not versions:
        return ''
    return max(versions, key=version_tuple)


def choose_version(available, target=''):
    """Prefer the Android release's Kodi version. Otherwise the newest stable package."""
    if target and target in available:
        return target
    return newest(available)


def dmg_url(arch, filename):
    return 'https://mirrors.kodi.tv/releases/osx/%s/%s' % (arch, filename)


def webos_url(filename):
    return 'https://mirrors.kodi.tv/releases/webos/%s' % filename
