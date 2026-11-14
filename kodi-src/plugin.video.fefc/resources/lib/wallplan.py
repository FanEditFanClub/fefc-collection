"""Home mosaic cell geometry. 1920x1080, same 400x200 cells and 12px gaps as the menu.

Outer 5x5 lattice. The centre 3x3 is the menu (left black in the rendered loop).
Video fills the perimeter: five along the top, five along the bottom, and five down
each side (the corners belong to both the end rows and the side columns, so three
cells sit beside the middle menu rows).

That perimeter has 16 cells, but mosaic_cells() returns 10: it leaves out the three
centre cells of the top row and the three centre cells of the bottom row, which sit
behind the wordmark and the menu bar. What is left is the left column and the right
column, five cells each, listed row by row (top to bottom), left cell then right cell.

Geometry facts, pinned by tests. Change them only together with Home.xml and the tests:
  - Columns start at x = -64, 348, 760, 1172, 1584. The outer two bleed 64 px off the
    1920 wide screen on each side (-64..336 and 1584..1984), so the lattice is centred
    on x = 960.
  - Rows start at y = 0, 212, 424, 636, 848. The menu group sits at (348, 212) in
    Home.xml and the lattice is built around it, so the bottom row ends at y = 1048,
    32 px above the bottom edge, and the lattice centre is y = 524, not 540.
  - Only skip_button() is laid out inside the 5% safe area (x 96..1824, y 54..1026).
    The mosaic itself runs to the screen edges.

The menu origin must match Home.xml, and the SKIP numbers must match the fallback in
service.py (SkipIntro uses 1540, 910, 260, 92 if this module cannot be imported).
"""

TW, TH, GP = 400, 200, 12
# Menu origin matches Home.xml group (348, 212).
MENU_X = (348, 760, 1172)
MENU_Y = (212, 424, 636)


def mosaic_cells():
    """Perimeter cells, minus the three centre cells of the top row and the three
    centre cells of the bottom row. Those sit behind the wordmark and the menu bar.

    Returns exactly 10 (x, y, w, h) tuples, each w, h = 400, 200: x is -64 or 1584, y is
    0, 212, 424, 636 or 848. Callers may rely on the count and the order."""
    cols = (MENU_X[0] - TW - GP,) + MENU_X + (MENU_X[2] + TW + GP,)
    rows = (MENU_Y[0] - TH - GP,) + MENU_Y + (MENU_Y[2] + TH + GP,)
    top, bot = rows[0], rows[-1]
    mid = set(MENU_X)
    cells = []
    for y in rows:
        for x in cols:
            if x in mid and y in MENU_Y:
                continue
            if y in (top, bot) and x in mid:
                continue
            cells.append((x, y, TW, TH))
    return cells


def skip_button():
    """Bottom-right SKIP inside the 5% safe area (x 96..1824, y 54..1026).

    Returns (x, y, w, h) = (1540, 910, 260, 92): 24 px in from the right edge of the safe
    area (1824) and 24 px up from its bottom edge (1026). service.py keeps a copy of these
    four numbers as its fallback, so change both together."""
    w, h = 260, 92
    x = 1824 - w - 24
    y = 1026 - h - 24
    return x, y, w, h
