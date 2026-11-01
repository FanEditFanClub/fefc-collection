#!/usr/bin/env python3
"""Add genre -> collection folders/franchises mapping to data/genres.json under the key "__collections".
Run after tools/genres.py (which rewrites genres.json). The app strips "__collections" from the folder map on load.
For each genre:
  collections: [{slug, name, folders:[top-folder ids], extra:[video ids]}]
    - top-level folders of that genre, grouped by franchise key derived from the folder name
      (e.g. "Arrow - The Island" + "Arrow - Season 2 - The End Edition" -> one "Arrow" franchise)
    - extra: fan edits elsewhere in the library (editor collections, loose root files) whose TITLE starts with the
      franchise key (e.g. "Thor: Ragnarok - Trimmed Edition" found in an editor's folder -> Thor). Not for Uncategorized.
  Loose edits for a genre are computed client-side: genre videos not in any collection with 2+ items.
URL: #/genres/<genre>/<slug>"""
import json, os, re
from collections import defaultdict
D = os.path.join(os.path.dirname(__file__), '..', 'data')
G = json.load(open(os.path.join(D, 'genres.json'))); G.pop('__collections', None)
items = json.load(open(os.path.join(D, 'index.json')))['items']
by = {f['id']: f for f in items}; ROOT = '1kGaeK1unqWD1VOl3-DGWLAxISBhDR3cg'
def key(name):
    n = re.sub(r'\.(mkv|mp4|m4v|avi|mov|wmv|webm)$', '', name, flags=re.I)
    n = re.split(r'\s+[-–|]\s+|:\s|\s\(|\s\[', n)[0]
    n = re.sub(r'^(the|a)\s+', '', n.lower()); n = re.sub(r'[^a-z0-9& ]+', ' ', n)
    n = re.sub(r'\s+(series|trilogy|saga|collection|season\s*\d+|\d+|[ivx]+)$', '', n.strip())
    return re.sub(r'\s+', ' ', n).strip()
def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
def top(f):
    x, g = f, 0
    while x and x.get('parent') and x['parent'] != ROOT and g < 30: x = by.get(x['parent']); g += 1
    return x['id'] if x and x.get('parent') == ROOT else None
vids = [f for f in items if f.get('kind') == 'video']
# --- pinned genre overrides (data/genre-overrides.json): applied every run, after the Wikidata map, so nothing can undo them ---
OV = json.load(open(os.path.join(D, 'genre-overrides.json')))
RULES = [(re.compile(r['match'], re.I), r['genres']) for r in OV.get('rules', [])]
SKIPTOP = re.compile(r'^\d+\s*-\s|\bfan edits?\b.*$|\bseries\b - .*fan edits|^(actors|directors)$', re.I)
def override(name):
    for rx, gs in RULES:
        if rx.search(name): return gs
added = changed = 0
for f in items:
    if f.get('parent') != ROOT or f['mimeType'] != 'application/vnd.google-apps.folder': continue
    gs = override(f['name'])
    if gs is None: continue
    if f['id'] in G:
        if sorted(G[f['id']]['genres']) != sorted(gs): changed += 1
        G[f['id']]['genres'] = sorted(gs); G[f['id']]['source'] = dict(G[f['id']].get('source') or {}, pinned=True)
    else:
        added += 1; G[f['id']] = {'folder': f['name'], 'genres': sorted(gs), 'source': {'pinned': True}}
print('genre overrides: %d folders added, %d changed' % (added, changed))
genres = sorted({g for v in G.values() for g in v['genres']} | {e['genre'] for e in OV.get('edits', [])})
out = {}
for g in genres:
    groups = defaultdict(list)
    for fid, v in G.items():
        if g in v['genres']: groups[key(v['folder']) or slug(v['folder'])].append(fid)
    colls = []
    for k, fids in groups.items():
        fids.sort(key=lambda i: G[i]['folder'])
        name = G[fids[0]]['folder'] if len(fids) == 1 else (re.split(r'\s+-\s+|:\s', G[fids[0]]['folder'])[0])
        extra, seen = [], set()
        if g != 'Uncategorized' and len(k) >= 4:
            rx = re.compile(r'^' + re.escape(k) + r'(\b|$)')
            for f in vids:
                t = f.get('targetId') or f['id']
                if t in seen or top(f) in fids: continue
                if rx.match(key(f['name'])): seen.add(t); extra.append(f['id'])
        colls.append({'slug': slug(name), 'name': name, 'folders': fids, 'extra': extra})
    for e in OV.get('edits', []):
        if e['genre'] != g or any(c['name'].lower() == e['name'].lower() for c in colls): continue
        rx, seen, ids = re.compile(e['match'], re.I), set(), []
        for f in vids:
            t = f.get('targetId') or f['id']
            if t not in seen and rx.search(f['name']): seen.add(t); ids.append(f['id'])
        if ids: colls.append({'slug': slug(e['name']), 'name': e['name'], 'folders': [], 'extra': ids})
    colls.sort(key=lambda c: c['name'].lower())
    out[g] = colls
G['__collections'] = out
json.dump(G, open(os.path.join(D, 'genres.json'), 'w'), indent=0)
for g in genres:
    print(f"{g}: {len(out[g])} collections, {sum(len(c['folders'])>1 for c in out[g])} multi-folder franchises, {sum(len(c['extra']) for c in out[g])} title-matched extras")
