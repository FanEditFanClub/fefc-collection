// Moving edge tiles: EVERY visible outer Home tile changes every ~3-6 s (staggered) to a random cached clip.
// A small pool of muted inline <video> decoders hops between tiles (a tile plays its clip for one dwell, then hands the
// decoder on); tiles without a decoder at that moment crossfade to a new clip's still frame. Opacity-only transitions.
const DWELL=[3000,6000];
let clips=null,loading=false,timers=[],cells=[],pool=[],free=[],on=false;
const home=()=>document.getElementById('home');
/* No clip decoding during CSS intro OR while native ExoPlayer intro still covers the WebView. */
const atHome=()=>{const h=home(),b=document.body.classList;return h&&!h.hidden&&!document.hidden&&!b.contains('cintro')&&!b.contains('native-waiting')};
const tv=()=>document.body.classList.contains('tv');
const fire=()=>!!(window.FEFCNative||document.body.classList.contains('firetv'));
const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
const lite=()=>ios||document.body.classList.contains('lite')||Math.min(innerWidth,innerHeight)<600;
/* Cube / Fire TV: hard-cap concurrent H.264 decoders (intro ExoPlayer just released). Phones keep 6; desktops more. */
const decoders=()=>fire()?2:tv()?3:lite()?6:(navigator.hardwareConcurrency||8)<=6?12:40;
window.__clipStats=()=>({tiles:cells.length,decoders:pool.length,playing:pool.filter(v=>!v.paused).length});
function load(){if(clips||loading)return;loading=true;
 fetch('data/clips.json').then(r=>r.json()).then(j=>{clips=j;j.forEach(c=>{const i=new Image();i.src=c.poster})/* warm still frames */;schedule()}).catch(()=>{clips=[]})}
function pick(cell){const used=cells.map(c=>c._clip&&c._clip.src);let c,i=0;do{c=clips[Math.random()*clips.length|0]}while(++i<12&&(used.indexOf(c.src)>=0||c===cell._clip));return c}
const FILL='position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;pointer-events:none;border-radius:inherit;will-change:opacity;';
function stills(cell){if(cell._s)return;cell._s=[0,1].map(()=>{const p=document.createElement('img');p.alt='';p.className='mcp';p.decoding='async';p.style.cssText=FILL+'z-index:2;opacity:0;transition:opacity .7s ease';cell.appendChild(p);return p});cell._si=0}
function showStill(cell,c,cb){stills(cell);const nx=cell._s[cell._si^1],cur=cell._s[cell._si];const im=new Image();im.src=c.poster;
 const fin=()=>{if(!on)return;nx.src=c.poster;nx.style.zIndex=3;cur.style.zIndex=2;requestAnimationFrame(()=>{nx.style.opacity=1;setTimeout(()=>{if(cell._s[cell._si]!==nx)cur.style.opacity=0},750)});cell._si^=1;cb&&cb()};
 (im.decode?im.decode():Promise.resolve()).then(fin,fin)}
function mkVideo(){const v=document.createElement('video');v.muted=true;v.defaultMuted=true;v.loop=true;v.playsInline=true;
 v.setAttribute('muted','');v.setAttribute('playsinline','');v.setAttribute('webkit-playsinline','');v.preload='auto';v.className='mcv';
 v.style.cssText=FILL+'z-index:4;opacity:0;transition:opacity .45s ease';
 v.addEventListener('playing',()=>{if(v._cell)v.style.opacity=1});
 v.addEventListener('error',()=>{v.style.opacity=0;release(v._cell)});return v}
function release(cell){if(!cell||!cell._v)return;const v=cell._v;cell._v=null;v._cell=null;v.style.opacity=0;setTimeout(()=>{if(v._cell)return;try{v.pause()}catch(e){}free.indexOf(v)<0&&free.push(v)},460)}
function attach(cell,c){const v=free.shift();if(!v)return false;cell._v=v;v._cell=cell;v.style.opacity=0;if(v.parentNode!==cell)cell.appendChild(v);
 v.src=c.src;try{v.currentTime=0}catch(e){}const r=v.play();if(r&&r.catch)r.catch(()=>{release(cell)});return true}
function step(cell){if(!on||!atHome())return;const c=pick(cell);cell._clip=c;if(c.id)cell.dataset.id=c.id;
 const had=!!cell._v,keep=had&&pool.length>=cells.length; // enough decoders for every tile: keep it, just change clip
 if(keep){cell._v.style.opacity=0}else if(had)release(cell);
 // the still frame always changes first (visible even without a decoder); a decoder (if free) then plays over it
 showStill(cell,c,()=>{if(!on)return;if(keep&&cell._v){const v=cell._v;setTimeout(()=>{if(v._cell!==cell)return;v.src=c.src;const r=v.play();if(r&&r.catch)r.catch(()=>{})},450)}else if(!had)attach(cell,c)})}
function visible(el){const r=el.getBoundingClientRect(),m=120;return r.width>0&&r.right>-m&&r.bottom>-m&&r.left<innerWidth+m&&r.top<innerHeight+m}
function stop(){on=false;timers.forEach(clearTimeout);timers=[];pool.forEach(v=>{try{v.pause()}catch(e){}v._cell=null;v.style.opacity=0});cells.forEach(c=>{c._v=null});free=pool.slice();cells=[]}
function schedule(){stop();if(!clips||!clips.length||!atHome())return;on=true;
 cells=[].slice.call(document.querySelectorAll('#hub .mc')).filter(visible).filter(c=>c.style.visibility!=='hidden'); // headline-overlapping tiles stay hidden
 const n=Math.min(decoders(),cells.length);while(pool.length<n)pool.push(mkVideo());free=pool.slice(0,n);
 const order=cells.slice().sort(()=>Math.random()-.5);
 /* Fire TV: stagger first mosaic tile video starts ~300ms apart so all decoders don't spin up at once. */
 const gap=fire()?300:Math.min(140,2400/Math.max(1,order.length));
 order.forEach((c,i)=>{const loop=()=>{if(!on||!atHome())return;step(c);timers.push(setTimeout(loop,DWELL[0]+Math.random()*(DWELL[1]-DWELL[0])))};
  timers.push(setTimeout(loop,i*gap+(fire()?Math.random()*60:Math.random()*250)))})}
let deb;function kick(){clearTimeout(deb);if(!atHome()){stop();return}deb=setTimeout(()=>{if(atHome()){load();schedule()}else stop()},400)}
let _ic=document.body.classList.contains('cintro');new MutationObserver(()=>{const c=document.body.classList.contains('cintro');if(_ic&&!c)kick();_ic=c}).observe(document.body,{attributes:true,attributeFilter:['class']});
/* Native intro reveal: start clips only after WebView is shown and ExoPlayer is gone. */
addEventListener('fefc-home-revealed',()=>kick());
function init(){const h=home(),hub=document.getElementById('hub');if(!h||!hub)return setTimeout(init,500);
 new MutationObserver(ms=>{if(ms.some(m=>[].some.call(m.addedNodes,x=>x.classList&&x.classList.contains('mc'))||[].some.call(m.removedNodes,x=>x.classList&&x.classList.contains('mc'))))kick()}).observe(hub,{childList:true});
 new MutationObserver(kick).observe(h,{attributes:true,attributeFilter:['hidden']});
 document.addEventListener('visibilitychange',kick);addEventListener('fefc-background',()=>stop());addEventListener('fefc-foreground',kick);addEventListener('pagehide',()=>stop());addEventListener('hashchange',kick);addEventListener('resize',kick);addEventListener('scroll',kick,{passive:true,capture:true});
 /* Behind native intro: do not start decoders yet; still warm posters after reveal. */
 const start=()=>{if(document.body.classList.contains('native-waiting'))return;kick()};
 window.requestIdleCallback?requestIdleCallback(start,{timeout:1500}):setTimeout(start,1500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
