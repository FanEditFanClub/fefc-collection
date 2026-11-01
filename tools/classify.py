# Resolves each item's real type from public Drive responses (download headers, magic bytes, file page mime).
# Run: python3 tools/classify_probe.py && python3 tools/classify.py   (no API key needed)
import json,re,os,subprocess,collections,concurrent.futures as cf,sys
import pathlib
REPO=pathlib.Path(__file__).resolve().parent.parent
IDX=os.environ.get('FEFC_INDEX') or str(REPO/'data'/'index.json');D=json.load(open(IDX));d=D['items'];F='application/vnd.google-apps.folder'
TMP=os.environ.get('FEFC_TMP') or str(REPO/'tools'/'cache')
os.makedirs(TMP,exist_ok=True)
PP=os.path.join(TMP,'probe_all.json');P=json.load(open(PP)) if os.path.exists(PP) else {}
by={x['id']:x for x in d}
VEXT={'mp4','mkv','m4v','mov','avi','webm','ts','m2ts','wmv','mpg','mpeg','flv','vob','divx','m2t','mts','3gp','ogv'}
DOCEXT={'pdf','doc','docx','txt','rtf','odt','html','htm','xls','xlsx','csv','ppt','pptx','md','url'}
def ext(n):
  m=re.search(r'\.([A-Za-z0-9]{2,6})$',n or '');return m.group(1).lower() if m else ''
def tgt(x): return x.get('targetId') or x['id']
def sniff(t):
  try:
    b=subprocess.run(['curl','-s','-r','0-31','--max-time','30',f'https://drive.usercontent.google.com/download?id={t}&export=download&confirm=t'],capture_output=True).stdout
  except Exception: return None
  if len(b)<12 or b[:1]==b'<': return None
  if b[:4]==b'\x1a\x45\xdf\xa3': return 'video/x-matroska'
  if b[4:8]==b'ftyp': return 'video/mp4'
  if b[:4]==b'RIFF' and b[8:11]==b'AVI': return 'video/x-msvideo'
  if b[:4]==b'\x00\x00\x01\xba': return 'video/mpeg'
  if b[0]==0x47 and len(b)>0 and (len(b)<189 or True): return 'video/mp2t'
  if b[:4]==b'\x30\x26\xb2\x75': return 'video/x-ms-wmv'
  if b[:3]==b'FLV': return 'video/x-flv'
  if b[:4]==b'%PDF': return 'application/pdf'
  return 'application/octet-stream:'+b[:8].hex()
VC=os.path.join(TMP,'view.json');VW=json.load(open(VC)) if os.path.exists(VC) else {}
def viewmime(t):
  try: h=subprocess.run(['curl','-sL','--max-time','30',f'https://drive.google.com/file/d/{t}/view'],capture_output=True,text=True,errors='ignore').stdout
  except Exception: return None
  m=re.findall(r'(video/[a-z0-9.+-]+|application/vnd\.google-apps\.(?:document|spreadsheet|presentation)|application/pdf|image/[a-z+.-]+|audio/[a-z.+-]+|text/plain)',h)
  m=[x for x in m if x!='text/javascript']
  return m[0] if m else None
CACHE=os.path.join(TMP,'sniff.json');SN=json.load(open(CACHE)) if os.path.exists(CACHE) else {}
def resolve(t,x):
  """returns (kind,mime,ext,size,how) kind in video/doc/None"""
  v=P.get(t) or {};st=(v.get('st') or '').split(' ')[1:2];st=st[0] if st else '';ct=v.get('ct','');fn=v.get('fn','');size=v.get('size')
  im=x['mimeType'];e=ext(fn) or ext(x['name'])
  if x['name'].startswith('.') or x['name'].lower()=='thumbs.db': return 'doc','application/octet-stream',ext(x['name']),None,'system-file'
  if len(t)>=40: return 'doc',im if 'google-apps' in im else 'application/vnd.google-apps.document',e,None,'google-native'
  if st=='206':
    if ct.startswith('video/'): return 'video',ct,e,size,'content-type'
    if re.match(r'(image|audio|text)/|application/pdf',ct): return 'doc',ct,e,size,'content-type'
    if e in VEXT: return 'video',ct,e,size,'filename-ext'
    if e: return 'doc',ct,e,size,'filename-ext'
    s=SN.get(t)
    if s and s.startswith('video/'): return 'video',s,e,size,'magic-bytes'
    if s: return 'doc',s.split(':')[0],e,size,'magic-bytes'
    return None,ct,e,size,'unresolved'
  # html (download disabled / quota) or failure: ask Drive's own file page for the real mime
  w=VW.get(t)
  if w: return ('video' if w.startswith('video/') else 'doc'),w,e,size,'drive-view-page'
  if im.startswith('video/'): return 'video',im,e,size,'drive-listing'
  if re.match(r'(image|audio|text)/|application/pdf|application/vnd\.google-apps',im): return 'doc',im,e,size,'drive-listing'
  if e in VEXT: return 'video',im,e,size,'name-ext'
  if e in DOCEXT: return 'doc',im,e,size,'name-ext'
  s=SN.get(t)
  if s and s.startswith('video/'): return 'video',s,e,size,'magic-bytes'
  w=VW.get(t)
  if w: return ('video' if w.startswith('video/') else 'doc'),w,e,size,'drive-view-page'
  if x['name'].startswith('.'): return 'doc','application/octet-stream',e,size,'dotfile'
  return None,im,e,size,'unresolved'
FOLDERISH=lambda x:x['mimeType']==F or x.get('targetMime')==F or (x.get('targetId') and by.get(x['targetId'],{}).get('mimeType')==F)
RECLASS=os.environ.get('FEFC_RECLASSIFY')=='1'   # nightly is incremental: only entries without a stored kind are (re)classified
files=[x for x in d if not FOLDERISH(x) and (RECLASS or not x.get('kind'))]   # folders and folder shortcuts are NEVER classified as video/doc; nothing is decided from the name
# sniff pass for undetermined
need=sorted({tgt(x) for x in files if resolve(tgt(x),x)[0] is None and tgt(x) not in SN})
print('sniffing',len(need),file=sys.stderr)
with cf.ThreadPoolExecutor(24) as ex:
  for t,s in zip(need,ex.map(sniff,need)):
    if s: SN[t]=s
json.dump(SN,open(CACHE,'w'))
need=sorted({tgt(x) for x in files if tgt(x) not in VW and len(tgt(x))<40 and not (P.get(tgt(x)) or {}).get('st','').startswith('HTTP/2 206') and not x['name'].startswith('.')})
print('view pages',len(need),file=sys.stderr)
with cf.ThreadPoolExecutor(12) as ex:
  for t,s in zip(need,ex.map(viewmime,need)):
    if s: VW[t]=s
json.dump(VW,open(VC,'w'))
# before (old app rule = stored isVid snapshot from node)
before=json.load(open(os.path.join(TMP,'before_kind.json'))) if os.path.exists(os.path.join(TMP,'before_kind.json')) else {}
res={};how=collections.Counter()
for x in files:
  k=resolve(tgt(x),x);res[x['id']]=k;how[k[4]]+=1
# parent majority fallback
unres=[]
for x in files:
  if res[x['id']][0] is None:
    sib=[res.get(s['id'],(s.get('kind'),))[0] for s in d if s.get('parent')==x.get('parent') and not FOLDERISH(s) and res.get(s['id'],(s.get('kind'),))[0]]
    c=collections.Counter(sib);kind=(c.most_common(1)[0][0] if c else 'doc')
    r=res[x['id']];res[x['id']]=(kind,)+r[1:4]+('parent-majority',);unres.append((x['id'],x['name'],kind,dict(c)))
# top-level folder audit
top={}
def topof(x,dd=0):
  p=x.get('parent');
  if p==D['root'] or p not in by or dd>20: return x
  return topof(by[p],dd+1)
aud=collections.defaultdict(lambda:[0,0,0,0])
for x in files:
  tp=topof(x)['name'] if x.get('parent')!=D['root'] else '(root files)'
  b=before.get(x['id']);a=res[x['id']][0]
  aud[tp][0 if b else 1]+=1 if b is not None else 0
  aud[tp][2 if a=='video' else 3]+=1
# write
for x in files:
  k,mime,e,size,h=res[x['id']]
  x['kind']=k
  if mime and not mime.startswith('application/octet-stream') and 'google-apps.shortcut' not in x['mimeType']: x['mimeType']=mime if not ('google-apps' in x['mimeType'] and k=='doc') else x['mimeType']
  elif k=='video' and x['mimeType'] in ('application/octet-stream','','video/unknown'): x['mimeType']={'mkv':'video/x-matroska','avi':'video/x-msvideo','mov':'video/quicktime','mpg':'video/mpeg','vob':'video/mpeg'}.get(e,'video/unknown')
  if e: x['ext']=e
  if size and not x.get('size'): x['size']=size
  x['how']=h
json.dump(D,open(IDX,'w'),separators=(',',':'))
json.dump({'how':how,'unresolved':unres},open(os.path.join(TMP,'classify_log.json'),'w'),indent=1)
bv=sum(1 for v in before.values() if v);bd=sum(1 for v in before.values() if not v)
av=sum(1 for r in res.values() if r[0]=='video');ad=len(res)-av
print('BEFORE video',bv,'doc',bd,'| AFTER video',av,'doc',ad);print('resolved-by',dict(how));print('parent-majority',len(unres))
for n,(b1,b2,a1,a2) in sorted(aud.items()): pass
json.dump({k:{'video':v[2],'document':v[3]} for k,v in aud.items()},open(os.path.join(TMP,'audit.json'),'w'),indent=0)
