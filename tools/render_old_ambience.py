"""0.4.0: render the OLD Fire TV app ambience (firetv/app/src/main/assets/www/audio.js ambStart) offline, sample-exact:
intro.mp3 24.65-26.12 s crossfade loop + 14-oscillator A pad -> lowpass 850 Hz (Q 0.5 dB) swept by a 0.04 Hz LFO (+-180 Hz)
-> gain 0.085 -> master 0.6. Length L = 75 s (= 3 LFO periods); last 1.5 s crossfaded into the start so the loop point is seamless.
Usage: render_old_ambience.py out.wav"""
import sys, subprocess, numpy as np
SR = 48000; L = 75.0; N = int(L * SR)
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', 'assets/intro.mp3', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
ib = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)
dur = len(ib) / SR
t0 = int(24.65 * SR); t1 = int(min(dur - 0.03, 26.12) * SR); ln = t1 - t0
xf = int(min(0.28 * SR, ln * 0.25))
buf = ib[t0:t1].copy()
r = np.arange(xf) / xf
buf[:xf] = buf[:xf] * r[:, None] + ib[t1 - xf:t1] * (1 - r[:, None])
EXT = N + int(1.5 * SR)
t = np.arange(EXT) / SR
smp = np.tile(buf, (EXT // ln + 2, 1))[:EXT]
def osc(f, ty, cents):
    ph = (f * 2 ** (cents / 1200.0)) * t
    if ty == 'sine': return np.sin(2 * np.pi * ph)
    return 2 * np.abs(2 * (ph - np.floor(ph + 0.5))) - 1   # triangle
pad = np.zeros(EXT)
for i, (f, ty, v) in enumerate([[55, 'sine', .4], [164.81, 'triangle', .2], [329.63, 'sine', .16], [415.3, 'sine', .12], [493.88, 'sine', .09], [659.25, 'sine', .06], [987.77, 'sine', .03]]):
    for dt in (-4, 4):
        pad += osc(f, ty, dt + (1.5 if i % 2 else -1.5)) * (v / 2.5)
x = smp + pad[:, None]
fc = 850 + 180 * np.sin(2 * np.pi * 0.04 * t)
Q = 10 ** (0.5 / 20)
w0 = 2 * np.pi * fc / SR; al = np.sin(w0) / (2 * Q); cw = np.cos(w0)
a0 = 1 + al; b0 = (1 - cw) / 2 / a0; b1 = (1 - cw) / a0; a1 = -2 * cw / a0; a2 = (1 - al) / a0
y = np.zeros_like(x)
for ch in range(2):
    xs = x[:, ch]; ys = y[:, ch]; x1 = x2 = y1 = y2 = 0.0
    for n in range(EXT):
        v = b0[n] * xs[n] + b1[n] * x1 + b0[n] * x2 - a1[n] * y1 - a2[n] * y2
        x2 = x1; x1 = xs[n]; y2 = y1; y1 = v; ys[n] = v
y *= 0.085 * 0.6
X = int(1.5 * SR); out = y[:N].copy(); r = np.arange(X) / X
out[:X] = out[:X] * r[:, None] + y[N:N + X] * (1 - r[:, None])   # tail flows into the head -> seamless 75 s loop
open(sys.argv[1], 'wb')
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-i', '-', sys.argv[1]], input=out.astype(np.float32).tobytes(), check=True)
