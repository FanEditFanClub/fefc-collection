#!/usr/bin/env python3
"""Build data/dates.json {id:{m:'YYYY-MM-DD'}} from public embeddedfolderview last-modified column. Read-only."""
import re,json,html,time,datetime,urllib.request,concurrent.futures as cf,os
D=os.path.join(os.path.dirname(__file__),'..','data')
idx=json.load(open(f'{D}/index.json'));items=idx['items']
folders=[idx['root']]+[i['id'] for i in items if i['mimeType']=='application/vnd.google-apps.folder']
UA={'User-Agent':'Mozilla/5.0'};today=datetime.date.today()
ENT=re.compile(r'/(?:drive/folders|file/d)/([\w-]+).*?flip-entry-last-modified"><div>([^<]*)<',re.S)
MON={m:i+1 for i,m in enumerate('Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split())}
def parse(s):
    s=s.strip()
    if m:=re.fullmatch(r'(\d+)/(\d+)/(\d+)',s): y=2000+int(m[3]);y-=100 if y>today.year else 0;return datetime.date(y,int(m[1]),int(m[2]))
    if m:=re.fullmatch(r'([A-Z][a-z]{2}) (\d+)',s):
        d=datetime.date(today.year,MON[m[1]],int(m[2]));return d if d<=today else d.replace(year=d.year-1)
    if re.search(r'\d:\d\d',s): return today
def get(fid):
    for t in range(4):
        try:
            h=urllib.request.urlopen(urllib.request.Request(f'https://drive.google.com/embeddedfolderview?id={fid}',headers=UA),timeout=30).read().decode('utf8','replace')
            return [x for x in h.split('flip-entry"')[1:]]
        except Exception: time.sleep(2*(t+1))
    return []
out={}
with cf.ThreadPoolExecutor(12) as ex:
    for n,chunks in enumerate(ex.map(get,folders)):
        for c in chunks:
            m=ENT.search(c)
            if m and (d:=parse(html.unescape(m[2]))): out[m[1]]={'m':d.isoformat()}
        if n%200==0: print(n,len(folders),len(out),flush=True)
json.dump(out,open(f'{D}/dates.json','w'),separators=(',',':'))
vids={i['id'] for i in items if i['mimeType'].startswith('video/')}
print('DONE dated',len(out),'videos dated',len(vids&out.keys()),'/',len(vids))
