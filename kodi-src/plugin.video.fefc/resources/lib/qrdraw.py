"""Square QR PNG with a module quiet zone and a centered FEFC mark. No Kodi imports."""
import os
import struct
import zlib


def _png_rgb(path, rows):
    h, w = len(rows), len(rows[0]) // 3
    if h != w:
        raise ValueError('QR image must be square, got %sx%s' % (w, h))
    raw = b''.join(b'\x00' + r for r in rows)

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    data = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(data)
    return path


def _logo_path():
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(here, '..', 'media', 'fefc-logo.png'),
        os.path.join(here, '..', '..', '..', '..', 'assets', 'fefc-logo.png'),
    ]
    for p in candidates:
        p = os.path.normpath(p)
        if os.path.exists(p):
            return p
    return ''


def _read_rgba(path):
    """8-bit non-interlaced RGB or RGBA PNG -> (w, h, pixels of (r,g,b,a))."""
    data = open(path, 'rb').read()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('not a png')
    i = 8
    w = h = bit = ct = None
    idat = []
    while i < len(data):
        n = struct.unpack('>I', data[i:i + 4])[0]
        tag = data[i + 4:i + 8]
        chunk = data[i + 8:i + 8 + n]
        if tag == b'IHDR':
            w, h, bit, ct, comp, filt, inter = struct.unpack('>IIBBBBB', chunk)
            if bit != 8 or inter or ct not in (2, 6):
                raise ValueError('unsupported png')
        elif tag == b'IDAT':
            idat.append(chunk)
        elif tag == b'IEND':
            break
        i += 12 + n
    raw = zlib.decompress(b''.join(idat))
    bpp = 3 if ct == 2 else 4
    stride = w * bpp
    rows = []
    prev = bytearray(stride)
    pos = 0
    for _y in range(h):
        filt = raw[pos]
        pos += 1
        row = bytearray(raw[pos:pos + stride])
        pos += stride
        if filt == 1:
            for x in range(stride):
                left = row[x - bpp] if x >= bpp else 0
                row[x] = (row[x] + left) & 255
        elif filt == 2:
            for x in range(stride):
                row[x] = (row[x] + prev[x]) & 255
        elif filt in (3, 4):
            for x in range(stride):
                left = row[x - bpp] if x >= bpp else 0
                up = prev[x]
                if filt == 3:
                    row[x] = (row[x] + ((left + up) // 2)) & 255
                else:
                    ul = prev[x - bpp] if x >= bpp else 0
                    p = left + up - ul
                    pa, pb, pc = abs(p - left), abs(p - up), abs(p - ul)
                    pr = left if pa <= pb and pa <= pc else up if pb <= pc else ul
                    row[x] = (row[x] + pr) & 255
        elif filt != 0:
            raise ValueError('png filter %s' % filt)
        prev = row
        pix = []
        if ct == 2:
            for x in range(0, stride, 3):
                pix.append((row[x], row[x + 1], row[x + 2], 255))
        else:
            for x in range(0, stride, 4):
                pix.append((row[x], row[x + 1], row[x + 2], row[x + 3]))
        rows.append(pix)
    return w, h, rows


def _stamp_logo(rows, px, quiet, modules):
    """Center the FEFC mark on a white pad. The source logo is white-on-transparent,
    so the mark is drawn in black on that white pad (otherwise it would vanish).
    The pad stays inside the data area; the quiet zone is left alone. Error
    correction H covers the covered modules."""
    path = _logo_path()
    if not path:
        return
    try:
        lw, lh, logo = _read_rgba(path)
    except Exception:
        return
    # About a fifth of the symbol, on the module grid, plus a one-module white margin.
    box = max(7, int(modules * 0.20))
    if box % 2 == 0:
        box += 1
    pad = 1
    span = box + pad * 2
    if span >= modules - 8:
        return
    origin = quiet + (modules - span) // 2
    side = len(rows)

    def put(mod_x, mod_y, rgb):
        x0 = mod_x * px
        y0 = mod_y * px
        blob = bytes(rgb) * px
        for yy in range(y0, min(side, y0 + px)):
            row = bytearray(rows[yy])
            row[x0 * 3:(x0 + px) * 3] = blob
            rows[yy] = bytes(row)

    for my in range(origin, origin + span):
        for mx in range(origin, origin + span):
            put(mx, my, (255, 255, 255))
    # sample the logo into `box` modules
    for my in range(box):
        for mx in range(box):
            sx = min(lw - 1, int((mx + 0.5) * lw / box))
            sy = min(lh - 1, int((my + 0.5) * lh / box))
            r, g, b, a = logo[sy][sx]
            if a < 40:
                continue
            put(origin + pad + mx, origin + pad + my, (0, 0, 0))


def rgb_rows(url, size=600, quiet=4):
    """Return (rows, info). Quiet zone is `quiet` modules of white on every side.
    Error correction is H so the centered logo still scans."""
    if quiet < 4:
        raise ValueError('quiet zone must be at least 4 modules')
    try:
        from . import segno
    except ImportError:
        import segno
    matrix = [list(r) for r in segno.make(url, error='h').matrix]
    nmod = len(matrix)
    n = nmod + quiet * 2
    px = max(1, int(size) // n)
    side = n * px
    white = b'\xff\xff\xff' * px
    black = b'\x00\x00\x00' * px
    rows = []
    for y in range(n):
        if y < quiet or y >= n - quiet:
            line = white * n
        else:
            my = y - quiet
            parts = []
            for x in range(n):
                if x < quiet or x >= n - quiet:
                    parts.append(white)
                else:
                    parts.append(black if matrix[my][x - quiet] else white)
            line = b''.join(parts)
        rows.extend([line] * px)
    _stamp_logo(rows, px, quiet, nmod)
    info = {'modules': nmod, 'quiet': quiet, 'px': px, 'side': side, 'error': 'H'}
    return rows, info


def write_qr_png(path, url, size=600, quiet=4):
    rows, info = rgb_rows(url, size=size, quiet=quiet)
    _png_rgb(path, rows)
    info['path'] = path
    return info
