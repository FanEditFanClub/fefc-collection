// 0.8.13 mosaic motion (Carson):
// - Nearest ring around hub tiles = live muted <video> (hardware decode, low-bitrate ~360p clips).
// - Outer/farther tiles = still-frame slideshow (4–6 bundled WebP/JPEG frames), opacity-only crossfade.
// - Device tier (native FEFCNative.deviceTier): LOW 1–2 / MID 3–4 / HIGH full ring. Rotate if ring > cap.
// - No GIFs. Preload the next still only. Stagger so tiles don't flip together.
const DWELL=[3000,6000],DWELL_PERF=[7000,12000];
const STILL_MS=[3200,5000],STILL_MS_PERF=[4000,6500];
let clips=null,loading=false,timers=[],cells=[],pool=[],free=[],on=false,rot=0;
const home=()=>document.getElementById('home');
const atHome=()=>{const h=home(),b=document.body.classList;return h&&!h.hidden&&!document.hidden&&!b.contains('cintro')&&!b.contains('native-waiting')};
const tv=()=>document.body.classList.contains('tv');
const fire=()=>!!(window.FEFCNative||document.body.classList.contains('firetv'));
const perf=()=>document.body.classList.contains('perf');
const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
const lite=()=>ios||document.body.classList.contains('lite')||document.body.classList.contains('tier-lite')||Math.min(innerWidth,innerHeight)<600;
/* Read native tier (injected + bridge). ?tier=LOW|MID|HIGH overrides for emu profile tests. */
function tierInfo(){
  try{const q=new URLSearchParams(location.search).get('tier');if(q&&/^(LOW|MID|HIGH)$/i.test(q)){
    const T=q.toUpperCase();const vt=T==='HIGH'?12:T==='MID'?(perf()?3:4):(perf()?1:2);
    return {tier:T,videoTiles:vt,reduceEffects:T==='LOW'};}}catch(e){}
  try{if(window.__fefcTier&&window.__fefcTier.tier)return window.__fefcTier}catch(e){}
  try{if(window.FEFCNative&&FEFCNative.deviceTier){const j=JSON.parse(FEFCNative.deviceTier());window.__fefcTier=j;return j}}catch(e){}
  const b=document.body.classList;
  if(b.contains('tier-high'))return {tier:'HIGH',videoTiles:12};
  if(b.contains('tier-mid'))return {tier:'MID',videoTiles:perf()?3:4};
  if(b.contains('tier-low'))return {tier:'LOW',videoTiles:perf()?1:2};
  return null}
/* Video-tile budget by tier. HIGH = full ring (cap 12). MID 3–4. LOW 1–2. */
const decoders=()=>{
  const t=tierInfo();
  if(t&&t.videoTiles>0){
    let n=+t.videoTiles;
    if(t.tier==='MID'&&perf())n=Math.min(n,3);
    if(t.tier==='LOW'&&perf())n=Math.min(n,Math.max(1,n)); // keep 1–2; perf prefers lower already from native
    if(t.tier==='HIGH')n=Math.max(n,12); // full ring
    return n}
  // Fallback when no native tier (browser / old APK)
  if(fire()||tv())return perf()?2:3;
  return lite()?4:(navigator.hardwareConcurrency||8)<=6?8:16};
const dwell=()=>{const d=perf()?DWELL_PERF:DWELL;return d[0]+Math.random()*(d[1]-d[0])};
const stillDwell=()=>{const d=perf()?STILL_MS_PERF:STILL_MS;return d[0]+Math.random()*(d[1]-d[0])};
const ringOf=el=>{const n=+(el&&(el._ring!=null?el._ring:el.dataset&&el.dataset.ring));return n>0?n:99};
window.__clipStats=()=>({tiles:cells.length,ring1:cells.filter(c=>ringOf(c)===1).length,outer:cells.filter(c=>ringOf(c)>1).length,decoders:pool.length,playing:pool.filter(v=>!v.paused).length,cap:decoders(),tier:(tierInfo()||{}).tier||null});
function load(){if(clips||loading)return;loading=true;
 fetch('data/clips.json').then(r=>r.json()).then(j=>{clips=j;/* warm first still of a sample — not every poster (Cube). */j.slice(0,24).forEach(c=>{const i=new Image();i.src=(c.frames&&c.frames[0])||c.poster});schedule()}).catch(()=>{clips=[]})}
function pick(cell){const used=cells.map(c=>c._clip&&c._clip.src);let c,i=0;do{c=clips[Math.random()*clips.length|0]}while(++i<12&&(used.indexOf(c.src)>=0||c===cell._clip));return c}
function framesOf(c){return (c&&c.frames&&c.frames.length)?c.frames:(c&&c.poster?[c.poster]:[])}
const FILL='position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;pointer-events:none;border-radius:inherit;';
function stills(cell){if(cell._s)return;cell._s=[0,1].map(()=>{const p=document.createElement('img');p.alt='';p.className='mcp';p.decoding='async';p.style.cssText=FILL+'z-index:2;opacity:0;transition:opacity .7s ease;will-change:opacity';cell.appendChild(p);return p});cell._si=0}
function showFrame(cell,url,cb){if(!url){cb&&cb();return}stills(cell);const nx=cell._s[cell._si^1],cur=cell._s[cell._si];const im=new Image();im.src=url;
 const fin=()=>{if(!on)return;nx.src=url;nx.style.zIndex=3;cur.style.zIndex=2;requestAnimationFrame(()=>{nx.style.opacity=1;setTimeout(()=>{if(cell._s[cell._si]!==nx)cur.style.opacity=0},750)});cell._si^=1;cb&&cb()};
 (im.decode?im.decode():Promise.resolve()).then(fin,fin)}
/* Outer tiles: cycle frames of one clip, then hop to another clip. Preload next frame only. */
function stillLoop(cell){if(!on||!atHome())return;
 if(!cell._clip||!cell._fi&&cell._fi!==0){cell._clip=pick(cell);cell._fi=0;if(cell._clip.id)cell.dataset.id=cell._clip.id}
 const fr=framesOf(cell._clip);if(!fr.length){timers.push(setTimeout(()=>stillLoop(cell),stillDwell()));return}
 const url=fr[cell._fi%fr.length];const nextUrl=fr[(cell._fi+1)%fr.length];
 if(nextUrl){const pre=new Image();pre.src=nextUrl;cell._pre=pre} // preload next only
 showFrame(cell,url,()=>{cell._fi=(cell._fi+1)%Math.max(1,fr.length);
  if(cell._fi===0){cell._clip=pick(cell);if(cell._clip.id)cell.dataset.id=cell._clip.id;cell._fi=0}
  timers.push(setTimeout(()=>stillLoop(cell),stillDwell()))})}
function mkVideo(){const v=document.createElement('video');v.muted=true;v.defaultMuted=true;v.loop=true;v.playsInline=true;
 v.setAttribute('muted','');v.setAttribute('playsinline','');v.setAttribute('webkit-playsinline','');v.preload='auto';v.className='mcv';
 v.style.cssText=FILL+'z-index:4;opacity:0;transition:opacity .45s ease;'+(perf()?'will-change:auto;':'will-change:opacity;');
 v.addEventListener('playing',()=>{if(v._cell)v.style.opacity=1});
 v.addEventListener('error',()=>{v.style.opacity=0;release(v._cell)});return v}
function release(cell){if(!cell||!cell._v)return;const v=cell._v;cell._v=null;v._cell=null;v.style.opacity=0;setTimeout(()=>{if(v._cell)return;try{v.pause()}catch(e){}free.indexOf(v)<0&&free.push(v)},460)}
function attach(cell,c){const v=free.shift();if(!v)return false;cell._v=v;v._cell=cell;v.style.opacity=0;if(v.parentNode!==cell)cell.appendChild(v);
 v.src=c.src;try{v.currentTime=0}catch(e){}const r=v.play();if(r&&r.catch)r.catch(()=>{release(cell)});return true}
function videoStep(cell){if(!on||!atHome())return;const c=pick(cell);cell._clip=c;if(c.id)cell.dataset.id=c.id;
 const had=!!cell._v;
 if(had){cell._v.style.opacity=0;const v=cell._v;showFrame(cell,(c.frames&&c.frames[0])||c.poster,()=>{if(!on||v._cell!==cell)return;setTimeout(()=>{if(v._cell!==cell)return;v.src=c.src;const r=v.play();if(r&&r.catch)r.catch(()=>{})},450)})}
 else showFrame(cell,(c.frames&&c.frames[0])||c.poster,()=>{if(!on)return;attach(cell,c)})}
function visible(el){const r=el.getBoundingClientRect(),m=120;return r.width>0&&r.right>-m&&r.bottom>-m&&r.left<innerWidth+m&&r.top<innerHeight+m&&el.style.visibility!=='hidden'}
function stop(){on=false;timers.forEach(clearTimeout);timers=[];pool.forEach(v=>{try{v.pause()}catch(e){}v._cell=null;v.style.opacity=0});cells.forEach(c=>{c._v=null});free=pool.slice();cells=[]}
function schedule(){stop();if(!clips||!clips.length||!atHome())return;on=true;
 cells=[].slice.call(document.querySelectorAll('#hub .mc')).filter(visible);
 const ring1=cells.filter(c=>ringOf(c)===1).sort((a,b)=>(a._ring||0)-(b._ring||0));
 const outer=cells.filter(c=>ringOf(c)>1);
 const n=Math.min(decoders(),Math.max(1,ring1.length));
 while(pool.length<n)pool.push(mkVideo());free=pool.slice(0,n);
 /* If ring has more tiles than Cube can decode, rotate video among the closest subset. */
 const start=rot%Math.max(1,ring1.length);
 const videoTiles=[];for(let i=0;i<n&&ring1.length;i++)videoTiles.push(ring1[(start+i)%ring1.length]);
 const videoSet=new Set(videoTiles);
 const ringStill=ring1.filter(c=>!videoSet.has(c));
 /* Outer (+ overflow ring) = still slideshows, staggered. */
 const stillTiles=outer.concat(ringStill);
 stillTiles.forEach((c,i)=>timers.push(setTimeout(()=>{if(on&&atHome())stillLoop(c)},i*110+Math.random()*180)));
 const gap=(fire()||perf())?320:Math.min(140,2400/Math.max(1,videoTiles.length));
 videoTiles.forEach((c,i)=>{const loop=()=>{if(!on||!atHome())return;videoStep(c);timers.push(setTimeout(loop,dwell()))};
  timers.push(setTimeout(loop,i*gap+((fire()||perf())?Math.random()*80:Math.random()*250)))});
 /* Rotate which ring-1 tiles hold the decoders every ~40–55s. */
 if(ring1.length>n){timers.push(setTimeout(function hop(){if(!on||!atHome())return;rot=(rot+n)%ring1.length;schedule();},40000+Math.random()*15000))}
 try{const ti=tierInfo()||{};const line='FEFC_CLIPS tier='+(ti.tier||'?')+' ring1='+ring1.length+' video='+videoTiles.length+' outerStill='+stillTiles.length+' cap='+n+' stats='+JSON.stringify(__clipStats());console.log(line);try{if(window.FEFCNative&&FEFCNative.log)FEFCNative.log(line)}catch(e2){}}catch(e){}}
let deb;function kick(){clearTimeout(deb);if(!atHome()){stop();return}deb=setTimeout(()=>{if(atHome()){load();schedule()}else stop()},400)}
let _ic=document.body.classList.contains('cintro');new MutationObserver(()=>{const c=document.body.classList.contains('cintro');if(_ic&&!c)kick();_ic=c}).observe(document.body,{attributes:true,attributeFilter:['class']});
addEventListener('fefc-home-revealed',()=>kick());
function init(){const h=home(),hub=document.getElementById('hub');if(!h||!hub)return setTimeout(init,500);
 new MutationObserver(ms=>{if(ms.some(m=>[].some.call(m.addedNodes,x=>x.classList&&x.classList.contains('mc'))||[].some.call(m.removedNodes,x=>x.classList&&x.classList.contains('mc'))))kick()}).observe(hub,{childList:true});
 new MutationObserver(kick).observe(h,{attributes:true,attributeFilter:['hidden']});
 document.addEventListener('visibilitychange',kick);addEventListener('fefc-background',()=>stop());addEventListener('fefc-foreground',kick);addEventListener('pagehide',()=>stop());addEventListener('hashchange',kick);addEventListener('resize',kick);addEventListener('scroll',kick,{passive:true,capture:true});
 addEventListener('fefc-perf',kick);addEventListener('fefc-tier',kick);
 const start=()=>{if(document.body.classList.contains('native-waiting'))return;kick()};
 window.requestIdleCallback?requestIdleCallback(start,{timeout:1500}):setTimeout(start,1500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
