#!/usr/bin/env python3
"""Build resources/shipped/pages.pack from the repo's data/*.json files."""
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIB = os.path.join(ROOT, 'kodi-src', 'plugin.video.fefc', 'resources', 'lib')
sys.path.insert(0, LIB)
import catalog
import pagepack

BASE = 'https://fefc-collection.pages.dev'
DATA = os.path.join(ROOT, 'data')
OUT = os.path.join(ROOT, 'kodi-src', 'plugin.video.fefc', 'resources', 'shipped', 'pages.pack')


def main():
    t0 = time.perf_counter()
    raw = {}
    for name in catalog.SOURCES:
        path = os.path.join(DATA, name + '.json')
        if not os.path.exists(path):
            continue
        import json
        with open(path, encoding='utf-8') as f:
            raw[name] = json.load(f)
    t_json = time.perf_counter()
    model = catalog._decorate(catalog.build_model(raw))
    t_model = time.perf_counter()
    blob = pagepack.build_pack(model, BASE)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'wb') as f:
        f.write(blob)
    t_pack = time.perf_counter()
    print('json %.3fs  model %.3fs  pack %.3fs  bytes %d' % (
        t_json - t0, t_model - t_json, t_pack - t_model, len(blob)))
    # one slice, to prove the file seeks
    pagepack._CACHE.clear()
    root = pagepack.root_id(OUT)
    doc = pagepack.folder_page(root, 0, OUT)
    print('root', root, 'page0', len(doc['rows']), 'of', doc['total'])


if __name__ == '__main__':
    main()
