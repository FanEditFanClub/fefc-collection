#!/usr/bin/env python3
"""Make Kodi-reliable copies of the folder sound clips: assets/sfx/*.(mp3|m4a|wav) -> <out>/<name>.wav
(PCM 16-bit mono 22.05 kHz, max 6 s). Kodi's xbmc.playSFX plays wav natively; mp3/m4a are hit-and-miss on Android.
Loudness is untouched (the clips are already -16 LUFS / <= -1.5 dBTP); only a safety limiter at -1.5 dBFS is applied.
The web app keeps using the originals. Usage: kodi_sfx.py <sfx dir> <out dir>"""
import os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
best = {}
for f in sorted(os.listdir(src)):
    base, ext = os.path.splitext(f)
    if ext.lower() in ('.wav', '.mp3', '.m4a'):
        best.setdefault(base, f)
        if ext.lower() == '.wav':
            best[base] = f


def conv(item):
    base, f = item
    dst = os.path.join(out, base + '.wav')
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(os.path.join(src, f)):
        return 0
    r = subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', os.path.join(src, f), '-t', '6', '-vn', '-ac', '1', '-ar', '22050',
                        '-af', 'alimiter=limit=0.84:level=disabled', '-c:a', 'pcm_s16le', dst])
    return 0 if r.returncode == 0 else 1


with ThreadPoolExecutor(4) as ex:
    bad = sum(ex.map(conv, best.items()))
print('kodi sfx: %d clips, %d failed -> %s' % (len(best), bad, out))
