"""Build landscape 16:9 people tiles (Actors/Directors) from pinned Wikimedia Commons files.
Run from repo root: python3 tools/people.py   -> assets/people/<Folder>.jpg + data/people.json (url/credit/fit=cover).
Each person is PINNED to one Commons file so re-runs never revert (Sandler = Adam Sandler alone, tight crop).
zoom = crop height in face-heights (smaller = tighter, used to exclude neighbours); dx = horizontal nudge (fraction of crop); dx>=1 means force crop centre at (dx-1)*image width."""
import json,os,re,urllib.request,urllib.parse,cv2,numpy as np
UA={'User-Agent':'FEFCCollection/1.0 (faneditfanclub.com)'}
J=lambda u:json.loads(urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60).read())
G=lambda u:urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=120).read()
# folder: (full name, Commons file, zoom, dx[, cy = forced face-centre height fraction])
PINS={
'Brooks':('Mel Brooks','MEL BROOKS 2000 (5113183132).jpg',4.2,1.5,0.42),
'Cage':('Nicolas Cage','WonderCon2010 - Nicolas Cage 2815.jpg',4.2,0),
'Carrey':('Jim Carrey','Jim Carrey 2020.jpg',4.2,0),
'Costner':('Kevin Costner','"Hidden Figures" Screening at NMAAHC (NHQ201612140032).jpg',4.2,0),
'Cruise':('Tom Cruise','Tom Cruise during the 2025 Cannes Film Festival 03.jpg',4.2,0),
'Ford':('Harrison Ford','Harrison Ford (36201117635).jpg',4.2,0),
'Gibson':('Mel Gibson','Mel Gibson, 1985 01.jpg',4.2,0),
'Sandler':('Adam Sandler','Kate Beckinsale and Adam Sandler cropped.jpg',3.0,1.70),
'Schwarzenegger':('Arnold Schwarzenegger','Arnold Schwarzenegger speaks at New Way California Press event in Los Angeles (40066226265).jpg',4.2,0),
'Scorcese':('Martin Scorsese','Martin Scorsese Taxi Driver Tribeca Festival 2026-8.jpg',4.2,0),
'Stallone':('Sylvester Stallone','Sylvester Stallone (7588426252).jpg',4.2,0),
'Statham':('Jason Statham','Jason Statham 2018.jpg',4.2,0),
'Tarantino':('Quentin Tarantino','SDCC 2015 - Quentin Tarantino (19702844696).jpg',4.2,0),
'Willis':('Bruce Willis','Bruce Willis (4839960533).jpg',4.2,0),
'Abrams':('J. J. Abrams','SDCC 2015 - J. J. Abrams (19678958425).jpg',4.2,0),
'Bay':('Michael Bay','Michael Bay 060530-F-4692S-004.jpg',3.5,0),
'Cameron':('James Cameron','James Cameron (28003295064).jpg',4.2,0),
'Emmerich':('Roland Emmerich','Independence Day- Resurgence Japan Premiere- Roland Emmerich (28502013341).jpg',4.2,0),
'Nolan':('Christopher Nolan','ChrisNolanBFI150224 (4 of 12) (53530965557).jpg',4.2,0),
'Ritchie':('Guy Ritchie','GuyRitchiebyKathyHutchins.jpg',4.2,0),
'Scott':('Ridley Scott','Ridley Scott (6852645472).jpg',4.2,0),
'Snyder':('Zack Snyder','SDCC 2015 - Zack Snyder (19524157348).jpg',4.2,0),
'Spielberg':('Steven Spielberg','Steven Spielberg (35355058574).jpg',4.2,0),
'Verhoeven':('Paul Verhoeven','Paul Verhoeven Berlinale 2017.jpg',4.2,0),
}
CASC=[cv2.CascadeClassifier(cv2.data.haarcascades+n) for n in ('haarcascade_frontalface_default.xml','haarcascade_frontalface_alt2.xml','haarcascade_profileface.xml')]
def crop(im,zoom,dx,cy=None):
  h,w=im.shape[:2];g=cv2.equalizeHist(cv2.cvtColor(im,cv2.COLOR_BGR2GRAY));f=[]
  for c in CASC:
    f=c.detectMultiScale(g,1.08,6,minSize=(w//40,w//40))
    if len(f):break
  x,y,fw,fh=max(f,key=lambda r:r[2]*r[3]) if len(f) else (w*.45,h*.2,w*.1,w*.1)
  ch=int(min(h,w*9/16,max(fh*zoom,min(h,720)))); cw=int(ch*16/9)
  cx=x+fw/2+dx*cw if dx<1 else (dx-1)*w; top=y-0.45*fh  # keep the full head + headroom
  x0=int(min(max(cx-cw/2,0),w-cw)); y0=int(min(max(min(y+fh/2-ch*0.45,top),0),h-ch))
  if cy is not None: y0=int(min(max(cy*h-ch*0.45,0),h-ch))
  return cv2.resize(im[y0:y0+ch,x0:x0+cw],(1280,720),interpolation=cv2.INTER_AREA if cw>=1280 else cv2.INTER_CUBIC),len(f)
def main():
  d=json.load(open('data/index.json'));L=json.load(open('data/links.json'));by={x['id']:x for x in d['items']}
  old=json.load(open('data/people.json')) if os.path.exists('data/people.json') else {}
  os.makedirs('assets/people',exist_ok=True);out={}
  for parent,role in [('1Jb0DtQC05fOdpiNg-O88fUpwI5ic3UHS','actor'),('1u2B5d9cb1zAtrtdF_rA3eXhtcFgggSib','director')]:
    for i in L.get(parent,[])+[x['id'] for x in d['items'] if x.get('parent')==parent]:
      n=by.get(i,{}).get('name')
      if n not in PINS or i in out: continue
      full,fn,zoom,dx,*cy=PINS[n]
      r=J('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(dict(action='query',titles='File:'+fn,prop='imageinfo',iiprop='url|size|extmetadata',iiurlwidth=2400,format='json')))
      p=next(iter(r['query']['pages'].values()))['imageinfo'][0];m=p['extmetadata']
      src=p['thumburl'] if p['width']>2400 else p['url']
      im=cv2.imdecode(np.frombuffer(G(src),np.uint8),1);t,nf=crop(im,zoom,dx,*cy)
      cv2.imwrite(f'assets/people/{n}.jpg',t,[cv2.IMWRITE_JPEG_QUALITY,82,cv2.IMWRITE_JPEG_OPTIMIZE,1])
      out[i]=dict(name=full,folder=n,role=role,qid=old.get(i,{}).get('qid'),url=f'assets/people/{n}.jpg',link=p['descriptionurl'],fx=.5,fy=.5,fit='cover',
        credit=dict(source=p['descriptionurl'],author=re.sub('<[^>]+>','',m.get('Artist',{}).get('value','')).strip(),license=m.get('LicenseShortName',{}).get('value',''),
          licenseUrl=m.get('LicenseUrl',{}).get('value',''),original=f"{p['width']}x{p['height']}"))
      print(f"{n:15} {p['width']}x{p['height']} faces={nf} {out[i]['credit']['license']}")
  json.dump(out,open('data/people.json','w'),indent=0,ensure_ascii=False)
if __name__=='__main__':main()
