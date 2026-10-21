// Moving edge tiles: every visible mosaic cell plays a muted looping clip.
// One shared <video> per cell; swaps crossfade through the next clip's poster image.
const SWAP=[6000,11000];
let clips=null,loading=false,timers=[],active=[];
const home=()=>document.getElementById('home');
const atHome=()=>{const h=home();return h&&!h.hidden&&!document.hidden};
const tv=()=>document.body.classList.contains('tv');
const cap=()=>tv()?12:48;
function load(){if(clips||loading)return;loading=true;
 fetch('data/clips.json').then(r=>r.json()).then(j=>{clips=j;schedule()}).catch(()=>{clips=[]})}
function pick(){const used=active.map(c=>c._clip&&c._clip.src);let c,i=0;do{c=clips[Math.random()*clips.length|0]}while(++i<8&&used.indexOf(c.src)>=0);return c}
const FILL='position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;pointer-events:none;border-radius:inherit;';
function layers(cell){if(cell._v)return;const v=document.createElement('video');v.muted=true;v.defaultMuted=true;v.loop=true;v.playsInline=true;
 v.setAttribute('muted','');v.setAttribute('playsinline','');v.setAttribute('webkit-playsinline','');v.preload='auto';v.className='mcv';
 v.style.cssText=FILL+'z-index:2;opacity:0;transition:opacity .5s ease';
 const p=document.createElement('img');p.alt='';p.className='mcp';p.style.cssText=FILL+'z-index:3;opacity:0;transition:opacity .6s ease';
 cell.appendChild(v);cell.appendChild(p);cell._v=v;cell._p=p;
 v.addEventListener('playing',()=>{v.style.opacity=1;p.style.opacity=0});
 v.addEventListener('error',()=>{cell._fail=(cell._fail||0)+1;p.style.opacity=0;if(cell._fail<4)setTimeout(()=>play(cell),300)})}
function play(cell){const c=pick();if(!c)return;layers(cell);const v=cell._v,p=cell._p;cell._clip=c;if(c.id)cell.dataset.id=c.id;
 const go=()=>{if(!atHome())return;v.src=c.src;const r=v.play();if(r&&r.catch)r.catch(()=>{})};
 if(v.currentSrc){p.onload=()=>{p.style.opacity=1;setTimeout(go,600)};p.src=c.poster}else{p.src=c.poster;p.style.opacity=1;go()}}
function visible(el){const r=el.getBoundingClientRect();return r.width>0&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight}
function stop(){timers.forEach(clearTimeout);timers=[];[].forEach.call(document.querySelectorAll('#hub .mcv'),v=>{try{v.pause()}catch(e){}});active=[]}
function schedule(){stop();if(!clips||!clips.length||!atHome())return;
 const cells=[].slice.call(document.querySelectorAll('#hub .mc')).filter(visible).filter(c=>c.style.visibility!=='hidden');
 cells.sort(()=>Math.random()-.5);if(tv()){const hb=document.querySelector('#hub .hb'),ht=hb?hb.getBoundingClientRect().top:0;cells.sort((a,b)=>(a.getBoundingClientRect().bottom<ht?0:1)-(b.getBoundingClientRect().bottom<ht?0:1))}cells.sort((a,b)=>(b.classList.contains('toprow')?1:0)-(a.classList.contains('toprow')?1:0));active=cells.slice(0,cap());
 active.forEach((c,i)=>{let first=true;const loop=()=>{if(!atHome())return;if(first&&c._v&&c._v.currentSrc){first=false;const r=c._v.play();if(r&&r.catch)r.catch(()=>{})}else{first=false;play(c)}
   timers.push(setTimeout(loop,SWAP[0]+Math.random()*(SWAP[1]-SWAP[0])))};
  timers.push(setTimeout(loop,80*i+Math.random()*300))})}
let deb;function kick(){clearTimeout(deb);if(!atHome()){stop();return}deb=setTimeout(()=>{if(atHome()){load();schedule()}else stop()},400)}
function init(){const h=home(),hub=document.getElementById('hub');if(!h||!hub)return setTimeout(init,500);
 new MutationObserver(kick).observe(hub,{childList:true});
 new MutationObserver(kick).observe(h,{attributes:true,attributeFilter:['hidden']});
 document.addEventListener('visibilitychange',kick);addEventListener('hashchange',kick);
 const start=()=>kick();window.requestIdleCallback?requestIdleCallback(start,{timeout:1500}):setTimeout(start,1500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
