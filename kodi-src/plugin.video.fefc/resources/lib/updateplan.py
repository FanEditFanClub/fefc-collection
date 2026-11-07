"""Update-button decisions shared by the Kodi service. No network and no Android calls."""

PACKAGES = ('org.xbmc.kodi', 'com.fefc.kodi')


def select_apk(doc, package):
    """Return (url, size, sha256) for the running package. Legacy org.xbmc.kodi may use the top-level APK.
    com.fefc.kodi never falls back to that file: it is a different package."""
    doc = doc or {}
    entry = ((doc.get('packages') or {}).get(package)) or {}
    if package == 'org.xbmc.kodi':
        url = entry.get('url') or doc.get('url') or ''
        size = int(entry.get('size') or doc.get('size') or 0)
        sha = entry.get('sha256') or doc.get('sha256') or ''
        return url, size, sha
    return entry.get('url') or '', int(entry.get('size') or 0), entry.get('sha256') or ''


def next_step(installed_build, published_build):
    """installed_build None means this is not the FEFC app. published_build None means the check failed."""
    if installed_build is None:
        return 'not_fefc_build'
    if published_build is None:
        return 'check_failed'
    try:
        newer = int(published_build) > int(installed_build)
    except (TypeError, ValueError):
        return 'check_failed'
    return 'install' if newer else 'up_to_date'


def download_status(size, want, digest, sha):
    if want and size < int(want):
        return 'short'
    if sha and digest != sha:
        return 'checksum'
    if sha and not digest:
        return 'checksum'
    return 'ok'


def content_uri(package, root_name, relative):
    rel = (relative or '').lstrip('/')
    return 'content://%s.fefcupdate/%s/%s' % (package, root_name, rel)


def fileprovider_uri(package):
    """Build 38 already declares this FileProvider. The relative file is external-files/FEFC-update.apk."""
    return content_uri(package, 'ext', 'FEFC-update.apk')


# System installers only. Kodi sets Intent.setPackage to this name, so it cannot be empty.
# These open the platform confirmation screen. None of them is a silent install.
INSTALLERS = (
    ('com.google.android.packageinstaller', 'com.android.packageinstaller.InstallStart'),
    ('com.android.packageinstaller', 'com.android.packageinstaller.InstallStart'),
    ('com.android.packageinstaller', 'com.android.packageinstaller.PackageInstallerActivity'),
)


def launch_calls(package, has_update_activity):
    """has_update_activity is true only when this APK contains FefcUpdateActivity.
    Shipped build 38 does not. An empty package is never returned."""
    if package not in PACKAGES:
        raise ValueError('unknown package')
    if has_update_activity:
        return [{
            'kind': 'in_app_activity',
            'package': package,
            'intent': 'android.intent.action.VIEW',
            'mime': '',
            'data': 'fefcupdate://install',
            'flags': '',
            'classname': 'com.fefc.kodi.FefcUpdateActivity',
        }]
    uri = fileprovider_uri(package)
    return [{
        'kind': 'system_confirmation',
        'package': inst,
        'intent': 'android.intent.action.VIEW',
        'mime': 'application/vnd.android.package-archive',
        'data': uri,
        'flags': '1',
        'classname': cls,
    } for inst, cls in INSTALLERS]


def builtin(call):
    pkg = call.get('package') or ''
    if not pkg:
        raise ValueError('empty package')
    fields = [
        pkg,
        call.get('intent') or '',
        call.get('mime') or '',
        call.get('data') or '',
        call.get('flags') or '',
        '',
        '',
        '',
        call.get('classname') or '',
    ]
    return 'StartAndroidActivity(' + ','.join(fields) + ')'


def can_replace(installed_version_code, published_version_code):
    """Android/Fire OS replaces the same package in place only when versionCode increases.
    The signing certificate must also match; this function cannot see the certificate."""
    try:
        return int(published_version_code) > int(installed_version_code)
    except (TypeError, ValueError):
        return False


MESSAGES = {
    'not_fefc_build': 'This is not the FEFC app build, so there is no app update to check. Add-on updates arrive automatically.',
    'check_failed': 'Could not check for updates right now. Your list and settings were not changed.',
    'up_to_date': 'You are on {installed}. No newer app is published.',
    'no_apk': 'No update file is published for this app ({package}). Your list and settings were not changed.',
    'download_failed': 'The download did not finish after several tries. Check the connection and pick Update again; it will continue where it stopped. Your list and settings were not changed.',
    'checksum': 'The download did not match the published file, so it was not installed. Your list and settings were not changed.',
    'no_folder': 'The update downloaded, but this app folder could not be found, so the installer was not opened. Your list and settings were not changed.',
    'handed_off': 'Opening the app installer.',
    'confirm': 'The update is ready. Android will ask you to confirm the install. This replaces the same app in place. It does not uninstall FEFC and it does not clear My List or settings. If no install screen appears, download {url} and open that file. Do not uninstall first.',
}
