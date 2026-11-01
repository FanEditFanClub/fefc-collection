#!/usr/bin/env python3
"""Poster accuracy pass - runs in the nightly resync right after tools/posters.py (which regenerates data/posters.json from scratch).
 1. YEAR/TITLE FIX: for every video whose file name carries a year, if the poster Wikipedia page has an explicit different year
    ("Friday the 13th (2009 film)" for a 1982 file) or its title does not match the file title at all, re-search Wikipedia with the
    year and keep only a page whose year is within +-1 of the file's year and whose title overlaps the file title. Cached in
    tools/poster_fix_cache.json (so the nightly only queries new files).
 2. PINS: data/poster-pins.json 'rules' (regex on file name [+ ctx regex on ancestor folder names]) -> 'art' entries (TMDB page og:image
    or a Wikipedia page image), saved as clean local assets/posters/pin-<key>.webp. Pins always win, so a resync never reintroduces them.
 Read-only against Drive. No API keys (TMDB public page og:image, Wikipedia API)."""
import json,re,os,sys,io,urllib.request,urllib.parse,collections,difflib,concurrent.futures as cf
os.chdir(os.path.dirname(os.path.abspath(__file__))+'/..')
UA={'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 FEFCCollection'}
def get(u,t=30):
    return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=t).read()
import subprocess
def cget(u): return subprocess.run(['curl','-sL','--fail','-m','40','-A','Mozilla/5.0 (X11; Linux x86_64) Chrome/120 Safari/537.36',u],capture_output=True,check=True).stdout   # TMDB rejects python-urllib's TLS fingerprint
def jget(u):
    for _ in range(3):
        try: return json.loads(get(u))
        except Exception: pass
d=json.load(open('data/index.json'));by={x['id']:x for x in d['items']}
P=json.load(open('data/posters.json'));PINS=json.load(open('data/poster-pins.json'))
P={k:v for k,v in P.items() if v.get('source')!='pinned'}   # pins are re-derived from the rules every run (a rule change must not leave stale pins)
CACHE_F='tools/poster_fix_cache.json';CACHE=json.load(open(CACHE_F)) if os.path.exists(CACHE_F) else {}
VEXT=('.mkv','.mp4','.avi','.m4v','.mov','.webm','.wmv','.mpg','.divx','.ts')
vids=[x for x in by.values() if (x.get('kind')=='video' or x['name'].lower().endswith(VEXT)) and not x['name'].startswith('._')]
norm=lambda s:re.sub(r'[^a-z0-9]+',' ',re.sub(r'&','and',s.lower())).strip()
def chain(x):
    out=[];n=0
    while x and n<12: out.append(x['name']);x=by.get(x.get('parent'));n+=1
    return out
# ---------- 1. year / title fix
NOISE=re.compile(r'\b(movie )?fan ?edit|\bfan ?cut|\bcut\b|\bextended|\bremaster(ed)?|\b(4k|1080p|720p|hdr|uhd)\b|\bedit\b|\bsensical\b|\bversion\b',re.I)
def fparse(name):
    s=re.sub(r'\.[A-Za-z0-9]{2,4}$','',name).replace('_',' ')
    ys=re.findall(r'\((19[2-9]\d|20[0-3]\d)\)',s) or re.findall(r'\b(19[2-9]\d|20[0-3]\d)\b',s)
    lead=re.match(r'^(19[2-9]\d|20[0-3]\d)\s*-\s*(.+)',s)
    y=ys[0] if ys else None
    if lead: y=lead.group(1);s=lead.group(2)
    seg=re.split(r'\s+[-–|:]\s+',s)[0]
    seg=re.sub(r'\(?\b(19|20)\d\d\b\)?','',NOISE.sub('',seg)).replace('.',' ').strip(' -:.')
    seg=re.sub(r'^(.*), The$',r'The \1',seg)
    return re.sub(r'\s+',' ',seg),y
def myear(mt):
    m=re.search(r'\((\d{4}) (?:\w+ )*?(?:film|TV series|miniseries)\)',mt);return m and int(m.group(1))
def close(a,b): return abs(int(a)-int(b))<=1
def wiki_year(base,y):
    key=f'{base}|{y}'
    if key in CACHE: return CACHE[key]
    res=None
    for q in (f'{base} {y} film',f'{base} {y}'):
        r=jget('https://en.wikipedia.org/w/api.php?'+urllib.parse.urlencode(dict(action='query',format='json',generator='search',gsrsearch=q,gsrlimit=8,prop='pageimages|description',piprop='thumbnail',pithumbsize=300)))
        pages=sorted((r or {}).get('query',{}).get('pages',{}).values(),key=lambda p:p.get('index',9))
        for p in pages:
            if 'thumbnail' not in p: continue
            desc=p.get('description','')+' '+p['title']
            if not re.search(r'film|series|television|anime|animated|miniseries|sitcom',desc,re.I): continue
            yy=re.findall(r'\b(19\d\d|20\d\d)\b',desc)
            if not any(close(y,z) for z in yy): continue
            t=norm(re.sub(r'\s*\(.*?\)$','',p['title']));b=norm(base)
            if t==b or (len(b)>3 and (b in t or t in b)) or difflib.SequenceMatcher(None,t,b).ratio()>=.75 or (set(b.split())-{'the','a','of','and'})<=set(t.split()):
                res=dict(url=p['thumbnail']['source'],source='original',matchedTitle=p['title'],link='https://en.wikipedia.org/wiki/'+urllib.parse.quote(p['title'].replace(' ','_')));break
        if res: break
    CACHE[key]=res or {};return CACHE[key]
todo={}
for v in vids:
    p=P.get(v['id']);base,y=fparse(v['name'])
    if not y or not base or len(base)<3 or re.match(r'^\d+$',base): continue
    mt=(p or {}).get('matchedTitle','')
    mb=norm(re.sub(r'\s*\(.*?\)$','',mt)) if p else ''
    b=norm(base);my=myear(mt) if p else None
    bad=(p and my and not close(y,my)) or (p and p.get('source')!='custom' and not(mb==b or (len(b)>3 and (b in mb or mb in b))) and difflib.SequenceMatcher(None,mb,b).ratio()<.8)
    if bad or not p: todo.setdefault((base,y),[]).append(v)
print('poster_fix: lookups needed',sum(1 for k in todo if f'{k[0]}|{k[1]}' not in CACHE),'of',len(todo),flush=True)
def _w(k):
    try: wiki_year(*k)
    except Exception as e: print('lookup failed',k,e,file=sys.stderr)
with cf.ThreadPoolExecutor(12) as ex:
    for i,_ in enumerate(ex.map(_w,list(todo))):
        if i%100==99: json.dump(CACHE,open(CACHE_F,'w'),separators=(',',':'));print('  ...',i+1,flush=True)
json.dump(CACHE,open(CACHE_F,'w'),separators=(',',':'))
fixed=cleared=0
for (base,y),vs in todo.items():
    r=CACHE.get(f'{base}|{y}')
    for v in vs:
        old=P.get(v['id'])
        if r:
            if not old or old.get('matchedTitle')!=r['matchedTitle']: fixed+=1
            P[v['id']]=dict(r)
        elif old and (re.search(r'^\d{4}( \(film\))?$|Olympics|Formula One|\bseason$',old.get('matchedTitle','')) or myear(old.get('matchedTitle','')) and not close(y,myear(old['matchedTitle']))):
            del P[v['id']];cleared+=1   # wrong-year poster and no right-year page found: better no art than wrong art
# ---------- 2. pins
def save_art(key,spec):
    fn=f'assets/posters/pin-{key}.webp'
    if os.path.exists(fn): return fn
    tm=spec.get('tmdb')
    if not tm and 'wiki' in spec:   # Wikipedia hides non-free poster thumbnails from the API -> go Wikipedia -> Wikidata -> TMDB id (P4947 movie / P4983 tv)
        r=jget('https://en.wikipedia.org/w/api.php?'+urllib.parse.urlencode(dict(action='query',format='json',titles=spec['wiki'],prop='pageprops',ppprop='wikibase_item',redirects=1)))
        q=list(r['query']['pages'].values())[0].get('pageprops',{}).get('wikibase_item')
        if q:
            c=jget('https://www.wikidata.org/w/api.php?'+urllib.parse.urlencode(dict(action='wbgetclaims',entity=q,format='json')))['claims']
            for prop,kind in (('P4947','movie'),('P4983','tv')):
                if prop in c: tm=f"{kind}/{c[prop][0]['mainsnak']['datavalue']['value']}";spec['tmdb_resolved']=tm;break
    if tm:
        h=cget('https://www.themoviedb.org/'+tm).decode('utf8','replace')
        u=re.search(r'property="og:image" content="([^"]+)"',h).group(1)
    else:
        r=jget('https://en.wikipedia.org/w/api.php?'+urllib.parse.urlencode(dict(action='query',format='json',titles=spec['wiki'],prop='pageimages',piprop='thumbnail',pithumbsize=500,redirects=1)))
        u=list(r['query']['pages'].values())[0]['thumbnail']['source']
    from PIL import Image
    im=Image.open(io.BytesIO(cget(u) if 'tmdb' in u else get(u))).convert('RGB');w=300;im=im.resize((w,int(im.height*w/im.width)));im.save(fn,'WEBP',quality=80)
    return fn
def link(spec): return 'https://www.themoviedb.org/'+(spec.get('tmdb') or spec.get('tmdb_resolved')) if (spec.get('tmdb') or spec.get('tmdb_resolved')) else 'https://en.wikipedia.org/wiki/'+urllib.parse.quote(spec['wiki'].replace(' ','_'))
RULES=[(re.compile(r['match'],re.I),re.compile(r['ctx'],re.I) if r.get('ctx') else None,re.compile(r['not'],re.I) if r.get('not') else None,r['art']) for r in PINS['rules']]
pinned=collections.Counter();art_ok={}
for v in vids:
    for rx,ctx,neg,k in RULES:
        if rx.search(v['name']) and not (neg and neg.search(v['name'])) and (not ctx or ctx.search(' / '.join(chain(v)))):
            if k not in art_ok:
                try: art_ok[k]=save_art(k,PINS['art'][k])
                except Exception as e: art_ok[k]=None;print('pin art failed',k,e,file=sys.stderr)
            if art_ok[k]:
                P[v['id']]=dict(url=art_ok[k],source='pinned',matchedTitle=PINS['art'][k]['title'],link=link(PINS['art'][k]));pinned[k]+=1
            break
json.dump(P,open('data/posters.json','w'),separators=(',',':'));json.dump(CACHE,open(CACHE_F,'w'),separators=(',',':'))
print('poster_fix: year/title re-matched',fixed,'| cleared wrong-year',cleared,'| pinned',dict(pinned))
