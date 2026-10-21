import json,random,subprocess,os,re,collections,sys
os.chdir('/workspace/fefc-app')
d=json.load(open('data/index.json'))['items']
byid={x['id']:x for x in d}
v=[x for x in d if x.get('mimeType','').startswith('video')]
famous=re.compile(r'(star wars|alien|predator|terminator|matrix|batman|superman|marvel|avengers|spider|lord of the rings|hobbit|harry potter|jurassic|indiana|back to the future|godzilla|king kong|blade runner|mad max|star trek|x-men|dune|james bond|007|ghostbusters|rocky|die hard|robocop|halloween|jaws|pirates|transformers|mission|fast|john wick|hulk|iron man|thor|captain|joker|wonder woman|flash|2001|ring|godfather|titanic|avatar|shrek|toy story|lion king|gladiator|top gun|ace ventura|mask|true lies|total recall|kill bill|sin city|watchmen|hellboy|tron|planet of the apes)',re.I)
def top(x):
  p=x.get('parent');last=p
  while p in byid and byid[p].get('parent') in byid: last=p;p=byid[p].get('parent')
  return p
random.seed(7)
fam=[x for x in v if famous.search(x['name'])];random.shuffle(fam)
oth=[x for x in v if not famous.search(x['name'])];random.shuffle(oth)
seen=collections.Counter();cands=[]
for x in fam[:400]+oth[:200]:
  k=x.get('parent');f=famous.search(x['name']);fk=f.group(0).lower() if f else x['name'][:10]
  if seen[k]>=2 or seen['f:'+fk]>=2: continue
  seen[k]+=1;seen['f:'+fk]+=1;cands.append(x)
os.makedirs('assets/clips',exist_ok=True)
out=[];n=0
def url(i): return f'https://drive.usercontent.google.com/download?id={i}&export=download&confirm=t'
for x in cands:
  if n>=50: break
  i=x.get('targetId') or x['id'];u=url(i)
  try:
    dur=float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',u],capture_output=True,text=True,timeout=40).stdout.strip())
  except Exception: continue
  if dur<300: continue
  ok=False
  for t in range(4):
    ss=dur*random.uniform(.2,.7);fn=f'assets/clips/{n}.mp4'
    r=subprocess.run(['ffmpeg','-y','-v','error','-ss',f'{ss:.1f}','-i',u,'-t','4','-an','-vf','scale=384:216:force_original_aspect_ratio=increase,crop=384:216,fps=24,format=yuv420p','-c:v','libx264','-profile:v','main','-crf','30','-preset','slow','-movflags','+faststart',fn],capture_output=True,timeout=120)
    if r.returncode or not os.path.exists(fn) or os.path.getsize(fn)<20000: continue
    s=subprocess.run(['ffmpeg','-v','info','-i',fn,'-vf','signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-','-f','null','-'],capture_output=True,text=True).stdout
    ys=[float(m) for m in re.findall(r'YAVG=([\d.]+)',s)]
    lo=sum(1 for y in ys if y<28)
    if not ys or sum(ys)/len(ys)<40 or lo>len(ys)*.25: continue
    subprocess.run(['ffmpeg','-y','-v','error','-ss','1','-i',fn,'-frames:v','1','-q:v','6',f'assets/clips/{n}.jpg'])
    ok=True;break
  if ok:
    out.append({'n':n,'id':x['id'],'target':i,'title':re.sub(r'\.(mp4|mkv)$','',x['name']),'src':f'assets/clips/{n}.mp4','poster':f'assets/clips/{n}.jpg'})
    print(n,x['name'],os.path.getsize(fn),flush=True);n+=1
  elif os.path.exists(f'assets/clips/{n}.mp4'): os.remove(f'assets/clips/{n}.mp4')
json.dump(out,open('data/clips.json','w'),indent=1)
