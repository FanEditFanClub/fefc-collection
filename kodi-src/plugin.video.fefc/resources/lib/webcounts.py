import re
FOLDER='application/vnd.google-apps.folder'
XTRA=re.compile(r'\b(sample|trailer|teaser|featurette|extras?|bonus|promo|behind the scenes|deleted scenes?|interview|making of)\b',re.I)
JUNK=re.compile(r'^\.|^thumbs\.db$|^desktop\.ini$',re.I)
# Video extensions: single source of truth is catalog.VIDEO_EXTS.
# Fall back to the same union literal when catalog cannot be imported
# (webcounts is also imported standalone in tests). No cycle: catalog only
# imports webcounts inside build_model(), after catalog is fully loaded.
try:
    from .catalog import VIDEO_EXTS as _VIDEO_EXTS
except ImportError:
    try:
        from catalog import VIDEO_EXTS as _VIDEO_EXTS
    except ImportError:
        _VIDEO_EXTS = ('mkv', 'mp4', 'm4v', 'avi', 'mov', 'wmv', 'mpg', 'mpeg', 'ts', 'm2ts', 'webm', 'flv', 'vob', 'iso', 'divx', 'ogm', '3gp')
VEXT = re.compile(r'\.(?:' + '|'.join(_VIDEO_EXTS) + r')$', re.I)
FOLD={'collections':'1fEaxNbFIrEwKRygETVm4jgtJGVAqKxGB','tbc':'1503Wl56hzRppaIFcQisvQksOaeYOEjnk','readFirst':'1Aw4hr8uM3dsj_txpxPkEJxPDfNjmcYRT','actors':'1Jb0DtQC05fOdpiNg-O88fUpwI5ic3UHS','directors':'1u2B5d9cb1zAtrtdF_rA3eXhtcFgggSib'}
def web_counts(idx, ids):
    """Port of web app deepCounts/immFolderCount/countsLine (src/app.js)."""
    ROOT=idx.get('root'); items={}; kids={}
    for f in idx.get('items',[]):
        items[f['id']]=f; a=kids.setdefault(f.get('parent') or ROOT,[])
        a.append(f)
    for p,L in (idx.get('links') or {}).items():
        a=kids.setdefault(p,[])
        for i in L:
            f=items.get(i)
            if f is not None and not any(x is f for x in a): a.append(f)
    tgt=lambda f:f.get('targetId') or f['id']
    def isf(f):
        if not f: return False
        m=f.get('mimeType'); t=f.get('targetId')
        return m==FOLDER or f.get('targetMime')==FOLDER or bool(t and t!=f['id'] and (items.get(t) or {}).get('mimeType')==FOLDER)
    def isv(f,d=0):
        if not f or isf(f): return False
        m=f.get('mimeType') or ''; n=f.get('name') or ''
        if n.startswith('.'): return False
        if f.get('kind')=='video': return True
        t=f.get('targetId')
        if t and t!=f['id'] and d<3 and t in items: return isv(items[t],d+1)
        if m.startswith('video/'): return True
        return bool(VEXT.search(n))
    ut={}
    def under_tbc(t):
        if t in ut: return ut[t]
        x=items.get(t); h=0; r=t==FOLD['tbc']
        while not r and x and h<60:
            h+=1
            if x.get('parent')==FOLD['tbc']: r=True
            else: x=items.get(x.get('parent'))
        ut[t]=r; return r
    def vcanon(f):
        t=items.get(tgt(f)) or f
        if XTRA.search(t.get('name') or f.get('name') or ''): return None
        if t.get('md5'): return 'm:'+t['md5']
        z=t.get('size') or f.get('size')
        return 's:%s'%z if z else tgt(f)
    special=set(FOLD.values())|{ROOT}
    def imm(i):
        s=set()
        for f in kids.get(i,[]):
            if isf(f): s.add(tgt(f))
        return len(s)
    def deep(i):
        """(folder_count, file_count) under i. folder_count is the RECURSIVE
        count of subfolders, EXCEPT for ROOT, Collections and TBC, where it
        is the IMMEDIATE count (those tiles show immediate subfolders)."""
        noT=i==ROOT; c=n=0; seen=set(); fs=set(); qd=set(); st=[i]
        while st:
            x=st.pop()
            if x in seen: continue
            seen.add(x)
            for f in kids.get(x,[]):
                if noT and under_tbc(tgt(f)): continue
                if isf(f):
                    t=tgt(f)
                    # Intentional: special folders (Collections, TBC, Actors,
                    # Directors, Read First, root) are top-level navigation,
                    # not children of a non-root folder, so they are not
                    # counted here. For ROOT they are counted via imm() below.
                    if i!=ROOT and t!=i and t in special: continue
                    if t not in seen and t not in qd: qd.add(t); c+=1; st.append(t)
                elif not JUNK.search(f.get('name') or '') and isv(f) and tgt(f) not in fs:
                    fs.add(tgt(f)); ck=vcanon(f)
                    if ck is None or ('c:'+ck) in fs: continue
                    fs.add('c:'+ck); n+=1
        if i in (ROOT,FOLD['collections'],FOLD['tbc']):
            return imm(i),n
        return c,n
    out={}
    for k,i in ids.items():
        i=i or ROOT; c,n=deep(i)
        out[k]=(c,n)
    return out
