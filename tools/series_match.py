"""Decide when a fan-edit title should use the TV series poster, not the film."""
import re

_SERIES = re.compile(r'\b(series|mini[- ]?series|season|episodes?|s\d{1,2}e\d{1,3}|tv show|television)\b', re.I)
_PART = re.compile(r'\b(?:part|pt\.?)\s*\d+\b', re.I)
_SHOW_FOLDER = re.compile(r'\b(series|season|episodes?|tv show|television|tv)\b', re.I)


def wants_tv(name, parent=''):
    """True when the title or its folder is a TV show rather than a film.

    'Series', a season, or an episode marker is enough. 'Part 2' counts only
    together with a show word, so The Godfather Part II stays a film.
    """
    title = name or ''
    folder = parent or ''
    if _SERIES.search(title) or _SERIES.search(folder):
        return True
    if _PART.search(title) and _SHOW_FOLDER.search(folder + ' ' + title):
        return True
    return False


def show_query(name):
    """The show name to search, without the fan-edit suffix or the word Series."""
    text = re.sub(r'\.[A-Za-z0-9]{2,4}$', '', name or '')
    text = re.split(r'\s+[-–|]\s+', text)[0]
    text = re.sub(r'\b(mini[- ]?series|series|saga|season\s*\d+|s\d{1,2}e\d{1,3})\b.*$', '', text, flags=re.I)
    text = re.sub(r'\s+', ' ', text).strip(' -:._')
    return text or (name or '')
