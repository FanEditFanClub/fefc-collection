#!/usr/bin/env python3
"""Folder shortcuts show up in several folders; index.json keeps one parent. Re-list every folder (read-only) -> data/links.json {folderId:[childIds whose stored parent is elsewhere]}."""
import re,json,html,os,urllib.request,concurrent.futures as cf
D=os.path.join(os.path.dirname(__file__),'..','data');d=json.load(open(os.path.join(D,'index.json')))['items']
E_=re.compile(r'<a href="https://drive\.google\.com/(?:drive/folders|file/d)/([\w-]+)')
par={x['id']:x['parent'] for x in d};fs=[x['id'] for x in d if x['mimeType']=='application/vnd.google-apps.folder']+[d[0]['parent'] if False else '1kGaeK1unqWD1VOl3-DGWLAxISBhDR3cg']
def ls(f):
    for i in range(3):
        try:return f,E_.findall(urllib.request.urlopen(urllib.request.Request(f'https://drive.google.com/embeddedfolderview?id={f}',headers={'User-Agent':'Mozilla/5.0'}),timeout=30).read().decode('utf8','replace'))
        except Exception:pass
    return f,[]
out={}
with cf.ThreadPoolExecutor(8) as ex:
    for n,(f,ids) in enumerate(ex.map(ls,fs)):
        x=[i for i in dict.fromkeys(ids) if i in par and par[i]!=f]
        if x:out[f]=x
        if n%200==0:print('listed',n,'/',len(fs),flush=True)
json.dump(out,open(os.path.join(D,'links.json'),'w'));print('DONE folders with extra links',len(out),'links',sum(map(len,out.values())),flush=True)
