"""Original FEFC intro soundtrack, synthesised from scratch with numpy.
Timing/level keyframes were hand-set to the OnLive boot intro's timeline (analysis only;
no reference audio is read, sampled or shipped by this script)."""
import numpy as np, scipy.signal as ss, scipy.io.wavfile as wf, sys
SR=44100; DUR=26.166667; N=int(SR*DUR); t=np.arange(N)/SR
rng=np.random.default_rng(7)
def env(keys):  # [(time, dB)] -> linear gain, smooth
    k=np.array(keys,float); g=np.interp(t,k[:,0],k[:,1]); g=ss.savgol_filter(g,int(SR*.12)|1,2) if False else g
    return 10**(g/20)
def bandnoise(lo,hi,order=4):
    b=ss.butter(order,[lo/(SR/2),min(hi,SR/2-100)/(SR/2)],'band',output='sos'); n=ss.sosfilt(b,rng.standard_normal(N)); return n/np.sqrt((n**2).mean())
def sweepnoise(f0,f1,a,b,q=3):  # time-varying bandpass via short blocks
    out=np.zeros(N); n=rng.standard_normal(N); blk=1024
    for i in range(int(a*SR),min(N,int(b*SR)),blk):
        u=(i/SR-a)/(b-a); fc=f0*(f1/f0)**u; bw=fc/q
        sos=ss.butter(2,[max(20,fc-bw)/(SR/2),min(SR/2-200,fc+bw)/(SR/2)],'band',output='sos')
        seg=n[max(0,i-4096):i+blk]; y=ss.sosfilt(sos,seg)[-blk:]; out[i:i+len(y)]=y[:len(out[i:i+blk])]
    return out/ (np.sqrt((out**2).mean())+1e-12) * np.sqrt((b-a)/DUR)
def tone(f,ph=0,detune=0): return np.sin(2*np.pi*np.cumsum(np.broadcast_to(f,(N,)).astype(float)+detune)/SR+ph)
mix=np.zeros(N)
# 1 sub-bass bed (50-80 Hz) with slow beating: the low swells throughout
sub=(tone(62)+.7*tone(70,1)+.5*tone(48,2))/2.2
mix+=sub*env([(0,-44),(.3,-30),(1.1,-25),(1.8,-32),(2.4,-33),(2.8,-19),(3.1,-19),(3.4,-22),(4,-32),(4.5,-29),(5.4,-35),(5.8,-29),(6.1,-33),(6.3,-19),(6.6,-21),(6.9,-34),(7.2,-44),(9.2,-42),(9.6,-25),(9.9,-36),(10.2,-52),(10.6,-48),(10.9,-34),(11.6,-28),(12.2,-14),(12.45,-11),(12.8,-23),(13.2,-23),(14.2,-22),(15.5,-24),(16.2,-22),(16.6,-28),(18,-27),(18.4,-19),(18.9,-19),(19.2,-24),(20.6,-20),(21.6,-17),(22.2,-23),(22.7,-28),(23.2,-17),(23.6,-14),(24.4,-15),(24.6,-24),(24.8,-15),(25.2,-21),(25.7,-23),(25.85,-17),(26.17,-22)])
# 2 low-mid body 100-300 Hz (warm harmonic drone)
body=sum(tone(70*k,k)/k for k in (2,3,4))
mix+=body*env([(0,-50),(.4,-30),(1.4,-26),(2.2,-34),(3.6,-27),(4.4,-37),(5,-31),(6.2,-30),(6.9,-38),(7.2,-34),(9.2,-36),(10.2,-38),(11.6,-25),(12.2,-21),(13,-27),(16,-30),(16.2,-24),(16.4,-31),(18.4,-25),(19.4,-31),(21.6,-27),(22,-25),(23,-29),(24.2,-25),(24.6,-35),(24.8,-30),(26.17,-42)])
# 3 tonal pad 7.0-9.8 s: 70 Hz harmonic series (140/210/280/350) + soft 711 Hz partial, slow chorus
pad=sum((tone(70*k*(1+.002*np.sin(2*np.pi*.3*t+k)))/(1+.4*k)) for k in range(2,6))+.25*tone(711)
mix+=pad*env([(6.8,-90),(7.2,-34),(7.5,-26),(8,-23),(8.4,-24),(8.8,-28),(9.2,-30),(9.5,-26),(9.65,-20),(9.85,-30),(10.3,-46),(11,-80)])
# 4 mid noise / air 300-1000 (texture)
mix+=bandnoise(300,1000)*env([(0,-62),(.4,-48),(1.4,-40),(2.4,-47),(3.4,-38),(4.4,-40),(5,-33),(5.6,-41),(6.4,-41),(7,-46),(9,-40),(9.6,-26),(10,-46),(10.8,-48),(11.4,-37),(12.2,-30),(13,-37),(15,-42),(16,-44),(17.4,-37),(18,-33),(19,-33),(21,-30),(22,-35),(24.4,-36),(25,-44),(26.17,-46)])
# 5 presence 1-3 kHz: whooshes 11.4-12.8 (swoosh into the dive) and the 16.2-19 wind rise
mix+=sweepnoise(500,2600,11.0,13.4,2.2)*0  # placeholder kept for clarity
mix+=bandnoise(1000,3000)*env([(0,-70),(.6,-50),(1,-50),(2.4,-60),(3.4,-49),(5,-44),(5.8,-46),(6.6,-48),(7,-62),(9.4,-66),(9.6,-54),(10,-74),(10.8,-67),(11.4,-56),(12.2,-38),(12.6,-44),(13.4,-55),(16,-57),(16.6,-41),(17.6,-36),(18.6,-32),(19.2,-39),(22,-39),(22.8,-48),(23.6,-44),(24,-36),(24.4,-37),(24.8,-44),(25.2,-56),(26.17,-61)])
mix+=bandnoise(3000,8000)*env([(0,-80),(.6,-62),(1.4,-64),(2.4,-75),(3.4,-60),(5,-60),(6.4,-59),(6.8,-66),(8,-90),(8.8,-96),(9.4,-63),(9.6,-57),(10,-71),(10.8,-76),(11.4,-60),(11.8,-47),(12.2,-38),(12.6,-44),(13.4,-54),(15,-64),(16,-66),(16.6,-49),(17,-46),(18,-42),(18.6,-40),(19.2,-51),(21.6,-48),(22.8,-61),(23.6,-54),(24,-44),(24.6,-43),(24.8,-51),(25.2,-65),(26.17,-64)])
mix+=bandnoise(8000,19000)*env([(0,-90),(1,-75),(2.4,-95),(4,-85),(6,-75),(7,-88),(9.4,-77),(9.6,-71),(10.4,-93),(11.6,-80),(12.2,-52),(12.6,-61),(13.6,-82),(16.2,-80),(17,-58),(18.4,-48),(19,-57),(20,-65),(22,-72),(24,-66),(24.6,-78),(26.17,-82)])
# 6 shimmer: high bell partials glinting over the wind (17-19 s) and on the final snap
for f,a in ((1568,17.4),(2093,17.9),(2637,18.35),(3136,18.8)):
    e=np.where(t>a,np.exp(-(t-a)/1.2),0)*(1-np.exp(-np.maximum(t-a,0)/.01)); mix+=.006*e*tone(f)
# 7 impacts: soft low thumps at the beats (sine drop + noise click)
for a,g in ((2.75,.10),(6.25,.10),(9.6,.07),(12.25,.20),(18.4,.09),(23.6,.10),(24.75,.18),(25.8,.08)):
    u=np.maximum(t-a,0); e=np.where(t>a,np.exp(-u/.35),0)*(1-np.exp(-u/.004))
    mix+=g*e*np.sin(2*np.pi*(55*u+30*(1-np.exp(-u/.08))*.08*10))
# 8 final chime chord at the dashboard snap (24.75 s): bright FM bells E-major-ish, long tail
for i,f in enumerate((329.6,415.3,493.9,659.3,987.8)):
    a=24.75+i*.02; u=np.maximum(t-a,0); e=np.where(t>a,np.exp(-u/1.1),0)*(1-np.exp(-u/.005))
    mix+=.02*e*np.sin(2*np.pi*f*u+ (2.0*np.exp(-u/.4))*np.sin(2*np.pi*f*1.41*u))
# reverb tail: simple feedback comb/allpass mix
def verb(x):
    y=np.zeros_like(x)
    for d,g in ((1557,.84),(1617,.83),(1491,.82),(1422,.81)):
        c=np.copy(x); 
        for i in range(d,len(c),d): c[i:i+d]+=g*c[i-d:i][:len(c[i:i+d])]
        y+=c
    return y/4
mix=mix+.18*verb(mix)
fi=int(.02*SR); mix[:fi]*=np.linspace(0,1,fi); mix[-int(.3*SR):]*=np.linspace(1,0,int(.3*SR))
mix=mix/np.abs(mix).max()*0.89
out=sys.argv[1] if len(sys.argv)>1 else 'intro.wav'
wf.write(out,SR,(np.stack([mix,mix],1)*32767).astype(np.int16)); print(out,len(mix)/SR)
