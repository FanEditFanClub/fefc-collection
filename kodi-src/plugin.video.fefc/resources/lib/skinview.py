"""What the shipped browse skin actually draws.

Fire TV left every folder, genre, person, My List and search screen black
after the grid was hidden unless Container.Viewmode was exactly 500 or 501.
The container still had its items (the footer counted them). This module
reads the skin XML that ships and says which panel is on screen.

It reads the skin files from a source checkout (kodi-src/skin-fefc/xml) or from an
installed skin (an addons folder holding skin.fefc/xml next to this add-on). Set
FEFC_SKIN_XML_DIR to point it at any other folder.
"""
import html
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))


def _repo_root():
    """Nearest ancestor holding kodi-src (a source checkout). On a device there is none,
    and the old four-levels-up path is returned as before."""
    p = HERE
    for _ in range(10):
        if os.path.isdir(os.path.join(p, 'kodi-src')):
            return p
        parent = os.path.dirname(p)
        if parent == p:
            break
        p = parent
    return os.path.normpath(os.path.join(HERE, '..', '..', '..', '..'))


ROOT = _repo_root()

_SKIN_DIRS = (('kodi-src', 'skin-fefc', 'xml'), ('skin-fefc', 'xml'), ('skin.fefc', 'xml'))


def _skin_xml(filename):
    """First existing copy of a skin XML file: FEFC_SKIN_XML_DIR, then each ancestor of this
    file (a checkout has kodi-src/skin-fefc/xml, a device has addons/skin.fefc/xml beside the
    add-on). When nothing exists the checkout path is returned so the error names it."""
    tried = []
    override = os.environ.get('FEFC_SKIN_XML_DIR')
    if override:
        tried.append(os.path.join(override, filename))
    p = HERE
    for _ in range(10):
        for parts in _SKIN_DIRS:
            tried.append(os.path.join(p, *parts, filename))
        parent = os.path.dirname(p)
        if parent == p:
            break
        p = parent
    for path in tried:
        if os.path.isfile(path):
            return path
    return os.path.join(ROOT, 'kodi-src', 'skin-fefc', 'xml', filename)


NAV = _skin_xml('MyVideoNav.xml')
INC = _skin_xml('Includes_FEFC.xml')

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

_TILES = ('FefcGridTile', 'FefcPosterTile')


def _read(path):
    with open(path, encoding='utf-8-sig') as f:
        return f.read()


def _strip_comments(text):
    return re.sub(r'<!--.*?-->', '', text, flags=re.S)


# -- a small forgiving XML reader. Skin files are XML, but a comment, a single-quoted
# attribute or a stray entity must not make a test (or the check at startup) fall over.
_TAG_RE = re.compile(r'<(/?)([A-Za-z_][\w.:-]*)((?:"[^"]*"|\'[^\']*\'|[^>"\'])*)>', re.S)
_ATTR_RE = re.compile(r'([\w.:-]+)\s*=\s*(?:"([^"]*)"|\'([^\']*)\')')


class _Node(object):
    __slots__ = ('tag', 'attrs', 'text', 'children', 'parent', 'start', 'end')

    def __init__(self, tag, attrs, parent, start):
        self.tag = tag
        self.attrs = attrs
        self.text = ''
        self.children = []
        self.parent = parent
        self.start = start
        self.end = start


def _parse(src):
    root = _Node('#root', {}, None, 0)
    stack = [root]
    pos = 0
    for m in _TAG_RE.finditer(src):
        chunk = src[pos:m.start()]
        if chunk.strip():
            stack[-1].text += chunk
        pos = m.end()
        closing, tag, raw = m.group(1), m.group(2), m.group(3)
        if closing:
            for i in range(len(stack) - 1, 0, -1):
                if stack[i].tag == tag:
                    for node in stack[i:]:
                        node.end = m.end()
                    del stack[i:]
                    break
            continue                  # a closer that matches nothing is ignored
        attrs = {}
        for a in _ATTR_RE.finditer(raw):
            attrs[a.group(1)] = a.group(2) if a.group(2) is not None else a.group(3)
        node = _Node(tag, attrs, stack[-1], m.start())
        stack[-1].children.append(node)
        if raw.rstrip().endswith('/'):
            node.end = m.end()
        else:
            stack.append(node)
    for node in stack[1:]:
        node.end = len(src)
    return root


def _walk(node):
    """Every node under (and including) `node`, in document order."""
    stack = [node]
    while stack:
        n = stack.pop()
        yield n
        stack.extend(reversed(n.children))


def _browser_body(includes, wide=False):
    """Source text of the FefcBrowser include, opening tag through its closing tag.

    wide=True gives the older, wider region: from the opening tag up to the FefcCount
    variable, which can take in includes defined after FefcBrowser."""
    src = _strip_comments(includes)
    if not wide:
        for n in _walk(_parse(src)):
            if n.tag == 'include' and n.attrs.get('name') == 'FefcBrowser':
                return src[n.start:n.end]
    start = src.find('<include name="FefcBrowser">')
    end = src.find('<variable name="FefcCount">')
    if start < 0 or end < start:
        raise ValueError('FefcBrowser missing')
    return src[start:end]


# -- Kodi visibility expressions: ! (not), + (and), | (or), [ ] grouping. The atoms this
# module understands are Container.Viewmode and the fefc_kind list item property; any other
# atom makes the answer "unknown" (None) rather than a guess.
_ATOM_VIEWMODE = re.compile(r'(?:Integer|String)\.IsEqual\(\s*Container\.Viewmode\s*,\s*["\']?(\d+)["\']?\s*\)$', re.I)
_ATOM_KIND = re.compile(
    r'String\.IsEqual\(\s*(?:Container\.)?ListItem\.Property\(\s*fefc_kind\s*\)\s*,\s*["\']?([\w-]+)["\']?\s*\)$', re.I)
_ATOM_KIND_EMPTY = re.compile(r'String\.IsEmpty\(\s*(?:Container\.)?ListItem\.Property\(\s*fefc_kind\s*\)\s*\)$', re.I)


def _not(a):
    return None if a is None else (not a)


def _and(a, b):
    if a is False or b is False:
        return False
    if a is None or b is None:
        return None
    return True


def _or(a, b):
    if a is True or b is True:
        return True
    if a is None or b is None:
        return None
    return False


def _tokens(expr):
    toks, buf, depth = [], [], 0
    for ch in expr:
        if depth == 0 and ch in '[]!+|':
            atom = ''.join(buf).strip()
            if atom:
                toks.append(atom)
            buf = []
            toks.append(ch)
            continue
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth < 0:
                raise ValueError('unbalanced )')
        buf.append(ch)
    if depth:
        raise ValueError('unbalanced (')
    atom = ''.join(buf).strip()
    if atom:
        toks.append(atom)
    return toks


def _atom(text, ctx):
    low = text.strip().lower()
    if low == 'true':
        return True
    if low == 'false':
        return False
    m = _ATOM_VIEWMODE.match(text.strip())
    if m:
        if 'viewmode' not in ctx:
            return None
        return str(ctx['viewmode']).strip() == m.group(1)
    m = _ATOM_KIND.match(text.strip())
    if m:
        if 'kind' not in ctx:
            return None
        return str(ctx['kind']).strip().lower() == m.group(1).lower()
    if _ATOM_KIND_EMPTY.match(text.strip()):
        if 'kind' not in ctx:
            return None
        return not str(ctx['kind']).strip()
    return None


def _p_or(toks, i, ctx):
    value, i = _p_and(toks, i, ctx)
    while i < len(toks) and toks[i] == '|':
        right, i = _p_and(toks, i + 1, ctx)
        value = _or(value, right)
    return value, i


def _p_and(toks, i, ctx):
    value, i = _p_unary(toks, i, ctx)
    while i < len(toks) and toks[i] == '+':
        right, i = _p_unary(toks, i + 1, ctx)
        value = _and(value, right)
    return value, i


def _p_unary(toks, i, ctx):
    if i >= len(toks):
        raise ValueError('expression ends early')
    tok = toks[i]
    if tok == '!':
        value, i = _p_unary(toks, i + 1, ctx)
        return _not(value), i
    if tok == '[':
        value, i = _p_or(toks, i + 1, ctx)
        if i >= len(toks) or toks[i] != ']':
            raise ValueError('missing ]')
        return value, i + 1
    if tok in (']', '+', '|'):
        raise ValueError('unexpected %s' % tok)
    return _atom(tok, ctx), i + 1


def evaluate(expr, ctx=None):
    """True, False, or None (unknown) for a Kodi visibility expression.

    ctx may carry 'viewmode' (what Container.Viewmode returns, as a string) and 'kind'
    (the item's fefc_kind property). An atom this module cannot evaluate, or an
    expression it cannot parse, gives None. A blank expression is True (no condition)."""
    expr = (expr or '').strip()
    if not expr:
        return True
    try:
        toks = _tokens(expr)
        value, pos = _p_or(toks, 0, ctx or {})
    except ValueError:
        return None
    if pos != len(toks):
        return None
    return value


def panels(nav=None, includes=None):
    """Panel controls MyVideoNav actually includes, after $PARAM substitution."""
    nav_src = _strip_comments(_read(nav or NAV))
    body = _browser_body(_read(includes or INC))
    found = []
    for node in _walk(_parse(nav_src)):
        if node.tag != 'include' or node.attrs.get('content') != 'FefcBrowser':
            continue
        pid = ''
        for child in node.children:
            if child.tag == 'param' and child.attrs.get('name') == 'id':
                pid = (child.attrs.get('value') or child.text or '').strip()
                break
        if not re.fullmatch(r'\d+', pid):
            continue
        xml = body.replace('$PARAM[id]', pid)
        expr = ''
        always = True
        vm = re.search(r'<visible\b[^>]*>([^<]*Container\.Viewmode[^<]*)</visible>', xml)
        if vm:
            expr = ' '.join(html.unescape(vm.group(1)).split())
            always = False
        found.append({'id': pid, 'visible_expr': expr, 'always': always, 'itemlayout': xml})
    return found


def panel_visible(panel, viewmode):
    """viewmode is the string Container.Viewmode would return. '' means unset.

    Expressions made of Integer.IsEqual(Container.Viewmode,N) and true/false, joined with
    ! + | and [ ], are worked out exactly. Anything this module cannot evaluate counts as
    visible: the skin may well draw it, and calling a panel hidden on a guess would report
    a black screen that is not there. Use evaluate() when the difference matters."""
    if panel['always']:
        return True
    state = evaluate(panel['visible_expr'], {'viewmode': str(viewmode)})
    return True if state is None else state


def default_control(nav=None):
    nav = _strip_comments(_read(nav or NAV))
    m = re.search(r'<defaultcontrol\b[^>]*>\s*(\d+)\s*</defaultcontrol>', nav)
    if not m:
        raise ValueError('no defaultcontrol')
    return m.group(1)


def _tile_blocks(body):
    """(tile include name, [visible conditions that apply to it]) for every FefcGridTile /
    FefcPosterTile include in every itemlayout of `body`. The conditions are the <visible>
    children of the include and of every control above it, up to the layout. itemlayout is
    what the skin draws for an unfocused tile; focusedlayout is read only when a skin has no
    itemlayout."""
    root = _parse(body)
    layouts = [n for n in _walk(root) if n.tag == 'itemlayout']
    if not layouts:
        layouts = [n for n in _walk(root) if n.tag == 'focusedlayout']
    blocks = []
    for layout in layouts:
        for inc in _walk(layout):
            if inc.tag != 'include' or inc.attrs.get('content') not in _TILES:
                continue
            conds = []
            n = inc
            while n is not None:
                for child in n.children:
                    if child.tag == 'visible':
                        conds.append(' '.join(html.unescape(child.text).split()))
                if n is layout:
                    break
                n = n.parent
            blocks.append((inc.attrs['content'], conds))
    return blocks


def _tile_state(blocks, tile, kind):
    """True if some `tile` include draws for items of this fefc_kind, None if that cannot be
    worked out, else False."""
    best = False
    for name, conds in blocks:
        if name != tile:
            continue
        state = True
        for cond in conds:
            state = _and(state, evaluate(cond, {'kind': kind}))
        if state is True:
            return True
        if state is None:
            best = None
    return best


def _legacy_tile_draws(blocks, kind):
    """The older text check, used only when the expressions cannot be worked out."""
    for name, conds in blocks:
        expr = ' '.join(' '.join(conds).split())
        is_video = 'fefc_kind),video' in expr and not expr.startswith('!')
        hides_video = expr.startswith('!') and 'video' in expr
        hides_spacer = 'spacer' in expr
        if kind == 'video' and name == 'FefcPosterTile' and is_video:
            return True
        if kind in ('folder', 'action', 'files') and name == 'FefcGridTile' and hides_video and hides_spacer:
            return True
    return False


def tile_draws(kind, includes=None):
    """True when the panel's item layout has a visible group for this kind.

    folder and action (Sort, Shuffle, Support Us, people, genre collections)
    use the landscape card. video uses the poster. spacer draws nothing.

    Every itemlayout in FefcBrowser is read, not just the first, and nested groups count:
    a tile is drawn when all the <visible> conditions above it hold for an item of this
    kind. A poster group must draw for video and for nothing else; a card group must draw
    for the kind but not for video or spacer. When an expression cannot be worked out the
    older text check decides. 'files' is the old name for the card kinds and is kept as
    such; any other kind is treated as a card kind."""
    if kind == 'spacer':
        return False
    src = _read(includes or INC)
    blocks = _tile_blocks(_browser_body(src))
    if not blocks:
        blocks = _tile_blocks(_browser_body(src, wide=True))
    if not blocks:
        return False
    if kind == 'video':
        tile = 'FefcPosterTile'
        states = (_tile_state(blocks, tile, 'video'),
                  _tile_state(blocks, tile, 'folder'),
                  _tile_state(blocks, tile, 'spacer'))
    else:
        tile = 'FefcGridTile'
        ck = 'folder' if kind == 'files' else kind
        states = (_tile_state(blocks, tile, ck),
                  _tile_state(blocks, tile, 'video'),
                  _tile_state(blocks, tile, 'spacer'))
    if any(s is None for s in states):
        return _legacy_tile_draws(blocks, kind)
    return states[0] is True and states[1] is False and states[2] is False
