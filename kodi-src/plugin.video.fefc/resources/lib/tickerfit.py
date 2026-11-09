"""Pad ticker text to a fixed pixel width so a skin slide can loop without a jump.

Kodi label scroll bounces, and rewriting the string every frame stutters a Fire Stick
while the home wall is decoding. The skin slides two copies of this string by SLOT
pixels on a linear loop. Width comes from the Jura advances (no Pillow on device).
"""
import os
import re
import struct

SLOT = 16000
FONT_SIZE = 27
_COLOR = re.compile(r'\[/?COLOR[^\]]*\]')
_CACHE = {}


def strip_colors(text):
    return _COLOR.sub('', text or '')


def _tables(data):
    count = struct.unpack('>H', data[4:6])[0]
    out = {}
    for i in range(count):
        off = 12 + i * 16
        tag, _cs, toff, tlen = struct.unpack('>4sIII', data[off:off + 16])
        out[tag] = data[toff:toff + tlen]
    return out


def load_font(path):
    path = os.path.abspath(path)
    cached = _CACHE.get(path)
    if cached:
        return cached
    data = open(path, 'rb').read()
    tables = _tables(data)
    upem = struct.unpack('>H', tables[b'head'][18:20])[0]
    nmetrics = struct.unpack('>H', tables[b'hhea'][34:36])[0]
    hmtx = tables[b'hmtx']
    advances = []
    for i in range(nmetrics):
        adv, _lsb = struct.unpack('>Hh', hmtx[i * 4:i * 4 + 4])
        advances.append(adv)
    num_glyphs = struct.unpack('>H', tables[b'maxp'][4:6])[0]
    if len(advances) < num_glyphs and advances:
        advances.extend([advances[-1]] * (num_glyphs - len(advances)))
    cmap = tables[b'cmap']
    ntab = struct.unpack('>H', cmap[2:4])[0]
    rec = None
    for i in range(ntab):
        plat, enc, off = struct.unpack('>HHI', cmap[4 + i * 8:4 + i * 8 + 8])
        if plat == 3 and enc in (1, 10):
            rec = off
            if enc == 1:
                break
    mapping = {}
    if rec is not None:
        fmt = struct.unpack('>H', cmap[rec:rec + 2])[0]
        if fmt == 4:
            segc = struct.unpack('>H', cmap[rec + 6:rec + 8])[0] // 2
            end_at = rec + 14
            ends = struct.unpack('>%dH' % segc, cmap[end_at:end_at + 2 * segc])
            start_at = end_at + 2 * segc + 2
            starts = struct.unpack('>%dH' % segc, cmap[start_at:start_at + 2 * segc])
            delta_at = start_at + 2 * segc
            deltas = struct.unpack('>%dh' % segc, cmap[delta_at:delta_at + 2 * segc])
            range_at = delta_at + 2 * segc
            rangeoffs = struct.unpack('>%dH' % segc, cmap[range_at:range_at + 2 * segc])
            for i in range(segc):
                if ends[i] == 0xFFFF and starts[i] == 0xFFFF:
                    continue
                for cp in range(starts[i], ends[i] + 1):
                    if rangeoffs[i] == 0:
                        gid = (cp + deltas[i]) & 0xFFFF
                    else:
                        roff = range_at + 2 * i + rangeoffs[i] + 2 * (cp - starts[i])
                        gid = struct.unpack('>H', cmap[roff:roff + 2])[0]
                        if gid:
                            gid = (gid + deltas[i]) & 0xFFFF
                    mapping[cp] = gid
    loaded = (upem, advances, mapping)
    _CACHE[path] = loaded
    return loaded


def text_width(text, font_path, size=FONT_SIZE):
    upem, advances, mapping = load_font(font_path)
    scale = float(size) / float(upem)
    space = advances[mapping.get(32, 0)] if advances else 0
    total = 0
    for ch in text:
        gid = mapping.get(ord(ch))
        adv = advances[gid] if gid is not None and gid < len(advances) else space
        total += adv
    return total * scale


def fit_loop(text, font_path, slot=SLOT, size=FONT_SIZE):
    """Repeat the line, then pad with spaces, so the visible width is one slide slot."""
    raw = ' '.join(str(text or '').split()) or 'Loading community news...'
    if not raw.endswith('•'):
        unit = raw + '    •    '
    else:
        unit = raw + '    '
    out = ''
    # Whole copies only, and never more than a handful: a 900-character line already
    # fills most of the slot, and a second copy would blow past it.
    for _ in range(8):
        if text_width(strip_colors(out + unit), font_path, size) > slot and out:
            break
        out += unit
        if text_width(strip_colors(out), font_path, size) >= slot:
            break
    space = text_width(' ', font_path, size) or 1
    guard = 0
    while text_width(strip_colors(out), font_path, size) + space <= slot and guard < 4000:
        out += ' '
        guard += 1
    return out
