"""Pre-render the Kodi Home background (0.3.22): a muted-or-ambient 1280x720 'video wall' loop of fan edit clips
that only fills the EDGES around the centred 3x3 menu (OnLive style). The centre is solid black, exactly where
Home.xml draws its black panel (324..1596 x 192..856 in 1920x1080 -> 216..1064 x 128..571 here), so no clip ever
shows behind or over a tile.

Seamless loop: the composite is rendered L+F seconds long; the output is V[F..L] followed by a crossfade of
V[L..L+F] into V[0..F], so the last frame equals the first frame. Encoded closed-GOP, IDR at frame 0, no B-frames
across the seam, constant 24 fps, so Fire Stick's hardware decoder restarts cleanly.

Ambience: the original FEFC home ambience = the recorded tail of Carson's assets/intro.mp3 (24.65 s .. ~26.12 s,
low-passed at 850 Hz, crossfaded loop) - the same sample the web app looped. It is tiled to exactly L seconds,
loudness-normalised (-20 LUFS integrated, true peak <= -1.5 dBTP) and muxed as AAC.

Outputs: assets/home-wall.mp4 (with ambience), assets/home-wall-silent.mp4 (Sound Off), assets/home-wall-still.jpg
(the loop's first frame, 1920x1080, shown instantly before the video starts and across the loop seam),
assets/home-amb.m4a (the same ambience loop for the web app). Uses only assets/clips (no Drive access)."""
import glob, os, random, subprocess, sys
src = sorted(glob.glob('assets/clips/*.mp4'))
L, F, FPS = 75.0, 1.5, 24
T = L + F
W, H = 1920, 1080
# 0.4.0: tiles are EXACTLY the Home 3x3 menu tiles (400x200, 12 px gap; grid at x 348/760/1172, y 212/424/636).
# 0.5.3: 3 equal tiles per side, lined up with the 3 menu rows (y 212/424/636), plus one equal tile in each of
# the 4 corners. All 10 tiles are 324x200 — the side strips are 324px wide (0..324 and 1596..1920) and the menu
# rows are 200px tall, so every tile is the same size and the side tiles sit exactly on the rows. (The old
# layout had 5 per side + 3 across the bottom, which is why 5 tiles crowded into the space of 3 menu rows.)
TW, TH = 324, 200
cells = []
# 4 corners, all the same size
cells.append((0, 0, TW, TH))          # top-left
cells.append((1596, 0, TW, TH))       # top-right
cells.append((0, 880, TW, TH))        # bottom-left (bottom strip is 856..1080; 880+200 = 1080, flush with the edge)
cells.append((1596, 880, TW, TH))     # bottom-right
# 3 per side, on the menu rows
for y in (212, 424, 636):
    cells.append((0, y, TW, TH))      # left
    cells.append((1596, y, TW, TH))   # right
random.seed(22)
order = src[:]; random.shuffle(order)
tmp = '/tmp/wall2'; os.makedirs(tmp, exist_ok=True)
N = int(T // 3.9) + 2
ins = []
for i, (x, y, w, h) in enumerate(cells):
    pick = [order[(i * 7 + n * len(cells)) % len(order)] for n in range(N)]
    lst = os.path.join(tmp, 'c%d.txt' % i)
    open(lst, 'w').write(''.join("file '%s'\n" % os.path.abspath(p) for p in pick))
    cell = os.path.join(tmp, 'c%d.mp4' % i)
    subprocess.check_call(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-an',
                           '-vf', 'fps=%d,scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,eq=brightness=-0.06:saturation=0.85,setsar=1' % (FPS, w, h, w, h),
                           '-ss', '%.2f' % ((i * 1.37) % 3), '-t', '%.3f' % T, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', cell])
    ins.append((cell, x, y))
# composite V (length T) on black
args = ['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=%dx%d:r=%d:d=%.3f' % (W, H, FPS, T)]
fl, last = [], '0:v'
for k, (cell, x, y) in enumerate(ins):
    args += ['-i', cell]
    fl.append('[%d:v]setpts=PTS-STARTPTS[c%d]' % (k + 1, k))
for k, (cell, x, y) in enumerate(ins):
    o = 'o%d' % k
    fl.append('[%s][c%d]overlay=%d:%d:eof_action=repeat[%s]' % (last, k, x, y, o)); last = o
comp = os.path.join(tmp, 'comp.mp4')
args += ['-filter_complex', ';'.join(fl), '-map', '[%s]' % last, '-t', '%.3f' % T, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', comp]
subprocess.check_call(args)
# seamless loop: V[F..L] + xfade(V[L..T] -> V[0..F])
loopv = os.path.join(tmp, 'loop.mp4')
subprocess.check_call(['ffmpeg', '-y', '-v', 'error', '-i', comp, '-filter_complex',
    '[0:v]split=3[a][b][c];[a]trim=%.3f:%.3f,setpts=PTS-STARTPTS,fps=24,settb=1/24[body];[b]trim=%.3f:%.3f,setpts=PTS-STARTPTS,fps=24,settb=1/24[tail];'
    '[c]trim=0:%.3f,setpts=PTS-STARTPTS,fps=24,settb=1/24[head];[tail][head]xfade=transition=fade:duration=%.3f:offset=0[seam];'
    '[body][seam]concat=n=2:v=1:a=0,fps=%d,format=yuv420p[v]' % (F, L, L, T, F, F, FPS),
    '-map', '[v]', '-frames:v', str(int(L * FPS)), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', loopv])
# ambience (0.4.0): the OLD Fire TV app ambience, rendered offline (tools/render_old_ambience.py), +15.4 dB (~-22 LUFS)
raw = os.path.join(tmp, 'old.wav'); ambn = os.path.join(tmp, 'ambn.wav')
subprocess.check_call([sys.executable, 'tools/render_old_ambience.py', raw])
subprocess.check_call(['ffmpeg', '-y', '-v', 'error', '-i', raw, '-af', 'volume=15.4dB', '-t', '%.4f' % L, ambn])
venc = ['-c:v', 'libx264', '-profile:v', 'main', '-level', '4.0', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-r', str(FPS),
        '-crf', '27', '-maxrate', '1400k', '-bufsize', '2800k', '-g', '48', '-keyint_min', '48', '-sc_threshold', '0', '-bf', '0',
        '-x264-params', 'open-gop=0', '-forced-idr', '1', '-movflags', '+faststart']
os.makedirs('assets', exist_ok=True)
subprocess.check_call(['ffmpeg', '-y', '-v', 'error', '-i', loopv, '-i', ambn, '-map', '0:v', '-map', '1:a'] + venc +
                      ['-c:a', 'aac', '-b:a', '96k', '-ar', '48000', '-ac', '2', '-t', '%.3f' % L, 'assets/home-wall.mp4'])
subprocess.check_call(['ffmpeg', '-y', '-v', 'error', '-i', loopv, '-an'] + venc + ['assets/home-wall-silent.mp4'])
subprocess.check_call(['ffmpeg', '-y', '-v', 'error', '-i', ambn, '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', 'assets/home-amb.m4a'])
subprocess.check_call(['ffmpeg', '-y', '-v', 'error', '-i', loopv, '-frames:v', '1', '-vf', 'scale=1920:1080:flags=lanczos', '-q:v', '3', '-update', '1', 'assets/home-wall-still.jpg'])
for f in ('assets/home-wall.mp4', 'assets/home-wall-silent.mp4', 'assets/home-amb.m4a', 'assets/home-wall-still.jpg'):
    print(f, os.path.getsize(f))
