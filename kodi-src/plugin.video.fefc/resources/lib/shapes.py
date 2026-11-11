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
landscape row height. Landscape cards fill their own rows. Videos then start
on the next row as a uniform portrait grid. A poster is taller than one cell,
so pack() reserves the cells underneath that whole video row. Those cells are
not a blank band: the poster and its title are drawn down across them, and the
next video row starts where the poster ends.
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
# A poster plus up to five wrapped title lines is taller than one row.
# Four rows keep that block inside the cells reserved under the poster,
# with a gap before the next poster so the titles cannot overlap it.
SPAN = 4
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
    """Landscape cards first, each in its own rows. Videos start on a fresh row.

    Back, Sort, Shuffle, folders and other actions stay in the order they were
    added, then every video, in the order it was added. A short landscape row
    is padded so the first video is in column 0. Each video row reserves the
    cells under it, so posters do not overlap the next row or sit in an
    offset column.
    """
    land = [k for k in kinds if k != KIND_VIDEO]
    vids = [KIND_VIDEO for k in kinds if k == KIND_VIDEO]
    rows = []
    if land:
        padded = list(land)
        if vids and len(padded) % COLS:
            padded.extend([KIND_SPACER] * (COLS - (len(padded) % COLS)))
        for i in range(0, len(padded), COLS):
            rows.append(padded[i:i + COLS])
    for i in range(0, len(vids), COLS):
        chunk = list(vids[i:i + COLS])
        if len(chunk) < COLS:
            chunk.extend([KIND_SPACER] * (COLS - len(chunk)))
        rows.append(chunk)
        for _ in range(SPAN - 1):
            rows.append([KIND_SPACER] * COLS)
    flat = []
    for row in rows:
        flat.extend(row)
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
            # The empty cells that finish a landscape row so videos start at
            # column 0. They are not a band between the two sections.
            line = rows[r]
            last_real = -1
            for i, cell in enumerate(line):
                if cell not in (None, KIND_SPACER):
                    last_real = i
            if last_real >= 0 and KIND_VIDEO not in line and c > last_real:
                continue
            later = False
            for rr in range(r + 1, len(rows)):
                if rows[rr][c] not in (None, KIND_SPACER):
                    later = True
                    break
            if later:
                errors.append('blank gap col %d row %d' % (c, r))
    return errors


def skip_delta(pos, origin, lookup, from_menu=False):
    """Where to send focus when it lands on a reserved or padding cell.

    pos is the absolute index. lookup(i) returns the kind, or None past either
    end. origin is the previous index (None if unknown). Returns None when the
    current cell is a real tile, a relative delta to a real tile, or 'menu'
    when moving down off the last row. A padding cell on a landscape row moves
    to a real tile on that row, or on to the portrait grid. Up from a poster
    cell returns to a real tile. Down off the last poster row reaches the menu.
    """
    if lookup(pos) != KIND_SPACER:
        return None
    # Focus coming back from the bottom bar has no in-grid origin. Treating that
    # as Down sent a trailing spacer straight back to the menu, so Up did nothing.
    if from_menu:
        delta = -1
        direction = -1
    else:
        delta = 0 if origin is None else pos - origin
        direction = 1 if delta >= 0 else -1
    covered = False
    for back in range(1, SPAN):
        if lookup(pos - back * COLS) == KIND_VIDEO:
            covered = True
            break

    def ahead(step_dir, limit):
        for step in range(1, limit):
            j = pos + step_dir * step
            k = lookup(j)
            if not k:
                return None
            if k != KIND_SPACER:
                return j - pos
        return None

    if not covered:
        row = (pos // COLS) * COLS
        for step in range(1, COLS):
            j = pos + direction * step
            if j < row or j >= row + COLS:
                break
            k = lookup(j)
            if k and k != KIND_SPACER:
                return j - pos
        # Nothing further that way. A video on this row (Down landed in the
        # empty part of the poster row) or the next real row still counts.
        found = ahead(direction, 48)
        if found is not None:
            return found
        for step in range(1, COLS):
            j = pos - direction * step
            if j < row or j >= row + COLS:
                break
            k = lookup(j)
            if k and k != KIND_SPACER:
                return j - pos
        if direction > 0:
            return None if from_menu else 'menu'
        found = ahead(-1, 48)
        if found is not None:
            return found
        return None if from_menu else 'menu'

    found = ahead(direction, 36)
    if found is not None:
        return found
    if direction > 0 and (origin is None or delta > 1) and not from_menu:
        return 'menu'
    found = ahead(-direction, 36)
    if found is not None:
        return found
    return None if from_menu else 'menu'
