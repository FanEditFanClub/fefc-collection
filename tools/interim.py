#!/usr/bin/env python3
"""Listing phase only (no shortcut resolution) -> data/index.interim.json. Build data/index.json from Drive's public 'embeddedfolderview' (works for 'anyone with link' folders, no key). Read-only."""
import re,json,html,sys,time,urllib.request,concurrent.futures as cf,os
ROOT=sys.argv[1] if len(sys.argv)>1 else '1kGaeK1unqWD1VOl3-DGWLAxISBhDR3cg'
OUT=os.path.join(os.path.dirname(__file__),'..','data','index.interim.json')
UA={'User-Agent':'Mozilla/5.0'}
def get(u,tries=4):
    for i in range(tries):
        try:
            r=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30);return r.geturl(),r.read().decode('utf8','replace')
        except Exception as e: time.sleep(2*(i+1))
    return None,''
ENTRY=re.compile(r'<a href="https://drive\.google\.com/(drive/folders|file/d)/([\w-]+)[^"]*"[^>]*>.*?flip-entry-title">([^<]*)<.*?(?:flip-entry-last-modified"><div>([^<]*)<)?',re.S)
items={};folders=[ROOT];seen={ROOT}
def listf(fid):
    _,t=get(f'https://drive.google.com/embeddedfolderview?id={fid}')
    return fid,[(k,i,html.unescape(n),m) for k,i,n,m in ENTRY.findall(t)]
with cf.ThreadPoolExecutor(8) as ex:
    while folders:
        batch,folders=folders,[]
        for fid,ents in ex.map(listf,batch):
            for k,i,n,m in ents:
                fold=k=='drive/folders'
                items.setdefault(i,{'id':i,'name':n,'mimeType':'application/vnd.google-apps.folder' if fold else 'video/*' if re.search(r'\.(mp4|mkv|m4v|avi|mov|webm)$',n,re.I) else 'application/octet-stream','parent':fid,'modified':m or None})
                if fold and i not in seen: seen.add(i);folders.append(i)
        print('folders',len(seen),'items',len(items),flush=True)
for v in items.values():
    if v['mimeType']=='video/*': v['mimeType']='video/mp4'
json.dump({'root':ROOT,'generated':time.strftime('%Y-%m-%d %H:%M'),'partial':True,'items':list(items.values())},open(OUT,'w'))
print('DONE interim folders',len(seen),'items',len(items),flush=True)
