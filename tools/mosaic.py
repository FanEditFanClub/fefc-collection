#!/usr/bin/env python3
"""Pick ~60 public, non-black Drive thumbnails of fan edits for the home mosaic -> data/mosaic.json. Read-only."""
import re,json,random,io,urllib.request,concurrent.futures as cf,os,html
from PIL import Image,ImageStat
ROOT='1kGaeK1unqWD1VOl3-DGWLAxISBhDR3cg';UA={'User-Agent':'Mozilla/5.0'}
OUT=os.path.join(os.path.dirname(__file__),'..','data','mosaic.json')
def get(u):
    try:r=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=25);return r.geturl(),r.read()
    except Exception:return None,b''
E_=re.compile(r'<a href="https://drive\.google\.com/(drive/folders|file/d)/([\w-]+)[^"]*"[^>]*>.*?flip-entry-title">([^<]*)<',re.S)
def ls(f):return [(k,i,html.unescape(n)) for k,i,n in E_.findall(get(f'https://drive.google.com/embeddedfolderview?id={f}')[1].decode('utf8','replace'))]
top=[i for k,i,n in ls(ROOT) if k=='drive/folders']
random.seed(7);random.shuffle(top)
vids=[]
with cf.ThreadPoolExecutor(8) as ex:
    for ents in ex.map(ls,top[:70]):
        v=[(i,n) for k,i,n in ents if k=='file/d' and re.search(r'\.(mp4|mkv|m4v|mov|avi)$',n,re.I)]
        random.shuffle(v);vids+=v[:3]
    def chk(v):
        i,n=v;u,_=get(f'https://drive.google.com/file/d/{i}/view');m=re.search(r'/file/d/([\w-]+)',u or '');t=m.group(1) if m else i
        _,b=get(f'https://drive.google.com/thumbnail?sz=w480&id={t}')
        try:im=Image.open(io.BytesIO(b)).convert('L');s=ImageStat.Stat(im)
        except Exception:return None
        if s.mean[0]<28 or s.stddev[0]<12:return None
        return {'id':i,'target':t,'name':n}
    good=[g for g in ex.map(chk,vids) if g]
json.dump(good[:80],open(OUT,'w'));print('mosaic',len(good),'of',len(vids))
