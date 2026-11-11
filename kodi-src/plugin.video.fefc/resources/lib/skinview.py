"""What the shipped browse skin actually draws.

Fire TV left every folder, genre, person, My List and search screen black
after the grid was hidden unless Container.Viewmode was exactly 500 or 501.
The container still had its items (the footer counted them). This module
reads the skin XML that ships and says which panel is on screen.
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..'))
NAV = os.path.join(ROOT, 'kodi-src', 'skin-fefc', 'xml', 'MyVideoNav.xml')
INC = os.path.join(ROOT, 'kodi-src', 'skin-fefc', 'xml', 'Includes_FEFC.xml')

# What each browse screen puts on a list item. The skin must draw it.
CONTENT = {
    'folders': 'folder',
    'videos': 'video',
    'files': 'video',
    'genres': 'folder',
    'people': 'folder',
    'mylist': 'folder',
    'search': 'video',
}


def _read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def _browser_body(includes):
    start = includes.find('<include name="FefcBrowser">')
    end = includes.find('<variable name="FefcCount">')
    if start < 0 or end < start:
        raise ValueError('FefcBrowser missing')
    return includes[start:end]


def panels(nav=None, includes=None):
    """Panel controls MyVideoNav actually includes, after $PARAM substitution."""
    nav = _read(nav or NAV)
    includes = _read(includes or INC)
    body = _browser_body(includes)
    found = []
    for m in re.finditer(
            r'<include content="FefcBrowser"><param name="id" value="(\d+)"/></include>',
            nav):
        pid = m.group(1)
        xml = body.replace('$PARAM[id]', pid)
        expr = ''
        always = True
        vm = re.search(r'<visible>([^<]*Container\.Viewmode[^<]*)</visible>', xml)
        if vm:
            expr = ' '.join(vm.group(1).split())
            always = False
        found.append({'id': pid, 'visible_expr': expr, 'always': always, 'itemlayout': xml})
    return found


def panel_visible(panel, viewmode):
    """viewmode is the string Container.Viewmode would return. '' means unset."""
    if panel['always']:
        return True
    expr = panel['visible_expr']
    m = re.fullmatch(r'!Integer\.IsEqual\(Container\.Viewmode,(\d+)\)', expr)
    if m:
        return str(viewmode) != m.group(1)
    m = re.fullmatch(r'Integer\.IsEqual\(Container\.Viewmode,(\d+)\)', expr)
    if m:
        return str(viewmode) == m.group(1)
    if expr in ('true', ''):
        return True
    return False


def default_control(nav=None):
    nav = _read(nav or NAV)
    m = re.search(r'<defaultcontrol[^>]*>(\d+)</defaultcontrol>', nav)
    if not m:
        raise ValueError('no defaultcontrol')
    return m.group(1)


def tile_draws(kind, includes=None):
    """True when the panel's item layout has a visible group for this kind.

    folder and action (Sort, Shuffle, Support Us, people, genre collections)
    use the landscape card. video uses the poster. spacer draws nothing.
    """
    includes = _read(includes or INC)
    body = _browser_body(includes)
    groups = re.findall(r'<itemlayout[^>]*>(.*?)</itemlayout>', body, re.S)
    if not groups:
        return False
    layout = groups[0]
    blocks = []
    for chunk in re.findall(r'<control type="group">(.*?)</control>', layout, re.S):
        vis = re.search(r'<visible>(.*?)</visible>', chunk, re.S)
        inc = re.search(r'content="(FefcGridTile|FefcPosterTile)"', chunk)
        if vis and inc:
            blocks.append((' '.join(vis.group(1).split()), inc.group(1)))
    if kind == 'spacer':
        return False
    for expr, name in blocks:
        is_video = 'fefc_kind),video' in expr and not expr.startswith('!')
        hides_video = expr.startswith('!') and 'video' in expr
        hides_spacer = 'spacer' in expr
        if kind == 'video' and name == 'FefcPosterTile' and is_video:
            return True
        if kind in ('folder', 'action', 'files') and name == 'FefcGridTile' and hides_video and hides_spacer:
            return True
    return False
