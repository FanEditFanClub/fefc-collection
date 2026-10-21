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
/* The intro has exactly one sound: Carson's assets/intro.mp3. No synthesized intro, drone, bells or stings. */
const INTRO_MP3='assets/intro.mp3?v=352e1617';
const S={
 INTRO_MP3,
 unlock(){init();if(ctx.state==='suspended')ctx.resume();started=true},
 get muted(){return muted},
 toggle(){muted=!muted;localStorage.fefcMute=muted?'1':'0';if(master)master.gain.setTargetAtTime(muted?0:.6,ctx.currentTime,.05);return muted},
 ambience(on){if(amb&&!on)ambStop()},/* ambient drone disabled */
 move(){if(!started)return;tone(1400,ctx.currentTime,.06,'sine',.05)},
 click(){if(!started)return;const t=ctx.currentTime;tone(600,t,.08,'triangle',.12,900);tone(1200,t+.03,.1,'sine',.06)},
 open(){if(!started)return;const t=ctx.currentTime;tone(300,t,.35,'sawtooth',.05,1200);tone(880,t+.12,.25,'sine',.08)},
 chirp(n=0){if(!started)return;const t=ctx.currentTime,seq=[[1320,1760],[988,1480],[1760,1175]][n%3];tone(seq[0],t,.07,'square',.04);tone(seq[1],t+.08,.09,'square',.04)},

 state(){init();return ctx.state},
 // full intro score; times are seconds of the 26 s story (condensed: 4 s)
 loadIntro(){init();if(S._ip)return S._ip;S._ip=fetch(INTRO_MP3).then(r=>{if(!r.ok)throw 0;return r.arrayBuffer()}).then(a=>new Promise((res,rej)=>ctx.decodeAudioData(a,res,rej))).then(b=>S._ib=b,()=>null);return S._ip},
 introSeq(short,from,el){init();if(ctx.state!=='running')return;from=from||0;const bus=ctx.createGain();bus.gain.value=1;bus.connect(master);S._bus=bus;
  const play=()=>{const off=el?el():from;if(!S._ib||off>=S._ib.duration-.05)return;const src=ctx.createBufferSource();src.buffer=S._ib;src.connect(bus);src.start(ctx.currentTime+.01,Math.max(0,off+.01))};
  if(S._ib)play();else S.loadIntro().then(b=>{if(b&&S._bus===bus)play()})},
 introStop(){if(!S._bus)return;const b=S._bus;S._bus=null;b.gain.setTargetAtTime(0,ctx.currentTime,.08)},
 zoom(out){if(!started)return;const t=ctx.currentTime,n=ctx.createBufferSource(),b=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.7),ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;n.buffer=b;
  const f=ctx.createBiquadFilter(),g=ctx.createGain();f.type='bandpass';f.Q.value=1.4;f.frequency.setValueAtTime(out?2600:500,t);f.frequency.exponentialRampToValueAtTime(out?320:2600,t+.5);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(out?.12:.16,t+(out?.08:.38));g.gain.linearRampToValueAtTime(0,t+.6);n.connect(f);f.connect(g);g.connect(master);n.start(t);n.stop(t+.7);
  tone(out?48:62,t,.5,'sine',.22,out?36:55);
  if(!out)[659.3,987.8,1318.5].forEach((fq,i)=>{const s0=t+.4+i*.02,c=ctx.createOscillator(),m=ctx.createOscillator(),mg=ctx.createGain(),v=ctx.createGain();c.frequency.value=fq;m.frequency.value=fq*1.41;mg.gain.setValueAtTime(fq*2,s0);mg.gain.exponentialRampToValueAtTime(fq*.05,s0+.8);m.connect(mg);mg.connect(c.frequency);v.gain.setValueAtTime(0,s0);v.gain.linearRampToValueAtTime(.045,s0+.005);v.gain.exponentialRampToValueAtTime(.0001,s0+1.4);c.connect(v);v.connect(master);c.start(s0);m.start(s0);c.stop(s0+1.5);m.stop(s0+1.5)})},
};return S})();
