"""Pre-render the Kodi Home background: one 1920x1080 loop, low bitrate, closed GOP.

The frame is the 5x5 lattice in tools/home_layout.py. Centre 3x3 stays black (the
menu). The other 16 cells are fan-edit clips from assets/clips, each the same
size as a menu tile, including a full tile in every corner. Audio is the existing
ambience stream copied unchanged (no re-loudnorm). Sound Off is the silent twin.
"""
import glob
import os
import random
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import home_layout as L

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
src = sorted(glob.glob('assets/clips/[0-9]*.mp4'))
src = [p for p in src if os.path.getsize(p) > 1000]
if len(src) < 8:
    sys.exit('need numbered clips in assets/clips')
LOOP, FADE, FPS = 75.0, 1.5, 24
T = LOOP + FADE
W, H = L.W, L.H
cells = [(x, y, w, h) for _c, _r, x, y, w, h in L.cells()]
assert len(cells) == 16, len(cells)
random.seed(22)
order = src[:]
random.shuffle(order)
tmp = '/tmp/wall2'
os.makedirs(tmp, exist_ok=True)
N = int(T // 3.9) + 2
ins = []
for i, (x, y, w, h) in enumerate(cells):
    pick = [order[(i * 7 + n * len(cells)) % len(order)] for n in range(N)]
    lst = os.path.join(tmp, 'c%d.txt' % i)
    open(lst, 'w').write(''.join("file '%s'\n" % os.path.abspath(p) for p in pick))
    cell = os.path.join(tmp, 'c%d.mp4' % i)
    if not os.path.exists(cell) or os.environ.get('FEFC_WALL_FORCE') == '1':
        subprocess.check_call([
            'ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-an',
            '-vf', 'fps=%d,scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,eq=brightness=-0.06:saturation=0.85,setsar=1' % (FPS, w, h, w, h),
            '-ss', '%.2f' % ((i * 1.37) % 3), '-t', '%.3f' % T,
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', cell])
    ins.append((cell, x, y))
    print('cell', i + 1, '/', len(cells), flush=True)

args = ['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=%dx%d:r=%d:d=%.3f' % (W, H, FPS, T)]
fl, last = [], '0:v'
for k, (cell, x, y) in enumerate(ins):
    args += ['-i', cell]
    fl.append('[%d:v]setpts=PTS-STARTPTS[c%d]' % (k + 1, k))
for k, (cell, x, y) in enumerate(ins):
    o = 'o%d' % k
    fl.append('[%s][c%d]overlay=%d:%d:eof_action=repeat[%s]' % (last, k, x, y, o))
    last = o
comp = os.path.join(tmp, 'comp.mp4')
args += ['-filter_complex', ';'.join(fl), '-map', '[%s]' % last, '-t', '%.3f' % T,
         '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', comp]
print('composite', flush=True)
subprocess.check_call(args)
loopv = os.path.join(tmp, 'loop.mp4')
print('loop', flush=True)
subprocess.check_call([
    'ffmpeg', '-y', '-v', 'error', '-i', comp, '-filter_complex',
    '[0:v]split=3[a][b][c];[a]trim=%.3f:%.3f,setpts=PTS-STARTPTS,fps=24,settb=1/24[body];'
    '[b]trim=%.3f:%.3f,setpts=PTS-STARTPTS,fps=24,settb=1/24[tail];'
    '[c]trim=0:%.3f,setpts=PTS-STARTPTS,fps=24,settb=1/24[head];'
    '[tail][head]xfade=transition=fade:duration=%.3f:offset=0[seam];'
    '[body][seam]concat=n=2:v=1:a=0,fps=%d,format=yuv420p[v]' % (FADE, LOOP, LOOP, T, FADE, FADE, FPS),
    '-map', '[v]', '-frames:v', str(int(LOOP * FPS)), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', loopv])
venc = ['-c:v', 'libx264', '-profile:v', 'main', '-level', '4.0', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
        '-r', str(FPS), '-crf', '27', '-maxrate', '1400k', '-bufsize', '2800k', '-g', '48', '-keyint_min', '48',
        '-sc_threshold', '0', '-bf', '0', '-x264-params', 'open-gop=0', '-forced-idr', '1', '-movflags', '+faststart']
os.makedirs('assets', exist_ok=True)
prev = 'assets/home-wall.mp4'
if not os.path.exists(prev):
    sys.exit('refusing to invent ambience; assets/home-wall.mp4 is missing')
print('mux', flush=True)
staged = os.path.join(tmp, 'home-wall.mp4')
subprocess.check_call(['ffmpeg', '-y', '-v', 'error', '-i', loopv, '-i', prev, '-map', '0:v', '-map', '1:a', '-c:a', 'copy']
                      + venc + ['-t', '%.3f' % LOOP, staged])
os.replace(staged, 'assets/home-wall.mp4')
subprocess.check_call(['ffmpeg', '-y', '-v', 'error', '-i', loopv, '-an'] + venc + ['assets/home-wall-silent.mp4'])
subprocess.check_call(['ffmpeg', '-y', '-v', 'error', '-i', loopv, '-frames:v', '1', '-q:v', '3', '-update', '1', 'assets/home-wall-still.jpg'])
for f in ('assets/home-wall.mp4', 'assets/home-wall-silent.mp4', 'assets/home-wall-still.jpg'):
    print(f, os.path.getsize(f))
