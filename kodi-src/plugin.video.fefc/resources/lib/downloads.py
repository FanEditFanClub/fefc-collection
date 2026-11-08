"""Downloads for the FEFC Kodi add-on. Local copies of collection videos, saved under the add-on's
profile data (special://profile/addon_data/plugin.video.fefc/downloads/). Pure Python (no Kodi imports)."""
import json
import os
import time


def _now():
    return int(time.time() * 1000)


def fmt_size(n):
    """Human-readable size, e.g. 12.3 GB, 456 MB, 800 KB. None -> 'unknown'."""
    if n is None:
        return 'unknown'
    n = float(n)
    for unit in ('B', 'KB', 'MB', 'GB', 'TB'):
        if n < 1024.0 or unit == 'TB':
            return ('%.1f %s' % (n, unit)) if unit != 'B' else ('%d B' % int(n))
        n /= 1024.0
    return '%.1f TB' % n


class Downloads:
    def __init__(self, folder):
        self.dir = folder
        os.makedirs(folder, exist_ok=True)
        self.path = os.path.join(folder, 'downloads.json')
        self.db = {'items': {}}
        try:
            with open(self.path, 'r', encoding='utf-8') as f:
                d = json.load(f)
            if isinstance(d, dict):
                self.db.update(d)
        except Exception:
            pass

    def save(self):
        tmp = self.path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(self.db, f)
        os.replace(tmp, self.path)

    def all(self):
        rows = [r for r in self.db['items'].values() if r.get('path') and os.path.exists(r['path'])]
        rows.sort(key=lambda r: r.get('downloadedAt') or 0, reverse=True)
        return rows

    def get(self, vid):
        return self.db['items'].get(vid)

    def has(self, vid):
        r = self.db['items'].get(vid)
        return bool(r and r.get('path') and os.path.exists(r['path']))

    def count(self):
        return len(self.all())

    def free_bytes(self):
        """Free space on the device volume holding the downloads folder (bytes), or None if unreadable."""
        try:
            st = os.statvfs(self.dir)
            return st.f_bavail * st.f_frsize
        except Exception:
            return None

    def total_bytes(self):
        """Total space on the device volume holding the downloads folder (bytes), or None."""
        try:
            st = os.statvfs(self.dir)
            return st.f_blocks * st.f_frsize
        except Exception:
            return None

    def used_bytes(self):
        """Bytes used by downloaded files on this device."""
        total = 0
        for r in self.all():
            total += r.get('size') or 0
        return total

    def add(self, vid, name, path, size=0):
        self.db['items'][vid] = {'id': vid, 'name': name, 'path': path, 'size': size, 'downloadedAt': _now()}
        self.save()

    def remove(self, vid):
        r = self.db['items'].pop(vid, None)
        self.save()
        return r

    def file_path(self, vid, name):
        ext = os.path.splitext(name or 'video.mp4')[1] or '.mp4'
        return os.path.join(self.dir, vid + ext)
