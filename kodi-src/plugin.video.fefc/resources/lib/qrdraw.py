"""Square QR PNG with a module quiet zone. No Kodi imports."""
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


def rgb_rows(url, size=600, quiet=4):
    """Return (rows, info). Quiet zone is `quiet` modules of white on every side."""
    if quiet < 4:
        raise ValueError('quiet zone must be at least 4 modules')
    try:
        from . import segno
    except ImportError:
        import segno
    matrix = [list(r) for r in segno.make(url, error='m').matrix]
    n = len(matrix) + quiet * 2
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
    info = {'modules': len(matrix), 'quiet': quiet, 'px': px, 'side': side}
    return rows, info


def write_qr_png(path, url, size=600, quiet=4):
    rows, info = rgb_rows(url, size=size, quiet=quiet)
    _png_rgb(path, rows)
    info['path'] = path
    return info
