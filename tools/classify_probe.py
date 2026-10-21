import json,subprocess,concurrent.futures as cf,re,os
d=json.load(open('/tmp/wt8/data/index.json'))['items'];F='application/vnd.google-apps.folder'
T=sorted({x.get('targetId') or x['id'] for x in d if x['mimeType']!=F})
out={}
if os.path.exists('/tmp/probe_all.json'): out=json.load(open('/tmp/probe_all.json'))
T=[t for t in T if t not in out or not out[t].get('st')]
def probe(t):
  for i in range(2):
    r=subprocess.run(['curl','-sI','-r','0-1','--max-time','30',f'https://drive.usercontent.google.com/download?id={t}&export=download&confirm=t'],capture_output=True,text=True).stdout
    if r: break
  h={};st=r.split('\n',1)[0].strip() if r else ''
  for l in r.splitlines():
    if ':' in l: k,v=l.split(':',1);h[k.strip().lower()]=v.strip()
  fn=re.search(r'filename="([^"]*)"',h.get('content-disposition',''));cr=h.get('content-range','')
  return t,{'st':st,'ct':h.get('content-type','').split(';')[0],'fn':fn.group(1) if fn else '','size':int(cr.split('/')[-1]) if '/' in cr and cr.split('/')[-1].isdigit() else None}
n=0
with cf.ThreadPoolExecutor(24) as ex:
  for t,r in ex.map(probe,T):
    out[t]=r;n+=1
    if n%500==0: json.dump(out,open('/tmp/probe_all.json','w'));print(n,flush=True)
json.dump(out,open('/tmp/probe_all.json','w'));print('done',n,flush=True)
