"""Pre-render the Kodi Home background: one muted 1280x720 looping 'video wall' whose cells line up with the
3x3 menu grid (Home.xml: tiles 400x200 on a 412x212 pitch at x=348, y=200 in 1920x1080; scaled 2/3 here).
Each cell plays a different run of the short fan edit clips already in assets/clips (no Drive access)."""
import glob, os, random, subprocess, sys
src = sorted(glob.glob('assets/clips/*.mp4'))
out = sys.argv[1] if len(sys.argv) > 1 else 'assets/home-wall.mp4'
S = 2 / 3
CW, CH = 266, 132           # cell (400x200 * 2/3)
PX, PY = 412 * S, 212 * S   # pitch
X0, Y0 = 348 * S, 200 * S
cols = [X0 + k * PX for k in range(-1, 4)]
rows = [Y0 + j * PY for j in range(-1, 4)]
N, DUR = 8, 32
random.seed(7)
order = src[:]; random.shuffle(order)
cells, i = [], 0
tmp = '/tmp/wall'; os.makedirs(tmp, exist_ok=True)
for r, y in enumerate(rows):
    for c, x in enumerate(cols):
        pick = [order[(i * N + n) % len(order)] for n in range(N)]; i += 1
        lst = os.path.join(tmp, 'c%d_%d.txt' % (r, c))
        open(lst, 'w').write(''.join("file '%s'\n" % os.path.abspath(p) for p in pick))
        cells.append((lst, int(round(x)), int(round(y))))
args = ['ffmpeg', '-y', '-v', 'error']
fl = []
for k, (lst, x, y) in enumerate(cells):
    cell = lst[:-4] + '.mp4'   # each cell rendered on its own first (robust timestamps), then stacked
    subprocess.check_call(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-an',
                           '-vf', 'fps=24,scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,eq=brightness=-0.08:saturation=0.85' % (CW, CH, CW, CH),
                           '-ss', '%.2f' % ((k * 1.37) % 4), '-t', str(DUR - 1), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', cell])
    args += ['-i', cell]
    fl.append('[%d:v]setpts=PTS-STARTPTS[v%d]' % (k, k))
OX, OY = 60, 20   # xstack needs positions >= 0: shift, then crop back to 1280x720
lay = '|'.join('%d_%d' % (x + OX, y + OY) for _, x, y in cells)
fl.append(''.join('[v%d]' % k for k in range(len(cells))) + 'xstack=inputs=%d:layout=%s:fill=black,pad=1400:780:0:0:black,crop=1280:720:%d:%d[out]' % (len(cells), lay, OX, OY))
fl = fl[1:]
args += ['-filter_complex', ';'.join(fl), '-map', '[out]', '-t', str(DUR - 1), '-an',
         '-c:v', 'libx264', '-profile:v', 'main', '-level', '3.1', '-pix_fmt', 'yuv420p', '-preset', 'slow',
         '-b:v', '900k', '-maxrate', '1200k', '-bufsize', '2400k', '-g', '48', '-movflags', '+faststart', out]
subprocess.check_call(args)
print(out, os.path.getsize(out))
