#!/usr/bin/env python3
"""0.4.0 read-only: public Drive player info (get_video_info) for every video target -> adds "d" (seconds) and "r"
(best playback resolution, e.g. 1080p) to data/fileinfo.json. Nothing on Drive is modified. Cache: tools/cache/mediainfo_cache.json."""
import json,os,time,urllib.request,urllib.parse as up,concurrent.futures as cf
os.chdir(os.path.dirname(os.path.abspath(__file__))+'/..')
FI=json.load(open('data/fileinfo.json'))
CP='tools/cache/mediainfo_cache.json';C=json.load(open(CP)) if os.path.exists(CP) else {}
def res(h):
    return '4K' if h>=2000 else '1440p' if h>=1400 else '1080p' if h>=1000 else '720p' if h>=700 else '480p' if h>=460 else '360p' if h>=340 else '%dp'%h
def one(t):
    for i in range(3):
        try:
            s=urllib.request.urlopen(urllib.request.Request('https://drive.google.com/get_video_info?docid=%s&drive_originator_app=303'%t,headers={'User-Agent':'Mozilla/5.0'}),timeout=30).read().decode('utf8','replace')
            d=up.parse_qs(s)
            if (d.get('status') or [''])[0]!='ok': return t,{}
            hs=[int(x.split('/')[1].split('x')[1]) for x in (d.get('fmt_list') or [''])[0].split(',') if x.count('/')>=1 and 'x' in x.split('/')[1]]
            r={}
            if d.get('length_seconds'): r['d']=int(d['length_seconds'][0])
            if hs: r['r']=res(max(hs))
            return t,r
        except Exception: time.sleep(2*(i+1))
    return t,None
todo=[t for t in FI if t not in C];print('todo',len(todo),flush=True)
with cf.ThreadPoolExecutor(12) as ex:
    for n,(t,r) in enumerate(ex.map(one,todo)):
        if r is not None: C[t]=r
        if n%500==0: os.makedirs('tools/cache',exist_ok=True);json.dump(C,open(CP,'w'));print(n,flush=True)
json.dump(C,open(CP,'w'))
for t,v in FI.items(): v.update(C.get(t) or {})
json.dump(FI,open('data/fileinfo.json','w'),separators=(',',':'))
print('dur',sum('d' in v for v in FI.values()),'res',sum('r' in v for v in FI.values()))
