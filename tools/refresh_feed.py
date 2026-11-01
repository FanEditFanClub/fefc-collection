#!/usr/bin/env python3
"""Refresh data/community-feed.json (fallback snapshot used by /api/feed and the offline ticker).
Reddit: public Atom RSS (no token). X: only if X_BEARER_TOKEN is set; otherwise existing X posts are kept.
Never fails the caller: any source that errors keeps its previous snapshot entries."""
import json, os, re, subprocess, html, datetime, sys
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'community-feed.json')
UA = 'Mozilla/5.0 (compatible; FEFCCollection/1.0)'
def curl(u, h=()):
    a = ['curl', '-sL', '-m', '25', '-A', UA, '-w', '\n%{http_code}']
    for x in h: a += ['-H', x]
    o = subprocess.run(a + [u], capture_output=True, text=True).stdout
    b, _, c = o.rpartition('\n'); return int(c or 0), b
def ts(s): return int(datetime.datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp() * 1000)
def clean(t, n=140):
    t = re.sub(r'\s+', ' ', html.unescape(t)).strip(); return t if len(t) <= n else t[:n - 1].rstrip() + '…'
try: old = json.load(open(OUT)).get('posts', [])
except Exception: old = []
keep = lambda s: [p for p in old if p['src'] == s]
posts = []
c, b = curl('https://www.reddit.com/r/FanEditFanClub/new/.rss?limit=10')
rd = []
if c == 200:
    for e in re.findall(r'<entry>.*?</entry>', b, re.S):
        t = re.search(r'<title>(.*?)</title>', e, re.S); l = re.search(r'<link[^>]*href="([^"]+)"', e); d = re.search(r'<(?:updated|published)>([^<]+)<', e)
        if t and l and d: rd.append({'src': 'reddit', 'title': clean(t.group(1)), 'url': html.unescape(l.group(1)), 'ts': ts(d.group(1))})
posts += rd or keep('reddit')
tok = os.environ.get('X_BEARER_TOKEN'); xs = []
if tok:
    c, b = curl('https://api.x.com/2/users/2072539271450312704/tweets?max_results=30&exclude=retweets,replies&tweet.fields=created_at,referenced_tweets', ['authorization: Bearer ' + tok])
    if c == 200:
        for p in json.loads(b).get('data', []):
            if any(r['type'] == 'replied_to' for r in p.get('referenced_tweets', [])): continue
            t = re.sub(r'https?://t\.co/\w+', '', html.unescape(p['text'])).strip(); t = re.sub(r'^\d+/\d+\s+', '', t); lab = ''
            m = re.match(r'New Post in The Fan Edit Fan Club Reddit Feed\s*-\s*', t, re.I)
            if m: t = t[m.end():]; lab = 'Reddit Feed'
            xs.append({'src': 'x', 'title': clean(t.rstrip('. ')), 'label': lab, 'url': 'https://x.com/FanEditFanClub/status/' + p['id'], 'ts': ts(p['created_at'])})
posts += xs or keep('x')
posts += keep('discord')
posts.sort(key=lambda p: -p['ts'])
json.dump({'updated': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'posts': posts}, open(OUT, 'w'), ensure_ascii=False, indent=1)
print('feed snapshot:', {s: sum(1 for p in posts if p['src'] == s) for s in ('reddit', 'x', 'discord')}, file=sys.stderr)
