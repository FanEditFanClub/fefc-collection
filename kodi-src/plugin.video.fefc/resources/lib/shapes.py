"""The only place a listing decides landscape versus portrait.

A collection, a folder, and every utility button is a landscape card. That
includes Sort, Shuffle, Back/Up, Support Us, Read Me, Read First, Check for
update, Link/Sync My List, Recently Opened, Downloads, and the same kind of
non-video control. Only an actual video file is a portrait poster. The rule
does not depend on which view Kodi last saved, on Container.Content, or on
which item is focused.

Kodi picks one item layout for a whole container from the focused item, and a
wraplist is a single column, not a grid. That is why the rule kept flipping:
opening a mixed folder focused a folder, so every video drew as a landscape
card, and moving onto a video flipped the whole grid the other way. A saved
view (or a directory served from cache, which does not re-run the plugin)
could also put videos back on the landscape-only panel.

Both browser views are the same 6-across panel. The cell is always the
landscape row height. A portrait poster is taller than one cell, so pack()
reserves the cells underneath it. Those cells are not a blank band: the poster
is drawn down across them, and the next real row starts where the poster ends.
"""

KIND_FOLDER = 'folder'
KIND_ACTION = 'action'
KIND_VIDEO = 'video'
KIND_SPACER = 'spacer'

LANDSCAPE = 'landscape'
PORTRAIT = 'portrait'

# MyVideoNav.xml panel. Both view 500 and view 501 use these numbers.
COLS = 6
CELL_W = 283
CELL_H = 150
# A poster is taller than one row and shorter than this many rows, so the
# reserved cells below it are covered by the poster instead of left empty.
SPAN = 3
VIEW_ID = 501

ROW_H = {LANDSCAPE: CELL_H, PORTRAIT: CELL_H * SPAN}


def kind_for_container(is_container):
    """Catalog flag v[2] is true for a folder. A file is a video."""
    return KIND_FOLDER if is_container else KIND_VIDEO


def shape_for_kind(kind):
    """Portrait is only a video file. A missing kind is Kodi's Back/Up row.
    folder and action (Sort, Shuffle, Support Us, Read Me, Check for update,
    and the same buttons) are landscape cards."""
    if kind == KIND_VIDEO:
        return PORTRAIT
    if kind == KIND_SPACER:
        return KIND_SPACER
    return LANDSCAPE


def listing_mode(has_video):
    """Always the same panel. Content still says movies when a video is present
    so playable items keep movie info, but the view id does not change with it.
    View 500 is the same panel, so a view Kodi remembered cannot flip a tile."""
    return {
        'content': 'movies' if has_video else 'files',
        'view': VIEW_ID,
        'cols': COLS,
        'wrap': False,
    }


def stamp(li, kind, art=''):
    """Set the property and the art key the skin reads. One call replaces the
    whole art map, so a video cannot keep a landscape key and a folder cannot
    keep a poster key. The directory cache stores both the property and the art."""
    if kind == KIND_VIDEO:
        li.setProperty('fefc_kind', KIND_VIDEO)
        li.setArt({'poster': art or '', 'thumb': art or '', 'icon': art or '', 'landscape': ''})
        return
    if kind == KIND_SPACER:
        li.setProperty('fefc_kind', KIND_SPACER)
        li.setArt({'poster': '', 'landscape': '', 'thumb': '', 'icon': ''})
        return
    use = kind if kind in (KIND_FOLDER, KIND_ACTION) else KIND_FOLDER
    li.setProperty('fefc_kind', use)
    li.setArt({
        'landscape': art or '', 'thumb': art or '', 'icon': art or '',
        'fanart': art or '', 'poster': '',
    })


def pack(kinds):
    """Lay kinds into the 6-across grid without reordering them.

    A video reserves the cells under it (SPAN - 1 rows, same column). The next
    real item goes in the next free cell, so a folder never sits underneath a
    poster and a poster never shares its column with the next row.
    """
    rows = []

    def ensure(r):
        while len(rows) <= r:
            rows.append([None] * COLS)

    r = c = 0
    for kind in kinds:
        while True:
            ensure(r)
            if rows[r][c] is None:
                break
            c += 1
            if c == COLS:
                c = 0
                r += 1
        rows[r][c] = KIND_VIDEO if kind == KIND_VIDEO else kind
        if kind == KIND_VIDEO:
            for k in range(1, SPAN):
                ensure(r + k)
                if rows[r + k][c] is None:
                    rows[r + k][c] = KIND_SPACER
        c += 1
        if c == COLS:
            c = 0
            r += 1
    flat = []
    for ri, row in enumerate(rows):
        last = -1
        for i, cell in enumerate(row):
            if cell is not None:
                last = i
        if last < 0:
            continue
        end = COLS if ri < len(rows) - 1 else last + 1
        for i in range(end):
            flat.append(row[i] if row[i] is not None else KIND_SPACER)
    return flat


def audit(slots):
    """Problems in a packed grid. Empty means every folder/tool is a landscape
    cell, every video is a portrait cell, and no real item sits in a hole."""
    if not slots:
        return ['empty']
    width = COLS
    rows = []
    for i in range(0, len(slots), width):
        row = list(slots[i:i + width])
        if len(row) < width:
            row.extend([None] * (width - len(row)))
        rows.append(row)
    errors = []
    for r, row in enumerate(rows):
        for c, kind in enumerate(row):
            if kind in (None, KIND_SPACER):
                continue
            shape = shape_for_kind(kind)
            if kind == KIND_VIDEO and shape != PORTRAIT:
                errors.append('video not portrait r%d c%d' % (r, c))
            if kind != KIND_VIDEO and shape != LANDSCAPE:
                errors.append('folder not landscape r%d c%d %s' % (r, c, kind))
            if kind == KIND_VIDEO:
                for k in range(1, SPAN):
                    if r + k >= len(rows):
                        break
                    below = rows[r + k][c]
                    if below != KIND_SPACER:
                        errors.append('poster covered r%d c%d by %s' % (r + k, c, below))
    # A spacer with a real item further down the same column, and no poster
    # above it, is a blank hole between two rows of tiles.
    for c in range(width):
        for r in range(len(rows)):
            if rows[r][c] != KIND_SPACER:
                continue
            covered = False
            for back in range(1, SPAN):
                if r - back >= 0 and rows[r - back][c] == KIND_VIDEO:
                    covered = True
                    break
            if covered:
                continue
            later = False
            for rr in range(r + 1, len(rows)):
                if rows[rr][c] not in (None, KIND_SPACER):
                    later = True
                    break
            if later:
                errors.append('blank gap col %d row %d' % (c, r))
    return errors


def skip_delta(pos, origin, lookup):
    """Where to send focus when it lands on a reserved poster cell.

    pos is the absolute index. lookup(i) returns the kind, or None past either
    end. origin is the previous index (None if unknown). Returns None when the
    current cell is a real tile, a relative delta to a real tile, or 'menu'
    when moving down off the last row.
    """
    if lookup(pos) != KIND_SPACER:
        return None
    delta = 0 if origin is None else pos - origin
    direction = 1 if delta >= 0 else -1
    for step in range(1, 36):
        j = pos + direction * step
        k = lookup(j)
        if not k:
            break
        if k != KIND_SPACER:
            return j - pos
    if direction > 0 and (origin is None or delta > 1):
        return 'menu'
    for step in range(1, 36):
        j = pos - direction * step
        k = lookup(j)
        if k and k != KIND_SPACER:
            return j - pos
    return 'menu'
