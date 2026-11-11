#!/usr/bin/env python3
"""Builds resource.uisounds.fefc: the FEFC web / Fire TV app navigation sounds as a Kodi UI-sound add-on.
move/click/open are synthesised exactly like SFX.move/click/open in audio.js (same oscillators, frequencies, envelopes, gains);
back is the web app's assets/sfx/ui-back.wav. Every file is loudness-matched to -16 LUFS (BS.1770, measured over a 1 s window because
BS.1770 needs >= 400 ms) and limited to a true peak <= -1.5 dBTP. Usage: kodi_navsfx.py <out dir>"""
import re, shutil, subprocess, sys, tempfile, wave
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
MASTER = 0.6
TARGET_LUFS, TP_MAX = -16.0, -1.5
# Focus-move and Back only. Select (click) and open stay at the matched level.
# 0.85x amplitude is about -1.4 dB. Intro, wall and clips are not built here.
NAV_QUIET = 0.85
NAV_QUIET_NAMES = ('move', 'back')


def osc(kind, f0, f1, n):
    t = np.arange(n) / SR
    d = n / SR
    f = f0 * (f1 / f0) ** (t / d) if f1 else np.full(n, float(f0))
    ph = 2 * np.pi * np.cumsum(f) / SR
    if kind == 'sine':
        return np.sin(ph)
    out = np.zeros(n)
    if kind == 'triangle':
        for k in range(1, 60, 2):
            m = (k * f) < SR / 2
            out += np.where(m, ((-1) ** ((k - 1) // 2)) * np.sin(k * ph) / (k * k), 0)
        return out * 8 / np.pi ** 2
    if kind == 'sawtooth':
        for k in range(1, 100):
            m = (k * f) < SR / 2
            out += np.where(m, ((-1) ** (k + 1)) * np.sin(k * ph) / k, 0)
        return out * 2 / np.pi
    raise ValueError(kind)


def tone(buf, f, t0, d, kind='sine', g=0.15, f2=None):
    """Same as tone() in audio.js: gain 0 -> g (linear, 10 ms) -> 1e-4 (exponential) at d; oscillator runs d + 0.05 s."""
    n = int((d + 0.05) * SR)
    t = np.arange(n) / SR
    env = np.where(t < 0.01, g * t / 0.01, g * (1e-4 / g) ** np.clip((t - 0.01) / (d - 0.01), 0, None))
    env = np.where(t > d, 1e-4 * 0, env)  # silent after d
    s = osc(kind, f, f2, int(d * SR) + int(0.05 * SR) if not f2 else n)
    n = min(len(s), len(env))
    # frequency glide only runs for d seconds, then holds at f2
    if f2:
        td = np.arange(n) / SR
        fr = np.where(td < d, f * (f2 / f) ** (td / d), f2)
        s = np.sin(2 * np.pi * np.cumsum(fr) / SR) if kind == 'sine' else None
        if s is None:
            ph = 2 * np.pi * np.cumsum(fr) / SR
            s = np.zeros(n)
            if kind == 'triangle':
                for k in range(1, 60, 2):
                    s += np.where(k * fr < SR / 2, ((-1) ** ((k - 1) // 2)) * np.sin(k * ph) / (k * k), 0)
                s *= 8 / np.pi ** 2
            else:
                for k in range(1, 100):
                    s += np.where(k * fr < SR / 2, ((-1) ** (k + 1)) * np.sin(k * ph) / k, 0)
                s *= 2 / np.pi
    i0 = int(t0 * SR)
    seg = (s[:n] * env[:n])
    end = min(len(buf), i0 + len(seg))
    buf[i0:end] += seg[:end - i0]


def synth(name):
    b = np.zeros(int(0.6 * SR))
    if name == 'move':
        tone(b, 1400, 0, 0.06, 'sine', 0.05)
    elif name == 'click':
        tone(b, 600, 0, 0.08, 'triangle', 0.12, 900)
        tone(b, 1200, 0.03, 0.1, 'sine', 0.06)
    elif name == 'open':
        tone(b, 300, 0, 0.35, 'sawtooth', 0.05, 1200)
        tone(b, 880, 0.12, 0.25, 'sine', 0.08)
    return b * MASTER


def measure(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), '-af', 'apad=whole_dur=1,ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    tail = r[r.rindex('Integrated loudness'):]
    return float(re.search(r'I:\s+(-?[\d.]+) LUFS', tail).group(1)), float(re.search(r'Peak:\s+(-?[\d.]+) dBFS', tail).group(1))


def write(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())


def normalise(path, x):
    """Gain to -16 LUFS; if that would exceed TP -1.5 dBTP, back off to -1.5 dBTP (verified with ffmpeg, 4x oversampled true peak)."""
    write(path, x / max(1e-9, np.abs(x).max()) * 0.5)
    lufs, tp = measure(path)
    g = 10 ** ((TARGET_LUFS - lufs) / 20)
    g = min(g, 10 ** ((TP_MAX - 0.15 - tp) / 20) * 0.5 / 0.5)
    y = x / max(1e-9, np.abs(x).max()) * 0.5 * g
    write(path, y)
    for _ in range(4):
        lufs, tp = measure(path)
        if tp <= TP_MAX:
            break
        y *= 10 ** ((TP_MAX - 0.2 - tp) / 20)
        write(path, y)
    return measure(path)


SOUNDS_XML = '''<?xml version="1.0" encoding="UTF-8"?>
<sounds>
	<actions>
		<action><name>left</name><file>move.wav</file></action>
		<action><name>right</name><file>move.wav</file></action>
		<action><name>up</name><file>move.wav</file></action>
		<action><name>down</name><file>move.wav</file></action>
		<action><name>pageup</name><file>move.wav</file></action>
		<action><name>pagedown</name><file>move.wav</file></action>
		<action><name>select</name><file>click.wav</file></action>
		<action><name>back</name><file>back.wav</file></action>
		<action><name>previousmenu</name><file>back.wav</file></action>
		<action><name>parentdir</name><file>back.wav</file></action>
	</actions>
	<windows>
		<window><name>movieinformation</name><activate>open.wav</activate></window>
		<window><name>videos</name><activate>open.wav</activate></window>
	</windows>
</sounds>
'''

ADDON = '''<?xml version="1.0" encoding="UTF-8"?>
<addon id="resource.uisounds.fefc" version="%s" name="FEFC UI Sounds" provider-name="Fan Edit Fan Club">
  <requires>
    <import addon="kodi.resource" version="1.0.0"/>
  </requires>
  <extension point="kodi.resource.uisounds"/>
  <extension point="xbmc.addon.metadata">
    <summary lang="en">FEFC navigation sounds</summary>
    <description lang="en">The navigation sounds of the Fan Edit Fan Club web and Fire TV app (focus move, select, open, back) for Kodi.</description>
    <platform>all</platform>
    <assets>
      <icon>icon.png</icon>
    </assets>
  </extension>
</addon>
'''


def build(out, version='1.0.0'):
    out = Path(out)
    if out.exists():
        shutil.rmtree(out)
    res = out / 'resources'
    res.mkdir(parents=True)
    (out / 'addon.xml').write_text(ADDON % version, encoding='utf-8')
    from PIL import Image
    ic = Image.open(ROOT / 'assets' / 'fefc-logo.png').convert('RGBA').resize((384, 384))
    bg = Image.new('RGBA', (512, 512), (11, 24, 44, 255))
    bg.alpha_composite(ic, (64, 64))
    bg.convert('RGB').save(out / 'icon.png')
    (res / 'sounds.xml').write_text(SOUNDS_XML, encoding='utf-8')
    report = {}
    for n in ('move', 'click', 'open'):
        report[n] = normalise(res / (n + '.wav'), synth(n))
    # back: the web app's own file (already -16 LUFS), re-checked and re-matched to the same rules
    with wave.open(str(ROOT / 'assets' / 'sfx' / 'ui-back.wav')) as w:
        raw = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(float) / 32768
        sr = w.getframerate()
    if sr != SR:
        from scipy.signal import resample_poly
        from math import gcd
        g = gcd(SR, sr)
        raw = resample_poly(raw, SR // g, sr // g)
    report['back'] = normalise(res / 'back.wav', raw)
    for n in NAV_QUIET_NAMES:
        p = res / (n + '.wav')
        with wave.open(str(p)) as w:
            x = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(float) / 32768
        write(p, x * NAV_QUIET)
        report[n] = measure(p)
    return report


if __name__ == '__main__':
    for k, (l, p) in build(sys.argv[1]).items():
        print('%-6s %.1f LUFS  TP %.1f dBFS' % (k, l, p))
