"""Downloads for the FEFC Kodi add-on. Local copies of collection videos, saved under the add-on's
profile data (special://profile/addon_data/plugin.video.fefc/downloads/). Pure Python (no Kodi imports)."""
import json
import os
import threading
import time
import uuid


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
        self._lock = threading.RLock()
        # False only after a failed load with no usable .bak. While
        # False, save() refuses to write, so a bad load can never
        # overwrite the good index with an empty one.
        self._load_ok = True
        self.reload()

    def _read_from_disk(self):
        """Read downloads.json. Returns (dict_or_None, ok). Missing
        file is not an error (fresh index). A corrupt file is renamed
        to downloads.json.bad; a .bak of the last good save is then
        tried as a fallback before giving up."""
        try:
            with open(self.path, 'r', encoding='utf-8') as f:
                d = json.load(f)
            if not isinstance(d, dict):
                raise ValueError('downloads.json is not a JSON object')
            return d, True
        except FileNotFoundError:
            return {}, True
        except Exception:
            try:
                os.replace(self.path, self.path + '.bad')
            except OSError:
                pass
            try:
                with open(self.path + '.bak', 'r', encoding='utf-8') as f:
                    d = json.load(f)
                if isinstance(d, dict):
                    return d, True
            except Exception:
                pass
            return None, False

    def reload(self):
        with self._lock:
            d, ok = self._read_from_disk()
            if not ok:
                self._load_ok = False
                return False
            self._load_ok = True
            if d:
                self.db.update(d)
            return True

    def save(self):
        with self._lock:
            if not self._load_ok:
                return False
            tmp = '%s.%s.tmp' % (self.path, uuid.uuid4().hex)
            try:
                with open(tmp, 'w', encoding='utf-8') as f:
                    json.dump(self.db, f)
                    f.flush()
                    os.fsync(f.fileno())
                try:
                    if os.path.exists(self.path):
                        with open(self.path, 'rb') as src:
                            data = src.read()
                        bak_tmp = '%s.%s.tmp' % (self.path + '.bak', uuid.uuid4().hex)
                        with open(bak_tmp, 'wb') as dst:
                            dst.write(data)
                            dst.flush()
                            os.fsync(dst.fileno())
                        os.replace(bak_tmp, self.path + '.bak')
                except Exception:
                    pass
                os.replace(tmp, self.path)
                try:
                    fd = os.open(os.path.dirname(self.path) or '.', os.O_RDONLY)
                    try:
                        os.fsync(fd)
                    finally:
                        os.close(fd)
                except Exception:
                    pass
                return True
            except Exception:
                try:
                    os.remove(tmp)
                except OSError:
                    pass
                raise

    def all(self):
        rows = [r for r in self.db['items'].values()
                if isinstance(r, dict) and r.get('path') and os.path.exists(r['path'])]
        rows.sort(key=lambda r: r.get('downloadedAt') or 0, reverse=True)
        return rows

    def get(self, vid):
        r = self.db['items'].get(vid)
        return r if isinstance(r, dict) else None

    def has(self, vid):
        r = self.db['items'].get(vid)
        return bool(isinstance(r, dict) and r and r.get('path') and os.path.exists(r['path']))

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
        with self._lock:
            self.reload()
            if not self._load_ok:
                return
            self.db['items'][vid] = {'id': vid, 'name': name, 'path': path, 'size': size, 'downloadedAt': _now()}
            self.save()

    def remove(self, vid):
        with self._lock:
            self.reload()
            if not self._load_ok:
                return None
            r = self.db['items'].pop(vid, None)
            self.save()
            return r

    def file_path(self, vid, name):
        ext = os.path.splitext(name or 'video.mp4')[1] or '.mp4'
        return os.path.join(self.dir, vid + ext)
