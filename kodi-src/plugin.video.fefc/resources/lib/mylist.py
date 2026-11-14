"""My List for the FEFC Kodi add-on. Same data shape as the FEFC web app (data 'stars': id -> {id, starredAt, name, updatedAt};
removed items are tombstones {id, deleted, updatedAt}), so it merges with the web app / Fire TV list through the
app's own sync API (/api/sync/*) after a one-time 6-digit link code. Pure Python (no Kodi imports)."""
import copy
import json
import os
import threading
import time
import urllib.request
import urllib.error
import uuid

UA = 'FEFC-Kodi'

# Item 64: tombstones older than this are pruned after a successful sync;
# history is capped to the most recent entries.
_TOMBSTONE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000
_HISTORY_MAX = 200


def _now():
    return int(time.time() * 1000)


def _coerce_int(value):
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _clean_record(key, record):
    """Item 63: validate one remote record. Returns a normalised dict,
    or None for a non-dict record (skip it, do not crash the sync)."""
    if not isinstance(record, dict):
        return None
    r = dict(record)
    r.setdefault('id', key)
    r['updatedAt'] = _coerce_int(r.get('updatedAt'))
    return r


class MyList:
    def __init__(self, folder, base):
        self.dir = folder
        self.base = base.rstrip('/')
        os.makedirs(folder, exist_ok=True)
        self.path = os.path.join(folder, 'mylist.json')
        self.db = {'stars': {}, 'history': {}, 'playback': {}, 'token': '', 'user': ''}
        # Item 50: instance-level lock. A module-level lock would not
        # cover the plugin vs service processes (separate
        # sub-interpreters); the file is the shared state, so this
        # lock only serialises threads in this process, and the
        # atomic-replace + reload-before-write rules below protect
        # the file itself.
        self._lock = threading.RLock()
        self._sync_lock = threading.Lock()
        # Item 6: False only after a failed load with no usable .bak.
        # While False, save() refuses to write, so a bad load can
        # never overwrite the good file with empty defaults.
        self._load_ok = True
        self.reload()

    def _read_from_disk(self):
        """Read mylist.json. Returns (dict_or_None, ok).

        Missing file is not an error (fresh list). A corrupt file is
        renamed to mylist.json.bad; a .bak of the last good save is
        then tried as a fallback before giving up."""
        try:
            with open(self.path, 'r', encoding='utf-8') as f:
                d = json.load(f)
            if not isinstance(d, dict):
                raise ValueError('mylist.json is not a JSON object')
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
        # Item 6/50: on failure, keep the in-memory db as-is and mark
        # the load failed. Never replace it with empty defaults.
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
        # Item 50/61: unique tmp per write (no fixed .tmp name for two
        # writers to interleave on), flush + fsync before the atomic
        # replace, .bak of the previous good file, fsync of the
        # directory after the replace. Returns False (does not raise)
        # when the last load failed, so a bad load never wipes the file.
        with self._lock:
            if not self._load_ok:
                return False
            tmp = '%s.%s.tmp' % (self.path, uuid.uuid4().hex)
            try:
                with open(tmp, 'w', encoding='utf-8') as f:
                    json.dump(self.db, f)
                    f.flush()
                    os.fsync(f.fileno())
                # .bak = the last good save (the file being replaced).
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

    # -- local list
    def ids(self):
        rows = [r for r in self.db['stars'].values()
                if isinstance(r, dict) and not r.get('deleted') and r.get('id')]
        rows.sort(key=lambda r: r.get('starredAt') or 0, reverse=True)
        return [r['id'] for r in rows]

    def has(self, i):
        r = self.db['stars'].get(i)
        return bool(isinstance(r, dict) and r and not r.get('deleted'))

    def toggle(self, i, name=''):
        with self._lock:
            self.reload()
            if self.has(i):
                self.db['stars'][i] = {'id': i, 'deleted': True, 'updatedAt': _now()}
                on = False
            else:
                self.db['stars'][i] = {'id': i, 'starredAt': _now(), 'name': name or '', 'updatedAt': _now()}
                on = True
            self.save()
            return on

    # -- history / continue watching (same records as the web app's UD.opened / UD.setPlayback)
    def opened(self, i, name=''):
        with self._lock:
            self.reload()
            h = self.db.setdefault('history', {})
            r = h.get(i) if isinstance(h.get(i), dict) and not h.get(i, {}).get('deleted') else None
            h[i] = {'id': i, 'lastOpened': _now(), 'count': ((r or {}).get('count') or 0) + 1, 'name': name or '', 'updatedAt': _now()}
            self.save()

    def history_ids(self, n=50):
        rows = [r for r in (self.db.get('history') or {}).values() if isinstance(r, dict) and not r.get('deleted') and r.get('id')]
        rows.sort(key=lambda r: r.get('lastOpened') or 0, reverse=True)
        return [r['id'] for r in rows[:n]]

    def clear_history(self):
        with self._lock:
            self.reload()
            h = self.db.setdefault('history', {})
            for k in list(h):
                h[k] = {'id': k, 'deleted': True, 'updatedAt': _now()}
            self.save()

    @staticmethod
    def fmt(sec):
        s = max(0, int(sec or 0))
        h, m, r = s // 3600, s % 3600 // 60, s % 60
        return ('%02d:' % h if h else '') + '%02d:%02d' % (m, r)

    def set_playback(self, i, sec, name='', total=0):
        with self._lock:
            self.reload()
            p = self.db.setdefault('playback', {})
            prev = p.get(i) if isinstance(p.get(i), dict) else {}
            s = max(0, int(sec or 0))
            p[i] = {'id': i, 'sec': s, 'formatted': self.fmt(s), 'name': name or prev.get('name') or '',
                    'log': prev.get('log') or [], 'total': int(total or prev.get('total') or 0), 'updatedAt': _now()}
            self.save()

    def clear_playback(self, i):
        with self._lock:
            self.reload()
            p = self.db.setdefault('playback', {})
            if i in p and isinstance(p[i], dict) and not p[i].get('deleted'):
                p[i] = {'id': i, 'deleted': True, 'updatedAt': _now()}
                self.save()

    def playback(self, i):
        r = (self.db.get('playback') or {}).get(i)
        return r if isinstance(r, dict) and not r.get('deleted') else None

    def continue_ids(self):
        rows = [r for r in (self.db.get('playback') or {}).values() if isinstance(r, dict) and not r.get('deleted') and (r.get('sec') or 0) >= 10 and r.get('id')]
        rows.sort(key=lambda r: r.get('updatedAt') or 0, reverse=True)
        return [r['id'] for r in rows]

    # -- sync with the web app (needs a link code once)
    @property
    def linked(self):
        return bool(self.db.get('token'))

    def _api(self, path, body=None, timeout=12):
        with self._lock:
            token = self.db.get('token') or ''
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + '/api/sync/' + path, data=data, headers={
            'User-Agent': UA, 'Content-Type': 'application/json',
            **({'Authorization': 'Bearer ' + token} if token else {})})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode('utf-8'))

    def link(self, code):
        """Redeem a 6-digit code made on the web app (My List > Sync My List > Create a code). Returns '' or an error text."""
        try:
            j = self._api('pair/redeem', {'code': str(code)})
        except urllib.error.HTTPError as e:
            return 'That code is not valid or has expired.' if e.code == 404 else 'Sync is busy (%s). Try again in a minute.' % e.code
        except Exception as e:
            return 'Could not reach the server: %s' % e
        # Item 65: _api may return a non-dict (e.g. a list); .get on it
        # would raise AttributeError outside any try.
        if not isinstance(j, dict) or not j.get('token'):
            return 'Sync did not return a session.'
        with self._lock:
            # Item 62: reload before saving, so a concurrent local
            # change is not overwritten by this write.
            self.reload()
            if not self._load_ok:
                return 'Could not save the sync link.'
            self.db['token'] = j['token']
            u = j.get('user') if isinstance(j.get('user'), dict) else {}
            self.db['user'] = u.get('email') or u.get('name') or ''
            self.save()
        return ''

    def unlink(self):
        # Item 62: reload before clearing/saving.
        with self._lock:
            self.reload()
        try:
            self._api('logout', {})
        except Exception:
            pass
        with self._lock:
            self.db['token'] = ''
            self.db['user'] = ''
            self.save()

    def _prune(self):
        """Item 64: prune tombstones older than ~90 days and cap
        history to the most recent entries. Caller must hold _lock."""
        cutoff = _now() - _TOMBSTONE_MAX_AGE_MS
        for coll in ('stars', 'history', 'playback'):
            d = self.db.get(coll) or {}
            for k in list(d):
                r = d.get(k)
                if isinstance(r, dict) and r.get('deleted') and _coerce_int(r.get('updatedAt')) < cutoff:
                    del d[k]
        h = self.db.get('history') or {}
        if len(h) > _HISTORY_MAX:
            rows = sorted((r for r in h.values() if isinstance(r, dict)),
                          key=lambda r: (r.get('lastOpened') or r.get('updatedAt') or 0), reverse=True)
            keep = {r.get('id') for r in rows[:_HISTORY_MAX] if r.get('id')}
            for k in list(h):
                if k not in keep:
                    del h[k]

    def _clear_token(self):
        with self._lock:
            self.db['token'] = ''
            self.save()

    def sync(self, timeout=12):
        """Merge with the server list (newest record wins per id) and push the result. Returns '' or an error text."""
        if not self.linked:
            return 'not linked'
        # Item 60: single sync in flight. Tracker.finish() starts a
        # sync in a thread; a second caller returns at once instead
        # of overlapping it.
        if not self._sync_lock.acquire(blocking=False):
            return 'sync already in progress'
        try:
            # 1. Under lock: reload + snapshot. No network while held.
            with self._lock:
                self.reload()
                snapshot = copy.deepcopy(self.db)
            # 2. Network OUTSIDE the lock.
            try:
                raw = self._api('list', timeout=timeout) or {}
                remote = raw.get('data') if isinstance(raw, dict) else {}
                if not isinstance(remote, dict):
                    remote = {}
            except urllib.error.HTTPError as e:
                if e.code == 401:
                    self._clear_token()
                    return 'The sync link expired. Link again with a new code.'
                return 'Sync error %s' % e.code
            except Exception as e:
                return 'Sync failed: %s' % e
            # 3. Under lock: reload again, merge snapshot + remote by
            # newest updatedAt, prune, save. The payload is a deepcopy
            # taken under the lock, so pushing it cannot hit
            # "dictionary changed size during iteration".
            with self._lock:
                self.reload()
                for coll in ('stars', 'history', 'playback'):
                    local = self.db.setdefault(coll, {})
                    for source in (snapshot.get(coll) or {}, remote.get(coll) or {}):
                        if not isinstance(source, dict):
                            continue
                        for k, r in source.items():
                            clean = _clean_record(k, r)
                            if clean is None:
                                continue
                            cur = local.get(k)
                            if not isinstance(cur, dict) or (clean.get('updatedAt') or 0) > (cur.get('updatedAt') or 0):
                                local[k] = clean
                self._prune()
                payload = {'v': 1, 'updatedAt': _now(),
                           'stars': copy.deepcopy(self.db.get('stars') or {}),
                           'history': copy.deepcopy(self.db.get('history') or {}),
                           'playback': copy.deepcopy(self.db.get('playback') or {})}
                if not self.save():
                    return 'Sync failed: could not save local list.'
            # 4. Push the merged copy, outside the lock.
            try:
                self._api('list', {'data': payload}, timeout=timeout)
            except urllib.error.HTTPError as e:
                if e.code == 401:
                    self._clear_token()
                    return 'The sync link expired. Link again with a new code.'
                return 'Sync error %s' % e.code
            except Exception as e:
                return 'Sync failed: %s' % e
            return ''
        finally:
            self._sync_lock.release()

    # -- link flows (same backend as the web app: QR approved on a signed-in phone, or Google device code)
    def status(self):
        try:
            return self._api('status')
        except Exception:
            return {}

    def qr_start(self):
        return self._api('qr/start', {})

    def qr_poll(self, qid, secret):
        j = self._api('qr/poll', {'id': qid, 'secret': secret})
        return self._accept(j)

    def device_start(self):
        return self._api('device/start', {})

    def device_poll(self, did):
        j = self._api('device/poll', {'id': did})
        return self._accept(j)

    def _accept(self, j):
        # Item 65: guard non-dict responses, and return 'pending'
        # (not 'ok') when the status is 'ok' but there is no token.
        if not isinstance(j, dict):
            return 'pending'
        if j.get('status') == 'ok':
            if not j.get('token'):
                return 'pending'
            with self._lock:
                # Item 62: reload before saving.
                self.reload()
                if not self._load_ok:
                    return 'pending'
                self.db['token'] = j['token']
                u = j.get('user') if isinstance(j.get('user'), dict) else {}
                self.db['user'] = u.get('email') or u.get('name') or ''
                if not self.save():
                    return 'pending'
            return 'ok'
        return j.get('status') or 'pending'
