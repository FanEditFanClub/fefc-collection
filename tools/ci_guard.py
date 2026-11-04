#!/usr/bin/env python3
"""Daily-refresh safety net (run in GitHub Actions after the refresh steps, before commit).
 * data/index.json: if the new crawl has <90% of the previous item count -> exit 1 (no commit, no deploy).
 * every other tracked data/*.json: if it shrank by >20% in bytes vs HEAD (a tool half-failed), restore the HEAD copy.
Never touches Drive; only compares files in the working tree with git HEAD."""
import json, os, subprocess, sys
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def head(p):
    r = subprocess.run(['git', 'show', 'HEAD:' + p], capture_output=True)
    return r.stdout if r.returncode == 0 else None
bad = 0
old = head('data/index.json')
if old:
    o = len(json.loads(old)['items']); n = len(json.load(open('data/index.json'))['items'])
    print('index items old', o, 'new', n)
    if n < o * 0.9:
        print('crawl returned <90% of the previous catalogue; aborting (no commit, no deploy)'); sys.exit(1)
files = subprocess.run(['git', 'ls-files', 'data'], capture_output=True, text=True).stdout.split()
for p in files:
    if not p.endswith('.json') or p == 'data/index.json' or not os.path.exists(p):
        continue
    h = head(p)
    if h is None:
        continue
    new = os.path.getsize(p)
    if len(h) > 2000 and new < len(h) * 0.8:
        print('RESTORING %s (shrank %d -> %d bytes)' % (p, len(h), new))
        subprocess.run(['git', 'checkout', 'HEAD', '--', p], check=True)
    else:
        try:
            json.load(open(p))
        except Exception:
            print('RESTORING %s (invalid JSON)' % p); subprocess.run(['git', 'checkout', 'HEAD', '--', p], check=True)
print('guard ok')
