#!/usr/bin/env python3
"""0.6.6: repair the Support Us Optimus loop's legs (the "stutter").

Measured cause: the frames come from a 480x640 clip extended to 480x933 with synthesized legs
(tools/extend_support_feet.py). That extension failed or changed shape on some frames: 14 frames had
no legs at all below the original crop line (y >= 640: frames 43-44 and 50-61), and around 30 frames
alternated between a wide and a thin leg sprite every other frame (110-222). Played at 24 fps, the
legs blinked out and twitched while the body moved smoothly.

Repair, per frame, only below the crop line: a frame is "bad" when its leg width (rows 690-760)
is zero or differs by more than 5 px from the median of its 7-frame neighbourhood. A bad frame's
lower part is replaced by the nearest good frame's lower part, shifted sideways so the donor's
thighs line up with this frame's thighs (measured on rows 600-639, which are original footage).
Head, arms, hat and the kneel are untouched; good frames are untouched. Frame count, order and
timing (24 fps) stay the same, so the choreography is unchanged.

Usage: python3 tools/fix_support_legs.py [--check]   (--check only reports, writes nothing)
"""
import glob
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRAMES = os.path.join(ROOT, 'kodi-src', 'plugin.video.fefc', 'resources', 'media', 'optimus-support')
CUT = 640


def leg_width(a):
    band = a[690:760].mean(axis=2) > 90
    return float(band.sum(axis=1).mean())


def thigh_x(a):
    band = a[600:CUT].mean(axis=2) > 90
    cols = np.where(band.mean(axis=0) > 0.3)[0]
    return float(cols.mean()) if len(cols) else None


def leg_reach(a):
    """Share of the rows 640-800 that still show the left / right leg (0..1)."""
    reg = a[CUT:800].mean(axis=2) > 90
    return float(reg[:, :240].any(axis=1).mean()), float(reg[:, 240:].any(axis=1).mean())


def bad_frames(arrs):
    """A frame whose legs do not match its 7-frame neighbourhood: no legs, a leg sprite of a
    different width, or one leg longer/shorter than in the frames around it (a one-frame blink)."""
    n = len(arrs)
    w = [leg_width(a) for a in arrs]
    reach = [leg_reach(a) for a in arrs]
    out = []
    for i in range(n):
        idx = [j % n for j in range(i - 3, i + 4)]
        # frames with no legs at all do not vote, so a short-legged frame next to a gap is still caught
        idx = [j for j in idx if w[j] >= 1] or idx
        med_w = float(np.median([w[j] for j in idx]))
        med_l = float(np.median([reach[j][0] for j in idx]))
        med_r = float(np.median([reach[j][1] for j in idx]))
        if (w[i] < 1 or abs(w[i] - med_w) > 5
                or abs(reach[i][0] - med_l) > 0.15 or abs(reach[i][1] - med_r) > 0.15):
            out.append(i)
    return out


def load():
    paths = sorted(glob.glob(os.path.join(FRAMES, 'f*.jpg')))
    return paths, [np.asarray(Image.open(p).convert('RGB')).copy() for p in paths]


def repair(arrs):
    widths = [leg_width(a) for a in arrs]
    bad = set(bad_frames(arrs))
    good = [i for i in range(len(arrs)) if i not in bad]
    fixed = {}
    for i in sorted(bad):
        donor = min(good, key=lambda g: (min(abs(g - i), len(arrs) - abs(g - i)), g))
        tx, dx0 = thigh_x(arrs[i]), thigh_x(arrs[donor])
        shift = int(round(tx - dx0)) if tx is not None and dx0 is not None else 0
        if abs(shift) > 12:   # thigh centre lost (arm or hat in the band): keep the donor where it is
            shift = 0
        low = arrs[donor][CUT:].copy()
        if shift:
            low = np.roll(low, shift, axis=1)
            if shift > 0:
                low[:, :shift] = 0
            else:
                low[:, shift:] = 0
        out = arrs[i].copy()
        out[CUT:] = low
        fixed[i] = (donor, shift, out)
    return widths, bad, fixed


def main():
    check = '--check' in sys.argv
    paths, arrs = load()
    touched = set()
    for rnd in range(6):
        widths, bad, fixed = repair(arrs)
        print('pass', rnd + 1, 'frames', len(arrs), 'bad', len(bad), [i + 1 for i in sorted(bad)])
        if check:
            return 1 if bad else 0
        if not bad:
            break
        for i, (donor, shift, out) in fixed.items():
            arrs[i] = out
            touched.add(i)
            print('  f%03d <- legs of f%03d shifted %+d px' % (i + 1, donor + 1, shift))
    n = len(arrs)
    for i in sorted(touched):
        Image.fromarray(arrs[i]).save(paths[i], quality=88, optimize=True)
    print('rewrote %d of %d frames' % (len(touched), n))
    return 0


if __name__ == '__main__':
    sys.exit(main())
