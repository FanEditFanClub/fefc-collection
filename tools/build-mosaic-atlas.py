#!/usr/bin/env python3
"""Pre-composite mosaic-atlas MP4s.

One OnLive-style stream. The frame is a uniform COLS×ROWS grid. The center
3×3 slots are the selectable hub; every other slot is a clip of the same
size. A gutter (GUTTER fraction of each slot) is painted in the page
background so a focused hub tile can scale and glow without covering a clip.
"""
import glob, json, os, subprocess, sys, tempfile, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
COLS, ROWS, GUTTER = 5, 5, 0.10
clips = sorted(glob.glob('assets/clips/[0-9]*.mp4'), key=lambda p: int(os.path.basename(p).split('.')[0]))
clips = [c for c in clips if os.path.getsize(c) > 1000]
if len(clips) < 8:
    sys.exit('need clip mp4s under assets/clips/')

def even(n):
    n = int(n)
    return n if n % 2 == 0 else n - 1

def build(out, W, H, dur=8, crf=28):
    n = COLS * ROWS
    srcs = (clips * ((n // len(clips)) + 1))[:n]
    cw, ch = W // COLS, H // ROWS
    iw, ih = even(cw * (1 - GUTTER)), even(ch * (1 - GUTTER))
    if iw < 2 or ih < 2 or cw % 2 or ch % 2:
        sys.exit('bad cell size %s %s' % (cw, ch))
    tmp = tempfile.mkdtemp(prefix='fefc-atlas-')
    try:
        cells = []
        for i, src in enumerate(srcs):
            cell = os.path.join(tmp, 'c%02d.mp4' % i)
            subprocess.check_call([
                'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
                '-stream_loop', '-1', '-t', str(dur), '-i', src,
                '-vf', 'scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,setsar=1,fps=24,format=yuv420p,pad=%d:%d:(ow-iw)/2:(oh-ih)/2:color=0x05070b' % (iw, ih, iw, ih, cw, ch),
                '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', str(crf),
                '-pix_fmt', 'yuv420p', cell])
            cells.append(cell)
            print('cell', i + 1, '/', n, os.path.basename(out))
        inputs = []
        for c in cells:
            inputs += ['-i', c]
        fc, labs, layouts = [], [], []
        for i in range(n):
            c, r = i % COLS, i // COLS
            layouts.append('%d_%d' % (c * cw, r * ch))
            labs.append('[v%d]' % i)
            fc.append('[%d:v]setsar=1[v%d]' % (i, i))
        fc.append(''.join(labs) + "xstack=inputs=%d:layout=%s,scale=%d:%d:flags=neighbor,setsar=1[out]" % (n, '|'.join(layouts), W, H))
        cmd = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error'] + inputs + [
            '-filter_complex', ';'.join(fc), '-map', '[out]', '-an',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', str(crf),
            '-pix_fmt', 'yuv420p', '-map_chapters', '-1', '-map_metadata', '-1', '-movflags', '+faststart', '-t', str(dur), out]
        print('stacking', out)
        subprocess.check_call(cmd)
        print('wrote', out, os.path.getsize(out))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

build('assets/clips/mosaic-atlas-720.mp4', 1280, 720, crf=30)
build('assets/clips/mosaic-atlas-1080.mp4', 1920, 1080, crf=28)
json.dump({
    'cols': COLS, 'rows': ROWS, 'gutter': GUTTER, 'hub': 3,
    'duration': 8, 'fps': 24,
    'insight': 'OnLive Arena: one precomposited stream whose cells match the home hub grid. Center 3x3 is the hub; the ring around it is live clips of the same cell size.',
    'files': {
        'LOW': 'assets/clips/mosaic-atlas-720.mp4',
        'MID': 'assets/clips/mosaic-atlas-720.mp4',
        'HIGH': 'assets/clips/mosaic-atlas-1080.mp4'
    }
}, open('assets/clips/mosaic-atlas.json', 'w'), indent=2)
print('ok')
