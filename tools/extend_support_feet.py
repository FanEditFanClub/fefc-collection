#!/usr/bin/env python3
"""Extend Support Us frames with the still's legs and shoes, joined to the bob.

The motion frames are 480x640 and crop the figure at the thighs or knees.
assets/optimus-begging.png has the shoes. Each frame keeps its own head, arms
and hat. The still's legs are scaled to that frame, lined up with the thigh
cut, shifted with the bow, and feathered so the white matches. The still's
hat is never copied.
"""
import glob
import os
from PIL import Image, ImageFilter
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STILL = os.path.join(ROOT, 'assets', 'optimus-begging.png')
FRAMES = os.path.join(ROOT, 'kodi-src', 'plugin.video.fefc', 'resources', 'media', 'optimus-support')
PAD = 28


def _neutral(rgb):
    r = rgb[..., 0].astype(np.int16)
    g = rgb[..., 1].astype(np.int16)
    b = rgb[..., 2].astype(np.int16)
    return (np.abs(r - g) < 22) & (np.abs(r - b) < 24)


def _warm(rgb):
    """Beige hat. The legs are neutral white or black, so this stays out."""
    r = rgb[..., 0].astype(np.int16)
    g = rgb[..., 1].astype(np.int16)
    b = rgb[..., 2].astype(np.int16)
    return (r > g + 14) & (r > b + 22) & (r > 80)


def _runs(xs, gap=6):
    if len(xs) == 0:
        return []
    out = []
    start = prev = int(xs[0])
    for x in xs[1:]:
        x = int(x)
        if x - prev > gap:
            out.append((start, prev))
            start = x
        prev = x
    out.append((start, prev))
    return out


def build_sprite(still_path):
    rgb = np.asarray(Image.open(still_path).convert('RGB'))
    # Below the hat. y=1660 is the lower thigh; the shoes end before the floor glow.
    y0, y1 = 1660, 2290
    crop = rgb[y0:y1]
    neutral = _neutral(crop)
    bright = crop.sum(axis=2) > 140
    shin = neutral[160:300] & (crop[160:300].sum(axis=2) > 120)
    col = shin.mean(axis=0)
    xs = np.where(col > 0.2)[0]
    runs = [r for r in _runs(xs, 14) if r[1] - r[0] > 30]
    runs.sort()
    if len(runs) < 2:
        raise SystemExit('could not find two legs in the still')
    left, right = runs[0], runs[-1]
    # A few pixels of the grey edge, but not the hat between the legs.
    bands = []
    for x0, x1 in (left, right):
        bands.append((max(0, x0 - 6), min(crop.shape[1] - 1, x1 + 6)))
    mask = np.zeros(crop.shape[:2], dtype=bool)
    for x0, x1 in bands:
        mask[:, x0:x1 + 1] = True
    # Centre gap is where the still's hat lives. Keep it empty.
    mask[:, left[1] + 2:right[0] - 2] = False
    dark = crop.sum(axis=2) < 70
    keep = mask & ~_warm(crop) & (neutral | dark)
    alpha = keep.astype(np.uint8) * 255
    return crop, alpha, y0, left, right


def _leg_columns(rgb, y0, y1):
    sl = rgb[y0:y1]
    white = _neutral(sl) & (sl.sum(axis=2) > 90) & ~_warm(sl)
    col = white.mean(axis=0)
    xs = np.where(col > 0.08)[0]
    runs = [r for r in _runs(xs, 8) if r[1] - r[0] >= 12]
    lefts = [r for r in runs if (r[0] + r[1]) / 2.0 < 250]
    rights = [r for r in runs if (r[0] + r[1]) / 2.0 > 250]
    if not lefts or not rights:
        return None
    return lefts[0], rights[-1]


def frame_pose(rgb):
    """Head top, the y the legs are cut at, and the two thigh columns."""
    ink = rgb.sum(axis=2) > 50
    ys = np.where(ink.sum(axis=1) > 6)[0]
    head = int(ys[0]) if len(ys) else 0
    h = rgb.shape[0]
    cols = None
    for top in (h - 50, h - 90, h - 140):
        cols = _leg_columns(rgb, max(0, top), h)
        if cols:
            break
    cut = h - 1
    if cols:
        (l0, l1), (r0, r1) = cols
        left_rows = np.where(ink[:, l0:l1 + 1].sum(axis=1) > 2)[0]
        right_rows = np.where(ink[:, r0:r1 + 1].sum(axis=1) > 2)[0]
        rows = left_rows if len(left_rows) >= len(right_rows) else right_rows
        if len(rows):
            cut = int(rows.max())
    return head, cut, cols


def extend_all(source_dir=None, preview=None):
    crop, alpha, y0, sleft, sright = build_sprite(STILL)
    s_spacing = ((sright[0] + sright[1]) - (sleft[0] + sleft[1])) / 2.0
    src_dir = source_dir or FRAMES
    names = sorted(glob.glob(os.path.join(src_dir, 'f*.jpg')))
    decoded = []
    spacings = []
    for name in names:
        rgb = np.asarray(Image.open(name).convert('RGB'))
        # Original motion is 640 tall. A previous composite is taller; ignore that.
        if rgb.shape[0] != 640:
            raise SystemExit('%s is %s, expected the 480x640 motion frame' % (name, rgb.shape))
        head, cut, cols = frame_pose(rgb)
        decoded.append((name, rgb, head, cut, cols))
        if cols:
            (l0, l1), (r0, r1) = cols
            spacings.append(((r0 + r1) - (l0 + l1)) / 2.0)
    scale = (float(np.median(spacings)) / s_spacing) if spacings else 0.35
    shoe_rows = np.where(alpha.sum(axis=1) > 20)[0]
    shoe_bottom = int(shoe_rows.max()) if len(shoe_rows) else crop.shape[0] - 1
    # First bright row of each leg. Everything above it is tucked under the thigh.
    def bright_row_for(x0, x1):
        for i in range(crop.shape[0]):
            sel = alpha[i, x0:x1 + 1] > 0
            if int(sel.sum()) < 8:
                continue
            if float(crop[i, x0:x1 + 1][sel].mean()) > 130:
                return i
        return 0
    bright_rows = (bright_row_for(*sleft), bright_row_for(*sright))
    strips = (
        (crop[:, sleft[0]:sleft[1] + 1], alpha[:, sleft[0]:sleft[1] + 1], sleft[1] - sleft[0] + 1, bright_rows[0]),
        (crop[:, sright[0]:sright[1] + 1], alpha[:, sright[0]:sright[1] + 1], sright[1] - sright[0] + 1, bright_rows[1]),
    )

    # Each leg is scaled to its own thigh and hung from that thigh's cut,
    # so a bow that drops the knees also drops the shoes.
    placements = []
    max_bottom = 0
    for name, rgb, head, cut, cols in decoded:
        if not cols:
            placements.append(None)
            continue
        legs = []
        for (x0, x1), (srgb, salpha, swidth, brow) in zip(cols, strips):
            fw = max(8, x1 - x0 + 1)
            # Same scale on both axes so the shin is not squashed. Clamped so a
            # wide knee does not blow the shoe up, and a thin crop does not
            # leave a hairline leg.
            sy = float(np.clip(fw / float(swidth), 0.40, 0.55))
            leg_h = max(1, int(round(srgb.shape[0] * sy)))
            leg_w = max(1, int(round(swidth * sy)))
            # Hang from the bottom of the wide thigh, not the last faint pixel.
            # A bow that reveals the knee moves this point down, shoes with it.
            join_y = int(cut)
            ink_col = rgb[:, x0:x1 + 1].sum(axis=-1) > 36
            bottoms = []
            for x in range(ink_col.shape[1]):
                ys = np.where(ink_col[:, x])[0]
                if len(ys) > 8:
                    bottoms.append(int(ys[-1]))
            if bottoms:
                # The thigh's lower edge is concave. Meet the higher part of
                # that edge so the shin is not left hanging under a notch.
                join_y = int(np.percentile(bottoms, 30))
            dest_y = join_y - 80
            dest_x = int(round((x0 + x1) / 2.0 - leg_w / 2.0))
            bottom = dest_y + leg_h
            max_bottom = max(max_bottom, bottom)
            legs.append((dest_x, dest_y, join_y, leg_w, leg_h, x0, x1))
        placements.append(legs)
    canvas_h = max_bottom + PAD

    # One vertical scale keeps the shoes a steady length. Width is per thigh.
    base_strips = []
    for srgb, salpha, swidth, brow in strips:
        leg_h = max(1, int(round(srgb.shape[0] * scale)))
        im = Image.fromarray(np.dstack([srgb, salpha]), 'RGBA')
        base_strips.append((im, brow, swidth))

    out_dir = preview or FRAMES
    os.makedirs(out_dir, exist_ok=True)
    report = []
    for (name, rgb, head, cut, cols), place in zip(decoded, placements):
        canvas = np.zeros((canvas_h, rgb.shape[1], 3), dtype=np.float32)
        if place:
            for (dest_x, dest_y, join_y, leg_w, leg_h, x0, x1), (im, brow, swidth) in zip(place, base_strips):
                resized = im.resize((leg_w, leg_h), Image.LANCZOS)
                # Feather the top so the shin eases into the thigh instead of a step.
                arr = np.asarray(resized).astype(np.float32)
                # A short fade only, hidden under the thigh. The visible edge is solid.
                fade = np.clip(np.arange(arr.shape[0]) / 8.0, 0.0, 1.0).astype(np.float32)
                arr[..., 3] *= fade[:, None]
                sample = rgb[max(0, cut - 16):cut + 1, x0:x1 + 1]
                ok = _neutral(sample) & (sample.sum(axis=2) > 120)
                frame_white = sample[ok].mean(axis=0) if ok.any() else np.array([150.0, 150.0, 152.0])
                top = arr[:12, :, :3]
                ta = arr[:12, :, 3]
                still_white = top[ta > 40].mean(axis=0) if (ta > 40).any() else frame_white
                gain = np.clip(frame_white / np.maximum(still_white, 1.0), 0.75, 1.15)
                arr[..., :3] *= gain
                sx0 = max(0, -dest_x)
                sy0 = max(0, -dest_y)
                dx0 = max(0, dest_x)
                dy0 = max(0, dest_y)
                pw = min(arr.shape[1] - sx0, canvas.shape[1] - dx0)
                ph = min(arr.shape[0] - sy0, canvas.shape[0] - dy0)
                if pw > 0 and ph > 0:
                    sub = arr[sy0:sy0 + ph, sx0:sx0 + pw]
                    a = sub[..., 3:4] / 255.0
                    dst = canvas[dy0:dy0 + ph, dx0:dx0 + pw]
                    canvas[dy0:dy0 + ph, dx0:dx0 + pw] = sub[..., :3] * a + dst * (1.0 - a)
        # Fill the black knee sockets so the new shin cannot show through them.
        # The shin is visible only below the real silhouette.
        ink = rgb.sum(axis=2) > 36
        body = ink.copy()
        for x in range(body.shape[1]):
            ys = np.where(ink[:, x])[0]
            if len(ys) > 8:
                body[int(ys[0]):int(ys[-1]) + 1, x] = True
        canvas[:rgb.shape[0]] = np.where(body[..., None], rgb, canvas[:rgb.shape[0]])
        out = np.clip(canvas, 0, 255).astype(np.uint8)
        Image.fromarray(out, 'RGB').save(
            os.path.join(out_dir, os.path.basename(name)), quality=74, optimize=True)
        report.append((head, cut, os.path.basename(name)))
    report.sort()
    return {
        'canvas': (480, canvas_h),
        'scale': round(scale, 4),
        'highest_head': report[0],
        'lowest_head': report[-1],
        'count': len(decoded),
    }


if __name__ == '__main__':
    print(extend_all())
