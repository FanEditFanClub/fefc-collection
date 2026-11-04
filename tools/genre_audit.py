#!/usr/bin/env python3
"""Genre-coverage test. Mirrors the client's genresOf(): a video's genres = union, along its ancestor chain, of
data/genres.json[id].genres (minus 'Uncategorized') and data/video-genres.json (per-item multi-genre layer).  No genre = unsorted.
Usage: python3 tools/genre_audit.py [--list] [--legacy] [--max N]
  --legacy  count like before 0.8.23 (top-level-folder genres.json only) -> the 'before' number
  --max N   exit 1 if unsorted videos > N (use as a test; regenerate with tools/video_genres.py first)"""
import json, os, sys, collections
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
def audit(legacy=False):
    G = json.load(open(os.path.join(D, 'genres.json'))); G.pop('__collections', None)
    VG = {} if legacy else json.load(open(os.path.join(D, 'video-genres.json')))
    ids = VG.get('ids', {}); sets = VG.get('sets', [])
    idx = json.load(open(os.path.join(D, 'index.json'))); items = idx['items']; ROOT = idx['root']
    by = {f['id']: f for f in items}
    def chain(f):
        out, x, g = [], f, 0
        while x and g < 40: out.append(x); x = by.get(x.get('parent')); g += 1
        return out
    def genres(f):
        s = set()
        for x in ([x for x in chain(f) if x.get('parent') == ROOT][:1] if legacy else chain(f)):
            s |= {g for g in G.get(x['id'], {}).get('genres', []) if g != 'Uncategorized'}
            if x['id'] in ids: s |= set(sets[ids[x['id']]])
        return s
    seen = set(); vids = []
    for f in items:
        if f.get('kind') == 'video' and f['id'] not in seen: seen.add(f['id']); vids.append(f)
    un = [f for f in vids if not genres(f)]
    multi = sum(1 for f in vids if len(genres(f)) > 1)
    folders = [f for f in items if f.get('parent') == ROOT and f['mimeType'] == 'application/vnd.google-apps.folder']
    un_f = [f for f in folders if not genres(f)]
    return dict(videos=len(vids), unsorted_videos=len(un), multi=multi, folders=len(folders), unsorted_folders=len(un_f), un=un, un_f=un_f, by=by)
if __name__ == '__main__':
    a = audit('--legacy' in sys.argv)
    print('videos: %d, unsorted videos: %d, multi-genre videos: %d | top-level folders: %d, unsorted folders: %d' % (a['videos'], a['unsorted_videos'], a['multi'], a['folders'], a['unsorted_folders']))
    if '--list' in sys.argv:
        for f in a['un_f']: print('  FOLDER', f['name'])
        for f in a['un']:
            p = a['by'].get(f.get('parent')); print('  VIDEO  %s  [%s]' % (f['name'][:70], (p or {}).get('name', '')[:40]))
    mx = sys.argv[sys.argv.index('--max') + 1] if '--max' in sys.argv else None
    if mx is not None and a['unsorted_videos'] > int(mx): sys.exit(1)
