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
    Missing pieces are zeros, so 0.6 is (0, 6, 0) and 0.6.1 is (0, 6, 1)."""
    text = re.sub(r'(?i)\s*beta\s*$', '', str(label or '').strip())
    nums = [int(part) for part in re.findall(r'\d+', text)]
    if not nums:
        return (0, 0, 0)
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
    done_mb = max(0, int(done_bytes or 0)) >> 20
    total_mb = max(0, int(total_bytes or 0)) >> 20
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


def installed_from_apk(apk_record, recorded_record):
    """The build inside the running APK is the installed build. A pre-confirm record is ignored."""
    return apk_record


def package_download(manifest, pkg):
    """URL, size, sha256 for this install. com.fefc.kodi never falls back to the org.xbmc.kodi APK."""
    entry = ((manifest or {}).get('packages') or {}).get(pkg) or {}
    if pkg == 'com.fefc.kodi':
        return entry.get('url') or '', int(entry.get('size') or 0), entry.get('sha256') or ''
    return (entry.get('url') or (manifest or {}).get('url') or '',
            int(entry.get('size') or (manifest or {}).get('size') or 0),
            entry.get('sha256') or (manifest or {}).get('sha256') or '')


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
    return {'pkg': str(info.get('pkg') or ''), 'build': int(info.get('build') or 0),
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
    Kodi setPackage() cannot take an empty name."""
    if app_pkg == 'org.xbmc.kodi':
        return INSTALLER_PACKAGES[1]
    return INSTALLER_PACKAGES[0]


def installer_builtin(uri, package=INSTALLER_PACKAGES[0]):
    if not uri or not package:
        return ''
    return ('StartAndroidActivity(%s,android.intent.action.VIEW,application/vnd.android.package-archive,%s,1)'
            % (package, uri))
