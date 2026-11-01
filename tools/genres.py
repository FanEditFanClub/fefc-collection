#!/usr/bin/env python3
"""Genre map for top-level collection folders from Wikidata (free, no key). Folder -> best-matching film/TV/franchise item -> P136 genres -> coarse buckets. Unmatched -> Uncategorized."""
import json,re,urllib.request,urllib.parse,os,time
D=os.path.join(os.path.dirname(__file__),'..','data')
idx=json.load(open(os.path.join(D,'index.partial.json')))
ROOT=idx['root'];UA={'User-Agent':'FEFC-collection-app/1.0 (faneditfanclub@gmail.com)'}
def j(u):
    for i in range(3):
        try:return json.load(urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30))
        except Exception:time.sleep(2)
    return {}
BUCK=[('Action',r'action'),('Sci-Fi',r'science fiction|cyberpunk|space opera|dystopian'),('Horror',r'horror|slasher|zombie'),('Comedy',r'comed|sitcom|parody'),
 ('Animation',r'anim|cartoon|anime'),('Drama',r'drama'),('Fantasy',r'fantasy'),('Superhero',r'superhero'),('Thriller',r'thriller|mystery|neo-noir'),('Crime',r'crime|gangster|heist'),
 ('Adventure',r'adventure'),('War',r'war film|war drama|military'),('Western',r'(?<!contemporary )(?<!neo-)western'),('Family',r'family|children'),('Musical',r'music'),('Documentary',r'documentary')]
skip=re.compile(r'^\d+\s*-\s*|^z\s*-',re.I)
out={}
for f in idx['items']:
    if f['parent']!=ROOT or f['mimeType']!='application/vnd.google-apps.folder' or skip.match(f['name']):continue
    q=re.sub(r'\s*-\s*.*$','',f['name']) if ' - ' in f['name'] else f['name']
    s=j('https://www.wikidata.org/w/api.php?'+urllib.parse.urlencode({'action':'wbsearchentities','search':q,'language':'en','limit':5,'type':'item','format':'json'}))
    genres=[];match=None
    for c in s.get('search',[]):
        d=(c.get('description') or '').lower()
        if not re.search(r'film|series|franchise|television|movie|anim|show|video game',d) or re.search(r'actor|actress|director|filmmaker|person|human',d):continue
        if re.sub(r'\W','',(c.get('label') or '').lower())[:12]!=re.sub(r'\W','',q.lower())[:12]:continue
        e=j(f"https://www.wikidata.org/wiki/Special:EntityData/{c['id']}.json").get('entities',{}).get(c['id'],{})
        gids=[x['mainsnak'].get('datavalue',{}).get('value',{}).get('id') for x in e.get('claims',{}).get('P136',[])]
        gids=[g for g in gids if g]
        if not gids:continue
        L=j('https://www.wikidata.org/w/api.php?'+urllib.parse.urlencode({'action':'wbgetentities','ids':'|'.join(gids[:40]),'props':'labels','languages':'en','format':'json'})).get('entities',{})
        labels=[v.get('labels',{}).get('en',{}).get('value','') for v in L.values()]
        genres=sorted({b for b,rx in BUCK for l in labels if re.search(rx,l,re.I)});match={'qid':c['id'],'label':c.get('label'),'desc':d,'wikidataGenres':labels}
        if genres:break
    out[f['id']]={'folder':f['name'],'genres':genres or ['Uncategorized'],'source':match}
    print(f['name'],'->',out[f['id']]['genres'],flush=True)
json.dump(out,open(os.path.join(D,'genres.json'),'w'),indent=0)
m=sum(1 for v in out.values() if v['genres']!=['Uncategorized']);print('MATCHED',m,'of',len(out))
