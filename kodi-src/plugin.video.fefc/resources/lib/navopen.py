"""How a screen is opened, and where Back lands.

Kodi's executebuiltin splits on a single &. A plugin URL has to be written
with && or the genre and the search text are thrown away and the page opens
empty. Back is one container level: a child is pushed, not opened with
replace, and not ActivateWindow'd on top of Home.
"""

PARENT = {
    'genre': 'genres',
    'genres': 'home',
    'folder': 'parent',
    'person': 'people',
    'people': 'home',
    'details': 'folder',
    'search-results': 'search',
    'search': 'home',
    'mylist': 'home',
    'recent': 'home',
    'readme': 'home',
    'support': 'home',
    'collections': 'home',
    'main': 'home',
    'tbc': 'home',
}


def parent(screen):
    if screen not in PARENT:
        raise KeyError(screen)
    return PARENT[screen]


def escape_builtin(command):
    """Double every & so Kodi keeps the plugin query string."""
    return (command or '').replace('&', '&&')


def activate_videos(url):
    """One Videos window. Back from this screen returns to the window under it."""
    return escape_builtin('ActivateWindow(Videos,"%s",return)' % url)


def push_child(url):
    """One level deeper in the current window. Back returns to the page now showing."""
    return escape_builtin('Container.Update(%s)' % url)


def replace_same(url):
    """Refresh the page that is already open (a sort change). Back is unchanged."""
    return escape_builtin('Container.Update(%s,replace)' % url)
