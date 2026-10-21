#!/usr/bin/env python3
"""Build data/ai-titles.json (compact title list for the /api/ai-search prefilter in _worker.js).
Format: {v:1, folders:[name...], items:[[id, name_without_ext, folderIdx]...]} — one entry per unique video target."""
import json, re, os
ROOT = '1kGaeK1unqWD1VOl3-DGWLAxISBhDR3cg'
here = os.path.join(os.path.dirname(__file__), '..', 'data')
idx = json.load(open(os.path.join(here, 'index.json')))
items = idx['items']; by = {f['id']: f for f in items}
def isvid(f): return f.get('kind') == 'video'
seen, folders, fpos, out = set(), [], {}, []
for f in sorted(items, key=lambda f: f['name'].lower()):
    if not isvid(f): continue
    t = f.get('targetId') or f['id']
    if t in seen: continue
    seen.add(t)
    p = by.get(f.get('parent') or ROOT)
    pn = 'Fan Edit Fan Club Collection' if (not p or p['id'] == ROOT) else p['name']
    if pn not in fpos: fpos[pn] = len(folders); folders.append(pn)
    out.append([f['id'], re.sub(r'\.(mkv|mp4|m4v|avi|mov|wmv|webm|ts)$', '', f['name'], flags=re.I).strip(), fpos[pn]])
json.dump({'v': 1, 'folders': folders, 'items': out}, open(os.path.join(here, 'ai-titles.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(out), 'videos', len(folders), 'folders')
