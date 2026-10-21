#!/usr/bin/env python3
"""Build-time pipeline -> data/editinfo.json (read-only on Drive; public web sources only).
 1. Fan-edit info from FanEdit.org IFDB listings (editor, release, runtimes, synopsis, intention, changes, rating) with source links.
    Match = existing IFDB link, or WP search verified by edit title tokens + IFDB 'Original Movie/Show Title' vs filename source.
 2. Source-title disambiguation: candidates from Wikidata (same label films/series/games), decided by
    data/source-overrides.json > IFDB IMDb link > year in filename/path > folder-path/sibling words > popularity (IMDb votes). Low-confidence flagged.
 3. Source metadata (Wikidata/Wikipedia/IMDb ratings dataset/YouTube trailer/Wikipedia poster) for every corrected or newly resolved title.
Cache: tools/cache/editinfo_cache.json"""
import json,re,os,time,html,gzip,urllib.request,urllib.parse,concurrent.futures as cf,collections,threading
os.chdir(os.path.dirname(os.path.abspath(__file__))+'/..')
UA={'User-Agent':'FEFCCollection/1.0 (faneditfanclub.com metadata indexer; faneditfanclub@gmail.com)'}
BUA={'User-Agent':'Mozilla/5.0 (FEFCCollection metadata indexer)'}
def get(u,h=UA,t=30):
    for i in range(3):
        try: return urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=t).read().decode('utf8','replace')
        except Exception as e:
            if '404' in str(e): return None
            time.sleep(2*2**i)
    return None
def jget(u):
    s=get(u);
    try: return json.loads(s) if s else None
    except Exception: return None
CP='tools/cache/editinfo_cache.json';C=json.load(open(CP)) if os.path.exists(CP) else {}
for k in('wp','page','cand','ent','lab','plot','img','yt','imdbq'): C.setdefault(k,{})
LK=threading.Lock()
def save():
    with LK: json.dump(C,open(CP,'w'))
d=json.load(open('data/index.json'));by={}
for x in d['items']: by.setdefault(x['id'],x)
M=json.load(open('data/metadata.json'));OV=json.load(open('data/source-overrides.json'))
def isv(x): return (x.get('kind')=='video' or x['mimeType'].startswith('video')) and not x['name'].startswith('._')
vids=[x for x in by.values() if isv(x)]
def path(x):
    out=[];g=0
    while x and x.get('parent') and g<30: x=by.get(x['parent']);g+=1;x and out.append(x['name'])
    return out
norm=lambda s:re.sub(r'\s+',' ',re.sub(r'[^a-z0-9]+',' ',html.unescape(s or '').lower().replace('&','and'))).strip()
STOP={'the','a','an','of','and','cut','edit','fan','fanedit','version','extended','in','to','part'}
NOISE=re.compile(r'\b(fan ?edit|fanedit|mashup|4k|1080p|720p|hd|remaster(ed)?)\b',re.I)
EPI=re.compile(r'\b(season|episode|s\d+e\d+|ep\.? ?\d+)\b',re.I)
def parse(name):
    s=re.sub(r'\.[A-Za-z0-9]{2,4}$','',name).replace('_',' ')
    yr=re.search(r'\((19[2-9]\d|20[0-3]\d)\)|\b(19[2-9]\d|20[0-3]\d)\b',s);yr=yr and (yr.group(1) or yr.group(2))
    segs=[g.strip() for g in re.split(r'\s+[-–|]\s+',s) if g.strip()]
    base=re.sub(r'\(?\b(19|20)\d\d\b\)?','',NOISE.sub('',segs[0] if segs else s)).strip(' -:.')
    cut=None
    for g in segs[1:]:
        g2=NOISE.sub('',g).strip(' -')
        if g2 and not EPI.search(g2) and not re.match(r'^\d',g2): cut=g2;break
    return re.sub(r'\s+',' ',base),cut,yr
# ---------- 1. FanEdit.org IFDB ----------
FL=re.compile(r'jrFieldLabel[^>]*>(.*?)</div>\s*<div class="jrFieldValue[^"]*"[^>]*>(.*?)</div>\s*</div>',re.S)
def txt(h): return html.unescape(re.sub(r'<[^>]+>','',re.sub(r'<br\s*/?>','\n',h))).strip()
def ifdb_page(u):
    if u in C['page']: return C['page'][u]
    s=get(u,BUA);r=None
    if s and 'Faneditor Name' in s:
        F={}
        for a,b in FL.findall(s):
            a=txt(a).rstrip(':')
            if a in F: break
            F[a]=b
        r=dict(url=u,title=txt((re.search(r'itemprop="headline">(.*?)<',s) or re.search(r'<title>(.*?)</title>',s)).group(1)).replace(' - Fanedit.org',''))
        for k,n in (('Faneditor Name','editor'),('Original Movie/Show Title','orig'),('Fanedit Type','type'),('Original Release Date','origYear'),('Original Running Time','origRuntime'),('Fanedit Release Date','released'),('Fanedit Running Time','runtime'),('Synopsis','synopsis'),('Intention','intention'),('Editing Details','details'),('Cuts and Additions','changes')):
            if k in F: r[n]=txt(F[k])
        if 'changes' in r: r['changes']=[re.sub(r'^[-•*–]\s*','',l).strip() for l in r['changes'].split('\n') if len(l.strip())>2][:60]
        m=re.search(r'jrOverallUser.*?jrRatingValue[^>]*><span>([\d.]+)</span>(?:<span class="jrReviewCount"> \(<span class="count">(\d+))?',s,re.S)
        if m and float(m.group(1))>0: r['rating']=float(m.group(1));r['reviews']=int(m.group(2) or 0)
        m=re.search(r'jrOverallEditor.*?jrRatingValue[^>]*><span>([\d.]+)</span>',s,re.S)
        if m and float(m.group(1))>0: r['trusted']=float(m.group(1))
        m=re.search(r'imdb\.com/title/(tt\d+)',s);r['imdb']=m and m.group(1)
        r={k:v for k,v in r.items() if v}
    with LK: C['page'][u]=r
    return r
def ifdb_search(q):
    if q in C['wp']: return C['wp'][q]
    r=jget('https://fanedit.org/wp-json/wp/v2/posts?'+urllib.parse.urlencode({'search':q,'per_page':8,'_fields':'title,link'})) or []
    out=[(html.unescape(p['title']['rendered']),p['link']) for p in r if not re.search(r'^(Week of|FEOTM|Poll)',html.unescape(p['title']['rendered']))]
    with LK: C['wp'][q]=out
    return out
def tok(s): return set(norm(s).split())-STOP
def ifdb_for(v):
    base,cut,yr=parse(v['name']);known=M['ifdb'].get(v['id']) or M['ifdb'].get(v.get('targetId') or '')
    if known:
        p=ifdb_page(known)
        if p: return p,'known'
    if not cut or EPI.search(v['name']): return None,None
    ct=tok(cut);bt=tok(base)
    if not ct: return None,None
    for q in (f'{base} {cut}',cut):
        for title,link in ifdb_search(q):
            tt=tok(title)
            if not ct<=tt: continue
            p=ifdb_page(link)
            if not p: continue
            ot=tok(p.get('orig',''))|tt
            if bt and len(bt&ot)/len(bt)<0.6: continue   # stated source must match the filename's source
            return p,'search'
    return None,None
# ---------- 2. Wikidata candidates ----------
WD='https://www.wikidata.org/w/api.php?'
KINDS=re.compile(r'film|television series|miniseries|video game|animated series|web series|TV series|anime',re.I)
def ents(ids):
    need=[i for i in ids if i not in C['ent']]
    for i in range(0,len(need),50):
        r=jget(WD+urllib.parse.urlencode(dict(action='wbgetentities',format='json',ids='|'.join(need[i:i+50]),props='claims|labels|sitelinks|descriptions',languages='en',sitefilter='enwiki'))) or {}
        for q,e in r.get('entities',{}).items():
            cl=e.get('claims',{})
            def g(p):
                o=[]
                for c in cl.get(p,[]):
                    try: o.append(c['mainsnak']['datavalue']['value'])
                    except Exception: pass
                return o
            I=lambda p:[x['id'] for x in g(p) if isinstance(x,dict) and 'id' in x]
            dates=[x['time'][1:5] for x in g('P577')+g('P580') if isinstance(x,dict) and 'time' in x]
            dur=[x for x in g('P2047') if isinstance(x,dict)]
            with LK: C['ent'][q]=dict(label=e.get('labels',{}).get('en',{}).get('value'),desc=e.get('descriptions',{}).get('en',{}).get('value',''),wiki=e.get('sitelinks',{}).get('enwiki',{}).get('title'),
                p31=I('P31'),imdb=(g('P345') or [None])[0],year=min(dates) if dates else None,dir=I('P57')[:3]+I('P170')[:2],cast=I('P161')[:10],genre=I('P136')[:4],
                runtime=int(float(dur[0]['amount'])) if dur else None,yt=(g('P1651') or [None])[-1],series=I('P179')[:2])
    return [C['ent'].get(i) for i in ids]
def cands(title):
    k=norm(title)
    if k in C['cand']: return C['cand'][k]
    r=jget(WD+urllib.parse.urlencode(dict(action='wbsearchentities',format='json',search=title,language='en',type='item',limit=12))) or {}
    ids=[x['id'] for x in r.get('search',[]) if norm(x.get('label',''))==k or norm(re.sub(r'\(.*?\)','',x.get('label','')))==k]
    ents(ids);ok=[i for i in ids if C['ent'].get(i) and C['ent'][i]['imdb'] and KINDS.search(C['ent'][i]['desc'] or '')]
    with LK: C['cand'][k]=ok
    return ok
def by_imdb(tt):
    if tt in C['imdbq']: return C['imdbq'][tt]
    r=jget(WD+urllib.parse.urlencode(dict(action='query',format='json',list='search',srsearch=f'haswbstatement:P345={tt}',srlimit=1))) or {}
    s=r.get('query',{}).get('search',[]);q=s[0]['title'] if s else None
    with LK: C['imdbq'][tt]=q
    return q
# IMDb votes for popularity
if not os.path.exists('/tmp/ratings.tsv.gz') or time.time()-os.path.getmtime('/tmp/ratings.tsv.gz')>86400*3:
    open('/tmp/ratings.tsv.gz','wb').write(urllib.request.urlopen(urllib.request.Request('https://datasets.imdbws.com/title.ratings.tsv.gz',headers=UA),timeout=180).read())
IR={}
for ln in gzip.open('/tmp/ratings.tsv.gz','rt'):
    a=ln.rstrip('\n').split('\t')
    if a[0].startswith('tt'): IR[a[0]]=(a[1],int(a[2]) if a[2].isdigit() else 0)
votes=lambda q:IR.get((C['ent'].get(q) or {}).get('imdb'),(0,0))[1]
# ---------- run ----------
print('videos',len(vids),flush=True)
with cf.ThreadPoolExecutor(6) as ex: IF=dict(zip([v['id'] for v in vids],ex.map(ifdb_for,vids)))
save();print('ifdb matched',sum(1 for a,b in IF.values() if a),flush=True)
overrides=[(k,v) for k,v in OV.items() if not k.startswith('_')]
def ov(v):
    for k,q in overrides:
        if k==v['id'] or k==v.get('targetId') or (not re.fullmatch(r'[\w-]{25,}',k) and re.search(k,v['name'],re.I)): return q
CUR=M['map'];newmap={};conf={};why={};changes=[]
titles=collections.defaultdict(list)
for v in vids:
    base,cut,yr=parse(v['name'])
    if EPI.search(v['name']) and not CUR.get(v['id']): continue
    titles[norm(base)].append(v)
alltitles=sorted(titles);print('titles',len(alltitles),flush=True)
with cf.ThreadPoolExecutor(4) as ex: CA=dict(zip(alltitles,ex.map(lambda t:cands(parse(titles[t][0]['name'])[0]),alltitles)))
save()
ents(sorted({q for v in CUR.values() for q in [v]}))
for t,vs in titles.items():
    cs=CA.get(t) or []
    for v in vs:
        cur=CUR.get(v['id']);base,cut,yr=parse(v['name']);P=path(v);ptxt=norm(' '.join(P[:4]))
        sib=norm(' '.join(by[s]['name'] for s in [x['id'] for x in by.values() if x.get('parent')==v.get('parent')][:40])) if len(cs)>1 else ''
        pick=None;reason=None
        o=ov(v)
        if o: pick=by_imdb(o) if o.startswith('tt') else o;reason='override'
        p=IF[v['id']][0] if IF.get(v['id']) else None
        if not pick and p and p.get('imdb'): pick=by_imdb(p['imdb']);reason='fanedit.org IMDb link'
        if not pick and len(cs)>1:
            pool=cs[:]
            ys=[yr] if yr else []
            if not ys: ys=[m for m in re.findall(r'\b(19[2-9]\d|20[0-3]\d)\b',' '.join(P[:3]))]
            if p and p.get('origYear'): ys.append(p['origYear'][:4])
            if ys:
                y=[c for c in pool if C['ent'][c]['year'] in ys]
                if y: pool=y;reason='year'
            if len(pool)>1:   # folder path / siblings mention the series or franchise (e.g. Firefly)
                def ctx(c):
                    e=C['ent'][c];ser=[C['lab'].get(s) or '' for s in e['series']];w=tok(' '.join(ser)+' '+e['desc'])-tok(base)-{'film','series','television','american','directed','by','game','video','movie','british'}
                    return sum(1 for x in w if len(x)>3 and (x in ptxt.split() or x in sib.split()))
                sc={c:ctx(c) for c in pool};mx=max(sc.values())
                if mx>0 and list(sc.values()).count(mx)==1: pool=[max(sc,key=sc.get)];reason='folder/sibling context'
            if len(pool)>1:
                pool.sort(key=votes,reverse=True);a,b=votes(pool[0]),votes(pool[1])
                reason=reason or 'popularity';pick=pool[0]
                if b and a<3*b: conf[v['id']]='low'
            else: pick=pool[0]
        if not pick and not cur and len(cs)==1: pick=cs[0];reason='only candidate'
        if pick and pick!=cur:
            newmap[v['id']]=pick;why[v['id']]=reason
            if cur: changes.append((v['name'],(C['ent'].get(cur) or {}).get('label'),(C['ent'].get(cur) or {}).get('year'),C['ent'][pick]['label'] if pick in C['ent'] else pick,(C['ent'].get(pick) or {}).get('year'),reason))
        elif cur and len(cs)>1 and conf.get(v['id'])=='low': pass
need=sorted(set(newmap.values()));ents(need)
labs=sorted({x for q in need for k in('dir','cast','genre','series') for x in (C['ent'].get(q) or {}).get(k,[])}-set(C['lab']))
for i in range(0,len(labs),50):
    r=jget(WD+urllib.parse.urlencode(dict(action='wbgetentities',format='json',ids='|'.join(labs[i:i+50]),props='labels',languages='en'))) or {}
    for q,e in r.get('entities',{}).items(): C['lab'][q]=e.get('labels',{}).get('en',{}).get('value')
def wsum(t):
    if t in C['plot']: return
    r=jget('https://en.wikipedia.org/api/rest_v1/page/summary/'+urllib.parse.quote(t.replace(' ','_'),safe=''))
    C['plot'][t]=r and r.get('extract','')[:900];C['img'][t]=r and (r.get('originalimage') or r.get('thumbnail') or {}).get('source')
    time.sleep(.3)
for q in need:
    w=C['ent'].get(q)
    if w and w.get('wiki'): wsum(w['wiki'])
def yts(q,e):
    if q in C['yt']: return
    try:
        h=get('https://www.youtube.com/results?'+urllib.parse.urlencode(dict(search_query=f"{e['label']} {e['year'] or ''} official trailer")),BUA) or ''
        ids=re.findall(r'"videoRenderer":\{"videoId":"([\w-]{11})".*?"title":\{"runs":\[\{"text":"(.*?)"',h)
        a=tok(e['label']);C['yt'][q]=next((i for i,tt in ids[:6] if re.search('trailer|teaser',tt,re.I) and a<=tok(tt)),None)
    except Exception: C['yt'][q]=None
    time.sleep(1)
films={}
for q in need:
    e=C['ent'].get(q)
    if not e: continue
    if not e['yt']: yts(q,e)
    L=lambda xs:[C['lab'].get(x) for x in xs if C['lab'].get(x)]
    f=dict(title=e['label'],year=int(e['year']) if e['year'] else None,wiki=e['wiki'] and 'https://en.wikipedia.org/wiki/'+urllib.parse.quote(e['wiki'].replace(' ','_')),
        plot=C['plot'].get(e['wiki']),director=L(e['dir']),cast=L(e['cast']),genres=L(e['genre']),runtime=e['runtime'],imdb=e['imdb'],
        tv=bool(re.search('series',e['desc'] or '',re.I)),game=bool(re.search('video game',e['desc'] or '',re.I)),poster=C['img'].get(e['wiki']))
    if e['imdb'] in IR: f['imdbRating'],f['imdbVotes']=IR[e['imdb']]
    yt=e['yt'] or C['yt'].get(q)
    if yt: f['trailer']=dict(id=yt,src='wikidata' if e['yt'] else 'youtube')
    films[q]={k:x for k,x in f.items() if x not in(None,[],'',False)}
save()
edits={}
for v in vids:
    p,how=IF.get(v['id']) or (None,None)
    if p: edits[v['id']]=dict(p,src='FanEdit.org',how=how)
out=dict(v=1,generated=time.strftime('%Y-%m-%dT%H:%M:%S'),edits=edits,films=films,map=newmap,why=why,conf=conf)
json.dump(out,open('data/editinfo.json','w'),separators=(',',':'),ensure_ascii=False)
json.dump(dict(changed=changes,flagged=[(by[i]['name'],(C['ent'].get(newmap.get(i) or CUR.get(i)) or {}).get('label'),(C['ent'].get(newmap.get(i) or CUR.get(i)) or {}).get('year')) for i in conf]),open('tools/editinfo_report.json','w'),indent=1,ensure_ascii=False)
src=sum(1 for v in vids if v['id'] in newmap or v['id'] in CUR)
print(json.dumps(dict(videos=len(vids),with_source=src,with_edit_notes=sum(1 for e in edits.values() if e.get('changes')),with_ifdb=len(edits),remapped=len(changes),newly_resolved=len(newmap)-len(changes),flagged=len(conf),bytes=os.path.getsize('data/editinfo.json'))))
