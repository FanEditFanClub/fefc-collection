# Precompute source-film metadata for fan edit details pages -> data/metadata.json
# Sources: Wikipedia/Wikidata, IMDb non-commercial ratings dataset, Rotten Tomatoes page (polite), YouTube search for trailers.
import time,json,re,os,sys,urllib.request,urllib.parse,collections,concurrent.futures as cf,difflib,io
os.chdir(os.path.dirname(__file__)+'/..')
UA={'User-Agent':'FEFCCollection/1.0 (faneditfanclub.com metadata indexer; faneditfanclub@gmail.com)'}
def get(u,t=30):
    return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=t).read()
def jget(u):
    for i in range(3):
        try: return json.loads(get(u))
        except Exception as e: err=e;time.sleep(3*2**i)
    return None
d=json.load(open('data/index.json'));L=json.load(open('data/links.json'))
by={};kids=collections.defaultdict(list)
for x in d['items']:
    if x['id'] not in by: by[x['id']]=x; kids[x.get('parent')].append(x['id'])
for p,ids in L.items():
    for i in ids:
        if i not in kids[p]: kids[p].append(i)
FOLD='application/vnd.google-apps.folder'
depth={d['root']:0};q=[d['root']]
while q:
    n=[]
    for p in q:
        for c in kids[p]:
            if c not in depth: depth[c]=depth[p]+1; n.append(c)
    q=n
VEXT=('.mkv','.mp4','.avi','.m4v','.mov','.webm','.wmv','.mpg','.ts')
def isvid(x,dd=0):
    if x['mimeType'].startswith('video') or x['name'].lower().endswith(VEXT+('.m2ts','.mts','.mpeg','.flv','.3gp','.ogv','.vob','.divx')): return True
    t=x.get('targetId')
    if t and t!=x['id'] and t in by and dd<3 and isvid(by[t],dd+1): return True
    return x['mimeType'] in ('application/octet-stream','') and bool(re.search(r'fan ?edit|\bcut\b',x['name'],re.I))
vids=[x for x in by.values() if x['mimeType']!=FOLD and isvid(x) and not x['name'].startswith('._')]
if os.environ.get('ONLY'):
    _only=set(json.load(open(os.environ['ONLY']))); vids=[x for x in vids if x['id'] in _only]
vids.sort(key=lambda v:depth.get(v['id'],99))
NOISE=re.compile(r'\b(fan ?edit|fanedit|4k|1080p|720p|360p|hd|remaster(ed)?|chronological|mashup|workprint)\b',re.I)
EPI=re.compile(r'^(season|episode|part|chapter|s\d+e\d+|vol|disc|day)\b',re.I)
def parse(name,parent):
    s=re.sub(r'\.[A-Za-z0-9]{2,4}$','',name); s=re.sub(r'^y2mate\.com - ','',s); s=s.replace('_',' ')
    yr=re.search(r'\b(19[2-9]\d|20[0-3]\d)\b',s); yr=yr.group(1) if yr else None
    segs=[x.strip() for x in re.split(r'\s+[-–|]\s+',s) if x.strip()]
    base=segs[0] if segs else s
    cut=None
    for g in segs[1:]:
        g2=NOISE.sub('',g).strip(' -')
        if g2 and not EPI.match(g2) and not re.match(r'^\d',g2): cut=g2;break
    base=re.sub(r'(?<=.)\s\(?\b(19|20)\d\d\b\)?','',NOISE.sub('',base)).strip(' -:.')
    base=re.sub(r'\s+',' ',base)
    if not base or re.match(r'^(S\d+E\d+|LS\d+|\d+)',base) or len(base)<3:
        pn=by.get(parent,{}).get('name','');base=re.sub(r'\(.*?\)|season \d+|complete series','',pn,flags=re.I).strip(' -')
    return base,cut,yr
norm=lambda s:re.sub(r'[^a-z0-9]+',' ',re.sub(r'&','and',s.lower())).strip()
WP='https://en.wikipedia.org/w/api.php?'
KIND=re.compile(r'film|series|television|tv |sitcom|show|miniseries|anime|cartoon|animated',re.I)
def wiki(base,yr):
    best=None
    for qq in ([f'{base} {yr} film'] if yr else [])+[f'{base} film',f'{base} television series']:
        r=jget(WP+urllib.parse.urlencode(dict(action='query',format='json',generator='search',gsrsearch=qq,gsrlimit=6,prop='pageimages|description',piprop='thumbnail',pilicense='any',pithumbsize=300)))
        pages=sorted((r or {}).get('query',{}).get('pages',{}).values(),key=lambda p:p.get('index',9))
        for p in pages:
            if 'thumbnail' not in p or not KIND.search(p.get('description','')): continue
            t=re.sub(r'\s*\(.*?\)$','',p['title'])
            sc=difflib.SequenceMatcher(None,norm(t),norm(base)).ratio()
            if norm(t)==norm(base) or norm(t)==re.sub(r' (1|i)$','',norm(base)) or (':' in base and norm(t)==norm(base.split(':')[0])): sc=1.0
            if yr and yr in p.get('description','')+p['title']: sc+=.05
            if not best or sc>best[0]: best=(sc,p,t)
        if best and best[0]>=1: break
    if best and best[0]>=.8:
        p=best[1];return dict(url=p['thumbnail']['source'],source='original',matchedTitle=p['title'],link='https://en.wikipedia.org/wiki/'+urllib.parse.quote(p['title'].replace(' ','_')),score=round(best[0],2))
    return None
def fanedit(base,cut):
    r=jget('https://fanedit.org/wp-json/wp/v2/posts?'+urllib.parse.urlencode({'search':f'{base} {cut}','per_page':5,'_embed':'wp:featuredmedia','_fields':'title,link,_links,_embedded'}))
    for p in r or []:
        t=norm(re.sub(r'&#\d+;',' ',p['title']['rendered'])); ct=set(norm(cut).split())-{'cut','the','a','of','edit'}
        bt=set(norm(base).split()[:2])
        if ct and ct<=set(t.split()) and bt&set(t.split()):
            try:
                m=p['_embedded']['wp:featuredmedia'][0];sz=m.get('media_details',{}).get('sizes',{})
                u=(sz.get('medium_large') or sz.get('medium') or {}).get('source_url') or m['source_url']
                return dict(src=u,matchedTitle=re.sub(r'&#8211;','–',p['title']['rendered']),link=p['link'])
            except Exception: pass
    return None
import gzip,time,html
CACHE='tools/cache/metadata_cache.json'
C=json.load(open(CACHE)) if os.path.exists(CACHE) else {}
for k in ('search','qid','wd','lab','plot','rt','yt'): C.setdefault(k,{})
for k in ('search','qid'): C[k]={a:b for a,b in C[k].items() if b}
def save_cache(): json.dump(C,open(CACHE,'w'))
POST=json.load(open('data/posters.json'))
# 1. source title per video (Wikipedia page title)
P={v['id']:parse(v['name'],v.get('parent')) for v in vids}
need=set()
for v in vids:
    p=POST.get(v['id'])
    if not(p and p.get('source')=='original'):
        b,c,y=P[v['id']];need.add((b,y))
need=[k for k in need if f'{k[0]}|{k[1]}' not in C['search']] if os.environ.get('SEARCH') else []  # en.wikipedia search API rate-limits (429); opt-in
print('videos',len(vids),'wiki searches',len(need),flush=True)
with cf.ThreadPoolExecutor(3) as ex:
    for k,r in zip(need,ex.map(lambda k:wiki(*k),need)): C['search'][f'{k[0]}|{k[1]}']=r and r['matchedTitle']
save_cache()
wt={}
for v in vids:
    p=POST.get(v['id'])
    t=p['matchedTitle'] if p and p.get('source')=='original' else C['search'].get('%s|%s'%(P[v['id']][0],P[v['id']][2]))
    if t: wt[v['id']]=t
titles=sorted(set(wt.values())-set(C['qid']))
WD='https://www.wikidata.org/w/api.php?'
for i in range(0,len(titles),50):
    r=jget(WD+urllib.parse.urlencode(dict(action='wbgetentities',format='json',sites='enwiki',titles='|'.join(titles[i:i+50]),props='sitelinks',sitefilter='enwiki')))
    if not r: continue
    for q,e in r.get('entities',{}).items():
        t=e.get('sitelinks',{}).get('enwiki',{}).get('title')
        if t and q.startswith('Q'): C['qid'][t]=q
    time.sleep(.5)
save_cache();print('qids',sum(1 for t in titles if C['qid'].get(t)),'of',len(titles),flush=True)
def summ(t):
    r=jget('https://en.wikipedia.org/api/rest_v1/page/summary/'+urllib.parse.quote(t.replace(' ','_'),safe=''))
    return r and r.get('extract')
for t,q in list(C['qid'].items()):
    if q and q not in C['plot']:
        x=summ(t)
        if x: C['plot'][q]=x[:900]
        time.sleep(.25)
save_cache();print('plots',len(C['plot']),flush=True)
def wdget(ids,props):
    r=jget(WD+urllib.parse.urlencode(dict(action='wbgetentities',format='json',ids='|'.join(ids),props=props,languages='en')))
    return (r or {}).get('entities',{})
qids=sorted({q for q in C['qid'].values() if q}-set(C['wd']))
def val(c):
    try: return c['mainsnak']['datavalue']['value']
    except Exception: return None
for i in range(0,len(qids),50):
    for q,e in wdget(qids[i:i+50],'claims').items():
        cl=e.get('claims',{});g=lambda p:[val(c) for c in cl.get(p,[]) if val(c) is not None and c.get('rank')!='deprecated']
        ids=lambda p:[x['id'] for x in g(p) if isinstance(x,dict) and 'id' in x]
        dates=[x['time'][1:5] for x in g('P577') if isinstance(x,dict)] or [x['time'][1:5] for x in g('P580') if isinstance(x,dict)]
        dur=[x for x in g('P2047') if isinstance(x,dict)]
        C['wd'][q]=dict(p31=ids('P31'),imdb=(g('P345') or [None])[0],rt=(g('P1258') or [None])[0],year=min(dates) if dates else None,
            dir=ids('P57')[:3],cast=ids('P161')[:8],genre=ids('P136')[:4],runtime=int(float(dur[0]['amount'])) if dur else None,yt=(g('P1651') or [None])[0])
labs=sorted({x for w in C['wd'].values() for k in('dir','cast','genre','p31') for x in w[k]}-set(C['lab']))
for i in range(0,len(labs),50):
    for q,e in wdget(labs[i:i+50],'labels').items(): C['lab'][q]=e.get('labels',{}).get('en',{}).get('value')
save_cache();print('wikidata',len(C['wd']),flush=True)
# IMDb ratings
if not os.path.exists('/tmp/ratings.tsv.gz') or time.time()-os.path.getmtime('/tmp/ratings.tsv.gz')>86400*3:
    open('/tmp/ratings.tsv.gz','wb').write(get('https://datasets.imdbws.com/title.ratings.tsv.gz',120))
want={w['imdb'] for w in C['wd'].values() if w['imdb']};IR={}
for ln in gzip.open('/tmp/ratings.tsv.gz','rt'):
    a=ln.rstrip('\n').split('\t')
    if a[0] in want: IR[a[0]]=(a[1],int(a[2]))
# Rotten Tomatoes (polite: 1 req/1.5s, cached)
BUA={'User-Agent':'Mozilla/5.0 (FEFCCollection metadata indexer; faneditfanclub@gmail.com)'}
def page(u): return urllib.request.urlopen(urllib.request.Request(u,headers=BUA),timeout=30).read().decode('utf8','ignore')
for w in C['wd'].values():
    r=w['rt']
    if not r or r in C['rt']: continue
    try:
        h=page('https://www.rottentomatoes.com/'+r);m=re.search(r'"criticsScore":\{[^}]*?"score":"(\d+)"',h);a=re.search(r'"audienceScore":\{[^}]*?"score":"(\d+)"',h)
        C['rt'][r]=dict(t=m and m.group(1),a=a and a.group(1))
    except Exception as e: C['rt'][r]=None
    time.sleep(1.5)
save_cache();print('rt',sum(1 for x in C['rt'].values() if x and x['t']),flush=True)
OFFICIAL=re.compile(r'20th Century|Warner|Universal|Sony|Paramount|Disney|Marvel|Lionsgate|Pixar|DreamWorks|MGM|Netflix|HBO|Prime Video|Amazon|A24|Focus Features|Searchlight|Rotten Tomatoes Classic|Movieclips|FilmSelect|Trailers|Hulu|Apple TV|Columbia|New Line|Miramax|Neon|Criterion|IFC|Magnolia|STARZ|AMC|Lucasfilm|Star Wars|Peacock|Showtime|FX|BBC|Legendary|Blumhouse|Shout|Arrow|StudioCanal|Kino',re.I)
def ytsearch(q):
    h=page('https://www.youtube.com/results?'+urllib.parse.urlencode(dict(search_query=q)))
    m=re.search(r'var ytInitialData = (\{.*?\});</script>',h)
    if not m: return None
    res=[]
    def walk(o):
        if isinstance(o,dict):
            if 'videoRenderer' in o:
                v=o['videoRenderer'];t=''.join(x.get('text','') for x in v.get('title',{}).get('runs',[]));ch=''.join(x.get('text','') for x in v.get('ownerText',{}).get('runs',[]))
                res.append((v.get('videoId'),t,ch));return
            for x in o.values(): walk(x)
        elif isinstance(o,list):
            for x in o: walk(x)
    walk(json.loads(m.group(1)))
    res=[r for r in res[:8] if r[0] and re.search('trailer|teaser',r[1],re.I)]
    if not res: return None
    off=[r for r in res if OFFICIAL.search(r[2])]
    r=(off or res)[0];return dict(id=r[0],title=r[1],channel=r[2],official=bool(off))
titleOf={}
for t,q in C['qid'].items():
    if q: titleOf.setdefault(q,re.sub(r'\s*\(.*?\)$','',t))
for q,w in C['wd'].items():
    if w['yt'] or q in C['yt']: continue
    tv=any('series' in (C['lab'].get(x) or '') for x in w['p31'])
    try: C['yt'][q]=ytsearch(f"{titleOf.get(q,'')} {w['year'] or ''} official {'series ' if tv else ''}trailer")
    except Exception as e: C['yt'][q]=None
    time.sleep(1.0)
save_cache()
def ytmatch(t,yt):
    a=[w for w in norm(re.sub(r'\(.*?\)','',t)).split() if w not in ('the','a','an','of','and')];b=set(norm(yt).split())
    return bool(a) and all(w in b for w in a)
# build output
old=json.load(open('data/metadata.json'));out={k:v for k,v in old.items() if k not in('films','map','v')}
films={};mp={}
for v in vids:
    t=wt.get(v['id']);q=t and C['qid'].get(t);w=q and C['wd'].get(q)
    if not w: continue
    mp[v['id']]=q
    if q in films: continue
    L=lambda xs:[C['lab'].get(x) for x in xs if C['lab'].get(x)]
    f=dict(title=titleOf.get(q),year=w['year'],wiki='https://en.wikipedia.org/wiki/'+urllib.parse.quote(t.replace(' ','_')),
        director=L(w['dir']),cast=L(w['cast']),genres=L(w['genre']),runtime=w['runtime'],plot=C['plot'].get(q),
        tv=any(re.search('series|television',C['lab'].get(x) or '') for x in w['p31']))
    if w['imdb']:
        f['imdb']=w['imdb']
        if w['imdb'] in IR: f['imdbRating'],f['imdbVotes']=IR[w['imdb']]
    rt=w['rt'] and C['rt'].get(w['rt'])
    if w['rt']: f['rt']=w['rt']
    if rt and rt.get('t'): f['rtScore']=int(rt['t'])
    if rt and rt.get('a'): f['rtAudience']=int(rt['a'])
    if w['yt']: f['trailer']=dict(id=w['yt'],src='wikidata')
    elif C['yt'].get(q) and ytmatch(titleOf.get(q,''),C['yt'][q]['title']): y=C['yt'][q];f['trailer']=dict(id=y['id'],src='youtube',official=y['official'],channel=y['channel'])
    films[q]={k:x for k,x in f.items() if x not in(None,[],'',False)}
fe={}
for v in vids:
    p=POST.get(v['id'])
    if p and p.get('source')=='custom' and 'fanedit.org' in p.get('link',''): fe[v['id']]=p['link']
out['v']=2;out['films']=films;out['map']=mp;out['ifdb']=fe
json.dump(out,open('data/metadata.json','w'),separators=(',',':'),ensure_ascii=False)
cnt=collections.Counter()
for v in vids:
    f=films.get(mp.get(v['id']))
    if not f: continue
    cnt['matched']+=1
    for k in('imdbRating','rtScore','trailer','plot','cast','director'):
        if k in f: cnt[k]+=1
rep=dict(videos=len(vids),films=len(films),**cnt,ifdb=len(fe),bytes=os.path.getsize('data/metadata.json'))
print('coverage',rep);json.dump(rep,open('tools/metadata_log.json','w'),indent=1)
# drop trailers YouTube won't embed (oEmbed 401/404)
def embeddable(v):
    try: urllib.request.urlopen(urllib.request.Request('https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v='+v,headers=UA),timeout=20);return True
    except urllib.error.HTTPError as e: return e.code not in (401,403,404)
    except Exception: return True
def prune_trailers(path='data/metadata.json'):
    M=json.load(open(path));fs=[f for f in M['films'].values() if 'trailer' in f]
    with cf.ThreadPoolExecutor(8) as ex: ok=list(ex.map(lambda f:embeddable(f['trailer']['id']),fs))
    n=0
    for f,k in zip(fs,ok):
        if not k: del f['trailer'];n+=1
    json.dump(M,open(path,'w'),separators=(',',':'),ensure_ascii=False);print('trailers dropped (not embeddable):',n)
prune_trailers()
