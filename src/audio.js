// Original synthesized audio (Web Audio API). No external audio files.
window.SFX=(()=>{let ctx,master,amb,muted=localStorage.fefcMute==='1',started=false;
function init(){if(ctx)return;ctx=new (window.AudioContext||window.webkitAudioContext)();master=ctx.createGain();master.gain.value=muted?0:0.6;master.connect(ctx.destination)}
function tone(f,t0,d,type='sine',g=.15,f2){const o=ctx.createOscillator(),v=ctx.createGain();o.type=type;o.frequency.setValueAtTime(f,t0);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t0+d);
 v.gain.setValueAtTime(0,t0);v.gain.linearRampToValueAtTime(g,t0+.01);v.gain.exponentialRampToValueAtTime(.0001,t0+d);o.connect(v);v.connect(master);o.start(t0);o.stop(t0+d+.05)}
function ambStart(){if(!ctx||amb)return;const g=ctx.createGain();g.gain.value=0;g.gain.linearRampToValueAtTime(.05,ctx.currentTime+3);
 const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=900;lp.connect(g);g.connect(master);
 const lfo=ctx.createOscillator(),lg=ctx.createGain();lfo.frequency.value=.07;lg.gain.value=400;lfo.connect(lg);lg.connect(lp.frequency);lfo.start();
 const os=[55,82.4,110,164.8,220.5].map((f,i)=>{const o=ctx.createOscillator();o.type=i%2?'triangle':'sawtooth';o.frequency.value=f;o.detune.value=(i-2)*6;const v=ctx.createGain();v.gain.value=i>2?.25:.5;o.connect(v);v.connect(lp);o.start();return o});
 amb={g,os:[...os,lfo]}}
function ambStop(){if(!amb)return;const a=amb;amb=null;a.g.gain.linearRampToValueAtTime(0,ctx.currentTime+.6);setTimeout(()=>a.os.forEach(o=>o.stop()),700)}
const S={
 unlock(){init();if(ctx.state==='suspended')ctx.resume();started=true},
 get muted(){return muted},
 toggle(){muted=!muted;localStorage.fefcMute=muted?'1':'0';if(master)master.gain.setTargetAtTime(muted?0:.6,ctx.currentTime,.05);return muted},
 ambience(on){if(!started)return;on?ambStart():ambStop()},
 move(){if(!started)return;tone(1400,ctx.currentTime,.06,'sine',.05)},
 click(){if(!started)return;const t=ctx.currentTime;tone(600,t,.08,'triangle',.12,900);tone(1200,t+.03,.1,'sine',.06)},
 open(){if(!started)return;const t=ctx.currentTime;tone(300,t,.35,'sawtooth',.05,1200);tone(880,t+.12,.25,'sine',.08)},
 chirp(n=0){if(!started)return;const t=ctx.currentTime,seq=[[1320,1760],[988,1480],[1760,1175]][n%3];tone(seq[0],t,.07,'square',.04);tone(seq[1],t+.08,.09,'square',.04)},

 state(){init();return ctx.state},
 // full intro score; times are seconds of the 26 s story (condensed: 4 s)
 introSeq(short){init();if(ctx.state!=='running')return;const t0=ctx.currentTime+.05,bus=ctx.createGain();bus.gain.value=1;bus.connect(master);S._bus=bus;
  const noise=d=>{const n=ctx.createBufferSource(),b=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*d),ctx.sampleRate),x=b.getChannelData(0);for(let i=0;i<x.length;i++)x[i]=Math.random()*2-1;n.buffer=b;return n};
  const env=(g,a,b,pk,at=.3,rl=.3)=>{g.gain.setValueAtTime(0,a);g.gain.linearRampToValueAtTime(pk,a+Math.min(at,(b-a)/2));g.gain.setValueAtTime(pk,Math.max(a+Math.min(at,(b-a)/2),b-rl));g.gain.linearRampToValueAtTime(0,b)};
  const osc=(type,f,a,b,pk,f2,dst)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(f,a);if(f2)o.frequency.exponentialRampToValueAtTime(f2,b);env(g,a,b,pk);o.connect(g);g.connect(dst||bus);o.start(a);o.stop(b+.05);return o};
  const nz=(a,b,pk,type,f1,f2,q)=>{const n=noise(b-a+.1),fl=ctx.createBiquadFilter(),g=ctx.createGain();fl.type=type;fl.Q.value=q||1;fl.frequency.setValueAtTime(f1,a);fl.frequency.exponentialRampToValueAtTime(f2,b);env(g,a,b,pk,(b-a)*.6,(b-a)*.35);n.connect(fl);fl.connect(g);g.connect(bus);n.start(a);n.stop(b+.1)};
  const bell=a=>{[523.25,659.25,783.99,1046.5].forEach((f,i)=>{const c=ctx.createOscillator(),m=ctx.createOscillator(),mg=ctx.createGain(),g=ctx.createGain(),s=a+i*.03;c.frequency.value=f;m.frequency.value=f*1.4;mg.gain.setValueAtTime(f*2.2,s);mg.gain.exponentialRampToValueAtTime(f*.05,s+3);m.connect(mg);mg.connect(c.frequency);g.gain.setValueAtTime(0,s);g.gain.linearRampToValueAtTime(.09,s+.01);g.gain.exponentialRampToValueAtTime(.0001,s+4.5);c.connect(g);g.connect(master);c.start(s);m.start(s);c.stop(s+4.6);m.stop(s+4.6)})};
  const T=x=>t0+x;
  if(!short){
   osc('sine',32,T(0),T(2),.35,58);osc('sine',64,T(.4),T(2),.08,90);           // sub-bass swell
   nz(T(2),T(5),.16,'bandpass',4000,260,1.2);                                   // whoosh as it zooms back
   osc('sine',60,T(5.05),T(11),.025);osc('sine',120,T(5.05),T(11),.01);        // near-silence hum
   [440,554.4,659.3,880].forEach((f,i)=>{const o=osc('triangle',f,T(8),T(11.2),.025);o.detune.value=(i-1.5)*9});nz(T(8),T(11.2),.03,'highpass',6000,9000); // shimmer pad
   nz(T(10.9),T(12),.2,'highpass',300,9000,.7);                                // rising swoosh into the dive
   nz(T(12),T(21.2),.07,'lowpass',380,520,.8);nz(T(12.5),T(21),.03,'bandpass',900,600,3); // wind bed
   osc('sine',1800,T(21),T(24),.06,180);                                        // falling digital tone
   for(let i=0;i<14;i++)osc('square',2400+((i*733)%1600),T(21.2+i*.19),T(21.2+i*.19+.025),.03);
   bell(T(24.05))}
  else{nz(T(0),T(.9),.14,'bandpass',4000,300,1.2);nz(T(.8),T(1.5),.16,'highpass',300,9000,.7);nz(T(1.5),T(2.7),.05,'lowpass',380,520,.8);osc('sine',1800,T(2.6),T(4),.05,200);for(let i=0;i<6;i++)osc('square',2600+i*170,T(2.7+i*.2),T(2.725+i*.2),.03);bell(T(4))}},
 introStop(){if(!S._bus)return;const b=S._bus;S._bus=null;b.gain.setTargetAtTime(0,ctx.currentTime,.08)},
 bell(){init();if(ctx.state!=='running')return;const s=ctx.currentTime;[523.25,659.25,783.99].forEach((f,i)=>tone(f,s+i*.03,2.5,'sine',.07))},
 intro(short){if(!started)return;const t=ctx.currentTime;
  // rising whoosh (filtered noise) + swelling chord + bright resolve chime
  const n=ctx.createBufferSource(),b=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;n.buffer=b;
  const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.Q.value=2;bp.frequency.setValueAtTime(200,t);bp.frequency.exponentialRampToValueAtTime(5000,t+(short?.6:1.6));
  const ng=ctx.createGain();ng.gain.setValueAtTime(0,t);ng.gain.linearRampToValueAtTime(.12,t+(short?.4:1.2));ng.gain.linearRampToValueAtTime(0,t+(short?.8:1.9));n.connect(bp);bp.connect(ng);ng.connect(master);n.start(t);n.stop(t+2);
  const r=t+(short?.6:1.7);[220,277.2,329.6,440].forEach((f,i)=>tone(f,t+.2,(short?1:2.2),'triangle',.05));
  [880,1318.5,1760].forEach((f,i)=>tone(f,r+i*.07,1.4,'sine',.09))}
};return S})();
