"""Update-tile labels and the install handoff checks. No xbmc import, so tests can run them."""
import io
import json
import re
import zipfile

LABEL_CHECKING = 'Checking for updates'
LABEL_UP_TO_DATE = 'Up to date'
LABEL_AVAILABLE = 'Update available'
LABEL_UNABLE = 'Unable to check'

# Kodi's StartAndroidActivity always setPackage(first arg). An empty package cannot resolve.
INSTALLER_PACKAGES = ('com.google.android.packageinstaller', 'com.android.packageinstaller')


def version_key(label):
    """Numeric key for an app version label. '0.6 Beta' and '0.6.0' compare equal.
    Missing pieces are zeros, so 0.6 is (0, 6, 0) and 0.6.1 is (0, 6, 1).
    Always a 3-tuple: only the first three numeric parts count, and a
    trailing pre-release / build-date suffix (beta, rc, alpha, preview, or
    a parenthesised date) is ignored, so '0.6.5 RC1', '0.6.5 Beta 2' and
    '0.6.5 (2026-11-12)' all key as (0, 6, 5)."""
    text = str(label or '').strip()
    text = re.sub(r'(?i)\s*(?:beta|rc|alpha|preview)\b.*$', '', text)
    text = re.sub(r'\s*\(.*$', '', text)
    nums = [int(part) for part in re.findall(r'\d+', text)]
    if not nums:
        return (0, 0, 0)
    nums = nums[:3]
    while len(nums) < 3:
        nums.append(0)
    return tuple(nums)


def release_is_newer(new_version, new_build, cur_version, cur_build):
    """True when the published release is newer. The version label decides first
    (0.6 is newer than 0.5.5; 0.6 and 0.6.0 are the same release). A higher build
    number is newer only when the version labels are the same."""
    new_key = version_key(new_version)
    cur_key = version_key(cur_version)
    if new_key != cur_key:
        return new_key > cur_key
    try:
        return int(new_build or 0) > int(cur_build or 0)
    except (TypeError, ValueError):
        return False


def progress_view(state, version, pct=0, done_bytes=0, total_bytes=0, detail=''):
    """Copy for the centered update popup. state: downloading, verifying, ready, failed."""
    version = (version or '').strip()
    try:
        pct = max(0, min(100, int(pct)))
    except (TypeError, ValueError):
        pct = 0
    def _mb(v):
        try:
            return max(0, int(v or 0)) >> 20
        except (TypeError, ValueError):
            return 0
    done_mb = _mb(done_bytes)
    total_mb = _mb(total_bytes)
    if state == 'verifying':
        line = 'Verifying…'
        sub = version
        bar = 100
    elif state == 'ready':
        line = 'Ready to install'
        sub = version
        bar = 100
    elif state == 'failed':
        line = detail or 'The download did not finish. Check the connection.'
        sub = version
        bar = pct
    else:
        line = '%d%%' % pct
        sub = ('%d / %d MB' % (done_mb, total_mb)) if total_mb else version
        bar = pct
    return {
        'title': 'Updating FEFC' if state != 'failed' else 'Update failed',
        'version': version,
        'line': line,
        'sub': sub,
        'pct': bar,
        'retry': state == 'failed',
    }


def label_for(state):
    return {
        'checking': LABEL_CHECKING,
        'up_to_date': LABEL_UP_TO_DATE,
        'available': LABEL_AVAILABLE,
        'failed': LABEL_UNABLE,
    }.get(state, LABEL_UNABLE)


# Test-covered (tests/kodi-repairs.test.js:77). Keep even though no runtime
# caller uses it: it pins the "running APK build wins over a pre-confirm
# record" rule. Do not remove in a dead-code sweep.
def installed_from_apk(apk_record, recorded_record):
    """The build inside the running APK is the installed build. A pre-confirm record is ignored."""
    return apk_record


# Stock Kodi 21 versionCode. The FEFC build number is added to it for both APKs
# (com.fefc.kodi and org.xbmc.kodi), so a dumpsys versionCode can be turned back into a build.
# This MUST equal the versionCode baked into the APK by the build step: if Kodi
# bumps its stock versionCode, update this constant in step with the APK build
# (there is no runtime value to assert it against — the comment is the check).
VERSIONCODE_BASE = 2103000


def parse_pm_path(text):
    """`pm path <pkg>` prints `package:/data/app/.../base.apk`.

    Returns the FIRST `package:` line. Callers must scope the `pm path`
    invocation to one package (one pkg argument): with split APKs, or a
    dump covering several packages, the first line may belong to another
    package's split.
    """


def parse_dumpsys_version_code(text):
    """First `versionCode=` in the text, or None.

    Callers must scope the dumpsys invocation to one package (`dumpsys
    package <pkg>`): an unscoped dump can contain several versionCode
    values, and the first one wins here.
    """


def build_from_version_code(version_code, base=VERSIONCODE_BASE):
    try:
        code = int(version_code)
        base_i = int(base)
    except (TypeError, ValueError):
        return None
    if code < base_i:
        return None
    return code - base_i


def resume_plan(running, live, published):
    """Decide the update button after the app comes back from an install.

    `running` is fefc-build.json from the process that is still in memory.
    `live` is fefc-build.json from the APK PackageManager currently has installed.
    Android often leaves the old process running across the replace, so those two
    differ until Kodi is restarted. A published release that matches the installed
    APK is Up to date and must not prompt. A stale process is restarted.

    Intent (test-pinned, do not change): a pkg mismatch returns idle — the
    live APK is a different package, not this app's update — and prompt is
    always False on this path; the Home tile / launch check prompts
    separately. When `published` is not a dict (manifest fetch failed), the
    update state is unknown: do not clear it and do not claim 'up_to_date'.
    """
    idle = {'restart': False, 'clear_available': False, 'label': None, 'prompt': None,
            'installed': dict(running) if isinstance(running, dict) else running}
    if not isinstance(running, dict) or not isinstance(live, dict):
        return idle
    live_pkg = str(live.get('pkg') or '')
    run_pkg = str(running.get('pkg') or '')
    if live_pkg and run_pkg and live_pkg != run_pkg:
        return idle
    try:
        live_build = int(live.get('build') or 0)
        running_build = int(running.get('build') or 0)
    except (TypeError, ValueError):
        return idle
    if live_build <= running_build:
        return idle
    # No fallback to running's version: the comparison must use the live
    # build's own version, not a mixed live-build / running-version pair.
    live_version = str(live.get('version') or '')
    installed = {'build': live_build, 'version': live_version, 'pkg': live_pkg or run_pkg}
    if not isinstance(published, dict):
        # Manifest unknown: restart, but neither clear the badge nor claim
        # the tile is up to date.
        return {'restart': True, 'clear_available': False, 'label': None,
                'prompt': False, 'installed': installed}
    newer = release_is_newer(published.get('version'), published.get('build'), live_version, live_build)
    return {
        'restart': True,
        'clear_available': not newer,
        'label': 'available' if newer else 'up_to_date',
        'prompt': False,
        'installed': installed,
    }


def package_download(manifest, pkg):
    """URL, size, sha256 for this install. com.fefc.kodi never falls back to the org.xbmc.kodi APK."""
    if not isinstance(manifest, dict):
        manifest = {}
    packages = manifest.get('packages')
    if not isinstance(packages, dict):
        packages = {}
    entry = packages.get(pkg)
    if not isinstance(entry, dict):
        entry = {}

    def _size(*dicts):
        for d in dicts:
            if isinstance(d, dict) and d.get('size'):
                try:
                    return int(d.get('size'))
                except (TypeError, ValueError):
                    return 0
        return 0

    if pkg == 'com.fefc.kodi':
        return entry.get('url') or '', _size(entry), entry.get('sha256') or ''
    # Other packages fall back to the top-level entry, which is the
    # org.xbmc.kodi APK. That fallback is intentional — do not reject it.
    return (entry.get('url') or manifest.get('url') or '',
            _size(entry, manifest),
            entry.get('sha256') or manifest.get('sha256') or '')


def read_apk_identity(source):
    """assets/fefc-build.json inside an APK/zip path or bytes. None when it is not a FEFC build."""
    try:
        if isinstance(source, (bytes, bytearray)):
            z = zipfile.ZipFile(io.BytesIO(source))
        else:
            z = zipfile.ZipFile(source)
        with z:
            raw = z.read('assets/fefc-build.json')
        info = json.loads(raw.decode('utf-8'))
    except Exception:
        return None
    if not isinstance(info, dict):
        return None
    try:
        build = int(info.get('build') or 0)
    except (TypeError, ValueError):
        return None
    return {'pkg': str(info.get('pkg') or ''), 'build': build,
            'version': str(info.get('version') or '')}


def handoff_ok(identity, installed_pkg, installed_build, sha_ok):
    """Higher build and a matching sha256. A pkg field that names a different app is rejected.
    An empty pkg is allowed only because the bytes already matched the sha256 published for this package."""
    if not identity or not sha_ok:
        return False
    got = identity.get('pkg') or ''
    if got and got != installed_pkg:
        return False
    try:
        return int(identity.get('build') or 0) > int(installed_build or 0)
    except (TypeError, ValueError):
        return False


def installer_package_for(app_pkg):
    """Fire TV (org.xbmc.kodi) uses the AOSP installer. The phone package uses the Google one.
    Kodi setPackage() cannot take an empty name. Unknown packages fail closed
    ('') instead of getting the Google installer: the caller treats '' as
    "installer could not be opened" rather than installing via the wrong app."""
    if app_pkg == 'org.xbmc.kodi':
        return INSTALLER_PACKAGES[1]
    if app_pkg == 'com.fefc.kodi':
        return INSTALLER_PACKAGES[0]
    return ''


def installer_builtin(uri, package=INSTALLER_PACKAGES[0]):
    """StartAndroidActivity builtin that hands `uri` to the package installer.

    This builds the builtin; it does not choose the installer — pass the
    package from installer_package_for(). ',' and ')' inside the URI are
    percent-encoded (%2C / %29), because Kodi splits builtin arguments on
    ',' and ends the call on ')'; '"' is encoded as %22 for the same reason.
    """
    if not uri or not package:
        return ''
    safe = (uri or '').replace('"', '%22').replace(',', '%2C').replace(')', '%29')
    return ('StartAndroidActivity(%s,android.intent.action.VIEW,application/vnd.android.package-archive,%s,1)'
            % (package, safe))


UPDATE_HOSTS = ('fefc-collection.pages.dev', 'collection.faneditfanclub.com')


def classify_platform(flags):
    """Android wins when the device says it is Android. macOS and webOS are explicit.
    An empty probe stays 'other' so the caller can keep the Android installer for an unprobed Kodi.

    The old `if flags.get('android'): return 'android'` after the webos check
    was dead: line 221 already returns 'android' when android is set and
    webos is not, and line 224 returns 'webos' for every webos case, so
    execution could never reach it with android set. 'web0s' (zero) in the
    blob check is intentional — LG user-agent strings contain "Web0S".
    """
    flags = flags or {}
    if flags.get('android') and not flags.get('webos'):
        return 'android'
    blob = ' '.join(str(flags.get(k) or '') for k in ('build', 'os', 'xbmc_path')).lower()
    if flags.get('webos') or 'webos' in blob or 'web0s' in blob or '/palm/' in blob:
        return 'webos'
    if flags.get('darwin') or flags.get('osx'):
        return 'macos'
    return 'other'


def platform_arch(platform, machine):
    """CPU family used to pick a download. macOS never guesses across Intel and Apple Silicon."""
    m = (machine or '').lower()
    if platform == 'macos':
        if 'arm' in m or 'aarch64' in m:
            return 'arm64'
        return 'x86_64'
    if platform == 'webos':
        if m in ('aarch64', 'arm64'):
            return 'aarch64'
        return 'arm'
    return ''


def allowed_update_url(url):
    """New platform packages must be https on the FEFC host, under /kodi-app/.
    The Android updater does not use this; it keeps reading packages[] and the top-level url."""
    try:
        from urllib.parse import urlparse
        u = urlparse(url or '')
    except Exception:
        return False
    host = (u.hostname or '').lower()
    return u.scheme == 'https' and host in UPDATE_HOSTS and (u.path or '').startswith('/kodi-app/')


_PLATFORM_EXT = {'webos': '.ipk', 'tizen': '.wgt', 'macos': '.dmg'}


def platform_download(manifest, platform, arch=''):
    """URL, size, sha256 and filename for macOS, webOS or Tizen.
    Never falls back to the Android APK. A missing entry is not available."""
    block = ((manifest or {}).get('platforms') or {}).get(platform) or {}
    if not isinstance(block, dict):
        block = {}
    archs = block.get('arch') or {}
    if not isinstance(archs, dict):
        archs = {}
    entry = {}
    if platform == 'macos':
        entry = archs.get(arch) or {}
    elif arch and archs.get(arch):
        entry = archs.get(arch) or {}
    elif archs.get('all'):
        entry = archs.get('all') or {}
    elif block.get('url'):
        entry = block
    if not isinstance(entry, dict):
        entry = {}
    url = entry.get('url') or ''
    try:
        size = int(entry.get('size') or 0)
    except (TypeError, ValueError):
        size = 0
    ext = _PLATFORM_EXT.get(platform)
    if ext:
        # Extension of the URL path only (query/fragment stripped): a webos
        # entry pointing at a .apk, or a tizen entry at a .ipk, is not a
        # usable package for this platform.
        url_path = url.split('?', 1)[0].split('#', 1)[0].lower()
        ext_ok = url_path.endswith(ext)
    else:
        ext_ok = True
    return {
        'url': url,
        'size': size,
        'sha256': entry.get('sha256') or '',
        'filename': entry.get('filename') or '',
        'abi': entry.get('abi') or block.get('abi') or '',
        'available': bool(url and entry.get('sha256') and allowed_update_url(url) and ext_ok),
    }


def platform_unavailable_message(platform, version_label):
    names = {'macos': 'Mac', 'webos': 'LG webOS', 'tizen': 'Samsung Tizen', 'other': 'this system'}
    who = names.get(platform, platform)
    return ('FEFC %s is published. The %s package is not on the server yet, so nothing was downloaded. '
            'Android keeps using its own packages. When the %s package is published it will use this same version.'
            % (version_label or 'update', who, who))


try:
    from .shorturl import APK_FULL as PHONE_APK, APK_SHORT as PHONE_SHORT
except ImportError:
    try:
        from shorturl import APK_FULL as PHONE_APK, APK_SHORT as PHONE_SHORT
    except ImportError:
        PHONE_APK = 'https://fefc-collection.pages.dev/kodi-app/FEFC.apk'
        PHONE_SHORT = 'https://is.gd/8la6gb'
SAMSUNG_WGT = 'https://fefc-collection.pages.dev/kodi-app/FEFC.wgt'
SAMSUNG_GUIDE = 'https://collection.faneditfanclub.com/samsung'
WEB_APP = 'https://collection.faneditfanclub.com'
_BANNED_DOWNLOAD = ('FEFC-Kodi.apk', 'org.xbmc.kodi', 'macos', 'webos')


def manual_downloads(manifest):
    """One link per published platform.

    Fire TV and Android share the separate-ID APK (com.fefc.kodi). Samsung is
    the widget plus the install guide. Web is the site. Mac and webOS are not
    listed. The org.xbmc.kodi build is never listed.
    """
    info = manifest or {}
    version = str(info.get('version') or '')
    packages = info.get('packages') or {}
    phone = packages.get('com.fefc.kodi') or {}
    apk = str(phone.get('url') or '')
    if not apk.endswith('/FEFC.apk') or any(bad.lower() in apk.lower() for bad in _BANNED_DOWNLOAD):
        apk = PHONE_APK
    tizen = platform_download(info, 'tizen')
    wgt = str(tizen.get('url') or '')
    if not wgt.endswith('/FEFC.wgt') or any(bad.lower() in wgt.lower() for bad in _BANNED_DOWNLOAD):
        wgt = SAMSUNG_WGT
    rows = [
        {'platform': 'Fire TV & Android', 'version': version, 'url': apk, 'short': PHONE_SHORT},
        {'platform': 'Samsung TV', 'version': version, 'url': wgt, 'short': ''},
        {'platform': 'Samsung TV guide', 'version': version, 'url': SAMSUNG_GUIDE, 'short': ''},
        {'platform': 'Web', 'version': version, 'url': WEB_APP, 'short': ''},
    ]
    # The old loop raised ValueError here, but it was unreachable: apk/wgt
    # are already replaced by defaults when banned, and the defaults contain
    # no banned substrings. Degrade instead of raising: drop a bad row so
    # one bad entry can never kill the whole manual-download list.
    rows = [row for row in rows
            if not any(bad.lower() in (row['url'] + ' ' + row['short']).lower()
                       for bad in _BANNED_DOWNLOAD)]
    return rows


def platform_install_message(platform, path, opened=False, abi='', url=''):
    if platform == 'macos':
        opened_txt = 'The disk image was opened. ' if opened else ''
        return (
            'The update is verified. This build is not signed with an Apple Developer ID, so macOS will warn the first time it opens.\n\n'
            'Disk image:\n%s\n\n'
            '%sDrag FEFC.app to Applications and replace the old app.\n'
            'If macOS says the app is damaged or cannot be checked, run:\n'
            'codesign --remove-signature /Applications/FEFC.app\n'
            'xattr -dr com.apple.quarantine /Applications/FEFC.app\n'
            'Then right-click FEFC.app, choose Open, then Open.\n'
            'Then fully quit FEFC and open it again.'
        ) % (path, opened_txt)
    if platform == 'webos':
        try:
            from webosguide import tv_text
        except ImportError as e:
            # Only fall back when the failure names webosguide itself (the
            # top-level import is unavailable in this context). An
            # ImportError from inside webosguide is a real bug — re-raise
            # it instead of masking it with the package import.
            if getattr(e, 'name', None) not in (None, 'webosguide'):
                raise
            from resources.lib.webosguide import tv_text
        # url is the SERVER URL (rec['url']), not the local dst path: the TV
        # can only install from a URL it can fetch. url='' keeps the old
        # "not on the server yet" message for the genuinely unpublished case.
        msg = tv_text(url or '')
        if abi:
            msg += '\n\nArchitecture: %s' % abi
        return msg
    return 'No FEFC installer is available for this system.'
