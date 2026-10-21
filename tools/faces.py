"""Detect the main face in each people photo (OpenCV Haar, offline) and store a focal point in data/people.json.
fx/fy = face centre (0-1); fit='contain' when forehead-to-chin can't fit a 16:9 cover crop."""
import json,cv2,sys
P=json.load(open('data/people.json'));d=sys.argv[1]
casc=[cv2.CascadeClassifier(cv2.data.haarcascades+n) for n in ('haarcascade_frontalface_default.xml','haarcascade_frontalface_alt2.xml','haarcascade_profileface.xml')]
for k,v in P.items():
  im=cv2.imread(f'{d}/{k}.jpg');H,W=im.shape[:2];g=cv2.equalizeHist(cv2.cvtColor(im,cv2.COLOR_BGR2GRAY));f=[]
  for c in casc:
    f=c.detectMultiScale(g,1.08,5,minSize=(W//10,W//10))
    if len(f):break
  if len(f):
    x,y,w,h=max(f,key=lambda r:r[2]*r[3]);top=max(0,y-.18*h);bot=min(H,y+1.08*h)
    fx=(x+w/2)/W;fy=((top+bot)/2)/H;span=(bot-top)/H
  else: fx,fy,span=.5,.3,.5;print('NO FACE',v['name'])
  vis=min(1,(W*9/16)/H)  # visible fraction of height in a 16:9 cover crop
  v['fx']=round(fx,3);v['fy']=round(fy,3);v['fit']='contain' if span>vis*.98 else 'cover'
  print(f"{v['name']:22} {W}x{H} fx{fx:.2f} fy{fy:.2f} span{span:.2f} vis{vis:.2f} {v['fit']}")
json.dump(P,open('data/people.json','w'),indent=0,ensure_ascii=False)
