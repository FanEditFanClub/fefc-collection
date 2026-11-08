"""Surname order for Actors & Directors tiles.

Display keeps the natural name (no leading index and no trailing count). Sort uses the
surname, including particles and stripped suffixes, so Kodi can keep that order with
SORT_METHOD_UNSORTED instead of re-sorting the label by first name.
"""
import re
import unicodedata

_SUFFIX = {'jr', 'sr', 'ii', 'iii', 'iv', 'v', 'esq'}
_PARTICLE = {
    'van', 'von', 'de', 'da', 'del', 'della', 'di', 'la', 'le', 'du',
    'st', 'st.', 'bin', 'al', 'ten', 'ter', 'den', 'der', 'af', 'av',
    'mac', 'zu', 'dos', 'das', 'do', 'y',
}
_PREFIX_RE = re.compile(r'^\s*\d+\s*[-.:)]\s*')
_PREFIX_SPACE_RE = re.compile(r'^\s*\d+\s+(?=\S)')
_COUNT_RE = re.compile(r'\s*\(\d+\)\s*$')


def display_name(raw):
    """Natural name for a person tile. Drops a leading catalogue index and a trailing (count)."""
    s = _COUNT_RE.sub('', (raw or '').strip())
    s = _PREFIX_RE.sub('', s)
    s = _PREFIX_SPACE_RE.sub('', s)
    return re.sub(r'\s+', ' ', s).strip()


def _fold(s):
    s = unicodedata.normalize('NFD', s or '')
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return s.casefold()


def surname(raw):
    name = display_name(raw)
    tokens = name.split()
    while len(tokens) > 1 and tokens[-1].rstrip('.').casefold() in _SUFFIX:
        tokens.pop()
    if not tokens:
        return name
    if len(tokens) == 1:
        return tokens[0]
    i = len(tokens) - 1
    while i > 0 and tokens[i - 1].casefold().rstrip('.') in _PARTICLE:
        i -= 1
    if i == 0:
        i = len(tokens) - 1
    return ' '.join(tokens[i:])


def sort_key(raw, folder=None):
    """(surname, full name), accent-folded. A folder label is used only when it matches the parsed surname."""
    name = display_name(raw)
    sur = surname(name)
    if folder and _fold(str(folder).strip()) == _fold(sur):
        sur = str(folder).strip()
    return (_fold(sur), _fold(name))
