#!/usr/bin/env python3
"""Pre-composite mosaic-atlas MP4s (OnLive Arena model: one stream for the home wall)."""
import glob, json, os, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
clips = sorted(glob.glob('assets/clips/[0-9]*.mp4'), key=lambda p: int(os.path.basename(p).split('.')[0]))
clips = [c for c in clips if os.path.getsize(c) > 1000]
if len(clips) < 8:
    sys.exit('need clip mp4s under assets/clips/')

def build(out, W, H, cols=5, rows=3, dur=12, crf=28):
    n = cols * rows
    srcs = (clips * ((n // len(clips)) + 1))[:n]
    cw, ch = W // cols, H // rows
    assert cw % 2 == 0 and ch % 2 == 0
    inputs = []
    for src in srcs:
        inputs += ['-stream_loop', '-1', '-t', str(dur), '-i', src]
    fc, labs, layouts = [], [], []
    for i in range(n):
        c, r = i % cols, i // cols
        w = W - c * cw if c == cols - 1 else cw
        h = H - r * ch if r == rows - 1 else ch
        w -= w % 2; h -= h % 2
        layouts.append(f'{c*cw}_{r*ch}')
        fc.append(f'[{i}:v]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1,fps=24,format=yuv420p[v{i}]')
        labs.append(f'[v{i}]')
    fc.append(''.join(labs) + f"xstack=inputs={n}:layout={'|'.join(layouts)},scale={W}:{H}:flags=neighbor,setsar=1[out]")
    cmd = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error'] + inputs + [
        '-filter_complex', ';'.join(fc), '-map', '[out]', '-an',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', str(crf),
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', str(dur), out]
    print('encoding', out)
    subprocess.check_call(cmd)
    print('wrote', out, os.path.getsize(out))

build('assets/clips/mosaic-atlas-720.mp4', 1280, 720, crf=30)
build('assets/clips/mosaic-atlas-1080.mp4', 1920, 1080, crf=28)
json.dump({
    'cols': 5, 'rows': 3, 'duration': 12, 'fps': 24,
    'insight': 'OnLive Arena: one precomposited media stream',
    'files': {
        'LOW': 'assets/clips/mosaic-atlas-720.mp4',
        'MID': 'assets/clips/mosaic-atlas-720.mp4',
        'HIGH': 'assets/clips/mosaic-atlas-1080.mp4'
    }
}, open('assets/clips/mosaic-atlas.json', 'w'), indent=2)
print('ok')
