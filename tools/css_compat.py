#!/usr/bin/env python3
"""Idempotent compat pass for style.css (old Fire TV WebViews, Chromium < 79/87).

Adds a *fallback declaration* (marked /*fb*/) right before every declaration that uses clamp()/min()/max() or
the `inset` shorthand. Browsers that understand the modern value ignore the fallback (the later declaration
wins); older WebViews drop the modern declaration and use the fallback instead of the property falling back to
its initial value (which is what made the title/wordmark huge and cut off at the top on old WebViews).

  python3 tools/css_compat.py        # rewrite style.css in place (safe to re-run)
"""
import re, sys, os
P = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'style.css')
src = open(P, encoding='utf-8').read()
src = re.sub(r'/\*fb\*/[^;{}]*;', '', src)          # drop previously generated fallbacks

REL = re.compile(r'(vh|vw|vmin|vmax|%|em\b)')
def split_args(s):
    out, d, cur = [], 0, ''
    for ch in s:
        if ch == '(': d += 1
        if ch == ')': d -= 1
        if ch == ',' and d == 0: out.append(cur.strip()); cur = ''
        else: cur += ch
    out.append(cur.strip()); return out
def pick(fn, args):
    if fn == 'clamp' and len(args) == 3: return args[1]
    rel = [a for a in args if REL.search(a) and 'env(' not in a]
    return rel[0] if rel else args[0]
FN = re.compile(r'(?<![a-z-])(clamp|min|max)\(')
def lower(v):
    for _ in range(12):
        m = None
        for m in FN.finditer(v): pass       # last match = innermost-ish
        if not m: break
        i = m.end(); d = 1; j = i
        while j < len(v) and d:
            d += (v[j] == '(') - (v[j] == ')'); j += 1
        inner = v[i:j - 1]
        v = v[:m.start()] + pick(m.group(1), split_args(inner)) + v[j:]
    return v
def inset(v):
    imp = ''
    if v.rstrip().endswith('!important'): imp = '!important'; v = v.rstrip()[:-10]
    p = v.split()
    if not p or len(p) > 4 or any('(' in x for x in p) and len(p) > 1: return None
    t, r, b, l = {1: (0,0,0,0), 2: (0,1,0,1), 3: (0,1,2,1), 4: (0,1,2,3)}[len(p)]
    return '/*fb*/top:%s%s;/*fb*/right:%s%s;/*fb*/bottom:%s%s;/*fb*/left:%s%s' % (p[t], imp, p[r], imp, p[b], imp, p[l], imp)

out, i, n, start = [], 0, len(src), 0
buf = ''; depth_p = 0; q = None; incomment = False
res = []; seg = ''
k = 0
while k < n:
    ch = src[k]
    if incomment:
        seg += ch
        if src.startswith('*/', k - 1) and k > 0 and src[k-1] == '*': incomment = False
        k += 1; continue
    if q:
        seg += ch
        if ch == q and src[k-1] != '\\': q = None
        k += 1; continue
    if ch == '/' and src.startswith('/*', k): incomment = True; seg += '/*'; k += 2; continue
    if ch in '"\'': q = ch; seg += ch; k += 1; continue
    if ch == '(': depth_p += 1
    if ch == ')': depth_p -= 1
    if ch == ';' and depth_p == 0:
        res.append(seg + ';'); seg = ''; k += 1; continue
    if ch in '{}' and depth_p == 0:
        res.append(seg + ch); seg = ''; k += 1; continue
    seg += ch; k += 1
res.append(seg)

final, added = [], 0
for s in res:
    body = s.rstrip(';')
    m = re.match(r'^(\s*)([a-z-]+)\s*:(.*)$', body, re.S) if s.endswith(';') else None
    if m and 'url(' not in body and not s.lstrip().startswith(('@', '/*')):
        ws, prop, val = m.groups()
        if prop == 'inset':
            fb = inset(val.strip())
            if fb: final.append(fb + ';'); added += 1
        elif FN.search(val):
            nv = lower(val)
            if nv != val and not FN.search(nv): final.append('/*fb*/' + prop + ':' + nv.strip() + ';'); added += 1
        s = s.lstrip() if ws.strip() == '' and False else s
        final.append(s if not ws else s[len(ws):] if False else s)
        continue
    final.append(s)
open(P, 'w', encoding='utf-8').write(''.join(final))
print('fallbacks added:', added)
