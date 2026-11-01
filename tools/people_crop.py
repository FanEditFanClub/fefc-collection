import cv2,json,numpy as np,os,sys
P=json.load(open('data/people.json'))
SRC={'Statham':'Statham.new.jpg','Verhoeven':'Verhoeven.new.jpg'}
MAN=json.load(open('manual.json')) if os.path.exists('manual.json') else {}   # folder -> [cx,cy,h] in fractions of image (face centre x,y, head height incl hair)
cas=[cv2.CascadeClassifier(cv2.data.haarcascades+n) for n in ('haarcascade_frontalface_default.xml','haarcascade_frontalface_alt2.xml','haarcascade_profileface.xml')]
os.makedirs('out',exist_ok=True);rep={}
for k,v in P.items():
    f=v['folder'];im=cv2.imread(SRC.get(f) or f+'.orig.jpg');H,W=im.shape[:2]
    if f in MAN: cx,cy,hh=[MAN[f][0]*W,MAN[f][1]*H,MAN[f][2]*H];how='manual'
    else:
        s=1000/max(W,H);g=cv2.equalizeHist(cv2.cvtColor(cv2.resize(im,(int(W*s),int(H*s))),cv2.COLOR_BGR2GRAY));fc=[]
        for c in cas:
            fc=c.detectMultiScale(g,1.08,5,minSize=(40,40))
            if len(fc):break
        if not len(fc): print('NO FACE',f);continue
        x,y,w,h=max(fc,key=lambda r:r[2]*r[3]);x,y,w,h=[a/s for a in (x,y,w,h)];cx=x+w/2;cy=y+h*.42;hh=h*1.45;how='haar'  # head incl. hair
    # desired crop: head fills ~46% of height
    Hc=hh/.46;Wc=Hc*16/9
    if Hc>H or Wc>W: Hc=min(H,W*9/16);Wc=Hc*16/9
    if hh>Hc*.86:  # head too big for a 16:9 window: bake blurred-background composite of the full portrait
        bg=cv2.resize(im,(1280,720),interpolation=cv2.INTER_AREA);bg=cv2.GaussianBlur(bg,(0,0),28);bg=(bg*.55).astype(np.uint8)
        sc=720/H;fw=int(W*sc);fg=cv2.resize(im,(fw,720),interpolation=cv2.INTER_AREA)
        if fw>1280:fg=fg[:,(fw-1280)//2:(fw-1280)//2+1280];fw=1280
        x0=(1280-fw)//2;bg[:,x0:x0+fw]=fg;out=bg;how+='+blurpad';fx=(cx*sc+x0)/1280;fy=cy/H
    else:
        x0=min(max(cx-Wc/2,0),W-Wc);y0=min(max(cy-Hc*.44,0),H-Hc)
        out=cv2.resize(im[int(y0):int(y0+Hc),int(x0):int(x0+Wc)],(1280,720),interpolation=cv2.INTER_AREA);fx=(cx-x0)/Wc;fy=(cy-y0)/Hc
    cv2.imwrite(f'out/{f}.jpg',out,[cv2.IMWRITE_JPEG_QUALITY,88]);rep[f]=(round(fx,3),round(fy,3),how)
    print(f,how,round(fx,2),round(fy,2),flush=True)
json.dump(rep,open('rep.json','w'))
ts=[]
for k,v in P.items():
    p='out/'+v['folder']+'.jpg'
    if os.path.exists(p):
        t=cv2.resize(cv2.imread(p),(400,225));cv2.putText(t,v['name'],(5,20),cv2.FONT_HERSHEY_SIMPLEX,.6,(0,255,255),2);ts.append(t)
while len(ts)%4:ts.append(np.zeros((225,400,3),np.uint8))
cv2.imwrite(f'/workspace/shots-final/people-new-{len(sys.argv)}.jpg',np.vstack([np.hstack(ts[i:i+4]) for i in range(0,len(ts),4)]))
