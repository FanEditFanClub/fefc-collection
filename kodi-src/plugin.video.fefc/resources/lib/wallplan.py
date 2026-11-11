"""Home mosaic cell geometry. 1920x1080, same 400x200 cells and 12px gaps as the menu.

Outer 5x5 lattice. The centre 3x3 is the menu (left black in the rendered loop).
Video fills the perimeter: five along the top, five along the bottom, and five down
each side (the corners belong to both the end rows and the side columns, so three
cells sit beside the middle menu rows).
"""

TW, TH, GP = 400, 200, 12
# Menu origin matches Home.xml group (348, 212).
MENU_X = (348, 760, 1172)
MENU_Y = (212, 424, 636)


def mosaic_cells():
    """Perimeter cells, minus the three centre cells of the top row and the three
    centre cells of the bottom row. Those sit behind the wordmark and the menu bar."""
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
    """Bottom-right SKIP inside the 5% safe area (x 96..1824, y 54..1026)."""
    w, h = 260, 92
    x = 1824 - w - 24
    y = 1026 - h - 24
    return x, y, w, h
