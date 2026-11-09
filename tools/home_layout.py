"""Home screen lattice shared by the pre-rendered wall and the skin.

1920x1080 is one 5x5 grid. Every cell is the same 352x198 (16:9) box.
The centre 3x3 is the menu. The other 16 cells are the video perimeter:
top five, bottom five, and five down each side including the corners
(three of those sit beside the menu rows). Nothing is placed off-screen,
so the corner cells are full tiles instead of a cropped sliver.
"""
W, H = 1920, 1080
COLS, ROWS = 5, 5
SLOT_W, SLOT_H = W // COLS, H // ROWS  # 384, 216
INSET_X, INSET_Y = 16, 9
CELL_W, CELL_H = SLOT_W - 2 * INSET_X, SLOT_H - 2 * INSET_Y  # 352, 198
HUB0, HUB1 = 1, 3


def cell_rect(col, row):
    return (col * SLOT_W + INSET_X, row * SLOT_H + INSET_Y, CELL_W, CELL_H)


def menu_block():
    """Black plate behind the 3x3, exactly the centre cells and the gutters between them."""
    x, y, w, h = cell_rect(HUB0, HUB0)
    x2, y2, w2, h2 = cell_rect(HUB1, HUB1)
    return x, y, (x2 + w2) - x, (y2 + h2) - y


def cells():
    """(col, row, x, y, w, h) for the 16 video cells, row-major."""
    out = []
    for row in range(ROWS):
        for col in range(COLS):
            if HUB0 <= col <= HUB1 and HUB0 <= row <= HUB1:
                continue
            x, y, w, h = cell_rect(col, row)
            out.append((col, row, x, y, w, h))
    return out


def on_side(col, row, side):
    if side == 'top':
        return row == 0
    if side == 'bottom':
        return row == ROWS - 1
    if side == 'left':
        return col == 0
    if side == 'right':
        return col == COLS - 1
    raise KeyError(side)
