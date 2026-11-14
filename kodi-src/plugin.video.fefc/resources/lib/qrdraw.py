"""Square QR PNG with a module quiet zone and a centered FEFC mark. No Kodi imports.

Sizes: `size` is a target in pixels, not a promise. Each module is drawn
px = size // total_modules pixels wide (never less than 1), so the real image is
side = total_modules * px pixels square. That is at most `size`, except that a code
with more modules than `size` pixels still gets one pixel per module and ends up larger.
info['side'] is the only authoritative width and height. The PNG header, the logo pad
and any layout code must use info['side'] (or len(rows)), never `size`.
"""
import os
import struct
import uuid
import zlib

_PNG_SIG = b'\x89PNG\r\n\x1a\n'
MAX_SIZE = 4096            # largest accepted `size`, in pixels
MAX_QUIET = 32             # largest accepted quiet zone, in modules
_MAX_LOGO_SIDE = 2048      # a logo PNG bigger than this is ignored (plain code, no mark)
_MAX_LOGO_BYTES = 8 * 1024 * 1024
_ALPHA_INK = 40            # alpha at or above this is mark (logos with transparency)
_LUM_INK = 48              # luminance distance from the background that is mark (opaque logos)


def _png_rgb(path, rows):
    """Write a square 8-bit RGB PNG. The file appears all at once or not at all:
    it is written to a temp name in the same folder, synced, then renamed over `path`."""
    if not path or not isinstance(path, str):
        raise ValueError('PNG path must be a non-empty string')
    rows = list(rows or [])
    if not rows:
        raise ValueError('QR image has no rows')
    first = rows[0]
    if not isinstance(first, (bytes, bytearray)) or not first or len(first) % 3:
        raise ValueError('QR row 0 is empty or not whole RGB pixels')
    stride = len(first)
    for i, r in enumerate(rows):
        if not isinstance(r, (bytes, bytearray)) or len(r) != stride:
            raise ValueError('QR row %d is ragged (want %d bytes)' % (i, stride))
    h, w = len(rows), stride // 3
    if h != w:
        raise ValueError('QR image must be square, got %sx%s' % (w, h))
    raw = b''.join(b'\x00' + bytes(r) for r in rows)

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    data = (_PNG_SIG + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    tmp = '%s.%s.tmp' % (path, uuid.uuid4().hex[:8])
    try:
        with open(tmp, 'wb') as f:
            f.write(data)
            f.flush()
            try:
                os.fsync(f.fileno())
            except OSError:
                pass            # some Android filesystems refuse fsync; the rename is still atomic
        os.replace(tmp, path)
    except BaseException:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise
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
    """8-bit non-interlaced RGB or RGBA PNG -> (w, h, rows of (r, g, b, a) tuples).

    A file that cannot be read raises OSError. Anything wrong with the PNG itself (bad
    signature, truncated or corrupt chunk, CRC mismatch, unsupported format, bad zlib
    data, unknown filter) raises ValueError, and nothing else."""
    with open(path, 'rb') as f:
        data = f.read(_MAX_LOGO_BYTES + 1)
    if len(data) > _MAX_LOGO_BYTES:
        raise ValueError('png too large')
    try:
        return _decode_png(data)
    except ValueError:
        raise
    except (struct.error, zlib.error, IndexError, TypeError, OverflowError) as exc:
        raise ValueError('bad png: %s' % exc)


def _decode_png(data):
    if data[:8] != _PNG_SIG:
        raise ValueError('not a png')
    pos, total = 8, len(data)
    head = None
    idat = []
    ended = False
    while pos + 12 <= total:
        n = struct.unpack('>I', data[pos:pos + 4])[0]
        tag = data[pos + 4:pos + 8]
        end = pos + 8 + n
        if end + 4 > total:
            raise ValueError('truncated png chunk %r' % tag)
        body = data[pos + 8:end]
        crc = struct.unpack('>I', data[end:end + 4])[0]
        if crc != (zlib.crc32(tag + body) & 0xffffffff):
            raise ValueError('png crc mismatch in %r' % tag)
        pos = end + 4
        if tag == b'IHDR':
            if head is not None or len(body) != 13:
                raise ValueError('bad png header')
            w, h, bit, ct, comp, filt, inter = struct.unpack('>IIBBBBB', body)
            if comp != 0 or filt != 0:
                raise ValueError('unsupported png compression or filter method')
            if bit != 8 or inter or ct not in (2, 6):
                raise ValueError('unsupported png')
            if not (0 < w <= _MAX_LOGO_SIDE and 0 < h <= _MAX_LOGO_SIDE):
                raise ValueError('png size %sx%s not supported' % (w, h))
            head = (w, h, ct)
        elif tag == b'IDAT':
            if head is None:
                raise ValueError('png data before header')
            idat.append(body)
        elif tag == b'IEND':
            ended = True
            break
    if head is None or not idat or not ended:
        raise ValueError('incomplete png')
    w, h, ct = head
    bpp = 3 if ct == 2 else 4
    stride = w * bpp
    need = h * (stride + 1)
    inflater = zlib.decompressobj()
    raw = inflater.decompress(b''.join(idat), need + 1)   # the cap stops a decompression bomb
    if len(raw) != need or not inflater.eof:
        raise ValueError('png image data has the wrong length')
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


def _protected(matrix):
    """Finder, timing, and alignment modules. The logo must not paint over these
    or a long code (the feedback form) stops scanning."""
    n = len(matrix)
    prot = set()

    def mark(x0, y0, w, h):
        for y in range(y0, y0 + h):
            for x in range(x0, x0 + w):
                if 0 <= x < n and 0 <= y < n:
                    prot.add((x, y))

    mark(0, 0, 8, 8)
    mark(n - 8, 0, 8, 8)
    mark(0, n - 8, 8, 8)
    for i in range(n):
        prot.add((i, 6))
        prot.add((6, i))
    for y in range(n - 4):
        for x in range(n - 4):
            if _is_alignment(matrix, x, y):
                mark(x, y, 5, 5)
    return prot


def _is_alignment(matrix, x, y):
    n = len(matrix)
    if x < 2 or y < 2 or x + 4 >= n or y + 4 >= n:
        return False
    # 5x5: dark border, light ring, dark center. Skip the three finders.
    if x < 10 and y < 10 or x > n - 15 and y < 10 or x < 10 and y > n - 15:
        return False
    for dy in range(5):
        for dx in range(5):
            dark = matrix[y + dy][x + dx]
            edge = dx in (0, 4) or dy in (0, 4)
            center = dx == 2 and dy == 2
            ring = not edge and not center
            if edge or center:
                if not dark:
                    return False
            elif ring and dark:
                return False
    return True


def _lum(px):
    return (299 * px[0] + 587 * px[1] + 114 * px[2]) // 1000


def _background_lum(logo, lw, lh):
    """Median luminance of the logo's border: what the mark is drawn on."""
    step_x = max(1, lw // 32)
    step_y = max(1, lh // 32)
    samples = []
    for x in range(0, lw, step_x):
        samples.append(_lum(logo[0][x]))
        samples.append(_lum(logo[lh - 1][x]))
    for y in range(0, lh, step_y):
        samples.append(_lum(logo[y][0]))
        samples.append(_lum(logo[y][lw - 1]))
    samples.sort()
    return samples[len(samples) // 2]


def _logo_ink(logo, lw, lh, box):
    """box x box grid of booleans: True where a module of the pad is mark.

    A logo with transparency (the shipped white-on-transparent mark) is keyed on alpha.
    A fully opaque logo has no alpha to key on, so it is keyed on luminance instead: a
    module is mark where the logo differs enough from its own background. Treating every
    opaque pixel as mark would stamp a solid black square over the middle of the code."""
    has_alpha = any(p[3] < 255 for line in logo for p in line)
    if has_alpha:
        def is_ink(p):
            return p[3] >= _ALPHA_INK
    else:
        bg = _background_lum(logo, lw, lh)

        def is_ink(p):
            return abs(_lum(p) - bg) >= _LUM_INK
    grid = []
    # One sample per module missed the strokes: the mark is a thin line, so a module is
    # ink when the patch of the logo it covers actually contains the mark.
    for my in range(box):
        y0 = int(my * lh / box)
        y1 = max(y0 + 1, int((my + 1) * lh / box))
        line_out = []
        for mx in range(box):
            x0 = int(mx * lw / box)
            x1 = max(x0 + 1, int((mx + 1) * lw / box))
            ink = 0
            count = 0
            for sy in range(y0, min(lh, y1)):
                line = logo[sy]
                for sx in range(x0, min(lw, x1)):
                    count += 1
                    if is_ink(line[sx]):
                        ink += 1
            line_out.append(bool(count) and ink / count >= 0.08)
        grid.append(line_out)
    return grid


def _stamp_logo(rows, px, quiet, modules, matrix):
    """Center the FEFC mark on a white pad. The source logo is white-on-transparent,
    so the mark is drawn in black on that white pad (otherwise it would vanish).
    The pad stays inside the data area; the quiet zone is left alone. Error
    correction H covers the covered modules. The logo is cosmetic: if it is missing,
    unreadable, or has no mark to draw, the code is left plain."""
    path = _logo_path()
    if not path:
        return
    try:
        lw, lh, logo = _read_rgba(path)
    except Exception:       # cosmetic only: never let a bad logo cost us the QR code itself
        return
    # About a fifth of the symbol, on the module grid, plus a one-module white margin.
    box = max(7, int(modules * 0.20))
    if box % 2 == 0:
        box += 1
    pad = 1
    span = box + pad * 2
    if span >= modules - 8:
        return
    ink = _logo_ink(logo, lw, lh, box)
    if not any(any(line) for line in ink):
        return              # nothing to draw: do not cover modules with an empty pad
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

    keep = _protected(matrix)
    for my in range(origin, origin + span):
        for mx in range(origin, origin + span):
            if (mx - quiet, my - quiet) in keep:
                continue
            put(mx, my, (255, 255, 255))
    for my in range(box):
        for mx in range(box):
            gx = origin + pad + mx
            gy = origin + pad + my
            if (gx - quiet, gy - quiet) in keep:
                continue
            if ink[my][mx]:
                put(gx, gy, (0, 0, 0))


def _segno_absent(exc):
    """True when `exc` says segno itself could not be found (not packaged, or this module
    was imported outside its package). False when segno was found and something inside it
    failed to import: that error has to surface, not be replaced by a second misleading one."""
    name = getattr(exc, 'name', None)
    if not name:
        return True
    if name == 'segno' or name.endswith('.segno'):
        return True
    text = str(exc)
    return "cannot import name 'segno'" in text or 'no known parent package' in text


def _load_segno():
    try:
        from . import segno
        return segno
    except ImportError as exc:
        if not _segno_absent(exc):
            raise
        try:
            import segno
            return segno
        except ImportError as exc2:
            raise ImportError('QR support is not installed: segno was not found (%s)' % exc2) from exc2


def _whole(name, value, low, high):
    if isinstance(value, bool):
        raise ValueError('%s must be a whole number, got %r' % (name, value))
    try:
        number = int(value)
    except (TypeError, ValueError, OverflowError):
        raise ValueError('%s must be a whole number, got %r' % (name, value))
    if number < low or number > high:
        raise ValueError('%s must be between %d and %d, got %d' % (name, low, high, number))
    return number


def rgb_rows(url, size=600, quiet=4):
    """Return (rows, info). Quiet zone is `quiet` modules of white on every side.
    Error correction is H so the centered logo still scans.

    rows is a list of `side` byte strings of `side * 3` RGB bytes. `size` is only a target
    (see the module note): info['side'] is the real width and height in pixels, info['px']
    the pixels per module, info['modules'] the symbol width without the quiet zone."""
    if not isinstance(url, str) or not url.strip():
        raise ValueError('QR url must be a non-empty string')
    size = _whole('size', size, 1, MAX_SIZE)
    quiet = _whole('quiet zone', quiet, -10 ** 6, MAX_QUIET)
    if quiet < 4:
        raise ValueError('quiet zone must be at least 4 modules')
    segno = _load_segno()
    try:
        matrix = [list(r) for r in segno.make(url, error='h').matrix]
    except ValueError as exc:       # segno's DataOverflowError is a ValueError
        raise ValueError('this URL does not fit in a QR code: %s' % exc)
    nmod = len(matrix)
    if not nmod or any(len(r) != nmod for r in matrix):
        raise ValueError('QR matrix is not square')
    n = nmod + quiet * 2
    px = max(1, size // n)
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
    _stamp_logo(rows, px, quiet, nmod, matrix)
    if len(rows) != side or any(len(r) != side * 3 for r in rows):
        raise ValueError('internal error: QR rows do not match side %d' % side)
    info = {'modules': nmod, 'quiet': quiet, 'px': px, 'side': side, 'error': 'H'}
    return rows, info


def write_qr_png(path, url, size=600, quiet=4):
    """Write the code to `path` and return info (see rgb_rows). Use info['side'] for the
    size of the image; `size` is only the target that was asked for."""
    if not path or not isinstance(path, str):
        raise ValueError('PNG path must be a non-empty string')
    rows, info = rgb_rows(url, size=size, quiet=quiet)
    _png_rgb(path, rows)
    info['path'] = path
    return info
