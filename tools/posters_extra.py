"""Fill missing video posters by source title (series-level reuse).
Order per title: TMDB (tv/movie multi) -> OMDb -> TVmaze -> Wikipedia infobox image (films, shows, games, anime, comics).
Editor custom posters / existing entries in data/posters.json are never overwritten. Cache: tools/posters_extra_cache.json"""
import json,re,os,urllib.request,urllib.parse,concurrent.futures as cf,collections
os.chdir(os.path.dirname(os.path.abspath(__file__))+'/..')
cfg=open('config.js').read();K=lambda n:(re.search(n+r"\s*:\s*['\"]([^'\"]+)",cfg) or [None,None])[1]
TMDB,OMDB=K('TMDB_API_KEY'),K('OMDB_API_KEY')
UA={'User-Agent':'FEFCCollection/1.0 (faneditfanclub.com poster indexer)'}
def j(u):
    for _ in range(2):
        try: return json.loads(urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=20).read())
        except Exception: pass
GAME=re.compile(r"\bgame fan edit\b|\bgame\b(?= movie)|\bgamecut\b|\bvideo ?game\b|:? the game\b|\bx files game\b|telltale|alien: (isolation|blackout)|batman: arkham|assassin'?s creed|l\.a\. noire|indiana jones and the (emperor'?s tomb|infernal machine|staff of kings|great circle)|red dead (redemption|revolver)|grand theft auto|\bhalo\b|the saboteur|alan wake|metal gear|uncharted|god of war|mass effect(?!: paragon)|tomb raider|kingdom hearts|final fantasy|days gone|detroit: become|until dawn|heavy rain|quantum break|max payne|gears of war|bioshock|death stranding|ghost of tsushima|horizon (zero|forbidden)",re.I)
def src_title(name):
    n=re.sub(r'\.[A-Za-z0-9]{2,4}$','',name)
    n=re.sub(r'^(\[[^\]]*\]\s*)+','',n);n=re.sub(r'^y2mate\.com\s*-\s*','',n,flags=re.I)
    seg=n.split(' - ')[0]
    seg=re.split(r'\s*(?:,|&| and )\s*(?=[A-Z])',seg)[0] if re.search(r',|&',seg) else seg
    seg=re.sub(r'\((?:\d{4})(?:\s*-\s*\d{4})?\)','',seg)
    seg=re.sub(r'\b(Mini-Series|Series|Saga|Supercut|Refocused|Chronological|Fan Edit|Edition|Extended|Cut)\b.*$','',seg,flags=re.I)
    seg=re.sub(r'\bS\d{1,2}E\d{1,3}\b.*$','',seg,flags=re.I);seg=re.sub(r'\bEpisode\s*\d+.*$','',seg,flags=re.I)
    seg=re.sub(r'_\d{3,4}p.*$','',seg);seg=re.sub(r'\s*:\s*$','',seg)
    try:
        from series_match import wants_tv
        tv = wants_tv(name)
    except Exception:
        tv = bool(re.search(r'\b(series|season|s\d+e\d+|episode)\b', name or '', re.I))
    return re.sub(r'\s+',' ',seg).strip(' -:._'),bool(GAME.search(name)),tv
def tmdb(t, tv=False):
    if not TMDB: return None
    if tv:
        r=j('https://api.themoviedb.org/3/search/tv?'+urllib.parse.urlencode({'api_key':TMDB,'query':t}))
        for x in (r or {}).get('results',[]):
            if x.get('poster_path'): return {'url':'https://image.tmdb.org/t/p/w500'+x['poster_path'],'source':'tmdb-tv','matchedTitle':x.get('name') or x.get('title') or t}
        return None
    r=j('https://api.themoviedb.org/3/search/multi?'+urllib.parse.urlencode({'api_key':TMDB,'query':t}))
    for x in (r or {}).get('results',[]):
        if x.get('poster_path') and x.get('media_type') in ('tv','movie'): return {'url':'https://image.tmdb.org/t/p/w500'+x['poster_path'],'source':'tmdb','matchedTitle':x.get('name') or x.get('title')}
def omdb(t):
    if not OMDB: return None
    r=j('https://www.omdbapi.com/?'+urllib.parse.urlencode({'apikey':OMDB,'t':t}))
    if r and r.get('Poster','N/A')!='N/A': return {'url':r['Poster'],'source':'omdb','matchedTitle':r.get('Title')}
import difflib
def nrm(x): return re.sub(r'[^a-z0-9]+',' ',re.sub(r'\s*\((?:\d{4}\s*)?(?:film|tv series|video game|series|miniseries|american tv series|\d{4} film|\d{4} video game)[^)]*\)','',(x or '').lower())).strip()
def sim(a,b):
    a,b=nrm(a),nrm(b)
    return 1.0 if a==b else difflib.SequenceMatcher(None,a,b).ratio()
def tvmaze(t):
    r=j('https://api.tvmaze.com/singlesearch/shows?'+urllib.parse.urlencode({'q':t}))
    if r and r.get('image') and sim(t,r.get('name'))>=.85: return {'url':r['image'].get('original') or r['image'].get('medium'),'source':'tvmaze','matchedTitle':r.get('name')}
WP='https://en.wikipedia.org/w/api.php?'
def _pick(pages,t,game):
    for p in sorted(pages,key=lambda p:p.get('index',0)):
        o=p.get('original');ti=p.get('title','')
        if not o or o['height']<o['width']*1.15: continue
        if sim(t,ti)<.8 and not nrm(ti).startswith(nrm(t)): continue
        if game and 'video game' not in (p.get('pageprops',{}).get('wikibase-shortdesc','')+ti).lower() and not re.search(r'game',p.get('pageprops',{}).get('wikibase-shortdesc',''),re.I): continue
        return {'url':o['source'],'source':'wikipedia','matchedTitle':ti,'link':'https://en.wikipedia.org/wiki/'+urllib.parse.quote(ti.replace(' ','_'))}
def wiki(t,game=False,tv=False):
    base={'action':'query','format':'json','prop':'pageimages|pageprops','piprop':'original','pilicense':'any','ppprop':'wikibase-shortdesc','redirects':1}
    if game:
        cands=[t+' (video game)',t]
    elif tv:
        cands=[t+' (TV series)', t+' (television series)', t]
    else:
        cands=[t+' (TV series)',t+' (film)',t]
    r=j(WP+urllib.parse.urlencode(dict(base,titles='|'.join(cands))))
    hit=_pick(list(((r or {}).get('query') or {}).get('pages',{}).values()),t,game)
    if hit: return hit
    r=j(WP+urllib.parse.urlencode(dict(base,generator='search',gsrsearch=t+(' video game' if game else ''),gsrlimit=4)))
    return _pick(list(((r or {}).get('query') or {}).get('pages',{}).values()),t,game)
def resolve(k):
    t, game = k[0], k[1]
    tv = k[2] if len(k) > 2 else False
    if len(t)<2: return None
    if game:
        order=[lambda:wiki(t,True),lambda:tmdb(t)]
    elif tv:
        order=[lambda:tmdb(t, True), lambda:wiki(t, False, True), lambda:tvmaze(t)]
    else:
        order=[lambda:tmdb(t),lambda:omdb(t),lambda:wiki(t),lambda:tvmaze(t)]
    for f in order:
        try: r=f()
        except Exception: r=None
        if r and r.get('url'): return r
if __name__=='__main__':
    d=json.load(open('data/index.json'));P=json.load(open('data/posters.json'))
    CP='tools/posters_extra_cache.json';C=json.load(open(CP)) if os.path.exists(CP) else {}
    V=[x for x in d['items'] if x.get('kind')=='video' and not x['name'].startswith('._')]
    miss=[x for x in V if x['id'] not in P and (x.get('targetId') or '') not in P]
    keys=collections.Counter(src_title(x['name']) for x in miss)
    todo=[k for k in keys if '|'.join(map(str,k)) not in C]
    print('missing',len(miss),'titles',len(keys),'to query',len(todo))
    # most-used titles first; cache saved as we go
    todo.sort(key=lambda k:-keys[k])
    with cf.ThreadPoolExecutor(12) as ex:
        for i,(k,r) in enumerate(zip(todo,ex.map(resolve,todo))):
            C['|'.join(map(str,k))]=r
            if i%200==0: json.dump(C,open(CP,'w'));print('progress',i,len(todo),flush=True)
    json.dump(C,open(CP,'w'),indent=0)
    n=0
    for x in miss:
        r=C.get('|'.join(map(str,src_title(x['name']))))
        if r: P[x['id']]=dict(r,via='posters_extra:'+src_title(x['name'])[0]);n+=1
    json.dump(P,open('data/posters.json','w'),separators=(',',':'))
    still=sum(1 for x in V if x['id'] not in P and (x.get('targetId') or '') not in P)
    print('filled',n,'still missing',still,'of',len(V))
