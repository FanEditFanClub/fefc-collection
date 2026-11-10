"""My List for the FEFC Kodi add-on. Same data shape as the FEFC web app (data 'stars': id -> {id, starredAt, name, updatedAt};
removed items are tombstones {id, deleted, updatedAt}), so it merges with the web app / Fire TV list through the
app's own sync API (/api/sync/*) after a one-time 6-digit link code. Pure Python (no Kodi imports)."""
import json
import os
import time
import urllib.request
import urllib.error

UA = 'FEFC-Kodi'


def _now():
    return int(time.time() * 1000)


class MyList:
    def __init__(self, folder, base):
        self.dir = folder
        self.base = base.rstrip('/')
        os.makedirs(folder, exist_ok=True)
        self.path = os.path.join(folder, 'mylist.json')
        self.db = {'stars': {}, 'history': {}, 'playback': {}, 'token': '', 'user': ''}
        try:
            with open(self.path, 'r', encoding='utf-8') as f:
                d = json.load(f)
            if isinstance(d, dict):
                self.db.update(d)
        except Exception:
            pass

    def reload(self):
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

    # -- local list
    def ids(self):
        rows = [r for r in self.db['stars'].values() if not r.get('deleted')]
        rows.sort(key=lambda r: r.get('starredAt') or 0, reverse=True)
        return [r['id'] for r in rows]

    def has(self, i):
        r = self.db['stars'].get(i)
        return bool(r and not r.get('deleted'))

    def toggle(self, i, name=''):
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
        self.reload()
        h = self.db.setdefault('history', {})
        r = h.get(i) if isinstance(h.get(i), dict) and not h.get(i, {}).get('deleted') else None
        h[i] = {'id': i, 'lastOpened': _now(), 'count': ((r or {}).get('count') or 0) + 1, 'name': name or '', 'updatedAt': _now()}
        self.save()

    def history_ids(self, n=50):
        rows = [r for r in (self.db.get('history') or {}).values() if isinstance(r, dict) and not r.get('deleted')]
        rows.sort(key=lambda r: r.get('lastOpened') or 0, reverse=True)
        return [r['id'] for r in rows[:n]]

    def clear_history(self):
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
        self.reload()
        p = self.db.setdefault('playback', {})
        prev = p.get(i) if isinstance(p.get(i), dict) else {}
        s = max(0, int(sec or 0))
        p[i] = {'id': i, 'sec': s, 'formatted': self.fmt(s), 'name': name or prev.get('name') or '',
                'log': prev.get('log') or [], 'total': int(total or prev.get('total') or 0), 'updatedAt': _now()}
        self.save()

    def clear_playback(self, i):
        self.reload()
        p = self.db.setdefault('playback', {})
        if i in p and not p[i].get('deleted'):
            p[i] = {'id': i, 'deleted': True, 'updatedAt': _now()}
            self.save()

    def playback(self, i):
        r = (self.db.get('playback') or {}).get(i)
        return r if isinstance(r, dict) and not r.get('deleted') else None

    def continue_ids(self):
        rows = [r for r in (self.db.get('playback') or {}).values() if isinstance(r, dict) and not r.get('deleted') and (r.get('sec') or 0) >= 10]
        rows.sort(key=lambda r: r.get('updatedAt') or 0, reverse=True)
        return [r['id'] for r in rows]

    # -- sync with the web app (needs a link code once)
    @property
    def linked(self):
        return bool(self.db.get('token'))

    def _api(self, path, body=None, timeout=12):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + '/api/sync/' + path, data=data, headers={
            'User-Agent': UA, 'Content-Type': 'application/json',
            **({'Authorization': 'Bearer ' + self.db['token']} if self.db.get('token') else {})})
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
        if not j.get('token'):
            return 'Sync did not return a session.'
        self.db['token'] = j['token']
        u = j.get('user') or {}
        self.db['user'] = u.get('email') or u.get('name') or ''
        self.save()
        return ''

    def unlink(self):
        try:
            self._api('logout', {})
        except Exception:
            pass
        self.db['token'] = ''
        self.db['user'] = ''
        self.save()

    def sync(self, timeout=12):
        """Merge with the server list (newest record wins per id) and push the result. Returns '' or an error text."""
        if not self.linked:
            return 'not linked'
        try:
            self.reload()
            remote = (self._api('list', timeout=timeout) or {}).get('data') or {}
            rs = remote.get('stars') or {}
            loc = self.db['stars']
            for k, r in rs.items():
                if isinstance(r, dict) and (k not in loc or (r.get('updatedAt') or 0) > (loc[k].get('updatedAt') or 0)):
                    loc[k] = r
            for coll in ('history', 'playback'):
                rl = remote.get(coll) or {}
                ll = self.db.setdefault(coll, {})
                for k, r in rl.items():
                    if isinstance(r, dict) and (k not in ll or (r.get('updatedAt') or 0) > (ll[k].get('updatedAt') or 0)):
                        ll[k] = r
            payload = {'v': 1, 'updatedAt': _now(), 'stars': loc, 'history': self.db.get('history') or {},
                       'playback': self.db.get('playback') or {}}
            self._api('list', {'data': payload}, timeout=timeout)
            self.save()
            return ''
        except urllib.error.HTTPError as e:
            if e.code == 401:
                self.db['token'] = ''
                self.save()
                return 'The sync link expired. Link again with a new code.'
            return 'Sync error %s' % e.code
        except Exception as e:
            return 'Sync failed: %s' % e

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
        if j.get('status') == 'ok' and j.get('token'):
            self.db['token'] = j['token']
            u = j.get('user') or {}
            self.db['user'] = u.get('email') or u.get('name') or ''
            self.save()
        return j.get('status') or 'pending'
