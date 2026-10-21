import json,re,os,sys,urllib.request,urllib.parse,collections,concurrent.futures as cf,difflib,io
os.chdir(os.path.dirname(__file__)+'/..')
UA={'User-Agent':'FEFCCollection/1.0 (faneditfanclub.com poster indexer)'}
def get(u,t=30):
    return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=t).read()
def jget(u):
    for i in range(3):
        try: return json.loads(get(u))
        except Exception as e: err=e
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
vids=[x for x in by.values() if x['mimeType']!=FOLD and (x['mimeType'].startswith('video') or x['name'].lower().endswith(VEXT)) and not x['name'].startswith('._')]
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
from PIL import Image
def save(u,key):
    fn=f'assets/posters/{key}.webp'
    if not os.path.exists(fn):
        im=Image.open(io.BytesIO(get(u))).convert('RGB');w=300;im=im.resize((w,int(im.height*w/im.width)));im.save(fn,'WEBP',quality=72)
    return fn
LIMIT=int(sys.argv[1]) if len(sys.argv)>1 else 10**9
work=vids[:LIMIT]
P={v['id']:parse(v['name'],v.get('parent')) for v in work}
bases=collections.OrderedDict();cuts=collections.OrderedDict()
for b,c,y in P.values():
    bases.setdefault((b,y),None)
    if c: cuts.setdefault((b,c),None)
cuts=collections.OrderedDict(list(cuts.items())[:int(os.environ.get('CUTS','1500'))])
print('videos',len(work),'bases',len(bases),'cuts',len(cuts),flush=True)
with cf.ThreadPoolExecutor(12) as ex:
    for k,r in zip(bases,ex.map(lambda k:wiki(*k),bases)): bases[k]=r
print('wiki done',sum(1 for v in bases.values() if v),flush=True)
with cf.ThreadPoolExecutor(10) as ex:
    for k,r in zip(cuts,ex.map(lambda k:fanedit(*k),cuts)): cuts[k]=r
print('fanedit done',sum(1 for v in cuts.values() if v),flush=True)
out={};cnt=collections.Counter();doubt=[]
for v in work:
    b,c,y=P[v['id']];cm=cuts.get((b,c)) if c else None
    if cm:
        try:
            key=re.sub(r'[^a-z0-9]+','-',norm(cm['matchedTitle']))[:60]
            out[v['id']]=dict(url=save(cm['src'],key),source='custom',matchedTitle=cm['matchedTitle'],link=cm['link']);cnt['custom']+=1;continue
        except Exception as e: pass
    w=bases.get((b,y))
    if w:
        out[v['id']]={k:w[k] for k in ('url','source','matchedTitle','link')};cnt['original']+=1
        if w['score']<1: doubt.append((v['name'],w['matchedTitle'],w['score']))
    else: cnt['none']+=1
json.dump(out,open('data/posters.json','w'),separators=(',',':'))
top=[v for v in work if depth.get(v['id'],99)<=2]
print('coverage',dict(cnt),'of',len(work),'| depth<=2:',sum(1 for v in top if v['id'] in out),'/',len(top))
json.dump(dict(counts=cnt,doubtful=sorted(set(doubt))),open('tools/posters_log.json','w'),indent=1)
