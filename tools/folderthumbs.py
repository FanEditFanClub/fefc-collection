#!/usr/bin/env python3
"""For each known folder, find a public non-black thumbnail of a video inside it (searching up to 2 levels) -> data/folderthumbs.json {folderId: targetFileId}. Read-only."""
import re,json,io,html,os,urllib.request,concurrent.futures as cf
from PIL import Image,ImageStat
UA={'User-Agent':'Mozilla/5.0'};D=os.path.join(os.path.dirname(__file__),'..','data')
ROOT='1kGaeK1unqWD1VOl3-DGWLAxISBhDR3cg'
SEED=[ROOT,'1fEaxNbFIrEwKRygETVm4jgtJGVAqKxGB','1Jb0DtQC05fOdpiNg-O88fUpwI5ic3UHS','1u2B5d9cb1zAtrtdF_rA3eXhtcFgggSib','1503Wl56hzRppaIFcQisvQksOaeYOEjnk']
E_=re.compile(r'<a href="https://drive\.google\.com/(drive/folders|file/d)/([\w-]+)[^"]*"[^>]*>.*?flip-entry-title">([^<]*)<',re.S)
def get(u):
    try:r=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=25);return r.geturl(),r.read()
    except Exception:return None,b''
cache={}
def ls(f):
    if f not in cache:cache[f]=[(k=='drive/folders',i,html.unescape(n)) for k,i,n in E_.findall(get(f'https://drive.google.com/embeddedfolderview?id={f}')[1].decode('utf8','replace'))]
    return cache[f]
VID=re.compile(r'\.(mp4|mkv|m4v|mov|avi|webm)$',re.I)
def good(fid):
    u,_=get(f'https://drive.google.com/file/d/{fid}/view');m=re.search(r'/file/d/([\w-]+)',u or '');t=m.group(1) if m else fid
    _,b=get(f'https://drive.google.com/thumbnail?sz=w320&id={t}')
    try:s=ImageStat.Stat(Image.open(io.BytesIO(b)).convert('L'))
    except Exception:return None
    return t if s.mean[0]>=28 and s.stddev[0]>=12 else None
def thumb(folder,depth=0):
    ents=ls(folder);vids=[i for f,i,n in ents if not f and VID.search(n)]
    for i in vids[:4]:
        t=good(i)
        if t:return t
    if depth<1:
        for f,i,n in ents:
            if f:
                t=thumb(i,depth+1)
                if t:return t
    return None
folders={}
for s in SEED:
    for f,i,n in ls(s):
        if f:folders[i]=n
folders.update({s:'seed' for s in SEED})
out={}
with cf.ThreadPoolExecutor(8) as ex:
    for n,(fid,t) in enumerate(zip(folders,ex.map(thumb,list(folders)))):
        if t:out[fid]=t
        if n%10==0:
            json.dump(out,open(os.path.join(D,'folderthumbs.json'),'w'));print('progress',n,'/',len(folders),'thumbs',len(out),flush=True)
json.dump(out,open(os.path.join(D,'folderthumbs.json'),'w'))
print('DONE',len(out),'of',len(folders))
