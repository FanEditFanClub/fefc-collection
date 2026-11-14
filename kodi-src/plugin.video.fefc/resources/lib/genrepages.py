"""Genre grid: clean names, alphabetical pages of nine.

A tile shows the genre name only. Counts, badges, and a leading number
such as "01 - " are not part of the name. Pages are filled left to right,
top to bottom. The last page may be short. No other page has an empty slot.
"""
import re

PER_PAGE = 9

_PREFIX = re.compile(r'^\s*\d+\s*[-–—.:)]\s*')
_COUNT = re.compile(r'\s*(?:[\(\[]\s*\d+\s*[\)\]]|#\d+|\d+)\s*$')


def clean_genre_name(name):
    """Drop a numeric prefix and any trailing count or badge."""
    if name is None:
        return ''
    if not isinstance(name, str):
        name = str(name)
    s = name.strip()
    s = _PREFIX.sub('', s)
    # The listing used to append "  (42)". Take that off, then a single badge.
    s = _COUNT.sub('', s)
    s = _COUNT.sub('', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s or name.strip()


def genre_pages(names, per_page=PER_PAGE):
    """names: original genre keys. Returns pages of (label, key), A–Z by label.

    Uncategorized is last. Unsorted is not its own tile. The original key is
    what the genre route looks up; the label is what the tile shows.
    per_page is coerced to int (bad input falls back to PER_PAGE) and
    clamped to >= 1.
    """
    try:
        per_page = int(per_page)
    except (TypeError, ValueError):
        per_page = PER_PAGE
    if per_page < 1:
        per_page = 1
    rows = []
    seen = set()
    for raw in names or []:
        if raw in ('Unsorted',):
            continue
        label = clean_genre_name(raw)
        if not label or label.lower() == 'unsorted':
            continue
        # Dedupe by cleaned label alone: the first raw key wins and keeps
        # its key. ("01 - Action" and "Action" clean to the same label and
        # must tile once, not twice.)
        key = label.casefold()
        if key in seen:
            continue
        seen.add(key)
        rows.append((label, raw))

    def sort_key(pair):
        label = pair[0].casefold()
        if label == 'uncategorized':
            return (1, label)
        return (0, label)

    rows.sort(key=sort_key)
    if not rows:
        return []
    return [rows[i:i + per_page] for i in range(0, len(rows), per_page)]
