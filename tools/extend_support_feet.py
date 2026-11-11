#!/usr/bin/env python3
"""Put the full-body still's legs and shoes into every Support Us frame.

The motion frames are 480x640 and crop the figure around the thighs. The still
assets/optimus-begging.png includes the shoes. Each frame keeps its own head,
arms and hat. The still's legs are scaled to that frame's thighs and drawn
under them, on one taller canvas so the lowest bob still clears the shoes.
"""
import glob
import os
from PIL import Image
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STILL = os.path.join(ROOT, 'assets', 'optimus-begging.png')
FRAMES = os.path.join(ROOT, 'kodi-src', 'plugin.video.fefc', 'resources', 'media', 'optimus-support')
PAD = 36  # black rows under the shoes, even on the lowest bob


def _ink(arr, thresh):
    return arr.sum(axis=2) > thresh


def _runs(xs, gap=8):
    if len(xs) == 0:
        return []
    out = []
    start = xs[0]
    prev = xs[0]
    for x in xs[1:]:
        if x - prev > gap:
            out.append((int(start), int(prev)))
            start = x
        prev = x
    out.append((int(start), int(prev)))
    return out


def leg_sprite(still_path):
    im = Image.open(still_path).convert('RGB')
    arr = np.asarray(im)
    ink = _ink(arr, 90)
    # Two leg columns in the shin band. The hat sits between them and is left out.
    band = ink[1800:2050]
    col = band.sum(axis=0)
    xs = np.where(col > 40)[0]
    runs = [r for r in _runs(xs, 12) if r[1] - r[0] > 40]
    runs.sort(key=lambda r: r[0])
    if len(runs) < 2:
        raise SystemExit('could not find two legs in the still')
    left, right = runs[0], runs[-1]
    # Thighs start higher than the shin band. Walk up while both columns stay solid.
    top = 1680
    for y in range(1680, 1200, -1):
        if ink[y, left[0]:left[1] + 1].mean() > 0.25 and ink[y, right[0]:right[1] + 1].mean() > 0.25:
            top = y
        else:
            break
    shoe_rows = np.where(ink[top:].sum(axis=1) > 8)[0]
    bottom = top + int(shoe_rows.max()) + 1
    crop = arr[top:bottom, :]
    mask = np.zeros(crop.shape[:2], dtype=bool)
    for x0, x1 in (left, right):
        pad = 10
        mask[:, max(0, x0 - pad):min(crop.shape[1], x1 + 1 + pad)] = True
    # The still's hat sits between the legs. Never copy that centre band.
    mask[:, left[1] + 4:right[0] - 4] = False
    alpha = (_ink(crop, 70) & mask).astype(np.uint8) * 255
    # feather one pixel so the join is not a hard cut
    rgba = np.dstack([crop, alpha])
    return Image.fromarray(rgba, 'RGBA'), (left, right)


def frame_legs(arr):
    """(left x0,x1), (right x0,x1), y where the thighs are last fully in frame."""
    ink = _ink(arr, 80)
    h = arr.shape[0]
    found = None
    for y in range(h - 1, int(h * 0.45), -1):
        runs = [r for r in _runs(np.where(ink[y])[0], 6) if r[1] - r[0] >= 18]
        side = [r for r in runs if r[1] - r[0] < 90]
        if len(side) >= 2:
            side.sort(key=lambda r: r[0])
            found = (side[0], side[-1], y)
            break
    return found


def extend_all(preview=None):
    sprite, (sleft, sright) = leg_sprite(STILL)
    sw = (sleft[1] - sleft[0] + sright[1] - sright[0]) / 2.0
    names = sorted(glob.glob(os.path.join(FRAMES, 'f*.jpg')))
    measured = []
    decoded = []
    for name in names:
        im = Image.open(name).convert('RGB')
        arr = np.asarray(im)
        legs = frame_legs(arr)
        decoded.append((name, im, legs))
        if legs:
            (l0, l1), (r0, r1), y = legs
            measured.append((l1 - l0 + r1 - r0) / 2.0)
    scale = (float(np.median(measured)) / sw) if measured else 0.4
    scaled = sprite.resize((max(1, int(round(sprite.width * scale))),
                             max(1, int(round(sprite.height * scale)))), Image.LANCZOS)
    # shoe bottom inside the scaled sprite
    sa = np.asarray(scaled)
    ink_rows = np.where(sa[:, :, 3].sum(axis=1) > 0)[0]
    sprite_h = int(ink_rows.max()) + 1 if len(ink_rows) else scaled.height
    # canvas: original height + the leg that hangs past the join + pad for the lowest bob
    # The join sits on the detected thigh row, which is near the bottom on a low bob.
    extra = sprite_h + PAD
    canvas_h = 640 + extra
    out_dir = preview or FRAMES
    os.makedirs(out_dir, exist_ok=True)
    highs = []
    for name, im, legs in decoded:
        canvas = Image.new('RGB', (im.width, canvas_h), (0, 0, 0))
        dest_y = 640
        if legs:
            (l0, l1), (r0, r1), y = legs
            dest_x = int(round(l0 - (sleft[0] * scale)))
            first = int(ink_rows.min()) if len(ink_rows) else 0
            # Tuck the top of the legs just under the frame's thigh cut.
            dest_y = int(y - first - 70)
            canvas.paste(scaled, (dest_x, dest_y), scaled)
        # Original motion (head, arms, hat, thighs) covers the tucked join.
        # Black in that frame stays transparent so the legs show through it.
        src = np.asarray(im)
        keep = _ink(src, 28)
        mask = Image.fromarray((keep.astype(np.uint8) * 255), 'L')
        canvas.paste(im, (0, 0), mask)
        frame = canvas.convert('RGB')
        out = os.path.join(out_dir, os.path.basename(name))
        frame.save(out, quality=78, optimize=True)
        head = 0
        arr = np.asarray(im)
        ink = _ink(arr, 80)
        ys = np.where(ink.sum(axis=1) > 3)[0]
        if len(ys):
            head = int(ys[0])
        highs.append((head, dest_y + sprite_h, os.path.basename(name)))
    highs.sort()
    return {
        'canvas': (480, canvas_h),
        'scale': scale,
        'highest_head': highs[0],
        'lowest_head': highs[-1],
        'count': len(decoded),
    }


if __name__ == '__main__':
    info = extend_all()
    print(info)
