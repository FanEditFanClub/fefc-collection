#!/usr/bin/env python3
"""Resolve shortcut targets for non-video, non-folder entries in data/index.json (read-only GET of /file/d/<id>/view)."""
import re,json,os,urllib.request,concurrent.futures as cf
P=os.path.join(os.path.dirname(__file__),'..','data','index.json');d=json.load(open(P))
todo=[v for v in d['items'] if v['mimeType']=='application/octet-stream' and 'targetId' not in v]
def res(v):
    try:u=urllib.request.urlopen(urllib.request.Request(f"https://drive.google.com/file/d/{v['id']}/view",headers={'User-Agent':'Mozilla/5.0'}),timeout=30).geturl()
    except Exception:return
    m=re.search(r'/(?:file|document|spreadsheets|presentation)/d/([\w-]+)',u or '')
    if m and m.group(1)!=v['id']:v['targetId']=m.group(1)
    if '/document/' in (u or ''):v['targetMime']='application/vnd.google-apps.document'
    elif '/spreadsheets/' in (u or ''):v['targetMime']='application/vnd.google-apps.spreadsheet'
with cf.ThreadPoolExecutor(10) as ex:
    for n,_ in enumerate(ex.map(res,todo)):
        if n%500==0:print('resolved',n,'/',len(todo),flush=True)
json.dump(d,open(P+'.tmp','w'));os.replace(P+'.tmp',P);print('DONE',sum('targetId' in v for v in todo),'of',len(todo),flush=True)
