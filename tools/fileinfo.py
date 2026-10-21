#!/usr/bin/env python3
"""Read-only: for every video (shortcuts resolved to their target) fetch the public Drive viewer page and
record size + owner email -> data/fileinfo.json  {targetId: {"s":bytes,"o":"owner@x"}}. Cached in tools/cache/fileinfo_cache.json."""
import json,re,os,time,urllib.request,concurrent.futures as cf
os.chdir(os.path.dirname(os.path.abspath(__file__))+'/..')
d=json.load(open('data/index.json'));by={x['id']:x for x in d['items']}
def isv(x): return x.get('kind')=='video' or x['mimeType'].startswith('video')
T=sorted({x.get('targetId') or x['id'] for x in d['items'] if isv(x)})
CP='tools/cache/fileinfo_cache.json';C=json.load(open(CP)) if os.path.exists(CP) else {}
def one(t):
    for i in range(3):
        try:
            s=urllib.request.urlopen(urllib.request.Request(f'https://drive.google.com/file/d/{t}/view',headers={'User-Agent':'Mozilla/5.0'}),timeout=30).read().decode('utf8','replace')
            m=re.search(r'\[null,null,"(\d+)"\]',s);o=re.search(r'\]\],null,null,null,null,null,null,\d,null,\d,null,"([^"@\s]+@[^"\s]+)"',s) or re.search(r'"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,})"',s)
            return t,{'s':int(m.group(1)) if m else None,'o':o.group(1) if o else None}
        except Exception as e:
            if '404' in str(e) or '403' in str(e): return t,{'s':None,'o':None,'err':str(e)[:20]}
            time.sleep(2*(i+1))
    return t,None
todo=[t for t in T if t not in C];print('targets',len(T),'todo',len(todo),flush=True)
with cf.ThreadPoolExecutor(20) as ex:
    for n,(t,r) in enumerate(ex.map(one,todo)):
        if r: C[t]=r
        if n%500==0: json.dump(C,open(CP,'w'));print(n,flush=True)
json.dump(C,open(CP,'w'))
out={}
for t in T:
    r=C.get(t) or {};x=by.get(t,{});s=r.get('s') or x.get('size');o=r.get('o')
    e={k:v for k,v in (('s',s),('o',o)) if v}
    if e: out[t]=e
json.dump(out,open('data/fileinfo.json','w'),separators=(',',':'))
print('wrote',len(out),'size',sum('s' in v for v in out.values()),'owner',sum('o' in v for v in out.values()))
