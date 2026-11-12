(()=>{
/* Large JSON (index ~6.7MB) parses off the main thread via Worker when available — Fire TV Cube janks hard on JSON.parse of the catalog. */
let _jw=null,_jwN=0;const _jwPend=new Map();
function _jsonWorker(){if(_jw)return _jw;try{_jw=new Worker('json-worker.js');_jw.onmessage=e=>{const m=e.data||{},p=_jwPend.get(m.id);if(!p)return;_jwPend.delete(m.id);m.ok?p.res(m.value):p.rej(Error(m.error||'worker'))};_jw.onerror=()=>{_jw=null};return _jw}catch(e){_jw=null;return null}}
function parseJsonYield(text){return new Promise((res,rej)=>{setTimeout(()=>{try{res(JSON.parse(text))}catch(e){rej(e)}},0)})}
function parseJsonOffMain(text){
 /* Never post multi-MB strings into a Worker on Fire TV — structured-clone OOMs/hangs the Cube/emu. */
 if(text&&text.length>800000)return parseJsonYield(text);
 const w=_jsonWorker();if(!w)return parseJsonYield(text);const id=++_jwN;return new Promise((res,rej)=>{_jwPend.set(id,{res,rej});try{w.postMessage({id,text})}catch(e){_jwPend.delete(id);parseJsonYield(text).then(res,rej)}})}
function fetchJsonSmart(u,ms){const fire=!!(window.FEFCNative||document.body.classList.contains('tv')||document.body.classList.contains('firetv'));
 const big=/index\.json|metadata\.json|dates\.json|genres\.json|details/i.test(u)&&fire;
 /* Prefer Worker fetching the URL itself (no giant postMessage). Fall back to main fetch + yielded parse.
    0.8.18: On FEFCNative, ALWAYS use main-thread fetch so LocalAssets shouldInterceptRequest can
    serve the bundled/cached index instantly — Worker fetches often bypass the intercept and hung
    on slow Wi-Fi while Home stayed blank under body.native-waiting. */
 const viaWorkerUrl=()=>{const w=_jsonWorker();if(!w)return null;const id=++_jwN;return new Promise((res,rej)=>{_jwPend.set(id,{res,rej});try{w.postMessage({id,url:u})}catch(e){_jwPend.delete(id);rej(e)}})};
 const viaMain=()=>fetch(u,{credentials:'same-origin'}).then(r=>{if(!r.ok)throw Error(r.status);return r.text()}).then(t=>parseJsonOffMain(t));
 const preferBundle=!!window.FEFCNative||/index\.json/i.test(u);
 const go=big?(preferBundle?viaMain():(viaWorkerUrl()||viaMain())).catch(e=>{console.warn('json worker',e);return viaMain()}):fetch(u,{credentials:'same-origin'}).then(r=>{if(!r.ok)throw Error(r.status);return r.json()});
 return Promise.race([go,new Promise((_,rj)=>setTimeout(()=>rj(Error('timeout '+u)),ms))])}
const _fetchOnce=(u,ms)=>fetchJsonSmart(u,ms);
/* Retry/backoff for flaky Fire TV / mobile networks — never deletes content; just re-asks. */
function thumbSz(){const low=document.body.classList.contains('tier-low')||document.body.classList.contains('tier-lite');const tv=(typeof isTvEnv==='function'?isTvEnv():false)||document.body.classList.contains('tv')||document.body.classList.contains('firetv')||!!window.FEFCNative;return low?'w160':tv?'w320':'w640'}
const tmo=(u,ms,tries)=>{tries=tries==null?2:tries;let attempt=0;const go=()=>_fetchOnce(u,ms).catch(e=>{attempt++;if(attempt>tries)throw e;const wait=Math.min(4000,250*Math.pow(2,attempt-1));return new Promise(r=>setTimeout(r,wait)).then(go)});return go()};
const C=window.FEFC_CONFIG||{},ROOT=C.ROOT_ID,FOLDER='application/vnd.google-apps.folder',SC='application/vnd.google-apps.shortcut',S=window.SFX;
const $=s=>document.querySelector(s),P=new URLSearchParams(location.search);
const isTvEnv=()=>!!(document.body.classList.contains('tv')||document.body.classList.contains('firetv')||window.FEFCNative||P.get('tv')||/Tizen|Web0S|webOS|SMART-TV|SmartTV|NetCast|AFT\w|CrKey|BRAVIA|Android TV|GoogleTV|Silk|FEFCFireTV|Fire TV/i.test(navigator.userAgent));
if(isTvEnv())document.body.classList.add('tv');
/* Fire TV native Media3 intro: keep Home fully painted underneath but invisible until first paint is ready + ExoPlayer released. */
if(window.FEFCNative&&P.get('nointro')){document.body.classList.add('firetv','native-waiting');}
/* 0.8.17: Performance mode menu removed. Auto device-tier (LOW/MID/HIGH) owns cost. Debug: ?perf=1 forces body.perf; ?noperf=1 / ?perf=0 forces off. Clear+ignore stale localStorage.fefcPerf so users aren't stuck degraded. */
try{localStorage.removeItem('fefcPerf')}catch(e){}
window.__fefcPerfOn=function(){try{if(P.get('noperf')==='1'||P.get('perf')==='0')return false;if(P.get('perf')==='1')return true}catch(e){}return false};
window.__fefcApplyPerf=function(on){const b=document.body.classList;if(on)b.add('perf');else b.remove('perf');try{localStorage.removeItem('fefcPerf')}catch(e){}try{window.dispatchEvent(new CustomEvent('fefc-perf',{detail:{on:!!on}}))}catch(e){}};
if(window.__fefcPerfOn())document.body.classList.add('perf');
else document.body.classList.remove('perf');
/* 0.8.13 device tier from native (LOW/MID/HIGH). ?tier= overrides for profile tests. */
(function applyTier(){try{
  let t=null;const q=new URLSearchParams(location.search).get('tier');
  if(q&&/^(LOW|MID|HIGH)$/i.test(q))t={tier:q.toUpperCase(),videoTiles:q.toUpperCase()==='HIGH'?4:1,reduceEffects:q.toUpperCase()!=='HIGH'};
  else if(window.FEFCNative&&FEFCNative.deviceTier){try{t=JSON.parse(FEFCNative.deviceTier())}catch(e){}}
  if(!t||!t.tier)return;window.__fefcTier=t;
  const b=document.body.classList;b.remove('tier-low','tier-mid','tier-high','tier-lite');
  b.add('tier-'+String(t.tier).toLowerCase());if(t.reduceEffects)b.add('tier-lite');
  try{document.documentElement.dataset.tier=t.tier}catch(e){}
}catch(e){}})();
/* Fire TV Cube (and other 4K WebViews): lock CSS viewport to 1080p so we don't paint 4× the pixels. */
(function(){try{const fire=!!(window.FEFCNative||/\bFEFCFireTV\b|\bAFT\w|Fire TV/i.test(navigator.userAgent));
 if(!fire&&!document.body.classList.contains('tv'))return;
 const w=Math.max(screen.width||0,screen.height||0,innerWidth||0);
 if(w<1800&&!(window.devicePixelRatio>1.5&&Math.max(innerWidth,innerHeight)>=1080&&fire))return;
 const m=document.querySelector('meta[name=viewport]');
 if(m)m.setAttribute('content','width=1920,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover');
}catch(e){}})();
window.__fefcHomePaintReady=false;
window.__fefcMarkHomeReady=function(){if(window.__fefcHomePaintReady)return;window.__fefcHomePaintReady=true;try{document.body.classList.add('home-paint-ready')}catch(e){}};
window.__fefcFrameStats=null;
window.__fefcStartFrameProbe=function(ms){ms=ms||5000;const t0=performance.now();let last=t0,frames=[];
 function tick(now){frames.push(now-last);last=now;if(now-t0<ms)requestAnimationFrame(tick);else{const sorted=frames.slice().sort((a,b)=>a-b);const sum=frames.reduce((a,b)=>a+b,0);
  window.__fefcFrameStats={n:frames.length,avg:+(sum/frames.length).toFixed(1),p50:+(sorted[sorted.length>>1]||0).toFixed(1),p95:+(sorted[Math.floor(sorted.length*.95)]||0).toFixed(1),max:+(sorted[sorted.length-1]||0).toFixed(1),over16:frames.filter(d=>d>16.7).length,over33:frames.filter(d=>d>33).length,over50:frames.filter(d=>d>50).length};
  try{console.log('FEFC_FRAME_STATS '+JSON.stringify(window.__fefcFrameStats))}catch(e){}}};
 requestAnimationFrame(tick)};
window.__fefcRevealHome=function(){const b=document.body.classList;if(!b.contains('native-waiting')&&b.contains('home-revealed'))return 'already';
 b.remove('native-waiting');b.add('home-revealed','intro-done');
 try{window.dispatchEvent(new Event('fefc-home-revealed'))}catch(e){}
 try{window.__fefcStartFrameProbe(5000)}catch(e){}
 return 'ok'};
/* Fallback: if native never calls reveal (web-only TV), clear the gate. */
setTimeout(function(){if(document.body.classList.contains('native-waiting')&&!window.FEFCNative)window.__fefcRevealHome()},8000);
/* 0.8.18: native bridge can miss reveal when WebView is busy — force-clear gate so Home is never stuck opacity:0. */
setTimeout(function(){if(document.body.classList.contains('native-waiting')){console.warn('FEFC_REVEAL_WATCHDOG');window.__fefcRevealHome&&window.__fefcRevealHome()}},10000);
const HUES=[205,190,220,265,30,160,340,15];
let token=null,items=new Map(),kids=new Map(),meta={},cur=ROOT,live=false,view='home';
const hash=s=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))|0;return Math.abs(h)};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
/* Fire TV WebViews occasionally lack CSS.escape — hub() used to throw and leave #hub empty (blank Home). */
if(!window.CSS)window.CSS={};if(typeof CSS.escape!=='function')CSS.escape=s=>String(s).replace(/[^a-zA-Z0-9_-]/g,c=>{const h=c.charCodeAt(0).toString(16);return '\\'+h+' '});
const cssEsc=s=>{try{return CSS.escape(String(s))}catch(e){return String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"')}};
/* a folder is anything whose mimeType is the folder type, OR a shortcut whose targetMime / target item is a folder; never decided by name or extension */
const isFolder=f=>!!f&&(f.mimeType===FOLDER||f.targetMime===FOLDER||(f.mimeType===SC&&f.targetMime===FOLDER)||(!!f.targetId&&f.targetId!==f.id&&(items.get(f.targetId)||{}).mimeType===FOLDER));
const target=f=>f.targetId||f.id;
function add(list){for(const f of list){items.set(f.id,f);const p=f.parent||ROOT;if(!kids.has(p))kids.set(p,[]);const a=kids.get(p);if(!a.some(x=>x.id===f.id))a.push(f)}}
function applyLinks(L){if(!L)return;for(const p in L){if(!kids.has(p))kids.set(p,[]);const a=kids.get(p);for(const id of L[p]){const f=items.get(id);if(f&&!a.includes(f))a.push(f)}}}
function parse(n){const base=String(n??'').replace(/\.[a-z0-9]{2,4}$/i,'');const parts=base.split(' - ').map(s=>s.trim()).filter(s=>s&&!/^fan edit$/i.test(s));
 const head=parts[0]||base||'Fan edit';
 return{title:parts.length>1?parts.slice(1).join(' · '):head,series:parts.length>1?parts[0]:'',raw:base||head,film:head.replace(/\s*\(\d{4}\)\s*/,''),year:(base.match(/\((\d{4})\)/)||[])[1]}}
const sz=b=>b?(b/1e9).toFixed(2)+' GB':'';
/* ---------- INTRO ---------- */
(function(){var d=document.createElement('div').style;if(!('perspective' in d||'webkitPerspective' in d))document.documentElement.classList.add('no3d')})();
const IQ=[];function afterIntro(fn){const c=document.body.classList;if((c.contains('tvintro')||c.contains('cintro'))&&!c.contains('intro-done'))IQ.push(fn);else fn()}/* Boot data work (JSON parse/index/posters/mosaic) waits until the intro hands off — canvas globe and TV video both need an idle main thread */
const TVI={end:26.2};/* TV CSS intro: hold logo through full intro audio (~26.2s), then hand-off to Home (matches style.css .tvi-* fill-mode:both) */
function intro(){requestAnimationFrame(placeHeader);const wmi=document.getElementById('wordmark');if(wmi&&!wmi.complete)wmi.addEventListener('load',placeHeader);const el=$('#intro');
 /* the intro plays ONCE per app start: never again on reload (service-worker update, WebView restore/recreate), sync, focus or navigation. Marked in sessionStorage (tab/app life) and a short localStorage window (WebView restore after process death). */
 let seenNow=false;try{const t=+localStorage.fefcIntroAt||0;seenNow=!!sessionStorage.fefcIntro||(t>0&&Date.now()-t<3*60*1000)}catch(e){}
 if(!P.get('introframe')&&!P.get('shortintro')){if(seenNow){el.remove();document.body.classList.add('intro-done','no-intro');return}try{sessionStorage.fefcIntro='1';localStorage.fefcIntroAt=String(Date.now())}catch(e){}}
 if(P.get('nointro')){el.remove();document.body.classList.add('intro-done','no-intro');return}
 const short=!!P.get('shortintro'),tv=document.body.classList.contains('tv')||/Tizen|Web0S|webOS|SMART-TV|SmartTV|NetCast|AFT|BRAVIA|Android TV|GoogleTV|Silk/i.test(navigator.userAgent)||!!P.get('tv');
 document.body.classList.add('cintro');const tg=$('#tagline');
 /* TV: no per-frame canvas. A short CSS-only intro (transform/opacity on a few static layers) on the same audio; ?fullintro=1 forces the canvas intro. Timeline in seconds: see TVI. */
 const tvl=tv&&!P.get('fullintro')&&!P.get('introframe')&&!short;
 /* TV intro 0.8.6: assets/intro-tv.mp4 = H.264 Constrained Baseline 720p24 ~1.2Mbps (Fire-safe). Fire tries muted-then-unmute native video; on fail falls back to CSS layers that keep animating until hand-off (no logo freeze). ?novideo=1 / ?cssintro=1 force CSS. */
 const isFire=/AFT\w|FEFCFireTV|Fire TV|Amazon/i.test(navigator.userAgent)||!!window.FEFCNative;
 const vid=tvl&&!P.get('novideo')&&!P.get('cssintro');let vfb=false,vEl=null,tEnd=vid?26.2:TVI.end;
 const tviLayers=()=>{el.insertAdjacentHTML('afterbegin','<i class="tvi-glow"></i><i class="tvi-ring"></i><i class="tvi-ring r2"></i><i class="tvi-sweep"></i><img class="tvi-logo" src="assets/fefc-logo-carson.png" alt=""><i class="tvi-flash"></i><i class="tvi-pulse" aria-hidden="true"></i>');el.classList.add('tvi-live')};/* tagline waits for end() — do not tg-run mid-intro */
 if(tvl){document.body.classList.add('tvintro');el.classList.add('tvi');if(tg){tg.style.visibility='hidden';tg.style.opacity='0'}
  if(vid){vEl=document.createElement('video');vEl.className='tvi-video';vEl.src='assets/intro-tv.mp4?v=6';vEl.setAttribute('playsinline','');vEl.setAttribute('webkit-playsinline','');vEl.playsInline=true;vEl.setAttribute('muted','');vEl.muted=true;vEl.autoplay=true;vEl.preload='auto';vEl.disablePictureInPicture=true;el.prepend(vEl);vEl.addEventListener('error',()=>vidFail());vEl.addEventListener('ended',()=>end(false));vEl.addEventListener('playing',()=>{t0=performance.now();if(!(vEl.videoWidth>0))vidFail();else{try{if(!S.muted)vEl.muted=false}catch(e){}}},{once:true})}
  else tviLayers()}
 /* HTML title/subtitle stay hidden until intro ends (body.cintro:not(.tg-run)); short path still animates via tg-short */
 else if(short)document.body.classList.add('tg-run','tg-short');
 const lite=!tv&&(/iPhone|iPad|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1)||matchMedia('(prefers-reduced-motion: reduce)').matches||(navigator.hardwareConcurrency||8)<=4||!!P.get('lite'));if(lite)document.body.classList.add('lite');
 const R=tvl?{canvas:document.createElement('i'),frame(){},setTiles(){},mapF:r=>r>=tEnd?24.2:0,mapC:r=>r>=tEnd?24.2:0}:window.FEFCIntro.create({tv,lite,tagline:tg});if(!tvl)el.prepend(R.canvas);
 if(!tvl)fetch('data/mosaic.json').then(r=>r.json()).then(m=>R.setTiles(m.map(x=>x.target||x.id))).catch(()=>{});/* thumbs may arrive pre-planet; intro.js quiet() blocks atlas rebuilds through the globe */
 try{S.loadIntro()}catch(e){}
 const fr=P.get('introframe');if(fr!==null){document.body.classList.add('frozen');el.querySelector('.ihint').hidden=true;const draw=()=>R.frame(+fr);draw();[300,1000,2000,3500].forEach(t=>setTimeout(draw,t));return}
 let done=false,raf=0,ia=null;const end=skipped=>{if(done)return;done=true;cancelAnimationFrame(raf);localStorage.fefcSeen='1';sndHint(false);if(skipped||tvl){S.introStop();if(ia){try{ia.pause()}catch(e){}}if(vEl){try{vEl.pause()}catch(e){}}}
  tg.style.opacity='';tg.style.clipPath='';tg.style.visibility='';document.body.classList.add('tg-run');document.body.classList.remove('cintro','tvintro');el.classList.add('done');document.body.classList.add('intro-done');window.__ie=Date.now();IQ.splice(0).forEach(f=>setTimeout(f,0));$('#home').classList.add('enter');setTimeout(()=>{S.ambience($('#player').hidden&&$('#details').hidden);el.remove()},skipped?600:1870)};
 let t0=performance.now(),last=0;const hint=el.querySelector('.ihint');let sndOn=vid?'vid':false;
 const vidFail=()=>{if(vfb||done||!vid)return;vfb=true;tEnd=TVI.end;try{vEl.pause();vEl.remove()}catch(e){}sndOn=false;t0=performance.now();tviLayers();let s2='suspended';try{S.unlock();s2=S.state()}catch(e){}if(s2==='running'){sndOn='ctx';try{S.introSeq(false,0,()=>(performance.now()-t0)/1000)}catch(e){}}else{tryEl().then(ok=>{if(!ok&&!sndOn&&!done)sndHint(true)});const tick=setInterval(()=>{if(sndOn||done)return clearInterval(tick);go()},250)}};
 const fd=[];let pn=0,dg=0;const loop=now=>{if(vid&&!vfb&&vEl&&vEl.ended)return end(false);if(tvl&&ia){const r0=(now-t0)/1000;if(r0>tEnd-1)try{ia.volume=Math.max(0,Math.min(1,(tEnd-r0)/1))}catch(e){}}if(pn&&dg<3){fd.push(now-pn);if(fd.length>12)fd.shift();if(fd.length>=3){const m=fd.slice().sort((a,b)=>a-b)[fd.length>>1];if(m>26&&R.degrade){fd.length=0;dg++;if(R.degrade())document.body.classList.add('lite')}}}pn=now;const r=vid&&!vfb&&vEl.currentTime>0?vEl.currentTime:(now-t0)/1000,s=short?R.mapC(r):R.mapF(r);last=r;R.frame(s);if(s>=24.2)return end(false);raf=requestAnimationFrame(loop)};
 const off=()=>(performance.now()-t0)/1000;
 const hEl=document.createElement('div');hEl.className='isnd';hEl.textContent='Click or press any key for sound';el.appendChild(hEl);
 function sndHint(on){hEl.classList.toggle('on',!!on)}
 const muted=()=>{try{return !!S.muted}catch(e){return false}};
 // (a) HTMLAudioElement path: may be allowed by media-engagement even when the AudioContext is suspended
 const tryEl=()=>{if(short||sndOn||done)return Promise.resolve(false);if(!ia){ia=window.__ia=new Audio(S.INTRO_MP3||'assets/intro.mp3');ia.preload='auto';}ia.muted=muted();try{ia.currentTime=Math.max(0,off())}catch(e){}
  const pr=ia.play();return (pr&&pr.then?pr:Promise.resolve()).then(()=>{if(sndOn&&sndOn!=='el'){ia.pause();return false}if(done){ia.pause();return false}sndOn='el';try{ia.currentTime=Math.max(0,off())}catch(e){}sndHint(false);return true},()=>false)};
 let st='suspended';try{S.unlock();st=S.state()}catch(e){}
 const go=()=>{if(sndOn||done)return;let s2='suspended';try{S.unlock();s2=S.state()}catch(e){}if(s2==='running'){if(ia&&!ia.paused)return;sndOn='ctx';sndHint(false);try{S.introSeq(short,Math.max(0,(performance.now()-t0)/1000-.05),()=>(performance.now()-t0)/1000)}catch(e){}}};
 if(vid){/* sound comes from the video's own track */}else if(st==='running'){sndOn='ctx';try{S.introSeq(short,0,()=>(performance.now()-t0)/1000)}catch(e){}}
 else{tryEl().then(ok=>{if(!ok&&!sndOn&&!done&&!short)sndHint(true)});const tick=setInterval(()=>{if(sndOn||done)return clearInterval(tick);go()},250);['pointerdown','touchstart','keydown','click'].forEach(ev=>addEventListener(ev,go,{capture:true,passive:true}))}
 if(vid){let m=false;try{m=!!S.muted}catch(e){}vEl.muted=m;const pp=vEl.play();const mp=()=>{vEl.muted=true;const p2=vEl.play();if(p2&&p2.catch)p2.catch(()=>vidFail())};if(pp&&pp.catch)pp.catch(mp);setTimeout(()=>{if(!done&&!vfb&&(!(vEl.currentTime>0.05)||!(vEl.videoWidth>0)))vidFail()},2500)}
 R.frame(0);raf=requestAnimationFrame(loop);
 /* Skip arming: with video, sndOn starts as 'vid' so the old sndOn?250 path armed skip in 250ms —
    Fire TV D-pad/OK then cut the intro short (owner: "intro doesn't play in full"). Arm skip only after a real grace. */
 let skipArmed=false;const skipGrace=vid?Math.max(4000,(tEnd*1000*0.35)|0):(sndOn?2500:0);
 setTimeout(()=>{skipArmed=true;try{if(hint)hint.focus()}catch(e){}},skipGrace);
 const sk=e=>{if(e.type==='keydown'&&e.repeat)return;if(!skipArmed||(!sndOn&&!short&&!done)){/* first press / pre-arm: unlock sound only, never skip */S.unlock();tryEl().then(ok=>{if(!ok)go()});setTimeout(go,60);e.stopPropagation&&e.stopPropagation();return}e.preventDefault&&e.preventDefault();e.stopPropagation&&e.stopPropagation();removeEventListener('keydown',sk,true);el.removeEventListener('pointerdown',sk);S.unlock();end(true)};
 setTimeout(()=>{if(!done){addEventListener('keydown',sk,true);el.addEventListener('pointerdown',sk)}},vid?100:(sndOn?250:0))}
// first interaction anywhere unlocks audio (autoplay rules)
addEventListener('keydown',function kU(){removeEventListener('keydown',kU);if(!window._u){window._u=1;S.unlock();if(document.body.classList.contains('intro-done')&&$('#details').hidden&&$('#player').hidden)S.ambience(true)}});
addEventListener('pointerdown',()=>{const first=!window._u;window._u=1;S.unlock();if(first&&document.body.classList.contains('intro-done')&&$('#details').hidden&&$('#player').hidden)S.ambience(true)},{capture:true});
/* ---------- DRIVE (live) ---------- */
const F='id,name,mimeType,size,modifiedTime,parents,thumbnailLink,shortcutDetails';
async function api(q,pageToken){const u=new URL('https://www.googleapis.com/drive/v3/files');
 u.search=new URLSearchParams({q,pageSize:1000,fields:'nextPageToken,files('+F+')',supportsAllDrives:true,includeItemsFromAllDrives:true,...(pageToken?{pageToken}:{})});
 if(!token)u.searchParams.set('key',C.GOOGLE_API_KEY);const r=await fetch(u,token?{headers:{Authorization:'Bearer '+token}}:{});if(r.status===401){token=null;live=!!C.GOOGLE_API_KEY;throw Error('auth')}if(!r.ok)throw Error('drive '+r.status);return r.json()}
const norm=(f,p)=>({id:f.id,name:f.name,mimeType:f.mimeType,parent:p||(f.parents||[])[0],size:+f.size||0,modified:f.modifiedTime,thumb:f.thumbnailLink,targetId:f.shortcutDetails?.targetId,targetMime:f.shortcutDetails?.targetMimeType});
async function loadFolder(id){if(!live)return;status('Loading…');let t,all=[];
 do{const r=await api(`'${id}' in parents and trashed=false`,t);all.push(...(r.files||[]).map(f=>norm(f,id)));t=r.nextPageToken}while(t);
 kids.set(id,[]);add(all);
 status('')}
function signIn(){if(!C.GOOGLE_CLIENT_ID){alert('Live Drive mode needs a Google OAuth Client ID in config.js (see README). Showing the saved index.');return}
 const go=()=>google.accounts.oauth2.initTokenClient({client_id:C.GOOGLE_CLIENT_ID,scope:'https://www.googleapis.com/auth/drive.readonly',callback:async r=>{if(r.access_token){token=r.access_token;live=true;kids.clear();await loadFolder(ROOT);open(cur)}}}).requestAccessToken();
 if(window.google?.accounts)return go();const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.onload=go;document.head.appendChild(s)}
/* ---------- ART ---------- */
const cache=JSON.parse(localStorage.fefcCache||'{}');const save=()=>localStorage.fefcCache=JSON.stringify(cache);
async function tmdbFind(q,year){if(!C.TMDB_API_KEY)return null;const k='t:'+q+year;if(k in cache)return cache[k];
 try{const j=await(await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${C.TMDB_API_KEY}&query=${encodeURIComponent(q)}${year?'&year='+year:''}`)).json();cache[k]=(j.results||[]).find(x=>x.poster_path)||null}catch(e){cache[k]=null}save();return cache[k]}
function artBg(f){const h=HUES[hash(parse(f.name).series||f.name)%8];return `radial-gradient(circle at 75% 20%,hsl(${h} 90% 60% / .85),hsl(${h} 70% 25%) 45%,#050a14 100%)`}
const SUPRE=/^\s*\w{1,3}\s*-\s*support\b|support\s+(us|patreon)|patreon|paypal|venmo|donat(e|ion)/i;function isSupportDoc(f){if(!f||isFolder(f))return false;const t=f.targetId&&items.get(f.targetId);return SUPRE.test(f.name||'')||!!(t&&SUPRE.test(t.name||''))}
function personKind(pp){if(!pp)return'';const R=pp.roles||(pp.role?[pp.role]:[]);const hasA=R.includes('actor')||pp.role==='actor';const hasD=R.includes('director')||pp.role==='director';if(hasA&&hasD)return'ACTOR / DIRECTOR';return hasD?'DIRECTOR':'ACTOR'}
function tile(f,live_){const fold=isFolder(f),p=parse(f.name),aud=!fold&&!isVid(f)&&isAud(f),vid=!fold&&(isVid(f)||aud),pp=fold&&people[target(f)];const cls=fold?(pp?'person':'fold'):vid?'vid':'doc';/* Any Read First folder/doc (any parent / search / My List) uses the same home-hub artwork at normal grid tile size */if(/\bread first\b/i.test(f.name||''))return `<button class="ol-tile fold rfhome" data-id="${f.id}" data-rfhome="1" aria-label="Read First"><span class="rf-t">Read First</span></button>`;if(fold){const fid=target(f);if((fid===FOLD.collections||f.id===FOLD.collections)&&cur!==FOLD.collections)return `<button class="ol-tile fecc" data-id="${f.id}" data-fecc="1" aria-label="Fan Edit Collections"><span class="fecc-t">Fan Edit Collections</span><small class="fecc-c">${esc(countsLine(FOLD.collections)).replace(/ · /g,' <wbr>· ')}</small></button>`;if((fid===FOLD.tbc||f.id===FOLD.tbc)&&cur!==FOLD.tbc)return `<button class="ol-tile fecc fecc-tbc" data-id="${f.id}" data-fecc="1" aria-label="To Be Catalogued"><span class="fecc-t">To Be Catalogued</span><small class="fecc-c">${esc(countsLine(FOLD.tbc)).replace(/ · /g,' <wbr>· ')}</small></button>`}if(fold&&target(f)===ROOT&&f.parent===FOLD.collections)return `<button class="ol-tile mainc" data-id="${f.id}" data-mainc="1" aria-label="Main Collection"><img src="assets/fefc-logo.png" alt=""><small class="mc-l">Main Collection</small><small class="mc-c">${esc(countsLine(ROOT)).replace(/ · /g,' <wbr>· ')}</small></button>`;if(!fold&&!vid&&isSupportDoc(f))return `<button class="ol-tile sup" data-id="${f.id}" data-sup="1" aria-label="Support Us: Patreon, PayPal, Venmo"><span class="sup-t">Support Us</span><small class="sup-s">Patreon · <wbr>PayPal · <wbr>Venmo</small><span class="sup-logos" style="display:flex;gap:.4em;justify-content:center;margin-top:.4em"><img src="assets/brand/patreon.png" alt="Patreon" style="height:1.6em;background:#fff;border-radius:50%;padding:.2em"><img src="assets/brand/paypal.png" alt="PayPal" style="height:1.6em;background:#fff;border-radius:.4em;padding:.2em"><img src="assets/brand/venmo.png" alt="Venmo" style="height:1.6em;background:#fff;border-radius:.4em;padding:.3em"></span></button>`;const ad=cls==='doc'&&/^\s*\w{1,3}\s*-\s*support\b|support patreon|paypal\/venmo/i.test(f.name);return `<button class="ol-tile ${cls}${ad?' ad':''} ${live_?'live':''}" data-id="${f.id}" title="${esc(f.name)}"><div class="art" style="background:${artBg(f)}"></div><span class="kind">${live_?'NEW':pp?personKind(pp):(f.pt?(f.ptLabel||'LINK'):(fold?'':aud?'AUDIO':vid?'FAN EDIT':'DOCUMENT'))}</span>${(fold||vid)?(()=>{const on=!!(window.UD&&UD.isStarred(f.id));return `<span class="star${on?' on':''}" data-star="${f.id}" role="button" aria-pressed="${on}" aria-label="${on?'Remove from My List':'Add to My List'}" title="${on?'Starred':'Star'} (S)">${on?'★':'☆'}</span>`})():''}${vid?`<div class="pcap ${(()=>{const n=p.raw.length;return n>90?'c4':n>55?'c3':n>30?'c2':'c1'})()}">${esc(p.raw)}</div>`:''}${fold&&typeof isDenied==='function'&&isDenied(target(f))?'<span class="lockb" title="Private library" aria-label="Private">🔒</span>':''}<div class="nm">${esc(fold?f.name:(p.raw||f.name||'Untitled'))}</div></button>`}
const THUMBO=new Map();
/* Poster URLs in posters.json are mostly full-size originals (Wikimedia *_unscaled, TVmaze original_untouched). Ask for a tile-sized
   rendition instead (about a third of the bytes and decode cost on a weak TV); falls back to the original on error. */
function thumbUrl(u){if(!u||typeof u!=='string')return u;let n=u;
 let m=u.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/(en|commons)\/([0-9a-f]\/[0-9a-f]{2})\/([^\/?#]+\.(?:jpe?g|png|webp))(?:\?.*)?$/i);
 if(m&&!/\.svg/i.test(m[3]))n='https://upload.wikimedia.org/wikipedia/'+m[1]+'/thumb/'+m[2]+'/'+m[3]+'/330px-'+m[3];
 else if((m=u.match(/^(https:\/\/static\.tvmaze\.com\/uploads\/images\/)original_untouched(\/.*)$/)))n=m[1]+'medium_portrait'+m[2];
 if(n!==u)THUMBO.set(n,u);return n}
/* an edit with no poster of its own borrows one from a sibling edit of the same series (same folder, same "Series - Part N - Title" prefix), e.g. Dawn of Justice Series Part 1/3 use Part 2's */
function seriesPoster(f){if(isFolder(f))return null;const p=parse(f.name);if(!p.series)return null;const sb=kids.get(f.parent)||[];for(const x of sb){if(x===f||isFolder(x)||!isVid(x))continue;if(parse(x.name).series!==p.series)continue;const q=posters[x.id]||posters[target(x)];if(q)return q}return null}
async function art(el,f){if(f&&f.pt)return;if(el.dataset&&el.dataset.fecc)return;if(!f||el.classList.contains('sup')||el.classList.contains('mainc')||el.classList.contains('rfhome')||el.dataset.rfhome)return;let src=null;const p=parse(f.name);
 /* Person folders always use people.json photos — never folderthumbs / first-video Drive frames (those + face-crop coords looked like broken actor/director art after pins raced ahead of people.json). */
 const person=isFolder(f)&&(people[target(f)]||f.parent===FOLD.actors||f.parent===FOLD.directors);
 if(isFolder(f)&&people[target(f)])src=people[target(f)].url;else if(!isFolder(f)&&isMedia(f)){const ps=posters[f.id]||posters[target(f)]||(isAud(f)?(()=>{const sb=kids.get(f.parent)||[],pf=parse(f.name).film;for(const x of sb){const q=!isFolder(x)&&isVid(x)&&parse(x.name).film===pf&&(posters[x.id]||posters[target(x)]);if(q)return q}return null})():null)||seriesPoster(f);if(!ps)return;src=thumbUrl(ps.url);el.classList.add('has-poster')}else
 if(isFolder(f)&&!person){const fid=target(f);let t=fthumbs[fid];if(!t){let q=[fid];for(let d=0;d<3&&!t&&q.length;d++){const nq=[];for(const id of q){const ks=kids.get(id)||[],v=ks.find(x=>!isFolder(x)&&isVid(x));if(v){t=target(v);break}ks.forEach(x=>{if(isFolder(x))nq.push(target(x))})}q=nq.slice(0,40)}}if(t)src=t.startsWith('assets/')?t:'https://drive.google.com/thumbnail?sz='+thumbSz()+'&id='+t}
 else if(person&&!src){/* people.json not loaded yet — leave blank; reArt will fill */}else if(f.mimeType==='application/octet-stream'&&!f.targetId)src=null;else if(!person)src=f.thumb?f.thumb.replace(/=s\d+$/,'=s640'):'https://drive.google.com/thumbnail?sz='+thumbSz()+'&id='+target(f);
 if(!src){const r=await tmdbFind(isFolder(f)?f.name:p.film,p.year);if(r)src='https://image.tmdb.org/t/p/w780'+(r.backdrop_path||r.poster_path)}
 if(src){const im=new Image();im.alt='';im.referrerPolicy='no-referrer';im.decoding='async';im.onerror=()=>{const o=THUMBO.get(src);if(o){THUMBO.delete(src);src=o;im.src=o}};im.onload=()=>{if(im.naturalWidth>40){const a=el.querySelector('.art');const pp=isFolder(f)&&people[target(f)];
  if(pp&&pp.fx!=null){const vis=Math.min(1,im.naturalWidth*9/16/im.naturalHeight),py=vis>=1?50:Math.max(0,Math.min(100,(pp.fy-vis/2)/(1-vis)*100));
   if(pp.fit==='contain'){const bg=new Image();bg.alt='';bg.className='pbg';bg.referrerPolicy='no-referrer';bg.src=src;bg.style.objectPosition='50% '+py+'%';(a||el).appendChild(bg);im.className='pfit'}else im.style.objectPosition=(pp.fx*100).toFixed(1)+'% '+py.toFixed(1)+'%'}
  a?a.appendChild(im):el.insertBefore(im,el.firstChild)}};im.src=src}}
/* ---------- ONLIVE HOME HUB ---------- */
const FOLD={readFirst:'1Aw4hr8uM3dsj_txpxPkEJxPDfNjmcYRT',collections:'1fEaxNbFIrEwKRygETVm4jgtJGVAqKxGB',tbc:'1503Wl56hzRppaIFcQisvQksOaeYOEjnk',actors:'1Jb0DtQC05fOdpiNg-O88fUpwI5ic3UHS',directors:'1u2B5d9cb1zAtrtdF_rA3eXhtcFgggSib'};
const SUPPORT=[{name:'Patreon',url:'https://www.patreon.com/cw/FanEditFanClub',sub:'From $1 / month',logo:'<img class="sup-logo" src="assets/brand/patreon.png" alt="Patreon" style="width:100%;height:100%;object-fit:contain;background:#fff;border-radius:50%;padding:12%;box-sizing:border-box">'},{name:'PayPal',url:'https://www.paypal.com/biz/profile/faneditfanclub',sub:'One-time donation',logo:'<img class="sup-logo" src="assets/brand/paypal.png" alt="PayPal" style="width:100%;height:100%;object-fit:contain;background:#fff;border-radius:50%;padding:12%;box-sizing:border-box">'},{name:'Venmo',url:'https://venmo.com/u/FanEditFanClub',sub:'@FanEditFanClub',logo:'<img class="sup-logo" src="assets/brand/venmo.png" alt="Venmo" style="width:100%;height:100%;object-fit:contain;background:#fff;border-radius:50%;padding:12%;box-sizing:border-box">'}];
let posters={},people={},mosaicList=[],mosaicTimer=null,genreMap={},fthumbs={};
const GORDER=['Action','Sci-Fi','Horror','Comedy','Animation','Drama','Fantasy','Superhero','Thriller','Crime','Adventure','War','Western','Family','Musical','Documentary','Uncategorized'];
let _tfC=new Map(),_tfN=-1;function topFolder(f){if(_tfN!==items.size){_tfN=items.size;_tfC=new Map()}if(f&&_tfC.has(f.id))return _tfC.get(f.id);let x=f,guard=0;while(x&&x.parent&&x.parent!==ROOT&&guard++<30)x=items.get(x.parent);const r=x&&x.parent===ROOT?x.id:null;if(f&&f.id)_tfC.set(f.id,r);return r}
/* 0.8.23: an item can have several genres. Union of genres.json (folders, any depth) and data/video-genres.json (per file / collection folder) along its ancestor chain. */
let VG={},_goC=new Map(),_goK='';
function genresOf(f){if(!f)return['Uncategorized'];const k=Object.keys(genreMap).length+'|'+Object.keys(VG).length;if(_goK!==k){_goK=k;_goC=new Map()}let r=_goC.get(f.id);if(r)return r;const hit=[];let x=f,n=0;while(x&&n++<40){const a=genreMap[x.id],b=VG[x.id];if(a&&a.genres)for(const g of a.genres)if(g!=='Uncategorized'&&g!=='Unsorted'&&hit.indexOf(g)<0)hit.push(g);if(b)for(const g of b)if(g!=='Unsorted'&&hit.indexOf(g)<0)hit.push(g);x=items.get(x.parent)}if(f.targetId&&VG[f.targetId])for(const g of VG[f.targetId])if(g!=='Unsorted'&&hit.indexOf(g)<0)hit.push(g);/* 0.8.27: no separate Unsorted genre; it folds into Uncategorized */r=hit.length?hit:['Uncategorized'];_goC.set(f.id,r);return r}
window.__fefcVG=()=>VG;
let _glC={},_glK='';function genreList(g){const k=items.size+'|'+Object.keys(genreMap).length;if(_glK!==k){_glK=k;_glC={}}return _glC[g]||(_glC[g]=vids().filter(f=>genresOf(f).indexOf(g)>=0))}
function genreStrip(){const have={};Object.keys(genreMap).forEach(k=>genreMap[k].genres.forEach(g=>have[g]=1));have.Uncategorized=1;
 $('#genres').innerHTML='<span class="glab">Genres</span>'+GORDER.filter(g=>have[g]).map(g=>`<button class="gt" data-genre="${g}">${g}</button>`).join('')}
document.addEventListener('click',e=>{const g=e.target.closest('[data-genre]');if(!g)return;S.click();go('#/genres/'+encodeURIComponent(g.dataset.genre))});
const allVids=()=>vids();let _vc=null,_vk=-1;function vids(){if(_vk!==items.size){_vk=items.size;_vc=Array.from(items.values()).filter(f=>!isFolder(f)&&isVid(f))}return _vc}
let _rvc=null,_rvk=-1;function rootVids(){if(_rvk!==items.size){_rvk=items.size;_rvc=Array.from(items.values()).filter(f=>!isFolder(f)&&isVid(f)&&(f.parent===ROOT||(!f.parent&&f.id!==ROOT)))}return _rvc}
const DOCX=/\.(pdf|docx?|txt|xlsx?|pptx?|url|html?|rtf|csv|md|webloc|lnk|json|xml|zip|rar|7z|jpe?g|png|gif|mp3|flac|wav|srt)$/i;
function isVid(f,d){if(!f||isFolder(f))return false;if(f.kind)return f.kind==='video';/* resolved type stored by tools/classify.py */
 const t=f.targetId;if(t&&t!==f.id&&(d|0)<3){const x=items.get(t);if(x)return isVid(x,(d|0)+1)}
 const m=f.mimeType||'';if(/^\._|^\./.test(f.name||''))return false;if(/^application\/vnd\.google-apps\.(?!shortcut)/.test(m)||/^(text|image|audio)\/|pdf|html|url/.test(m)||DOCX.test(f.name))return false;
 return /^video\//.test(m)||/\.(mkv|mp4|m4v|avi|mov|webm|ts|m2ts|mts|mpg|mpeg|wmv|flv|3gp|ogv|vob|divx)$/i.test(f.name)}
const AUDX=/\.(mp3|m4a|m4b|aac|flac|wav|ogg|opus)$/i;function isAud(f,d){if(!f||isFolder(f)||/^\._/.test(f.name||''))return false;const t=f.targetId;if(t&&t!==f.id&&(d|0)<3){const x=items.get(t);if(x)return isAud(x,(d|0)+1)}if(/^application\/vnd\.google-apps\.(?!shortcut)/.test(f.mimeType||''))return false;const m=f.mimeType||'';return /^audio\//.test(m)||((!m||m==='application/octet-stream')&&AUDX.test(f.name||''))}
const isMedia=f=>isVid(f)||isAud(f);
const JUNK=/^\.|^thumbs\.db$|^desktop\.ini$/i,_dc={};
const mdate=f=>{const D=NA.dates||{},r=D[f.id]||D[f.targetId||'']||D[target(f)];return (r&&r.m)||f.modified||''};
/* unique-video identity: shortcuts resolve to their target; a byte-identical size means the same upload (Drive exposes no md5 via our tooling); samples/trailers/extras are not counted */
const XTRA=/\b(sample|trailer|teaser|featurette|extras?|bonus|promo|behind the scenes|deleted scenes?|interview|making of)\b/i;
function vcanon(f){const t=items.get(target(f))||f;if(XTRA.test(t.name||f.name||''))return null;if(t.md5)return 'm:'+t.md5;const z=t.size||f.size;return z?'s:'+z:target(f)}
/* Main Collection subtitle leaves out To Be Catalogued: no TBC folders, no TBC-hosted files even via shortcuts */
const _ut={};function underTBC(t){if(t in _ut)return _ut[t];let x=items.get(t),h=0,r=t===FOLD.tbc;while(!r&&x&&h++<60){if(x.parent===FOLD.tbc)r=true;else x=items.get(x.parent)}return _ut[t]=r}
function deepCounts(id){if(_dc[id]&&_dc[id].k===items.size&&_dc[id].d===!!NA.dates)return _dc[id];const noT=id===ROOT;let c=0,n=0,sz=0,nw='';const seen={},fs={},qd={},st=[id];while(st.length){const x=st.pop();if(seen[x])continue;seen[x]=1;(kids.get(x)||[]).forEach(f=>{if(f.pt)return;if(noT&&underTBC(target(f)))return;if(isFolder(f)){const t=target(f);if(id!==ROOT&&t!==id&&(t===ROOT||Object.values(FOLD).includes(t)))return;if(!seen[t]&&!qd[t]){qd[t]=1;c++;st.push(t)}}else if(!JUNK.test(f.name||'')&&isVid(f)&&!fs[target(f)]){fs[target(f)]=1;const ck=vcanon(f);if(ck===null||fs['c:'+ck])return;fs['c:'+ck]=1;n++;sz+=f.size||0;const m=mdate(f);if(m>nw)nw=m}})}return _dc[id]={k:items.size,d:!!NA.dates,c,n,sz,nw}}
/* per-folder stats for sorting AND the in-collection subtitle: own subtree only (real subfolders; folder shortcuts are not followed, so cross-links can't inflate counts). n = unique video files only: never folders, never docs/images/subtitles */
const _sc={};function sortCounts(id){const c=_sc[id];if(c&&c.k===items.size&&c.d===!!NA.dates)return c;let n=0,sz=0,nw='';const seen={},fs={},st=[id];while(st.length){const x=st.pop();if(seen[x])continue;seen[x]=1;(kids.get(x)||[]).forEach(f=>{if(f.pt)return;if(isFolder(f)){const t=target(f);if(t===f.id&&!f.targetId&&(items.get(t)||f).parent===x&&t!==ROOT&&!Object.values(FOLD).includes(t))st.push(t)}else if(!JUNK.test(f.name||'')&&isVid(f)&&!fs[target(f)]){fs[target(f)]=1;const ck=vcanon(f);if(ck===null||fs['c:'+ck])return;fs['c:'+ck]=1;n++;sz+=f.size||0;const m=mdate(f);if(m>nw)nw=m}})}return _sc[id]={k:items.size,d:!!NA.dates,n:directVids(id),sz,nw,deep:n}}
const fmtN=n=>n.toLocaleString('en-US');
/* 0.3.22: the file count shown for any folder (actors, directors, collections, tiles, subtitles) = unique VIDEO files directly inside it, not recursive. The hub lines (Main Collection / Fan Edit Collections / TBC) keep their existing totals. */
const _dv={};function directVids(id){const t=target(items.get(id)||{id})||id;const c=_dv[t];if(c&&c.k===items.size)return c.n;let n=0;const fs={};(kids.get(t)||[]).forEach(f=>{if(f.pt||isFolder(f)||JUNK.test(f.name||'')||!isVid(f)||fs[target(f)])return;fs[target(f)]=1;const ck=vcanon(f);if(ck===null||fs['c:'+ck])return;fs['c:'+ck]=1;n++});_dv[t]={k:items.size,n};return n}
function immFolderCount(id){let c=0;const seen={};(kids.get(id)||[]).forEach(f=>{if(f.pt||!isFolder(f))return;const t=target(f);if(seen[t])return;seen[t]=1;c++});return c}
/* Hub / Main Collection / Fan Edit Collections / TBC labels: collection count = immediate child folders only (not recursive). File totals stay deep. */
function countsLine(id){const d0=deepCounts(id),d=(id===ROOT||id===FOLD.collections||id===FOLD.tbc)?d0:Object.assign({},d0,{n:directVids(id)});const c=(id===ROOT||id===FOLD.collections||id===FOLD.tbc)?immFolderCount(id):d.c;return fmtN(c)+(c===1?' collection':' collections')+' · '+fmtN(d.n)+(d.n===1?' file':' files')}
/* Any Drive file link (details "Open in Drive" etc.) counts as opening the file: record it in History like Play */
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href*="drive.google.com"],a[href*="docs.google.com"]');if(!a||!window.UD)return;
 const m=a.href.match(/\/(?:file|document|spreadsheets|presentation)\/d\/([\w-]{20,})/)||a.href.match(/[?&]id=([\w-]{20,})/);if(!m)return;
 const id=m[1],f=[...(items.get(id)?[items.get(id)]:[])][0]||[...items.values()].find(x=>x.targetId===id),did=$('#details')&&!$('#details').hidden?$('#details').dataset.id:null,rec=(did&&(did===id||target(items.get(did)||{id:did})===id))?items.get(did):f;
 try{UD.opened(rec?rec.id:id,rec?rec.name:(a.title||a.textContent||'Drive file'))}catch(err){}},true);
function cnt(id){const k=kids.get(id);return k?k.length:0}
function hubTiles(){const newN=NA.newCount(rootVids());
 return [['readfirst','Read First',''],['arena','New Arrivals',newN?newN+(newN===1?' New File':' New Files'):''],['support','Support Us','Patreon · PayPal · Venmo'],
  ['folder:'+FOLD.collections,'Fan Edit Collections',countsLine(FOLD.collections)],['main','',''],['folder:'+FOLD.tbc,'To Be Catalogued',countsLine(FOLD.tbc)],
  ['people','Actors\n&\nDirectors',NA.plural(peopleList().length,'Collection')],['mylist','My List',(()=>{const n=(window.UD&&UD.stars)?UD.stars().length:0;return 'History · '+n+' Starred'})()],['genres','Genres',(()=>{const h={};Object.keys(genreMap).forEach(x=>genreMap[x].genres.forEach(g=>h[g]=1));const n=GORDER.filter(g=>h[g]).length;return n?n+(n===1?' Genre':' Genres'):''})()]];
}
function hubHtml(t){return t[0]==='main'?`<button class="hb hb-logo" data-hub="main" aria-label="Main Collection"><img src="assets/fefc-logo.png" alt=""><small>Main Collection</small><small class="hb-cnt">${esc(countsLine(ROOT)).replace(/ · /g,' <wbr>· ')}</small></button>`
  :`<button class="hb" data-hub="${t[0]}">${t[0]==='mylist'?'<i class="hb-star" aria-hidden="true">★</i>':''}<span>${esc(t[1]).replace(/\n&amp;\n/,'<br><i class="amp">&amp;</i><br>').replace(/\n/g,'<br>')}</span>${t[2]?`<small>${esc(t[2]).replace(/ · /g,' <wbr>· ')}</small>`:''}</button>`}
function hubPatchOne(el,t){if(!el||!t)return;if(t[0]==='main'){const sm=el.querySelector('.hb-cnt');if(sm)sm.innerHTML=esc(countsLine(ROOT)).replace(/ · /g,' <wbr>· ');return}
 const sp=el.querySelector('span');if(sp)sp.innerHTML=esc(t[1]).replace(/\n&amp;\n/,'<br><i class="amp">&amp;</i><br>').replace(/\n/g,'<br>');
 let sm=el.querySelector('small');if(t[2]){if(!sm){sm=document.createElement('small');el.appendChild(sm)}sm.innerHTML=esc(t[2]).replace(/ · /g,' <wbr>· ')}else if(sm)sm.remove()}
function hub(){try{
 if(document.body.classList.contains('genres-mode')&&window.FEFCGenres&&FEFCGenres.hub)return FEFCGenres.hub();
 const box=$('#hub');if(!box)return;let T;try{T=hubTiles()}catch(e){console.warn('hubTiles',e);T=[['readfirst','Read First',''],['arena','New Arrivals',''],['support','Support Us','Patreon · PayPal · Venmo'],['folder:'+FOLD.collections,'Fan Edit Collections',''],['main','',''],['folder:'+FOLD.tbc,'To Be Catalogued',''],['people','Actors\n&\nDirectors',''],['mylist','My List','History · 0 Starred'],['genres','Genres','']]}
 const ae=document.activeElement;const fhub=(ae&&box.contains(ae)&&ae.getAttribute&&ae.getAttribute('data-hub'))||(window.__fefcFocusRec&&window.__fefcFocusRec.type==='hub'&&window.__fefcFocusRec.hub)||null;
 const mcs=[].slice.call(box.querySelectorAll('.mc'));
 /* Prefer in-place label/count updates so the focused .hb node is never replaced (TV focus loss). */
 let ok=T.length>0;const have=new Set();
 for(let i=0;i<T.length;i++){const t=T[i];const el=box.querySelector('.hb[data-hub="'+cssEsc(t[0])+'"]');if(!el){ok=false;break}hubPatchOne(el,t);have.add(t[0])}
 if(ok){[].slice.call(box.querySelectorAll('.hb[data-hub]')).forEach(el=>{if(!have.has(el.getAttribute('data-hub')))el.remove()});
  if(fhub){const el=box.querySelector('.hb[data-hub="'+cssEsc(fhub)+'"]');if(el&&document.activeElement!==el)try{focusEl(el)}catch(e){}}
  try{if(box.querySelector('.hb'))window.__fefcMarkHomeReady&&window.__fefcMarkHomeReady()}catch(e){}
  return}
 box.innerHTML=T.map(hubHtml).join('');mcs.forEach(x=>box.appendChild(x));
 if(fhub){const el=box.querySelector('.hb[data-hub="'+cssEsc(fhub)+'"]');if(el)try{focusEl(el)}catch(e){}}
 try{if(box.querySelector('.hb'))window.__fefcMarkHomeReady&&window.__fefcMarkHomeReady()}catch(e){}
}catch(e){console.warn('hub',e);try{const box=$('#hub');if(box&&!box.querySelector('.hb')){box.innerHTML='<button class="hb" data-hub="readfirst"><span>Read First</span></button><button class="hb" data-hub="arena"><span>New Arrivals</span></button><button class="hb" data-hub="support"><span>Support Us</span></button><button class="hb" data-hub="folder:'+FOLD.collections+'"><span>Fan Edit Collections</span></button><button class="hb hb-logo" data-hub="main" aria-label="Main Collection"><img src="assets/fefc-logo.png" alt=""><small>Main Collection</small></button><button class="hb" data-hub="folder:'+FOLD.tbc+'"><span>To Be Catalogued</span></button><button class="hb" data-hub="people"><span>Actors<br><i class="amp">&amp;</i><br>Directors</span></button><button class="hb" data-hub="mylist"><i class="hb-star" aria-hidden="true">★</i><span>My List</span></button><button class="hb" data-hub="genres"><span>Genres</span></button>';window.__fefcMarkHomeReady&&window.__fefcMarkHomeReady()}}catch(e2){}}}

function syncTag(){placeHeader()}
/* Home grid: one uniform COLS×ROWS lattice. Center 3×3 is the selectable hub.
   Every other cell is a clip tile of the same size. Gutter absorbs focus scale + glow
   so a clip never overlaps a hub button. Must match tools/build-mosaic-atlas.py. */
const HOME_COLS=5,HOME_ROWS=5,HOME_HUB=3,HOME_GUTTER=0.10;
function homePlane(){let p=document.getElementById('home-plane');const h=$('#home');if(!h)return null;if(!p){p=document.createElement('div');p.id='home-plane';const mos=$('#mosaic'),hub=$('#hub');if(mos)p.appendChild(mos);if(hub)p.appendChild(hub);h.appendChild(p)}return p}
function layoutHomeGrid(){
 const H=$('#home'),plane=homePlane(),hub=$('#hub'),tg=$('#tagline');if(!H||!plane||!hub)return null;
 const HR=H.getBoundingClientRect();
 const W=H.clientWidth||innerWidth,Ht=H.clientHeight||innerHeight;
 if(W<80||Ht<80)return null;
 const tv=document.body.classList.contains('tv')||document.body.classList.contains('firetv');
 document.body.classList.add('home-grid');
 const side=Math.round(W*(tv?0.05:0.025));
 let top=Math.round(Ht*(tv?0.05:0.012));
 if(tg){tg.style.top=Math.round(top*0.35)+'px';tg.style.left='0';tg.style.right='0';
  const tr=tg.getBoundingClientRect();if(tr.height>4&&tr.bottom>HR.top)top=Math.max(top,Math.round(tr.bottom-HR.top+Math.max(6,Ht*0.008)))}
 const hi=$('#hints'),tk=$('#ticker');
 let bot=Math.round(Ht*(tv?0.05:0.02));
 if(hi&&hi.offsetHeight){const ir=hi.getBoundingClientRect();if(ir.top>HR.top+Ht*0.4)bot=Math.max(bot,Math.round(HR.bottom-ir.top+Math.max(6,Ht*0.008)))}
 if(document.body.classList.contains('tk-on')&&tk&&tk.classList.contains('on')){const kr=tk.getBoundingClientRect();if(kr.top>HR.top+Ht*0.4)bot=Math.max(bot,Math.round(HR.bottom-kr.top))}
 const pw=Math.max(120,W-side*2),ph=Math.max(120,Ht-top-bot);
 const cellW=pw/HOME_COLS,cellH=ph/HOME_ROWS;
 const hubCol=(HOME_COLS-HOME_HUB)/2,hubRow=(HOME_ROWS-HOME_HUB)/2;
 plane.style.cssText='position:absolute;left:'+side+'px;top:'+top+'px;width:'+Math.round(pw)+'px;height:'+Math.round(ph)+'px;z-index:1';
 const gx=cellW*HOME_GUTTER,gy=cellH*HOME_GUTTER;
 const hx=((hubCol+HOME_GUTTER/2)/HOME_COLS*100)+'%',hy=((hubRow+HOME_GUTTER/2)/HOME_ROWS*100)+'%';
 const hw=((HOME_HUB-HOME_GUTTER)/HOME_COLS*100)+'%',hh=((HOME_HUB-HOME_GUTTER)/HOME_ROWS*100)+'%';
 const st=document.documentElement.style;
 st.setProperty('--hub-x',hx);st.setProperty('--hub-y',hy);st.setProperty('--hub-w',hw);st.setProperty('--hub-h',hh);
 st.setProperty('--hub-gx',gx+'px');st.setProperty('--hub-gy',gy+'px');
 hub.style.left=hx;hub.style.top=hy;hub.style.width=hw;hub.style.height=hh;
 hub.style.columnGap=gx+'px';hub.style.rowGap=gy+'px';
 plane._grid={side,top,pw,ph,cellW,cellH,gx,gy};
 return plane._grid}
let _placeHdrRaf=0,_placeHdrNeed=0;
function placeHeader(){_placeHdrNeed=1;if(_placeHdrRaf)return;_placeHdrRaf=requestAnimationFrame(()=>{_placeHdrRaf=0;if(!_placeHdrNeed)return;_placeHdrNeed=0;placeHeaderNow()})}
function placeHeaderNow(){layoutHomeGrid()}
addEventListener('resize',()=>requestAnimationFrame(placeHeader));

function mosaic(){const M=$('#mosaic');const tv=document.body.classList.contains('tv');
 /* 0.8.6: Fire TV keeps a lighter mosaic (fewer tiles, low-res thumbs, slower stagger) — do not skip. */
 const fire=tv&&(document.body.classList.contains('firetv')||window.FEFCNative);
 const perf=document.body.classList.contains('perf');
 let pool=mosaicList.length?mosaicList.slice():vids().slice(0,40).map(f=>({id:f.id,target:target(f),name:f.name}));
 const grid=layoutHomeGrid();
 const gkey=grid?Math.round(grid.pw)+'x'+Math.round(grid.ph):'0';
 if(M&&M._gridKey===gkey&&M.childElementCount>=(HOME_COLS*HOME_ROWS-HOME_HUB*HOME_HUB-HOME_HUB))return;
 if(M)M._gridKey=gkey;
 if(M)M.innerHTML='';[].slice.call(document.querySelectorAll('#home-plane .mc,#hub .mc')).forEach(x=>x.remove());const cells=[];
 /* Surrounding cells only. Same content box as each hub button (slot minus the shared gutter). */
 const hub0=(HOME_COLS-HOME_HUB)/2,hub1=hub0+HOME_HUB-1;
 if(grid&&M){for(let r=0;r<HOME_ROWS;r++)for(let c=0;c<HOME_COLS;c++){
  if(c>=hub0&&c<=hub1&&r>=hub0&&r<=hub1)continue;
  /* 0.8.28: nothing above the 3x3 (title area stays solid): 5-tile side columns + 3 bottom tiles, same size/gap as the hub tiles */
  if(r===0&&c>=hub0&&c<=hub1)continue;
  const el=document.createElement('div');el.className='mc';el._ring=1;el.dataset.ring='1';el.dataset.cell=c+','+r;
  const pct=v=>(v*100)+'%';
  el.style.left=pct((c+HOME_GUTTER/2)/HOME_COLS);
  el.style.top=pct((r+HOME_GUTTER/2)/HOME_ROWS);
  el.style.width=pct((1-HOME_GUTTER)/HOME_COLS);
  el.style.height=pct((1-HOME_GUTTER)/HOME_ROWS);
  el.innerHTML='<img class="mi1" alt="" referrerpolicy="no-referrer"><img class="mi2" alt="" referrerpolicy="no-referrer">';
  M.appendChild(el);cells.push(el)}}
 const pick=()=>pool.length?pool[Math.floor(Math.random()*pool.length)]:null;
 const set=(c,first)=>{const v=pick(),layers=c.children,on=c._on?0:1;c._on=!c._on;const L=layers[on];
  if(v){const ps=posters[v.id]||posters[v.target];
   /* 0.8.18: prefer bundled clip posters on Fire/TV/low — Drive thumbs fail SSL on many TV WebViews and left the mosaic black. */
   let src=null;
   if(ps&&ps.url&&String(ps.url).startsWith('assets/'))src=ps.url;
   const wantLocal=fire||document.body.classList.contains('tier-low')||document.body.classList.contains('tier-lite')||document.body.classList.contains('firetv');
   if(!src&&wantLocal){let h=0;const id=String(v.id||v.target||'');for(let i=0;i<id.length;i++)h=(h*31+id.charCodeAt(i))|0;src='assets/clips/'+((Math.abs(h)%164))+'.jpg'}
   if(!src)src='https://drive.google.com/thumbnail?sz='+(document.body.classList.contains('tier-low')||document.body.classList.contains('tier-lite')?'w160':(fire||perf?'w240':'w480'))+'&id='+v.target;
   L.src=src;L.decoding='async';L.loading='eager';L.onerror=function(){this.onerror=null;this.style.display='none';c.style.background=c.style.background||('radial-gradient(circle at 40% 30%,hsl('+((Math.abs((v.id||'').length*37)%360))+' 55% 32%),#050a14 75%)')};c.dataset.id=v.id}else{c.style.background='radial-gradient(circle at 60% 30%,hsl('+(Math.random()*360|0)+' 70% 45%),#050a14 80%)'}
  /* Perf/low: static crossfade — skip forced reflow + Ken Burns (layout thrash / Cube GPU). */
  if(perf||document.body.classList.contains('tier-low')||document.body.classList.contains('tier-lite')){
   L.className=(on?'mi2':'mi1');L.style.transform='none';L.style.willChange='auto';L.style.animationName='none';
  }else{
   L.style.animationName='none';void L.offsetWidth;L.style.animationName='';
   L.className=(on?'mi2':'mi1')+' kb'+(Math.random()*4|0);
  }
  layers[on].style.opacity=1;layers[1-on].style.opacity=0};
 /* Fire TV: stagger first still assignment so decode+layout aren't one main-thread spike; mark paint-ready after first tiles decode. */
 const paintReady=()=>{const imgs=[].slice.call(document.querySelectorAll('#mosaic .mc img, #hub .mc img')).filter(i=>i.src).slice(0,8);
  const waits=imgs.map(i=>i.decode?i.decode().catch(()=>{}):Promise.resolve());
  Promise.all(waits).then(()=>window.__fefcMarkHomeReady&&window.__fefcMarkHomeReady(),()=>window.__fefcMarkHomeReady&&window.__fefcMarkHomeReady());
  setTimeout(()=>window.__fefcMarkHomeReady&&window.__fefcMarkHomeReady(),2500)};
 if(fire){cells.forEach((c,i)=>setTimeout(()=>{set(c,true);if(i===Math.min(5,cells.length-1))paintReady()},i*45));if(!cells.length)paintReady()}
 else{cells.forEach(c=>set(c,true));if(window.FEFCNative)paintReady()}
 clearInterval(mosaicTimer);
 mosaicTimer=setInterval(()=>{if($('#home').hidden||document.hidden)return;if(tv&&document.body.classList.contains('genres-mode'))return;if(document.body.classList.contains('shufpick-open')||document.body.classList.contains('tvmenu-open'))return;const k=fire||perf||document.body.classList.contains('tier-low')||document.body.classList.contains('tier-lite')?1:(tv?1:2);for(let j=0;j<k;j++){const c=cells[Math.random()*cells.length|0];if(c)set(c)}},perf?(fire?16000:tv?12000:5000):(fire?10000:tv?7000:2200))}
let mosT;const mosDeb=()=>{const tvish=document.body.classList.contains('tv')||document.body.classList.contains('firetv')||!!window.FEFCNative;clearTimeout(mosT);mosT=setTimeout(()=>{if(!$('#home').hidden)mosaic()},tvish?450:250)};if(window.ResizeObserver)new ResizeObserver(mosDeb).observe(document.getElementById('hub'));addEventListener('resize',mosDeb);
let homeHideTimer=null;
const VIEW_MS=(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion:reduce)').matches)?1:220;
function viewFade(main){if(!main||VIEW_MS<=1)return;main.classList.remove('view-enter');main.classList.add('view-fade');}
function viewEnter(main){if(!main)return;if(VIEW_MS<=1){main.classList.remove('view-fade','view-enter');return}requestAnimationFrame(()=>{main.classList.remove('view-fade');main.classList.add('view-enter');clearTimeout(viewEnter._t);viewEnter._t=setTimeout(()=>main.classList.remove('view-enter'),VIEW_MS+40);});}

function showHome(gm){
 const hk=typeof parseH==='function'?parseH()[0]:'';
 if(hk==='edit'||hk==='play'||hk==='readfirst')return;
 clearTimeout(homeHideTimer);
 closeRF();
 if(!$('#details').hidden){const d=$('#details');d.classList.remove('leaving');d.hidden=true;document.body.classList.remove('details-open')}
 if(!$('#player').hidden)closePlayer();
 const home=$('#home'),main=$('#main'),bar=$('#bar');
 home.classList.remove('leaving');main.classList.remove('entering');bar.classList.remove('entering');
 document.body.classList.toggle('genres-mode',!!gm);view=gm?'genres':'home';cur=ROOT;home.hidden=false;document.body.classList.add('at-home');main.hidden=true;bar.hidden=true;try{hub()}catch(e){console.warn(e)}
 try{if(document.querySelector('#hub .hb'))window.__fefcMarkHomeReady&&window.__fefcMarkHomeReady()}catch(e){}
 const lay=()=>{const r=$('#hub').getBoundingClientRect(),k=Math.round(r.left)+'x'+Math.round(r.top)+'x'+Math.round(r.width);if($('#mosaic')._k!==k){$('#mosaic')._k=k;mosaic()}};requestAnimationFrame(lay);setTimeout(lay,500);setTimeout(lay,1500);if(document.fonts&&document.fonts.ready)document.fonts.ready.then(lay);
 const focusMain=()=>{if(!(document.body.classList.contains('kbd')||document.body.classList.contains('tv')||document.body.classList.contains('firetv')||window.FEFCNative))return;
  const st=history.state;let done=false;
  if(navBack||(st&&st.fefc&&st.focus)){try{restoreScroll();done=!!(document.activeElement&&document.activeElement!==document.body&&($('#hub').contains(document.activeElement)||$('#main').contains(document.activeElement)))}catch(e){}}
  if(!done){const t=document.querySelector('#hub .hb-logo')||document.querySelector('#hub .hb[data-hub="main"]')||document.querySelector('#hub .hb');if(t){focusEl(t);window.__fefcFocusRec={type:'hub',hub:'main'}}}
 };
 setTimeout(focusMain,30);setTimeout(focusMain,400);setTimeout(()=>recoverFocus(true),1200);
 try{resolveHomeVer()}catch(e){}}
function hideHome(){
 clearTimeout(homeHideTimer);
 document.body.classList.remove('at-home');
 const home=$('#home'),main=$('#main'),bar=$('#bar');
 if(!home.hidden){
  /* paint main/bar first, then fade home out — no blank flash */
  main.hidden=false;bar.hidden=false;
  main.classList.add('entering');bar.classList.add('entering');
  requestAnimationFrame(()=>{home.classList.add('leaving')});
  homeHideTimer=setTimeout(()=>{
   home.hidden=true;
   home.classList.remove('leaving');
   main.classList.remove('entering');
   bar.classList.remove('entering');
  },VIEW_MS);
 }else{
  home.hidden=true;main.hidden=false;bar.hidden=false;
 }
}
function virtual(list,title){hideHome();cur='virtual';view='folder';render(list,title,'home')}
function secHTML(k,l,a,extra){return `<div class="ol-div"><span>${l}</span><i></i>${extra||''}<b>${a.length}</b></div>`+(a.length?`<div class="sgrid ${k}">${a.map(f=>tile(f)).join('')}</div>`:'')}
function pageShell(title,sub){hideHome();cur='virtual';view='folder';$('#crumb').textContent=title;$('#arena').innerHTML='';$('#sec2').textContent=sub||'';status('');menu();$('#main').scrollTop=0}
function peopleList(){const box=new Set([...Object.values(FOLD),ROOT]),seen=new Set(),out=[];
 [FOLD.actors,FOLD.directors].forEach(p=>(kids.get(p)||[]).filter(isFolder).forEach(f=>{const t=target(f);if(box.has(t)||/^(actors?|directors?|actors\s*&\s*directors|people|\d+\s*-\s*read first)$/i.test(f.name.trim())||seen.has(t))return;seen.add(t);out.push(f)}));
 return out.sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'}))}
function peoplePage(){const L=peopleList();
 pageShell('Actors & Directors',NA.plural(L.length,'Collection'));const g=$('#grid');g.className='sectioned';g.innerHTML=secHTML('folds','ACTORS & DIRECTORS',L);g.querySelectorAll('.ol-tile').forEach(lazyArt);restoreScroll()}
let mlSort=localStorage.fefcStarSort||'date';
function fitMlFoot(){const f=document.querySelector('.ml-foot'),h=document.getElementById('hints'),m=document.getElementById('main');if(!f||!m)return;const set=()=>{const hr=h&&h.getBoundingClientRect();const b=hr&&hr.height&&getComputedStyle(h).visibility!=='hidden'?Math.max(0,window.innerHeight-hr.top+8-(parseFloat(getComputedStyle(m).paddingBottom)||0)-(m.getBoundingClientRect().bottom<window.innerHeight?window.innerHeight-m.getBoundingClientRect().bottom:0)):Math.round(window.innerHeight*.05);m.style.setProperty('--ml-foot-b',b+'px')};set();if(!window.__mlFootRs){window.__mlFootRs=1;addEventListener('resize',()=>{document.querySelector('.ml-foot')&&set()})}}
function myListPage(){const U=window.UD;if(!U)return;const H=U.history(50).map(r=>items.get(r.id)).filter(Boolean);
 let St=U.stars().map(r=>({r,f:items.get(r.id)})).filter(x=>x.f);St.sort(mlSort==='az'?(a,b)=>a.f.name.localeCompare(b.f.name):(a,b)=>b.r.starredAt-a.r.starredAt);St=St.map(x=>x.f);
 pageShell('My List',`${NA.plural(St.length,'Starred')} · ${H.length} in history`.replace('Starreds','Starred'));const g=$('#grid');g.className='sectioned mylist';
 const vids_=a=>a.filter(f=>!isFolder(f)),fold_=a=>a.filter(isFolder);
 const histCollapsed=localStorage.fefcHistCollapsed==='1';
 const histHead=`<div class="ol-div ml-hist-head"><button type="button" class="ml-hist-tog" data-ml="hist" aria-expanded="${histCollapsed?'false':'true'}" aria-controls="ml-hist-body"><span class="ml-hist-chev" aria-hidden="true">${histCollapsed?'▶':'▼'}</span><span>HISTORY</span></button><i></i>${(!histCollapsed&&H.length)?'<button class="mi ml-btn" data-ml="clear">Clear history</button>':''}<b>${H.length}</b></div>`;
 const histBody=`<div id="ml-hist-body" class="ml-hist-body${histCollapsed?' is-collapsed':''}"${histCollapsed?' hidden':''}>`+(H.length?`<div class="sgrid vids">${H.map(f=>tile(f)).join('')}</div>`:'<p class="ml-empty">Fan edits you open in the player show up here.</p>')+'</div>';
 const updTV=(document.body.classList.contains('tv')||document.body.classList.contains('firetv')||window.FEFCNative)?('<div class="ml-upd-wrap ml-upd-bot"><button type="button" class="mi ml-upd" id="ml-update" data-ml="update">Check for updates</button><span class="ml-upd-ver" id="ml-upd-ver" aria-label="Installed version"></span><p class="ml-upd-hint">Looks for a newer Fire TV / Android TV build.</p><div class="ml-manual" id="ml-manual"><a href="https://fefc-collection.pages.dev/kodi-app/FEFC.apk">Fire TV &amp; Android — FEFC.apk</a> <a href="https://is.gd/8la6gb">is.gd/8la6gb</a><br><a href="https://fefc-collection.pages.dev/kodi-app/FEFC.wgt">Samsung TV — FEFC.wgt</a> <a href="https://collection.faneditfanclub.com/samsung">Install guide</a><br><a href="https://collection.faneditfanclub.com">Web</a></div></div>'):'';
 /* 0.8.6: Check for updates at BOTTOM so D-pad Down from menu lands on list items first. */
 g.innerHTML='<div id="ml-sync"></div>'+histHead+histBody
  +`<div class="ol-div"><span>STARRED</span><i></i><button class="mi ml-btn${mlSort==='date'?' on':''}" data-ml="date">Date starred</button><button class="mi ml-btn${mlSort==='az'?' on':''}" data-ml="az">A–Z</button><b>${St.length}</b></div>`
  +(St.length?(fold_(St).length?`<div class="sgrid folds">${fold_(St).map(f=>tile(f)).join('')}</div>`:'')+(vids_(St).length?`<div class="sgrid vids">${vids_(St).map(f=>tile(f)).join('')}</div>`:''):'<p class="ml-empty">Star fan edits and collections with ★ to keep them here.</p>')+updTV+'<footer class="ml-foot"><a href="privacy.html">Privacy</a> · <a href="terms.html">Terms</a></footer>';try{(window.__fefcPaintSync||(window.FEFCSync&&FEFCSync.paintCard)||0)()}catch(e){};try{paintMlUpdVer()}catch(e){};try{fitMlFoot()}catch(e){}
 g.querySelectorAll('.ol-tile').forEach(lazyArt);
 requestAnimationFrame(()=>{if(navBack){try{restoreScroll();return}catch(e){}}
  if(document.body.classList.contains('tv')){const first=g.querySelector('#ml-sync .sync-go,#ml-sync .mi,.ol-tile,.ml-btn,.ml-hist-tog')||$('#ml-update');
   if(first){try{first.focus({preventScroll:true});focusEl(first)}catch(e){}}}})}
document.addEventListener('click',e=>{const b=e.target.closest('[data-ml]');if(!b)return;S.click();const k=b.dataset.ml;if(k==='update'){try{window.FEFCNative&&FEFCNative.checkUpdate()}catch(err){}return}if(k==='hist'){localStorage.fefcHistCollapsed=localStorage.fefcHistCollapsed==='1'?'0':'1';myListPage();const t=document.querySelector('[data-ml="hist"]');if(t)try{t.focus({preventScroll:true})}catch(err){t.focus()}return}if(k==='clear'){if(confirm('Clear your watch history?'))UD.clearHistory();myListPage();return}if(k==='date'||k==='az'){mlSort=localStorage.fefcStarSort=k;myListPage()}});
let starLast={};if(window.UD&&UD.subscribe)UD.subscribe(()=>requestAnimationFrame(()=>document.querySelectorAll('[data-star]').forEach(x=>{const on=UD.isStarred(x.dataset.star);if((x.getAttribute('aria-pressed')==='true')!==on)paintStars(x.dataset.star,on)})));
function starToast(t){let el=$('#startoast');if(!el){el=document.createElement('div');el.id='startoast';el.setAttribute('role','status');el.setAttribute('aria-live','polite');document.body.appendChild(el)}el.textContent=t;el.classList.remove('show');void el.offsetWidth;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),1600)}
/* 0.4.0: details button = Home 'My List' tile star + label (Kodi parity) */
function starLbl(on){return '<i class="hb-star sb-ic" aria-hidden="true">★</i>'+(on?'Remove from My List':'Add to My List')}
function paintStars(id,on){document.querySelectorAll('[data-star="'+id+'"]').forEach(x=>{x.classList.toggle('on',on);x.setAttribute('aria-pressed',String(on));if(x.classList.contains('star')){x.textContent=on?'★':'☆';x.setAttribute('aria-label',on?'Remove from My List':'Add to My List');x.title=(on?'Starred':'Star')+(document.body.classList.contains('firetv')?' (Menu)':' (S)');x.classList.remove('pop');void x.offsetWidth;x.classList.add('pop')}else if(x.classList.contains('star-btn'))x.innerHTML=starLbl(on)})}
function toggleStarFor(id){if(!window.UD||!id)return;const t=Date.now();if(starLast[id]&&t-starLast[id]<250)return;starLast[id]=t;const f=items.get(id),on=UD.toggleStar(id,f&&f.name);S.chirp&&S.chirp(on?1:0);
 paintStars(id,on);starToast(on?'Starred':'Unstarred');
 if(view!=='home'&&parseH()[0]==='mylist'&&!on)myListPage();if(!$('#home').hidden)hub()}
document.addEventListener('click',e=>{const st=e.target.closest('[data-star]');if(!st)return;e.preventDefault();e.stopPropagation();toggleStarFor(st.dataset.star)},true);
function starFocused(){const a=document.activeElement,t=a&&a.closest&&a.closest('.ol-tile');const id=t?t.dataset.id:(!$('#details').hidden?$('#details').dataset.id:null);if(id&&(t?t.querySelector('[data-star]'):(!$('#details').hidden&&($('#details').dataset.id===id)))){toggleStarFor(id);return true}return false}
document.addEventListener('keydown',e=>{if(e.target&&/INPUT|TEXTAREA/.test(e.target.tagName))return;if(e.keyCode===83||e.keyCode===405||e.key==='ColorF2Yellow'){if(starFocused())e.preventDefault()}});
function _x(){}
const CONTACT_EMAIL='faneditfanclub@gmail.com';
const FEEDBACK_FORM_URL='https://docs.google.com/forms/d/e/1FAIpQLSe_MZOis6_4DFTkrbSu2SiP0bGTMuCRruUPeemutI4uZ7nIbA/viewform';
const FEEDBACK_SHORT='https://is.gd/UVko0K';
const FEEDBACK_HTML=`<div class="fb-block" style="grid-column:1/-1;background:#10151d;border:1px solid #232c3a;border-radius:14px;padding:18px 20px;margin-top:8px"><h3 style="margin:0 0 8px;font-size:1.15em">App feedback</h3><p style="margin:0 0 8px;line-height:1.5">Questions about the app, or something not working? Email us at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p><p style="margin:0 0 12px;line-height:1.5">Or tell us what you think &mdash; scan the code with your phone, or <a href="${FEEDBACK_FORM_URL}" target="_blank" rel="noopener">open the feedback form</a>.</p><div id="fbqr" style="background:#fff;border-radius:10px;padding:12px;display:inline-block;line-height:0" aria-label="QR code for the feedback form"></div><p style="margin:8px 0 0"><a class="fefc-short" href="${FEEDBACK_SHORT}" target="_blank" rel="noopener" tabindex="0">${FEEDBACK_SHORT}</a></p></div>`;
function renderFeedbackQR(){const c=document.getElementById('fbqr');if(!c)return;const draw=()=>{try{if(!window.qrcode||!qrcode.mountFefc)return;qrcode.mountFefc(c,FEEDBACK_FORM_URL);}catch(e){c.innerHTML='<a href="'+FEEDBACK_FORM_URL+'" target="_blank" rel="noopener">Open the feedback form</a>';}};if(window.qrcode){draw();return;}const sc=document.createElement('script');sc.src='qrgen.js';sc.onload=draw;sc.onerror=()=>{c.innerHTML='<a href="'+FEEDBACK_FORM_URL+'" target="_blank" rel="noopener">Open the feedback form</a>';};document.head.appendChild(sc);}
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a.fefc-short');if(!a)return;var onTv=window.tizen||/[?&]tizen=1(?:&|$)/.test(location.search);if(!onTv)return;e.preventDefault();var url=a.getAttribute('href')||'';try{if(window.tizen&&tizen.application&&tizen.ApplicationControl){var ctrl=new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/view',url);tizen.application.launchAppControl(ctrl,null,function(){},function(){},null);return}}catch(err){}try{if(window.parent&&window.parent!==window)window.parent.postMessage({type:'fefc-open-url',url:url},'*')}catch(err){}});
function hubGo(k){S.click();
 if(k==='main')return hideHome(),open(ROOT,'all');
 if(k==='arena'||k==='collections')return hideHome(),open(ROOT,k);
 if(k==='readfirst')return readFirst();
 if(k.indexOf('folder:')===0)return hideHome(),open(k.slice(7));
 if(k==='people')return go('#/people');
 if(k==='actors')return virtual([items.get(FOLD.actors)||{id:FOLD.actors,name:'Actors',mimeType:FOLDER},items.get(FOLD.directors)||{id:FOLD.directors,name:'Directors',mimeType:FOLDER}],'Actors & Directors');
 if(k==='search'){openSpot('');return}
 if(k==='genres'){showHome(true);if(!Object.keys(genreMap).length&&window.loadGenres)window.loadGenres();if(window.FEFCGenres&&FEFCGenres.hub)FEFCGenres.hub({get genreMap(){return genreMap},order:GORDER,items,isVid,esc});return}
 if(k==='support'){hideHome();cur='virtual';view='folder';$('#crumb').textContent='Support Us';$('#arena').innerHTML='';$('#sec2').textContent='Thank you for supporting the collection';
  $('#grid').className='support-grid';$('#grid').innerHTML=SUPPORT.map(s=>`<a class="ol-tile link sup sup-${s.name.toLowerCase()}" href="${s.url}" target="_blank" rel="noopener" aria-label="${s.name} (opens in a new tab)"><span class="sup-logo">${s.logo}</span><span class="sup-nm">${s.name}</span><small>${s.sub}</small></a>`).join('')+FEEDBACK_HTML;status('');menu();renderFeedbackQR()}}
const HUBH={main:'#/all',arena:'#/newarrivals',readfirst:'#/readfirst',genres:'#/genres',support:'#/supportus',people:'#/people',mylist:'#/mylist',search:'#/search'};
document.addEventListener('click',e=>{const h=e.target.closest('[data-hub]');if(!h)return;S.click();const k=h.dataset.hub;go(k.indexOf('folder:')===0?'#/folder/'+k.slice(7):HUBH[k]||'#/')});
document.addEventListener('pointerover',e=>{const h=e.target.closest('.hb');if(h&&h!==lastHub){lastHub=h;S.move()}});let lastHub=null;
function doSearch(){S.click();openSpot('')}
function doMute(){S.unlock();S.toggle();sm2()}
function sm2(){const l=$('#hmutel');if(l)l.textContent=S.muted?'Sound off':'Sound on';if($('#mute'))$('#mute').textContent=S.muted?'🔇':'🔊';
  const g=$('#hmute .g');if(g&&document.body.classList.contains('tv')){g.className='g g-ftv g-ftv-spk';g.setAttribute('aria-hidden','true');
   g.innerHTML=S.muted
    ?'<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M16.5 12a4.5 4.5 0 00-1.3-3.15l1.4-1.4A6.4 6.4 0 0118.5 12a6.4 6.4 0 01-1.9 4.55l-1.4-1.4A4.5 4.5 0 0016.5 12zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.9 8.9 0 003.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>'
    :'<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 00-1.3-3.15l1.4-1.4A6.4 6.4 0 0118.5 12a6.4 6.4 0 01-1.9 4.55l-1.4-1.4A4.5 4.5 0 0016.5 12zM14 3.23v2.06a8.9 8.9 0 010 13.42v2.06c3.84-1.1 6.5-4.7 6.5-8.77s-2.66-7.67-6.5-8.77z"/></svg>'}
  const hm=$('#hmute');if(hm)hm.setAttribute('aria-pressed',S.muted?'true':'false')}
let lastFocus=null;document.addEventListener('focusin',e=>{if(!e.target.closest('#hints'))lastFocus=e.target});
document.addEventListener('click',e=>{const h=e.target.closest('[data-hint]');if(!h)return;const k=h.dataset.hint;
 if(k==='search')return doSearch();if(k==='menu'){S.click&&S.click();openTvMenu();return}if(k==='star'){S.click&&S.click();starFocused();return}if(k==='mute')return doMute();if(k==='home'){S.click&&S.click();return go('#/')}if(k==='back'){if(closeTvMenu())return;return goBack()}
 if(k==='select'){const t=lastFocus&&document.contains(lastFocus)&&lastFocus.matches('.ol-tile,[data-act],[data-nav],.hb,.pill,.sortpill,.bigplay,.mi,#tvmenu button')?lastFocus:null;if(t){S.unlock&&S.unlock();t.click()}}});
(function(){const B=document.body,u=()=>{const t=!B.classList.contains('tv')&&((window.matchMedia&&matchMedia('(pointer:coarse)').matches)||('ontouchstart' in window&&navigator.maxTouchPoints>0));B.classList.toggle('touch',t)};u();window.addEventListener('touchstart',()=>{if(!B.classList.contains('tv'))B.classList.add('touch')},{passive:true,once:true});if(window.matchMedia)try{matchMedia('(pointer:coarse)').addEventListener('change',u)}catch(e){}})();
/* 0.8.13: Menu hold ≥3s toggles hidden FPS/long-task HUD; short press opens TV menu (or stars on web). */
let _menuHoldT=null,_menuHoldFired=false;
/* ?perfhud=1 or Intent --ez perfhud true: show FPS HUD immediately (QA / Menu-hold alternate). */
try{if(P.get('perfhud')==='1'||P.get('perfhud')==='true'){document.addEventListener('DOMContentLoaded',()=>togglePerfHud(true));setTimeout(()=>{try{togglePerfHud(true)}catch(e){}},1200)}}catch(e){}

function ensurePerfHud(){let el=$('#fefc-perfhud');if(el)return el;el=document.createElement('div');el.id='fefc-perfhud';el.setAttribute('aria-hidden','true');document.body.appendChild(el);return el}
function togglePerfHud(force){const on=force==null?!document.body.classList.contains('perfhud-on'):!!force;document.body.classList.toggle('perfhud-on',on);const el=ensurePerfHud();if(!on){if(window.__fefcHudStop)window.__fefcHudStop();return}
 let frames=0,last=performance.now(),fps=0,longs=0,longMs=0;
 const po=(typeof PerformanceObserver==='function')?(()=>{try{const o=new PerformanceObserver(list=>{list.getEntries().forEach(e=>{longs++;longMs+=e.duration})});o.observe({entryTypes:['longtask']});return o}catch(e){return null}})():null;
 let raf=0;const tick=now=>{frames++;if(now-last>=1000){fps=frames;frames=0;last=now;el.textContent='FPS '+fps+'\nlong '+longs+' ('+Math.round(longMs)+'ms)\nclips '+(window.__clipStats?JSON.stringify(__clipStats()):'—')+'\nperf '+(document.body.classList.contains('perf')?'ON':'off')+'\ntier '+((window.__fefcTier&&__fefcTier.tier)||document.documentElement.dataset.tier||'?');longs=0;longMs=0}raf=requestAnimationFrame(tick)};
 raf=requestAnimationFrame(tick);window.__fefcHudStop=()=>{cancelAnimationFrame(raf);try{po&&po.disconnect()}catch(e){}};}
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K')){e.preventDefault();doSearch();return}if(e.target&&/INPUT|TEXTAREA/.test(e.target.tagName))return;const menuKey=e.key==='Menu'||e.key==='ContextMenu'||e.keyCode===93||(e.keyCode===82&&e.key!=='r'&&e.key!=='R');
 if(menuKey){e.preventDefault();if(_menuHoldT)return;_menuHoldFired=false;_menuHoldT=setTimeout(()=>{_menuHoldFired=true;_menuHoldT=null;togglePerfHud();try{S.click&&S.click()}catch(err){}},3000);return}
 if(e.key==='y'||e.key==='Y'||e.key==='/'||e.keyCode===403){e.preventDefault();doSearch()}else if(e.key==='m'||e.key==='M'||e.keyCode===404){doMute()}});
document.addEventListener('keyup',e=>{const menuKey=e.key==='Menu'||e.key==='ContextMenu'||e.keyCode===93||(e.keyCode===82&&e.key!=='r'&&e.key!=='R');if(!menuKey)return;if(_menuHoldT){clearTimeout(_menuHoldT);_menuHoldT=null}if(_menuHoldFired){_menuHoldFired=false;return}_menuHoldFired=false;if(document.body.classList.contains('firetv')||(document.body.classList.contains('tv')&&window.FEFCNative))openTvMenu();else starFocused()});
const RF_DOC='https://docs.google.com/document/d/1KWjoQ-wDzkj1f97lHoe1H_o41V-IYCwXj48pamczPVk/preview';
function readFirst(){const p=$('#rfpanel'),d=$('#rfdoc');{const sp=p.querySelector('.rf-top span');if(sp)sp.textContent='Read First'}if(d&&d.dataset.src&&d.dataset.src!=='data/readfirst.html'){delete d.dataset.ok;d.dataset.src='data/readfirst.html'}if(d&&!d.dataset.ok){d.dataset.ok=1;fetch('data/readfirst.html').then(r=>{if(!r.ok)throw 0;return r.text()}).then(h=>{d.innerHTML=h}).catch(()=>{d.innerHTML='<iframe src="'+RF_DOC+'" title="Read First" style="width:100%;height:80vh;border:0;background:#fff"></iframe>'})}p.hidden=false;void p.offsetWidth;RFX.open(p);setTimeout(()=>focusEl($('#rfclose')),60)}
function closeRF(){const p=$('#rfpanel');if(p.hidden)return false;S.click();RFX.close(p,()=>{p.hidden=true;const t=document.querySelector('[data-hub="readfirst"]');if(t)focusEl(t)});return true}
$('#rfclose').onclick=()=>rfDismiss();
let rfInPlace=false;function rfDismiss(){if(rfInPlace){rfInPlace=false;closeRF()}else back('#/')}
$('#rfpanel').addEventListener('click',e=>{if(!e.target.closest('.rf-in'))rfDismiss()});
const RF_IDS={'1KWjoQ-wDzkj1f97lHoe1H_o41V-IYCwXj48pamczPVk':1};
function isReadFirst(f){if(!f)return false;const n=f.name||'';if(/\bread (first|me)\b/i.test(n))return true;/* Drive folder "01 - Read First" and sibling docs */return /^\s*\d{0,2}[A-Z]?\s*-\s*read first\b/i.test(n)}
function rfKind(f){if(!f||isFolder(f)||isMedia(f))return null;if(/support|patreon|paypal|venmo/i.test(f.name))return 'support';if(isReadFirst(f))return 'readfirst';return null}
const RF_HOME_TILE=`<button class="ol-tile fold rfhome" data-rfhome="1" data-hub="readfirst" aria-label="Read First"><span class="rf-t">Read First</span></button>`;
const SUP_HOME_TILE=`<button class="ol-tile fold sup" data-sup="1" aria-label="Support Us: Patreon, PayPal, Venmo"><span class="sup-t">Support Us</span><small class="sup-s">Patreon · <wbr>PayPal · <wbr>Venmo</small><span class="sup-logos" style="display:flex;gap:.4em;justify-content:center;margin-top:.4em"><img src="assets/brand/patreon.png" alt="Patreon" style="height:1.6em;background:#fff;border-radius:50%;padding:.2em"><img src="assets/brand/paypal.png" alt="PayPal" style="height:1.6em;background:#fff;border-radius:.4em;padding:.2em"><img src="assets/brand/venmo.png" alt="Venmo" style="height:1.6em;background:#fff;border-radius:.4em;padding:.3em"></span></button>`;
function stripReadFirst(list){return list.filter(f=>!isReadFirst(f))}
function stripSupportDocs(list){return list.filter(f=>!isSupportDoc(f))}
function openDocTile(f){const k=rfKind(f);if(k==='support'){S.click();go('#/supportus');return}const p=$('#rfpanel'),d=$('#rfdoc'),src='data/readfirst.html',ttl='Read First';
 const sp=p.querySelector('.rf-top span');if(sp)sp.textContent=ttl;if(d.dataset.src!==src){d.dataset.src=src;d.dataset.ok=1;d.innerHTML='';fetch(src).then(r=>{if(!r.ok)throw 0;return r.text()}).catch(()=>fetch('data/readfirst.html').then(r=>r.text())).then(h=>{d.innerHTML=h}).catch(()=>{})}
 rfInPlace=true;S.click();p.hidden=false;void p.offsetWidth;RFX.open(p);setTimeout(()=>focusEl($('#rfclose')),60)}
/* ---------- HASH ROUTER ---------- */
/* per-folder sound effects (data/folder-sfx.json: folder id or name -> files) */
const _afterHomeIdle=(fn,delay)=>{const run=()=>setTimeout(()=>{(window.requestIdleCallback||(f=>setTimeout(f,0)))(fn,{timeout:6000})},delay|0);
 if(document.body.classList.contains('native-waiting'))addEventListener('fefc-home-revealed',()=>run(),{once:true});else run()};
let FER={};_afterHomeIdle(()=>tmo('data/fanedit-ratings.json',10000).then(j=>{FER=(j&&j.items)||{}}).catch(()=>{}),3000);
let FSFX={};_afterHomeIdle(()=>tmo('data/folder-sfx.json',10000).then(m=>{FSFX=m;_sfxGen++;_gpool={};const pre=()=>{Object.keys(m._genres||{}).forEach(g=>{const L=m._genres[g];const V=Array.isArray(L)&&L.length&&Array.isArray(L[0])?L:[L];V.forEach(x=>S.loadFx&&S.loadFx(x))});Object.keys(m).forEach(k=>Array.isArray(m[k])&&S.loadFx&&S.loadFx(m[k]));(m._rules||[]).forEach(r=>{if(!S.loadFx)return;const V=Array.isArray(r.file)&&Array.isArray(r.file[0])?r.file:[r.files||(Array.isArray(r.file)?r.file:[r.file])];V.forEach(x=>S.loadFx(x))})};(window.requestIdleCallback||setTimeout)(pre,{timeout:4000})}).catch(()=>{}),4000);
let _lastSfxId=null,_lastSfxAt=0,_sandlerLast=-1,_cruiseLast=-1;
const DIR_IDS={'1eQuWxYXhHhE1j_as84WDDZDb-4BfvAPP':1,'1wUX7MQ6lUdz0xNvjUMpuB7VDia1cb1p4':1,'13ANvT9oxL6Voklf1qtJxwJZcFlUXzP-v':1,'1Pv0xjKKHMDrP7U_djiEDynT4Nmhn6fR2':1,'1Bj8vx-7styFpcsc6IQc8eWfefN4uNtGg':1,'1ZRwXWitDCwFVRQu3cgKvuisZItGH9R5o':1,'1Nrgv4vgoeqtBPiIt_7RZqVrvZeOQ7LjF':1,'1zzodzguDJ-9kbx6uGpDUlbgGdQvaC1el':1,'1XamnD6tgeL17vW3ecYEBez7iPOSFIY0t':1,'1yUwoHrLOcwR7CDE9Fx2Usu7V72zQSfNC':1};
let _sfxGen=0,_gpool={};
function pushClip(out,seen,L){if(!L)return;if(Array.isArray(L)&&L.length&&Array.isArray(L[0])){L.forEach(x=>pushClip(out,seen,x));return}const files=(Array.isArray(L)?L:[L]).filter(Boolean);if(!files.length)return;const k=files.join('|');if(seen[k])return;seen[k]=1;out.push(files)}
function clipsForFolder(id){const f=items.get(id),out=[],seen={};const direct=FSFX[id]||(f&&FSFX[f.name]);if(direct)pushClip(out,seen,direct);
 if(f&&Array.isArray(FSFX._rules)){const nm=(f.name||'');FSFX._rules.forEach(r=>{let hit=false;if(r.ids&&r.ids.some(x=>x===id||x===(f.targetId||'')))hit=true;if(!hit&&r.regex){try{if(new RegExp(r.regex,'i').test(nm))hit=true}catch(e){}}if(!hit&&r.match&&nm.toLowerCase().includes(String(r.match).toLowerCase()))hit=true;if(hit)pushClip(out,seen,r.file||r.files)})}
 return out}
function genreClipPool(G){const ck=items.size+':'+_sfxGen;if(_gpool[G]&&_gpool[G].k===ck)return _gpool[G].pool;const seen={},pool=[],ids={};
 Object.keys(genreMap||{}).forEach(fid=>{const g=genreMap[fid];if(g&&(g.genres||[]).indexOf(G)>=0)ids[fid]=1});
 (typeof genreColls==='function'?genreColls(G):[]).forEach(c=>(c.folders||[]).forEach(fid=>{ids[fid]=1}));
 Object.keys(ids).forEach(id=>clipsForFolder(id).forEach(L=>pushClip(pool,seen,L)));
 pushClip(pool,seen,(FSFX._genres||{})[G]);
 return (_gpool[G]={k:ck,pool}).pool}
let _gsfx={k:'',t:0,i:-1,n:0,order:null};
function genreSfx(G){if(navBack||!G)return;const pool=genreClipPool(G);if(!pool.length)return;const now=Date.now();if(_gsfx.k===G&&now-_gsfx.t<1500)return;
 if(_gsfx.k!==G||!_gsfx.order||_gsfx.order.length!==pool.length){const o=pool.map((_,i)=>i);for(let i=o.length-1;i>0;i--){const j=Math.random()*(i+1)|0;const t=o[i];o[i]=o[j];o[j]=t}if(o.length>1&&o[0]===_gsfx.i){const t=o[0];o[0]=o[1];o[1]=t}_gsfx.order=o;_gsfx.n=0}
 const i=_gsfx.order[_gsfx.n%_gsfx.order.length];_gsfx.n++;if(_gsfx.n>=_gsfx.order.length)_gsfx.order=null;_gsfx.k=G;_gsfx.t=now;_gsfx.i=i;const L=pool[i];
 if(window.S&&S.unlock)try{S.unlock()}catch(e){}if(S.fx)S.fx(L);try{S.loadFx&&S.loadFx(L)}catch(e){}}
/* navBack marks a Back/popstate navigation (suppresses sounds, restores scroll). It was only cleared by restoreScroll(), so after Back to a page without it (home, details) every later folder open stayed silent. Always expire it, and clear it on explicit forward navigation (go()). */
let _bcT=0;function clearBack(){clearTimeout(_bcT);_bcT=setTimeout(()=>{navBack=false},2500)}
/* details page: a clip from the file's franchise = nearest ancestor folder with its own clips (Kodi parity), else the parent's usual sound */
function franchiseSfx(f){if(!f||!f.parent)return;let p=f.parent,n=0;while(p&&p!==ROOT&&n++<30){const L=sfxResolve(p,true);if(Array.isArray(L)&&L.length){if(window.S&&S.unlock)try{S.unlock()}catch(e){}if(S.fx)S.fx(L);_lastSfxId=p;_lastSfxAt=Date.now();return}const q=items.get(p);p=q&&q.parent}folderSfx(f.parent)}
function folderSfx(id){
 if(navBack||!id||id===ROOT)return;
 const now=Date.now();
 if(_lastSfxId===id&&(now-_lastSfxAt)<1200)return;
 _lastSfxId=id;_lastSfxAt=now;
 if(window.S&&S.unlock)try{S.unlock()}catch(e){}
 const L=sfxResolve(id);
 if(Array.isArray(L)&&L.length){if(/cat-meow/.test(L[0])&&window.S&&S.catMeow)S.catMeow();if(S.fx)S.fx(L)}}
/*SFX-RESOLVE-BEGIN (tests/sfx-coverage.test.js evaluates this block)*/
const SFX_DEFAULTS=['clack','reel','chime'].map(n=>['assets/sfx/default-'+n+'.mp3','assets/sfx/default-'+n+'.m4a']);
const SFX_GENRE_RX=[['Horror',/horror|slasher|nasties|schlock|monster|creepshow|haunt|zombie|walking dead|nightmare|evil dead|scream|saw\b|halloween|friday the 13th|chucky|exorcist|conjuring|insidious|purge/i],['Western',/western|cowboy|gunslinger|yellowstone|deadwood/i],['War',/\bwar\b|soldier|band of brothers|platoon|vietnam|d-day|navy|marines/i],['Sci-Fi',/sci-?fi|space|star|alien|robot|cyber|galactic|dune|matrix|terminator|futur|mars|trek|battlestar|dragon ball|gundam/i],['Superhero',/marvel|dc\b|batman|superman|x-men|avengers|spider|hero|justice league|suicide squad|daredevil|jessica jones|iron fist/i],['Animation',/anime|animat|cartoon|pixar|disney|demon slayer|naruto|simpsons|dragon ball/i],['Crime',/crime|mob|gangster|detective|noir|mafia|reacher|sopranos|godfather/i],['Comedy',/comed|sitcom|seinfeld|parody|funny|spoof|jackass|late late|actors studio/i],['Fantasy',/fantasy|wizard|magic|witcher|dragon|rings|hobbit|potter|narnia/i],['Action',/action|fast &|die hard|bond|007|mission|rambo|fury/i],['Documentary',/documentar|archive|interview|behind the|making of/i],['Family',/family|kids|christmas|holiday/i],['Drama',/drama|series|season|story/i]];
/* Last-resort layers so EVERY collection has a clip: (1) the collection's catalogued genre, (2) a genre inferred from its own and its ancestors' names, (3) a deterministic generic projector/clapper/chime sound. */
function sfxFallback(id,f){const G=FSFX._genres||{};
 const gm=(typeof genreMap==='object'&&genreMap&&(genreMap[id]||(f&&genreMap[f.id])))||null;
 if(gm&&gm.genres){const g=gm.genres.find(x=>genreClipPool(x).length);if(g){const pool=genreClipPool(g);return sfxBag(pool)}}
 const names=[];let c=f,n=0;while(c&&n++<12){names.push(c.name||'');c=items.get(c.parent)}
 const txt=names.join(' | ');
 for(const [g,rx] of SFX_GENRE_RX){if(G[g]&&rx.test(txt)){const L=G[g];return sfxBag(L)}}
 let h=0;for(let i=0;i<id.length;i++)h=(h*31+id.charCodeAt(i))>>>0;return SFX_DEFAULTS[h%SFX_DEFAULTS.length]}
/* 0.3.22 shuffle-bag: every rotation shuffles, never repeats back-to-back, persisted per rotation (localStorage) */
function sfxBag(V){if(!V||!V.length)return null;if(!Array.isArray(V[0]))return V;if(V.length===1)return V[0];const key='b:'+V.map(x=>x[0]).join('|');let st={};try{st=JSON.parse(localStorage.getItem('fefc_sfxbag')||'{}')}catch(e){}let b=st[key]||{o:[],l:-1};if(!b.o||!b.o.length||b.o.some(i=>i>=V.length)){const o=V.map((_,i)=>i);for(let i=o.length-1;i>0;i--){const j=Math.random()*(i+1)|0;const t=o[i];o[i]=o[j];o[j]=t}if(o[0]===b.l){const t=o[0];o[0]=o[1];o[1]=t}b.o=o}const i=b.o.shift();b.l=i;st[key]=b;try{localStorage.setItem('fefc_sfxbag',JSON.stringify(st))}catch(e){}return V[i]}
function sfxPickPool(V,rec){return sfxBag(V)}
function sfxResolve(id,nf){
 const f=items.get(id);let L=FSFX[id]||(f&&FSFX[f.name]);
 if(L&&!Array.isArray(L)&&typeof L==='object'&&(L.file||L.files))L=sfxPickPool(L.file||L.files);
 if(L&&Array.isArray(L)&&Array.isArray(L[0]))L=sfxPickPool(L,FSFX);
 /* Franchise _rules beat hardcodes so director folders / Cage / GoT get their full rotating pools; path:true inherits to subfolders. */
 if(!L&&f&&Array.isArray(FSFX._rules)){const names=[],ids=[];let c=f,n=0;while(c&&n++<30){names.push((c.name||'').toLowerCase());ids.push(c.id,c.targetId||'');c=items.get(c.parent)}
  const sc=[...items.values()].find(x=>x.targetId===id&&x.id!==id);if(sc)names.push((sc.name||'').toLowerCase());
  const r=FSFX._rules.find(r=>{if(r.ids&&r.ids.some(x=>x===id||(r.path!==false&&ids.indexOf(x)>=0)))return true;if(r.regex){let re;try{re=new RegExp(r.regex,'i')}catch(e){}if(re&&(r.path?names:names.slice(0,1)).some(x=>re.test(x)))return true}const q=(r.match||'').toLowerCase();return q&&(r.path?names:names.slice(0,1).concat(sc?[(sc.name||'').toLowerCase()]:[])).some(x=>x.includes(q))});if(r)L=sfxPickPool(r.file,r)||(r.files||(Array.isArray(r.file)?r.file:[r.file]))}
 if(!L){
  const p=people[id]||(f&&(people[f.id]||people[f.targetId]));
  const pName=(p?(p.name+' '+(p.folder||'')):(f?f.name:'')).toLowerCase();
  const isDir=DIR_IDS[id]||(p&&p.role==='director')||(f&&f.parent===FOLD.directors)||/^(abrams|bay|cameron|emmerich|nolan|ritchie|scott|snyder|spielberg|verhoeven)$/i.test(f?f.name:'');
  let fullPath = pName;
  if(f){let c=f,g=0;while(c&&c.parent&&g++<15){c=items.get(c.parent);if(c&&c.name)fullPath+=' '+c.name.toLowerCase()}}
  if(/purr|purassic/i.test(fullPath)){
   L=['assets/sfx/cat-meow.wav','assets/sfx/cat-meow.m4a']
  }else if(fullPath.includes('jurassic')&&!/game of thrones|house of the dragon/i.test(fullPath)){
   L=['assets/sfx/trex-roar.mp3','assets/sfx/trex-roar.m4a']
  }else if(/\bdexter\b(?!'?s?\s+lab)/i.test(fullPath)){
   L=['assets/sfx/dexter-tonights-the-night.mp3','assets/sfx/dexter-tonights-the-night.m4a']
  }else if(/carrey/i.test(pName)||id==='10AA5RFZKOrtyeALpY891WpIKTiqASZbZ'){
   L=['assets/sfx/bruce-almighty-beautiful.mp3']
  }else if((/^cage$|nicolas cage/i.test(pName)||id==='19gM-ZhG481Xv3-z1-7BIrxRmPGSuMTBq')&&!/luke cage/i.test(pName)){
   L=['assets/sfx/cage-not-the-bees.mp3']
  }else if(/sandler/i.test(pName)||id==='1sBe2LolQsUBYKe-rFAg7eT44OMJjRJIO'){
   _sandlerLast=(_sandlerLast+1)%2;
   L=_sandlerLast===0?['assets/sfx/sandler-swan.mp3']:['assets/sfx/sandler-quote2.mp3']
  }else if(/cruise/i.test(pName)||id==='1X1_iqdZJ9Nz62fGZSSvbzGuk_92Xespa'){
   _cruiseLast=(_cruiseLast+1)%2;
   L=_cruiseLast===0?['assets/sfx/cruise-money.mp3']:['assets/sfx/cruise-speed.mp3']
  }else if(isDir){
   L=['assets/sfx/director-action.mp3']
  }
 }
 if(!L&&f&&!nf)L=sfxFallback(id,f);
 return L}
/*SFX-RESOLVE-END*/
addEventListener('hashchange',()=>{const m=location.hash.match(/^#\/folder\/([^/?]+)/);if(m&&!navBack)folderSfx(decodeURIComponent(m[1]))});
function go(h){captureNavState();navBack=false;const cur=location.hash||'#/';
 /* Remember the real previous screen when opening a video details page so Back does not dump to Home. */
 if(/^#\/edit\//.test(h)&&!/^#\/(edit|play)\//.test(cur)){window.__editFrom=cur;try{sessionStorage.fefcEditFrom=cur}catch(e){}}
 const m=h.match(/^#\/folder\/([^/?]+)/);if(m)folderSfx(decodeURIComponent(m[1]));if(location.hash===h)return route();history.pushState({fefc:1,y:0,focus:null},'',h);route()}
function back(fallback){/* leave current entry stamped so Forward would work; pop restores prior entry's scroll/focus from history.state */
 captureNavState();S.back();navBack=true;clearBack();const h=location.hash,fb=()=>{history.replaceState({fefc:1,y:0,focus:null},'',fallback||'#/');route()};if(history.state&&history.state.fefc){history.back();setTimeout(()=>{if(location.hash===h)fb()},450)}else fb()}
function parentHash(){const r=parseH();
 if(r[0]==='play')return window.__shufPrevHash||(r[1]?'#/edit/'+encodeURIComponent(r[1]):'#/');
 if(r[0]==='edit'){
  /* Prefer the screen we navigated from (folder / search / My List / people / genres / home hub). */
  let from=window.__editFrom;try{if(!from)from=sessionStorage.fefcEditFrom}catch(e){}
  if(from&&from!==location.hash&&!/^#\/(edit|play)\/?/.test(from))return from;
  const f=items.get(r[1]);
  if(f&&f.parent){
   if(f.parent===ROOT)return '#/all';
   if(f.parent===FOLD.actors||f.parent===FOLD.directors)return '#/people';
   if(items.has(f.parent))return '#/folder/'+f.parent;
  }
  return '#/';
 }
 if(r[0]==='readfirst'||r[0]==='search'||r[0]==='mylist'||r[0]==='people'||r[0]==='supportus'||r[0]==='support')return '#/';
 if(r[0]==='folder'){const f=items.get(r[1]);if(f&&(f.parent===FOLD.actors||f.parent===FOLD.directors))return '#/people';return f&&f.parent&&f.parent!==ROOT&&items.has(f.parent)?'#/folder/'+f.parent:(f&&f.parent===ROOT?'#/all':'#/')}
 if(r[0]==='genre')return '#/genres';if(r[0]==='genres'&&r[2])return '#/genres/'+encodeURIComponent(r[1]);if(r[0]==='genres'&&r[1])return '#/genres';if(r[0]==='genres')return '#/';return '#/'}
function parseH(){if(/^#\/arena/.test(location.hash))history.replaceState(history.state,'','#/newarrivals');return (location.hash.replace(/^#\/?newarrivals/,'#/arena').replace(/^#\/?/,'')||'').split('/').map(decodeURIComponent)}
function itemOr(id){return items.get(id)||{id:id,name:'Fan edit',mimeType:'video/mp4'}}
let baseKey=null;
/* Soft in-place refresh after background index/links/interim/dates loads.
   Must NEVER navigate or flash Home — that caused idle Home↔collection bounce
   (showHome on boot/reload, then route() restoring the hash). */
let _softRaf=0,_softPending=0;
function softRefresh(){ /* 0.8.14: coalesce bursts from index/links/genres/dates into one paint */
 _softPending=1;if(_softRaf)return;_softRaf=requestAnimationFrame(()=>{_softRaf=0;if(!_softPending)return;_softPending=0;softRefreshNow()})}
function softRefreshNow(){
 try{
  if(!$('#player').hidden){try{restreamIfNamed()}catch(e){}return}
  if((parseH()[0]==='play')&&$('#player').hidden){try{route()}catch(e){}return}
  const r=parseH(),k=r[0]||'';
  if(!$('#home').hidden||!k||k==='home'){
   const ae0=document.activeElement;const fhub0=ae0&&ae0.dataset&&ae0.dataset.hub;const fid0=ae0&&ae0.dataset&&ae0.dataset.id;
   hub();
   const M=$('#mosaic');
   if(M&&!M.querySelector('.mc')&&mosaicList.length)mosaic();
   /* Restore hub/tile focus after any rebuild; never leave activeElement on body. */
   requestAnimationFrame(()=>{
    if(fhub0){const el=document.querySelector('#hub [data-hub="'+cssEsc(fhub0)+'"]');if(el){try{focusEl(el)}catch(e){}return}}
    if(fid0){const el=document.querySelector('[data-id="'+cssEsc(fid0)+'"]');if(el){try{focusEl(el)}catch(e){}return}}
    recoverFocus(true);
   });
   return;
  }
  if(/^(folder|all|arena|newarrivals|people|actors|directors|mylist|genre|genres|search|support|supportus)$/.test(k)){
   const main=$('#main'),st=main?main.scrollTop:0;
   const ae=document.activeElement,fid=ae&&ae.dataset&&ae.dataset.id,fhub=ae&&ae.dataset&&ae.dataset.hub;
   renderBase(location.hash);
   if(main)main.scrollTop=st;
   if(fid){const el=document.querySelector('[data-id="'+cssEsc(fid)+'"]');if(el)try{focusEl(el)}catch(e){}}
   else if(fhub){const el=document.querySelector('[data-hub="'+cssEsc(fhub)+'"]');if(el)try{focusEl(el)}catch(e){}}
   return;
  }
 }catch(e){console.warn('softRefresh',e)}
}
function route(){const r=parseH(),k=r[0]||'';
 // overlays
 if(k!=='play')closedFor=null;
 if(k!=='play'&&!$('#player').hidden){closePlayer();window.__shufPrevHash=null;if(started())S.ambience(true)}
 if(k!=='edit'&&k!=='play'&&!$('#details').hidden){const d=$('#details');const hide=()=>{d.hidden=true;d.classList.remove('leaving');document.body.classList.remove('details-open')};if(VIEW_MS<=1)hide();else{d.classList.add('leaving');setTimeout(hide,VIEW_MS)}}
 if(k!=='readfirst')closeRF();
 if(k==='edit'){const _ef=itemOr(r[1]);details(_ef,false);try{warmStream(_ef)}catch(e){}if(!navBack){try{franchiseSfx(_ef)}catch(e){}}if(baseKey===null)renderBase('');return}
 if(k==='play'){
  /* the player was just closed for this exact hash (Back/close/Esc): never reopen it, step up to the parent instead */
  if(closedFor===location.hash){closedFor=null;history.replaceState({fefc:1},'',parentHash()||'#/');return route()}
  if(baseKey===null)renderBase('');
  /* same video already showing: a stray route() (index/links/sync refresh) must not rebuild the frame */
  if(!$('#player').hidden&&$('#player').dataset.pid===r[1])return;
  /* Fire TV app (FEFCNative bridge): Play launches the native full-screen TV PLAYER directly (the WebView popup can show audio with a black picture); web/phone keep the popup */
  {const nf=itemOr(r[1]),nb=window.FEFCNative;if(nf&&nb&&nb.playVideo&&(!window.__shufPlay||window.__shufFullscreen)){let ok=false;try{ok=nativePlay(nf)}catch(e){}
   if(ok){try{window.UD&&UD.opened(nf.id,nf.name)}catch(e){}S.ambience(false);if(!window.__editFrom){const _h=location.hash||'#/';window.__editFrom=/^#\/(edit|play)\//.test(_h)?'#/':_h;try{sessionStorage.fefcEditFrom=window.__editFrom}catch(e){}}history.replaceState({fefc:1},'','#/edit/'+encodeURIComponent(nf.id));return route()}}}
  play(itemOr(r[1]));return}
 if(k==='readfirst'){if(baseKey===null||baseKey!=='')renderBase('');readFirst();return}
 renderBase(location.hash);if(view==='home'||k==='')S.ambience(true);else S.ambience(false)/* 0.8.27: ambience only on Home */}
function renderBase(h){baseKey=h;const r=(h.replace(/^#\/?/,'').replace(/\?.*$/,'')||'').split('/').map(decodeURIComponent),k=(r[0]==='newarrivals'?'arena':r[0])||'';
 if(k==='')return showHome();
 if(k==='all')return hideHome(),open(ROOT,'all');
 if(k==='arena')return hideHome(),open(ROOT,'arena');
 if(k==='folder')return hideHome(),open(r[1]);
 if(k==='support'){history.replaceState(history.state,'','#/supportus');return hubGo('support')}
 if(k==='genres'&&r[1])return genrePage(r[1],r[2]);
 if(k==='genres'||k==='supportus')return hubGo(k==='supportus'?'support':k);
 if(k==='people'||k==='actors'||k==='directors'){if(k!=='people')history.replaceState(history.state,'','#/people');return peoplePage()}
 if(k==='mylist')return myListPage();
 if(k==='genre')return genrePage(r[1]);if(0){const G=r[1],list=genreList(G),folders=Object.keys(genreMap).filter(x=>genreMap[x].genres.indexOf(G)>=0).map(x=>items.get(x)||{id:x,name:genreMap[x].folder,mimeType:FOLDER,parent:ROOT});return virtual(list.length?list:folders,G)}
 if(k==='search'){if(!r[1]){openSpot('');return}return searchPage(r[1])}
 showHome()}
window.addEventListener('popstate',()=>{S.back();navBack=true;clearBack();route()});(window.requestIdleCallback||setTimeout)(()=>{try{S.loadFx(S.BACK)}catch(e){}},{timeout:3000});
if(P.get('debug'))window._fefc={items,kids,episodes:i=>episodes(items.get(i))};
/* ---------- DASHBOARD ---------- */
function status(t){$('#status').textContent=t}
function menu(){$('#menu').innerHTML=NA.menuHTML(FOLD,cur!==ROOT||!$('#details').hidden||parseH()[0]==='search'||parseH()[0]==='edit');const o=$('#menu .mi.on');o&&o.scrollIntoView&&o.scrollIntoView({block:'nearest',inline:'nearest'})}
const FIRST_TILES=36;let drainGen=0,artIO=null;
function lazyArt(el){if(!window.IntersectionObserver)return art(el,items.get(el.dataset.id));if(!artIO)artIO=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){artIO.unobserve(e.target);art(e.target,items.get(e.target.dataset.id))}}),{root:null,rootMargin:(document.body.classList.contains('tv')||document.body.classList.contains('firetv')||!!window.FEFCNative)?'320px 0px':'600px 0px'});artIO.observe(el)}
/* On TV only keep a few screens of tiles ahead of the viewport in the DOM (the root grid is 4,000+ tiles). */
const LEAN=()=>document.body.classList.contains('tv')||matchMedia('(pointer:coarse)').matches; /* TV + touch phones/tablets: never build thousands of tiles ahead of the viewport (Chrome Android 'Aw, Snap') */
function tvGate(){if(!LEAN())return true;const m=$('#main');return !m||m.scrollTop+m.clientHeight*3>m.scrollHeight-m.clientHeight*.5}
function drain(Q,isNew){const gen=++drainGen,idle=window.requestIdleCallback?cb=>requestIdleCallback(cb,{timeout:400}):cb=>setTimeout(cb,30);let qi=0;
 const one=()=>{if(gen!==drainGen)return false;while(qi<Q.length&&!Q[qi].length)qi++;if(qi>=Q.length)return false;const box=document.querySelector('#grid .sgrid[data-q="'+qi+'"]');if(!box){qi++;return true}
  const part=Q[qi].splice(0,(LEAN()?(document.body.classList.contains('perf')?12:24):60)),t=document.createElement('div');t.innerHTML=part.map(f=>tile(f,isNew[f.id])).join('');const fr=document.createDocumentFragment();const els=[].slice.call(t.children);els.forEach(e=>fr.appendChild(e));box.appendChild(fr);els.forEach(lazyArt);return true};
 drainOne=one;const step=()=>{if(gen!==drainGen)return;if(!tvGate()){setTimeout(step,300);return}if(one())idle(step)};setTimeout(()=>idle(step),700)}
/* ---------- scroll + focus restoration (per-route in history.state; sessionStorage fallback) ---------- */
let drainOne=()=>false,navBack=false;
const scrollKey=h=>'fefcScroll:'+(h||location.hash||'#/')+'|'+(window.FEFCSortKey||localStorage.fefcSort||'');
function readFocusTarget(el){
 if(!el||!el.closest)return null;
 const tile=el.closest('.ol-tile[data-id]');if(tile)return{type:'tile',id:tile.dataset.id};
 const hub=el.closest('[data-hub]');if(hub)return{type:'hub',hub:hub.dataset.hub};
 const ml=el.closest('#ml-update');if(ml)return{type:'id',id:'ml-update'};
 const mi=el.closest('#menu .mi[data-href],#bar .mi[data-href]');if(mi&&mi.dataset.href)return{type:'href',href:mi.dataset.href};
 const tvq=el.closest('#tvq');if(tvq)return{type:'id',id:'tvq'};
 const star=el.closest('[data-star]');if(star)return{type:'star',id:star.dataset.star};
 const sh=el.closest&&el.closest('#shufpick .shuf-opt');if(sh&&sh.dataset&&sh.dataset.shuf)return{type:'shuf',shuf:sh.dataset.shuf};
 return null;
}
/* 0.8.14: stable focus memory + recovery. softRefresh/hub/mosaic must not leave activeElement on body. */
window.__fefcFocusRec=null;
document.addEventListener('focusin',e=>{const rec=readFocusTarget(e.target);if(rec)window.__fefcFocusRec=rec;else if(e.target&&e.target.matches&&e.target.matches('.hb,.ol-tile,.sortpill,.mi,.pill,.bigplay,.hint-btn')){const r=readFocusTarget(e.target);if(r)window.__fefcFocusRec=r}},true);
function recoverFocus(preferHub){
 const a=document.activeElement;
 if(a&&a!==document.body&&a!==document.documentElement&&document.contains(a)){
  /* Still focused, but if node was detached somehow treat as lost */
  if(a.isConnected!==false)return false;
 }
 const rec=window.__fefcFocusRec;
 if(rec){try{applyFocusRec(rec);if(document.activeElement&&document.activeElement!==document.body)return true}catch(e){}}
 if(preferHub||!$('#home').hidden){const t=document.querySelector('#hub .hb-logo')||document.querySelector('#hub .hb[data-hub="main"]')||document.querySelector('#hub .hb');if(t){try{focusEl(t)}catch(e){}return true}}
 const first=document.querySelector(focSel());if(first){try{focusEl(first)}catch(e){}return true}
 return false;
}
function captureNavState(focusId){
 const m=$('#main');
 const y=(m&&!m.hidden)?m.scrollTop:0;
 let focus=null;
 if(focusId)focus={type:'tile',id:focusId};
 else focus=readFocusTarget(document.activeElement);
 const hash=location.hash||'#/';
 const st=Object.assign({},(history.state&&typeof history.state==='object')?history.state:{},{fefc:1,y,focus,hash});
 try{history.replaceState(st,'')}catch(e){}
 try{sessionStorage.setItem(scrollKey(hash),JSON.stringify({y,id:focus&&focus.type==='tile'?focus.id:null,focus}))}catch(e){}
 return st;
}
function saveScroll(id){captureNavState(id)}
document.addEventListener('click',e=>{const t=e.target.closest&&e.target.closest('#grid .ol-tile,#arena .ol-tile,#hub .hb');if(t&&!e.target.closest('[data-star]'))saveScroll(t.dataset.id||null)},true);
function applyFocusRec(focus){
 if(!focus)return;
 let t=null;
 if(focus.type==='tile'&&focus.id)t=document.querySelector('#grid [data-id="'+focus.id+'"],#arena [data-id="'+focus.id+'"]');
 else if(focus.type==='hub'&&focus.hub)t=document.querySelector('#hub [data-hub="'+focus.hub+'"]');
 else if(focus.type==='href'&&focus.href)t=document.querySelector('#menu .mi[data-href="'+focus.href+'"]');
 else if(focus.type==='id'&&focus.id)t=document.getElementById(focus.id);
 else if(focus.type==='star'&&focus.id)t=document.querySelector('[data-star="'+focus.id+'"]');
 if(t){try{focusEl(t)}catch(e){try{t.focus({preventScroll:true})}catch(_){}}if(document.body.classList.contains('kbd')||document.body.classList.contains('tv'))t.classList.add('ret')}
}
function restoreScroll(){const m=$('#main');
 let rec=null;
 if(navBack){
  const st=history.state;
  if(st&&st.fefc&&(st.y!=null||st.focus)){rec={y:st.y||0,id:st.focus&&st.focus.type==='tile'?st.focus.id:(st.id||null),focus:st.focus||null}}
  if(!rec){try{rec=JSON.parse(sessionStorage.getItem(scrollKey())||'null')}catch(e){}}
 }
 navBack=false;
 /* Home has no #main scroll — still restore hub focus from history.state */
 if(!m||m.hidden){if(rec&&rec.focus)requestAnimationFrame(()=>applyFocusRec(rec.focus));return}
 if(!rec){m.scrollTop=0;if(cur===FOLD.collections||view==='collections'){const mc=document.querySelector('[data-mainc]');if(mc&&(document.body.classList.contains('tv')||document.body.classList.contains('kbd')))requestAnimationFrame(()=>focusEl(mc))}return}
 const need=()=>m.scrollHeight<rec.y+m.clientHeight+40||(rec.id&&!document.querySelector('#grid [data-id="'+rec.id+'"],#arena [data-id="'+rec.id+'"]'));
 let guard=0;while(need()&&guard++<400){if(drainOne())continue;const more=document.getElementById('na-more');if(more&&!more.hidden&&more.offsetParent){more.onclick&&NA&&more.click();continue}break}
 const prev=m.style.scrollBehavior;m.style.scrollBehavior='auto';m.scrollTop=rec.y;m.style.scrollBehavior=prev;
 const foc=rec.focus||(rec.id?{type:'tile',id:rec.id}:null);
 if(foc)requestAnimationFrame(()=>applyFocusRec(foc));
}
const CSORTS=[['az','Name A–Z'],['za','Name Z–A'],['added','Recently Added'],['updated','Recently Updated'],['files','Most Files'],['size','Largest']];
const csortGet=id=>{try{const v=localStorage.getItem('fefcSort:'+id);return CSORTS.some(x=>x[0]===v)?v:'az'}catch(e){return 'az'}};
function csortFn(k){const nat=(a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}),dc=f=>isFolder(f)?sortCounts(target(f)):{n:isVid(f)?1:0,sz:f.size||0,nw:mdate(f)},own=mdate;
 const by=g=>(a,b)=>{const x=g(a),y=g(b);return x<y?1:x>y?-1:nat(a,b)};
 return k==='za'?(a,b)=>nat(b,a):k==='added'?by(f=>dc(f).nw||own(f)):k==='updated'?by(own):k==='files'?by(f=>dc(f).n):k==='size'?by(f=>dc(f).sz):nat}
/* sort a list but keep support-ad tiles in their A–Z slots */
function csortList(a,k,isAd){const az=a.slice().sort(csortFn('az'));if(k==='az')return az;const rest=az.filter(f=>!isAd(f)).sort(csortFn(k));return az.map(f=>isAd(f)?f:rest.shift())}
document.addEventListener('click',e=>{const b=e.target.closest('[data-csort]');if(!b)return;try{localStorage.setItem('fefcSort:'+b.closest('.sortbar').dataset.for,b.dataset.csort)}catch(_){}S.click&&S.click();const keep=b.dataset.csort;const sy=$('#main').scrollTop;open(cur,view==='folder'?'folder':view).then(()=>{$('#main').scrollTop=sy;const n=document.querySelector(`[data-csort="${keep}"]`);if(n&&document.body.classList.contains('tv'))focusEl(n)})});
/* ---------- GENRE PAGES: collection folders/franchises first, then loose edits (#/genres/<genre>[/<collection>]) ---------- */
let GC={};const _cv={};
function genreColls(G){return GC[G]||[]}
let _vbt=null,_vbk=-1;function vidsByTop(){if(_vbk!==items.size||!_vbt){_vbk=items.size;const m={};vids().forEach((f,i)=>{const t=topFolder(f);if(t)(m[t]||(m[t]=[])).push([i,f])});_vbt={m}}return _vbt}
function collVids(c){const k=c.slug+'|'+items.size;if(_cv[k])return _cv[k];const fs={},seen={};c.folders.forEach(x=>fs[x]=1);const out=[];
 const by=vidsByTop(),pick=[];c.folders.forEach(x=>{const a=by.m[x];if(a)for(const e of a)pick.push(e)});pick.sort((p,q)=>p[0]-q[0]);pick.forEach(e=>{const f=e[1],t=target(f);if(!seen[t]){seen[t]=1;out.push(f)}});(c.extra||[]).forEach(id=>{const f=items.get(id);if(f&&!seen[target(f)]){seen[target(f)]=1;out.push(f)}});return _cv[k]=out}
function genrePage(G,slug){if(!slug)genreSfx(G);hideHome();cur='virtual';view='folder';const C=genreColls(G);
 if(slug){const c=C.find(x=>x.slug===slug);if(!c){if(!Object.keys(GC).length)return status('Loading…');return go('#/genres/'+encodeURIComponent(G))}
  window.__gscope='gc:'+G+'/'+slug;window.__gtitle=c.name;const fl=c.folders.map(x=>items.get(x)).filter(Boolean),vs=collVids(c).filter(f=>c.folders.indexOf(topFolder(f))<0);
  virtual(fl.concat(vs),c.name);const n=collVids(c).length;$('#sec2').textContent=G+' · '+NA.plural(c.folders.length,'folder')+' · '+fmtN(n)+' fan edit'+(n===1?'':'s');return}
 window.__gscope=G;window.__gtitle=G;$('#crumb').textContent=G;$('#arena').innerHTML='';
 const inColl={},big=C.filter(c=>collVids(c).length>=2);big.forEach(c=>collVids(c).forEach(f=>inColl[target(f)]=1));
 /* FAN EDITS = every individual edit in this genre: the loose ones PLUS the edits that live inside the collections/franchises above (collections are shortcuts into them, not replacements) */
 const seen={},loose=genreList(G).concat(...big.map(c=>collVids(c))).filter(f=>{const t=target(f);if(seen[t])return false;return seen[t]=1}).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}));
 const ctile=c=>{const fid=c.folders[0],n=collVids(c).length;return tile({id:fid,targetId:fid,name:c.name,mimeType:FOLDER,parent:ROOT}).replace(/data-id="/,`data-gc="#/genres/${encodeURIComponent(G)}/${c.slug}" data-id="`).replace('COLLECTION',c.folders.length>1||(c.extra||[]).length?'FRANCHISE · '+fmtN(n):'COLLECTION · '+fmtN(n))};
 const Q=[loose.slice(FIRST_TILES)];
 $('#sec2').textContent=NA.plural(big.length,'collection')+' · '+fmtN(loose.length)+' fan edits';
 const g=$('#grid');g.className='sectioned';g.innerHTML=(big.length||loose.length?`<div class="sortbar csort" role="toolbar">${shufBtn(G)}</div>`:'')+
  (big.length?`<div class="ol-div"><span>COLLECTIONS</span><i></i><b>${big.length}</b></div><div class="sgrid folds gcolls">${big.map(ctile).join('')}</div>`:'')+
  (loose.length?`<div class="ol-div"><span>FAN EDITS</span><i></i><b>${fmtN(loose.length)}</b></div><div class="sgrid vids" data-q="0">${loose.slice(0,FIRST_TILES).map(f=>tile(f)).join('')}</div>`:'');
 g.querySelectorAll('.ol-tile').forEach(lazyArt);drain(Q,{});status(big.length||loose.length?'':'Nothing here yet');menu();restoreScroll()}
document.addEventListener('click',e=>{const t=e.target.closest('[data-gc]');if(!t||e.target.closest('[data-star]'))return;e.preventDefault();e.stopImmediatePropagation();S.click();go(t.dataset.gc)},true);
/* ---------- SHUFFLE PLAY ---------- */
let SHUF=null;tmo('data/shuffle.json',15000).then(d=>{SHUF=new Set(d.ids)}).catch(()=>{SHUF=new Set()});
const SHUF_ICON='<svg class="shuf-ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17 3l4 4-4 4V8h-2.6l-2.2 2.7-1.3-1.6L13.4 6H17V3zM3 6h4.6l8 10H17v-3l4 4-4 4v-3h-2.6l-8-10H3V6zm0 10h3.4l2.1-2.6 1.3 1.6L7.6 18H3v-2z"/></svg>';
function shufPool(scope){if(!SHUF)return [];const seen={};
 if(scope==='newarrivals'){const top=(window.NA&&window.NA.top)?window.NA.top(rootVids()).filter(isVid):[];return top.filter(f=>{const t=target(f);if(seen[t]||!SHUF.has(t))return false;return seen[t]=1})}
 if(scope==='collections'){const collVids=[],seenFolders={},q=[FOLD.collections];while(q.length){const fid=q.pop();if(seenFolders[fid])continue;seenFolders[fid]=1;(kids.get(fid)||[]).forEach(x=>{if(isFolder(x))q.push(target(x));else if(isVid(x))collVids.push(x)})}return collVids.filter(f=>{const t=target(f);if(seen[t]||!SHUF.has(t))return false;return seen[t]=1})}
 if(scope==='tbc'||scope==='tobecatalogued'||scope===FOLD.tbc){const tbcVids=[],seenFolders={},q=[FOLD.tbc];while(q.length){const fid=q.pop();if(seenFolders[fid])continue;seenFolders[fid]=1;(kids.get(fid)||[]).forEach(x=>{if(isFolder(x))q.push(target(x));else if(isVid(x))tbcVids.push(x)})}return tbcVids.filter(f=>{const t=target(f);if(seen[t]||!SHUF.has(t))return false;return seen[t]=1})}
 let gcs=null;if(/^gc:/.test(scope||'')){const m=scope.slice(3),i=m.indexOf('/'),c=genreColls(m.slice(0,i)).find(x=>x.slug===m.slice(i+1));gcs={};if(c)collVids(c).forEach(f=>gcs[target(f)]=1)}return vids().filter(f=>{const t=target(f);if(seen[t]||!SHUF.has(t))return false;if(scope&&scope!=='all'&&(gcs?!gcs[t]:genresOf(f).indexOf(scope)<0))return false;return seen[t]=1})}
function shufPick(scope){const pool=shufPool(scope);if(!pool.length)return null;let rec=[];try{rec=JSON.parse(localStorage.fefcShufRecent||'[]')}catch(e){}
 const fresh=pool.filter(f=>rec.indexOf(target(f))<0),from=fresh.length?fresh:pool,f=from[Math.floor(Math.random()*from.length)];
 rec.push(target(f));rec=rec.slice(-20);try{localStorage.fefcShufRecent=JSON.stringify(rec)}catch(e){}return f}
function closeShufPick(){const el=$('#shufpick');if(!el||el.hidden)return false;el.hidden=true;el.setAttribute('aria-hidden','true');document.body.classList.remove('shufpick-open');
 const prev=window.__shufPickPrev;window.__shufPickPrev=null;if(prev&&document.contains(prev))try{focusEl(prev)}catch(e){}return true}
function shufRun(mode,scope){const f=shufPick(scope);if(!f){status('Nothing to shuffle yet');return}
 try{sessionStorage.fefcShufScope=scope}catch(e){}
 if(!window.__shufPrevHash&&location.hash&&!/^#\/play\//.test(location.hash))window.__shufPrevHash=location.hash;
 closeShufPick();
 const tid=target(f),title=parse(f.name).raw||f.name||'Fan edit',nb=window.FEFCNative;
 if(mode==='vlc'){S.chirp&&S.chirp(1);try{quietForExternal();if(nb&&nb.openInVlc)nb.openInVlc(tid,title,f.name||'video.mp4');else status('VLC not available')}catch(e){status('Could not open VLC')}return}
 if(mode==='drive'){S.chirp&&S.chirp(1);try{if(nb&&typeof nb.openInDrive==='function')nb.openInDrive(tid,title);else window.open('https://drive.google.com/file/d/'+tid+'/view','_blank')}catch(e){}return}
 /* Full Screen (default): NEVER windowed shuffle. Native fullscreen when bridge exists; else #/play without floating shuf-player. */
 window.__shufPlay=0;window.__shufFullscreen=1;
 if(nb&&nb.playVideo){let ok=false;try{ok=nativePlay(f)}catch(e){}
  if(ok){try{window.UD&&UD.opened(f.id,f.name)}catch(e){}S.ambience(false);if(!window.__editFrom){const _h=location.hash||'#/';window.__editFrom=/^#\/(edit|play)\//.test(_h)?'#/':_h;try{sessionStorage.fefcEditFrom=window.__editFrom}catch(e){}}
   history.replaceState({fefc:1},'','#/edit/'+encodeURIComponent(f.id));route();return}}
 const targetHash='#/play/'+encodeURIComponent(f.id);if(parseH()[0]==='play'){history.replaceState({fefc:1},'',targetHash);route()}else{go(targetHash)}}
function openShufPick(scope){
 let el=$('#shufpick');
 if(!el){el=document.createElement('div');el.id='shufpick';el.setAttribute('role','dialog');el.setAttribute('aria-label','Shuffle Play');
  el.innerHTML='<div class="shuf-box"><p class="shuf-h">Shuffle Play</p><button type="button" class="shuf-opt" data-shuf="fullscreen">Play Full Screen</button><button type="button" class="shuf-opt" data-shuf="vlc">Open in VLC</button><button type="button" class="shuf-opt" data-shuf="drive">Open in Drive</button><p class="shuf-hint">Back to cancel</p></div>';
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target===el){closeShufPick();return}const b=e.target.closest('[data-shuf]');if(!b)return;e.preventDefault();S.unlock&&S.unlock();S.click&&S.click();shufRun(b.dataset.shuf,el._scope||'all')});
  el.addEventListener('keydown',e=>{const k=e.keyCode;if(k===10009||k===461||k===27||e.key==='GoBack'||e.key==='BrowserBack'||(k===8&&!(e.target&&e.target.matches&&e.target.matches('input,textarea'))) ){e.preventDefault();e.stopPropagation();closeShufPick();return}
   if(k!==37&&k!==38&&k!==39&&k!==40&&k!==13&&k!==23)return;
   const L=[].slice.call(el.querySelectorAll('.shuf-opt:not([hidden])'));if(!L.length)return;e.preventDefault();
   let i=L.indexOf(document.activeElement);if(k===13||k===23){if(i>=0)L[i].click();return}
   if(i<0)i=0;else if(k===40||k===39)i=Math.min(L.length-1,i+1);else i=Math.max(0,i-1);try{L[i].focus({preventScroll:true})}catch(err){L[i].focus()}})}
 el._scope=scope||'all';window.__shufPickPrev=document.activeElement;el.hidden=false;el.setAttribute('aria-hidden','false');document.body.classList.add('shufpick-open');
 const hasV=!!(window.FEFCNative&&typeof FEFCNative.openInVlc==='function');
 const hasD=!!(window.FEFCNative&&typeof FEFCNative.openInDrive==='function')||true;
 el.querySelector('[data-shuf="vlc"]').hidden=!hasV;el.querySelector('[data-shuf="vlc"]').disabled=!hasV;
 el.querySelector('[data-shuf="drive"]').hidden=false;
 requestAnimationFrame(()=>{const first=el.querySelector('[data-shuf="fullscreen"]');if(first)try{first.focus({preventScroll:true})}catch(e){first.focus()}})}
function shuffle(scope){openShufPick(scope||'all')}
const shufBtn=scope=>`<button class="sortpill shuf-btn" data-shuffle="${esc(scope)}" title="Play a random fan edit">${SHUF_ICON}Shuffle Play</button>`;
document.addEventListener('click',e=>{const b=e.target.closest('[data-shuffle]');if(!b)return;e.preventDefault();S.unlock&&S.unlock();shuffle(b.dataset.shuffle)});
function render(list,title,mode){const _list=(cur===ROOT)?stripSupportDocs(stripReadFirst(list)):list;const fold=_list.filter(isFolder).sort((a,b)=>a.name.localeCompare(b.name)),vids=_list.filter(f=>!isFolder(f)).sort((a,b)=>a.name.localeCompare(b.name));const showRF=cur===ROOT&&(mode==='all'||mode==='home'||!mode);
 const _main=$('#main');viewFade(_main);$('#crumb').textContent=title;hideHome();
 $('#arena').innerHTML='';NA.top(rootVids());const isNew={};if(mode!=='collections')list.forEach(f=>{if(NA.isNew(f))isNew[f.id]=1});
 const all=mode==='arena'?vids:mode==='collections'?fold:[...fold,...vids];
 $('#sec2').textContent=mode==='arena'?'Every fan edit in the collection · newest first':(cur===ROOT||cur===FOLD.collections||cur===FOLD.tbc)?countsLine(cur):cur==='virtual'?`${fold.length} collections · ${fmtN(vids.filter(isVid).length)} files`:`${fold.length} ${fold.length===1?'collection':'collections'} · ${fmtN(sortCounts(cur).n)} ${sortCounts(cur).n===1?'file':'files'}`;
if((items.get(cur)||{}).pt&&window.FEFCTesting)$('#sec2').textContent=FEFCTesting.countsLine(kids.get(cur)||[]);
 const isAd=f=>!isVid(f)&&/^\s*\w{1,3}\s*-\s*support\b|support patreon|paypal\/venmo/i.test(f.name),nat=(a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}),docs=vids.filter(f=>!isVid(f)&&!isAd(f)),ck=mode==='arena'?'az':csortGet(cur),evs=csortList(vids.filter(f=>isVid(f)||isAd(f)),ck,isAd),Q=[],sec=(k,l,a)=>{if(!a.length)return '';const qi=Q.length;Q.push(a.slice(FIRST_TILES));return `<div class="ol-div"><span>${l}</span><i></i><b>${a.length}</b></div><div class="sgrid ${k}" data-q="${qi}">${a.slice(0,FIRST_TILES).map(f=>tile(f,isNew[f.id])).join('')}</div>`};
 const g=$('#grid');if(mode==='arena'){$('#arena').innerHTML='';NA.render(rootVids(),tile,art,i=>items.get(i),typeof shufBtn==='function'?shufBtn('newarrivals'):'')}else if(mode==='all'&&cur===ROOT){g.className='sectioned';sortedAll(fold,vids,g,typeof shufBtn==='function'?shufBtn('all'):'')}else{g.className='sectioned';const shs=cur===ROOT&&mode!=='collections'?'all':(cur===FOLD.collections||mode==='collections')?'collections':(cur===FOLD.tbc||(underTBC(cur)&&!String(cur).startsWith('pt:'))||/to be catalogued/i.test(title))?'tbc':cur==='virtual'&&window.__gscope&&title===window.__gtitle?window.__gscope:'',sb=(list.length>1&&cur!=='virtual')||shs?`<div class="sortbar csort" role="toolbar" aria-label="Sort" data-for="${cur}">${shs?shufBtn(shs):''}${cur==='virtual'?'':CSORTS.map(([v,l])=>`<button class="sortpill${v===ck?' on':''}" data-csort="${v}" aria-pressed="${v===ck}">${l}</button>`).join('')}</div>`:'';const fsorted=csortList(fold,ck,isAd);const _rf=(cur===ROOT&&mode!=='arena')?(RF_HOME_TILE+SUP_HOME_TILE):'';g.innerHTML=sb+sec('folds','COLLECTIONS',fsorted.filter(f=>!people[target(f)])).replace(/(<div class="sgrid folds"[^>]*>)/,'$1'+_rf)+sec('folds','PEOPLE',fsorted.filter(f=>people[target(f)]))+(mode==='collections'?sec('docs','DOCUMENTS',docs)/* 0.8.27: Google Docs inside Fan Edit Collections are shown */:sec('vids','FAN EDITS',evs)+sec('docs','DOCUMENTS',docs))}
 document.querySelectorAll('#arena .ol-tile,#grid .ol-tile').forEach(lazyArt);if(mode!=='arena'&&!(mode==='all'&&cur===ROOT))drain(Q,isNew);
 status(all.length?'':(live?'Empty':'Nothing here yet'));menu();restoreScroll();viewEnter(_main)}
/* ---------- private / not-shared folders: Request Access prompt (app-side only, no requests sent) ---------- */
const DENIED=new Set();let INACC=new Set();tmo('data/inaccessible.json',10000).then(j=>{INACC=new Set(j.ids||[]);document.querySelectorAll('.ol-tile.fold').forEach(el=>{const f=items.get(el.dataset.id);if(f&&isDenied(target(f))&&!el.querySelector('.lockb'))el.insertAdjacentHTML('beforeend','<span class="lockb" title="Private library" aria-label="Private">🔒</span>')})}).catch(()=>{});
function isDenied(id){return DENIED.has(id)||INACC.has(id)}
function privatePrompt(id,f){const g=$('#grid');if(!g)return;const own=f&&(f.owner||f.ownerName),url='https://drive.google.com/drive/folders/'+encodeURIComponent(id);g.className='sectioned';
 g.innerHTML=`<div class="priv"><div class="priv-box"><div class="priv-bar"><span>ACCESS RESTRICTED</span><i></i><b>🔒</b></div><h2>This library is private.</h2><p>Request access from the owner${own?` (<b>${esc(own)}</b>)`:''} to view it.</p><div class="priv-row"><a class="pill priv-req" href="${url}" target="_blank" rel="noopener" data-privreq="1">Request Access</a><button class="pill priv-back" type="button" data-privback="1">Back</button></div><small>Opens Google Drive, where you can ask the owner for access.</small></div></div>`;
 status('');const b=g.querySelector('.priv-req');setTimeout(()=>{try{b.focus({preventScroll:true})}catch(e){}},60)}
document.addEventListener('click',e=>{if(e.target.closest('[data-privback]')){e.preventDefault();back(parentHash())}});
async function open(id,mode='home'){cur=id;view=id===ROOT?mode:'folder';$('#q').value='';if(!navBack&&id!==ROOT)folderSfx(id);if(live&&!kids.has(id)){try{await loadFolder(id)}catch(e){if(/drive (403|404)/.test(e&&e.message||''))DENIED.add(id);live=false;status('');add(window._idx||[]);applyLinks(window._links)}}
 const f=items.get(id);if(id===ROOT&&mode==='home')return showHome();render(kids.get(id)||[],id===ROOT?{home:'The Fan Edit Fan Club Collection',all:'The Fan Edit Fan Club Collection',arena:'New Arrivals',collections:'Collections'}[mode]:f.name,id===ROOT?mode:'home');if(id!==ROOT&&!(kids.get(id)||[]).length&&isDenied(id))privatePrompt(id,f)}
/* ---------- SORT (#/all) ---------- */
const SORTS=[['az','A–Z'],['za','Z–A'],['newest','Newest'],['oldest','Oldest'],['film','Source Media'],['genre','Genre'],['size','Largest']];
function curSort(){const m=location.hash.match(/[?&]sort=([a-z]+)/);return m&&SORTS.some(s=>s[0]===m[1])?m[1]:'az'}
/* Main Collection layout. sections (default): every folder, then every file. mixed: the previous letter-by-letter mix. */
function allLayout(){try{return localStorage.getItem('fefcAllLayout')==='mixed'?'mixed':'sections'}catch(e){return 'sections'}}
let sortJob=0;
function sortedAll(fold,vids,g,extra){fold=stripReadFirst(fold);vids=stripReadFirst(stripSupportDocs(vids));const k=curSort(),layout=allLayout(),list=[...fold,...vids],nm=(a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'});
 const dt=f=>NA.d(f)||'',film=f=>{const mm=meta.map&&meta.films&&meta.films[meta.map[f.id]||meta.map[target(f)]];return (mm&&mm.title)||(isFolder(f)?f.name.replace(/^\s*\d+[A-Z]?\s*-\s*/,''):parse(f.name).film)||f.name},gen=f=>{const x=isFolder(f)?(genreMap[target(f)]||{}).genres:genresOf(f);return x&&x[0]||'Uncategorized'};
 const cmp=(a,b)=>{if(k==='az')return nm(a,b);if(k==='za')return nm(b,a);if(k==='newest'||k==='oldest'){const s=k==='newest'?-1:1;return (dt(a)<dt(b)?-s:dt(a)>dt(b)?s:0)||nm(a,b)}if(k==='size')return (+b.size||0)-(+a.size||0)||nm(a,b);const x=k==='film'?film(a):gen(a),y=k==='film'?film(b):gen(b);return (x==='Uncategorized')-(y==='Uncategorized')||x.localeCompare(y,undefined,{sensitivity:'base'})||nm(a,b)};
 const layoutBtn=`<button class="sortpill${layout==='mixed'?' on':''}" data-layout="1" aria-pressed="${layout==='mixed'}" title="Mixed lists folders and files together. Off: all collections, then all files.">Mixed</button>`;
 const bar=`<div class="sortbar" role="toolbar" aria-label="Sort">${extra||''}${SORTS.map(([v,l])=>`<button class="sortpill${v===k?' on':''}" data-sort="${v}" aria-pressed="${v===k}">${l}</button>`).join('')}${layoutBtn}</div>`;
 const job=++sortJob,q=[];
 /* Sections: paint every collection before the files header, so the files block cannot appear in the middle of a still-loading folder grid. */
 if(layout==='sections'){const folders=fold.slice().sort(cmp),files=vids.slice().sort(cmp);
  g.innerHTML=bar+`<div class="ol-div"><span>COLLECTIONS</span><i></i><b>${folders.length+1}</b></div><div class="sgrid folds" data-g="cols"></div>`+(files.length?'<div data-files-slot></div>':'');
  const colEl=g.querySelector('[data-g="cols"]');if(colEl){colEl.insertAdjacentHTML('afterbegin',RF_HOME_TILE+SUP_HOME_TILE);for(let i=0;i<folders.length;i+=60)q.push([colEl,folders.slice(i,i+60)])}
  if(files.length)q.push([{files:files},[]])}
 else{let groups;
  if(k==='az'||k==='za'){list.sort(k==='az'?nm:(a,b)=>nm(b,a));const L=f=>{const c=(f.name||'').trim().charAt(0).normalize('NFD').charAt(0).toUpperCase();return /[A-Z]/.test(c)?c:'#'};const by=new Map();list.forEach(f=>{const x=L(f);if(!by.has(x))by.set(x,[]);by.get(x).push(f)});groups=[...by.entries()].map(([x,a])=>[x,a,1])}
  else if(k==='newest'||k==='oldest'){const s=k==='newest'?-1:1;groups=[['',list.sort((a,b)=>(dt(a)<dt(b)?-s:dt(a)>dt(b)?s:0)||nm(a,b))]]}
  else if(k==='size')groups=[['',list.sort((a,b)=>(+b.size||0)-(+a.size||0)||nm(a,b))]];
  else{const by=new Map(),key=k==='film'?film:gen;list.forEach(f=>{const x=key(f);if(!by.has(x))by.set(x,[]);by.get(x).push(f)});
   groups=[...by.entries()].sort((a,b)=>(a[0]==='Uncategorized')-(b[0]==='Uncategorized')||a[0].localeCompare(b[0],undefined,{sensitivity:'base'})).map(([x,a])=>[x,a.sort(nm)])}
  g.innerHTML=bar+groups.map(([x,a,lt],n)=>(x?`<div class="ol-div${lt?' letter':''}" id="${lt?'L-'+(x==='#'?'num':x):''}"><span>${esc(x)}</span><i></i><b>${a.length}</b></div>`:'')+`<div class="sgrid folds" data-g="${n}f"></div><div class="sgrid vids" data-g="${n}v"></div>`).join('');
  groups.forEach(([x,a],n)=>{[['f',a.filter(f=>!isMedia(f))],['v',a.filter(f=>isMedia(f))]].forEach(([t,b])=>{const el=g.querySelector(`[data-g="${n}${t}"]`);if(!b.length)el.remove();for(let i=0;i<b.length;i+=60)q.push([el,b.slice(i,i+60)])})})}
 /* A queued {files} marker mounts the FILES section only after the collection chunks ahead of it have been painted. */
 const next=()=>{const item=q.shift();if(!item)return null;if(item[0]&&item[0].files){const files=item[0].files,slot=g.querySelector('[data-files-slot]');if(slot){slot.outerHTML=`<div class="ol-div"><span>FILES</span><i></i><b>${files.length}</b></div><div class="sgrid vids" data-g="files"></div>`;const el=g.querySelector('[data-g="files"]');const chunks=[];for(let i=0;i<files.length;i+=60)chunks.push([el,files.slice(i,i+60)]);for(let i=chunks.length-1;i>=0;i--)q.unshift(chunks[i])}return next()}return item};
 const paint=item=>{if(!item||!item[0]||!item[0].insertAdjacentHTML)return;const[el,a]=item;el.insertAdjacentHTML('beforeend',a.map(f=>tile(f)).join(''));el.querySelectorAll('.ol-tile:not([data-arted])').forEach(e=>{e.dataset.arted=1;lazyArt(e)})};
 const step=()=>{if(job!==sortJob||!q.length)return;if(!tvGate()){setTimeout(step,300);return}const t=Date.now();while(q.length&&Date.now()-t<12&&tvGate())paint(next());if(q.length)(tvGate()?requestAnimationFrame(step):setTimeout(step,300))};
 paint(next());drainOne=()=>{if(job!==sortJob||!q.length)return false;paint(next());return true};requestAnimationFrame(step)}
document.addEventListener('click',e=>{const b=e.target.closest('[data-sort]');if(!b)return;S.click();const h='#/all'+(b.dataset.sort==='az'?'':'?sort='+b.dataset.sort);if(location.hash!==h){history.pushState({fefc:1},'',h);route()}setTimeout(()=>{const n=document.querySelector(`[data-sort="${b.dataset.sort}"]`);if(n)focusEl(n)},30)});
document.addEventListener('click',e=>{const b=e.target.closest('[data-layout]');if(!b)return;e.preventDefault();try{localStorage.setItem('fefcAllLayout',allLayout()==='mixed'?'sections':'mixed')}catch(_){}S.click&&S.click();const sy=$('#main')?$('#main').scrollTop:0;open(ROOT,'all').then(()=>{$('#main').scrollTop=sy;const n=document.querySelector('[data-layout]');if(n)focusEl(n)})});
/* ---------- DETAILS (LCARS) ---------- */
async function omdb(title,year){if(!C.OMDB_API_KEY)return null;try{const j=await(await fetch(`https://www.omdbapi.com/?apikey=${C.OMDB_API_KEY}&t=${encodeURIComponent(title)}${year?'&y='+year:''}`)).json();return j.Response==='True'?j:null}catch(e){return null}}
async function ytTrailer(q){if(!C.YOUTUBE_API_KEY)return null;try{const j=await(await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(q)}&key=${C.YOUTUBE_API_KEY}`)).json();const v=j.items?.[0];return v?{youtubeId:v.id.videoId,title:v.snippet.title,auto:true}:null}catch(e){return null}}
const ICO={
 imdb:'<svg viewBox="0 0 64 32" class="ico"><rect width="64" height="32" rx="5" fill="#F5C518"/><text x="32" y="23" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="18" text-anchor="middle" fill="#000">IMDb</text></svg>',
 rt:'<svg viewBox="0 0 32 32" class="ico"><circle cx="16" cy="18" r="12" fill="#FA320A"/><path d="M13 6c1-3 5-3 6 0-2-1-4-1-6 0zM16 6l-3-4M16 6l4-3" stroke="#00912D" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>',
 fe:'<svg viewBox="0 0 32 32" class="ico"><rect width="32" height="32" rx="6" fill="#1d3f6e"/><text x="16" y="21" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="12" text-anchor="middle" fill="#fff">FE</text></svg>',
 mr:'<svg viewBox="0 0 32 32" class="ico"><rect width="32" height="32" rx="6" fill="#6b1d6e"/><text x="16" y="21" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="12" text-anchor="middle" fill="#fff">MR</text></svg>'};
const fmtV=n=>n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?Math.round(n/1e3)+'K':String(n);
/* ---------- EPISODES ---------- */
function epInfo(n){n=n.replace(/\.[a-z0-9]{2,4}$/i,'');let m=n.match(/\bS(\d{1,2})\s*E(\d{1,3})\b/i)||null,s=null,e=null,at=-1;const lead=n.match(/^(\d{1,4})[.)]\s+(\S.*)$/);if(lead&&!m)return{s:null,e:+lead[1],key:'',title:lead[2]};
 if(m){s=+m[1];e=+m[2];at=m.index}else{const ms=n.match(/\b(?:Season|Series|Book)\s*(\d+)/i),me=n.match(/\b(?:Episode|Ep\.?|Part|Chapter|Chapitre|Vol(?:ume)?\.?)\s*(\d+)/i);if(ms){s=+ms[1];at=ms.index}if(me){e=+me[1];if(at<0||me.index<at)at=me.index}}
 if(e==null)return null;const key=n.slice(0,at).replace(/[\s\-–:|,]+$/,'').toLowerCase();
 const rest=n.slice(at).replace(/^(?:S\d+\s*E\d+|(?:Season|Series|Book)\s*\d+[\s\-–:,]*(?:(?:Episode|Ep\.?|Part|Chapter)\s*\d+)?|(?:Episode|Ep\.?|Part|Chapter|Chapitre|Vol(?:ume)?\.?)\s*\d+)/i,'').split(/\s+[-–|]\s+/).map(x=>x.trim()).filter(x=>x&&!/fan ?edit|^\(?\d{4}\)?$/i.test(x));
 return{s,e,key,title:rest[0]||''}}
function realParent(f){const t=items.get(target(f));return (t&&t.parent)||f.parent}
function episodes(f){const me=epInfo(f.name);if(!me)return null;const par=realParent(f),seen=new Set();
 const pool=[...(kids.get(par)||[]),...(f.parent!==par?kids.get(f.parent)||[]:[])].filter(x=>!isFolder(x)&&isVid(x)&&!seen.has(target(x))&&seen.add(target(x)));
 const T=items.get(target(f)),meT=T&&T!==f?epInfo(T.name):null,real=(kids.get(par)||[]).filter(x=>!isFolder(x)&&isVid(x)).map(x=>({f:x,i:epInfo(x.name)})),ded=par!==ROOT&&meT&&real.filter(o=>o.i).length>=real.length*.5&&real.some(o=>target(o.f)===target(f));const all=ded?real.filter(o=>o.i):pool.map(x=>({f:x,i:epInfo(x.name)})).filter(o=>o.i&&o.i.key===me.key);const me2=ded?meT:me;
 const pf=items.get(par),gp=pf&&pf.parent;let seasons=[];const sn=x=>{const m=x.name.match(/\b(?:Season|Series|Book)\s*(\d+)/i);return m?+m[1]:null};
 if(pf&&sn(pf)!=null)seasons=(kids.get(gp)||[]).filter(x=>isFolder(x)&&sn(x)!=null).map(x=>({n:sn(x),id:x.id,folder:1,cur:target(x)===par||x.id===par}));
 else{const by={};all.forEach(o=>{if(o.i.s!=null&&!(o.i.s in by))by[o.i.s]=o});const ss=Object.keys(by);if(ss.length>1)seasons=ss.map(k=>({n:+k,id:by[k].f.id,cur:+k===me2.s}))}
 seasons.sort((a,b)=>a.n-b.n);
 const eps=all.filter(o=>me2.s==null||o.i.s==null||o.i.s===me2.s||(pf&&sn(pf)!=null)).sort((a,b)=>(a.i.s||0)-(b.i.s||0)||a.i.e-b.i.e||a.f.name.localeCompare(b.f.name));
 const idx=eps.findIndex(o=>target(o.f)===target(f));return eps.length>1||seasons.length>1?{me:me2,seasons,eps,idx}:null}
function epHTML(E,showAll){if(!E)return'';const{eps,idx,seasons,me}=E,lo=showAll?0:Math.max(0,Math.min(idx-3,eps.length-7)),hi=showAll?eps.length:Math.min(eps.length,lo+7);
 const lab=o=>(o.i.s!=null?'S'+o.i.s+' · ':'')+(/part/i.test(o.f.name)&&!/episode/i.test(o.f.name)?'Part ':'Ep ')+o.i.e;
 return (seasons.length>1?`<h3 class="lc-h l">Seasons</h3><div class="seas">${seasons.map(x=>`<button class="ol-tile seat${x.cur?' cur':''}" data-id="${esc(x.id)}" data-ep="1"><b>SEASON</b><span>${x.n}</span></button>`).join('')}</div>`:'')
 +(eps.length>1?`<h3 class="lc-h p">Episodes <small>${idx+1} of ${eps.length}</small></h3><div class="epnav"><button class="pill p4 epbtn" data-epgo="${idx>0?esc(eps[idx-1].f.id):''}" ${idx>0?'':'disabled'}>◀ Previous</button><button class="pill p2 epbtn" data-epall="1">${showAll?'Show fewer':'Show all '+eps.length}</button><button class="pill p4 epbtn" data-epgo="${idx<eps.length-1?esc(eps[idx+1].f.id):''}" ${idx<eps.length-1?'':'disabled'}>Next ▶</button></div><div class="eps${showAll?' all':''}">${eps.slice(lo,hi).map((o,k)=>`<button class="ol-tile ept${lo+k===idx?' cur':''}" data-id="${esc(o.f.id)}" data-ep="1"><b>${esc(lab(o))}</b><span>${esc(o.i.title||parse(o.f.name).raw)}</span></button>`).join('')}</div>`:'')}
function epWire(f,E){const box=$('#lc-eps');if(!box||!E){if(box)box.innerHTML='';return}let all=false;
 /* 0.8.16: season→first ep details; Select on ept plays on TV; keep focused ep visible; no stacked listeners */
 const tvish=()=>document.body.classList.contains('tv')||document.body.classList.contains('firetv')||!!window.FEFCNative;
 const reveal=el=>{
  if(!el||!el.getBoundingClientRect)return;
  try{el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'})}catch(_){}
  const scrollers=[];let p=el.parentElement;while(p&&p!==document.body){try{const cs=getComputedStyle(p);if(/(auto|scroll)/.test((cs.overflow||'')+(cs.overflowX||'')+(cs.overflowY||'')))scrollers.push(p)}catch(_){}
   if(p.id==='details'||p.classList&&p.classList.contains('lc-body')){if(scrollers.indexOf(p)<0)scrollers.push(p);break}p=p.parentElement}
  const body=$('#details .lc-body');if(body&&scrollers.indexOf(body)<0)scrollers.push(body);
  for(const sc of scrollers){const er=el.getBoundingClientRect(),sr=sc.getBoundingClientRect();
   if(er.bottom>sr.bottom-8)sc.scrollTop+=er.bottom-sr.bottom+16;if(er.top<sr.top+8)sc.scrollTop-=sr.top-er.top+16;
   if(er.right>sr.right-8)sc.scrollLeft+=er.right-sr.right+16;if(er.left<sr.left+8)sc.scrollLeft-=sr.left-er.left+16}
 };
 const firstEpId=seat=>{const id=seat&&seat.dataset&&seat.dataset.id,folder=id&&items.get(id);
  if(folder&&isFolder(folder)){const list=kids.get(target(folder))||[];
   const vids=list.filter(x=>!isFolder(x)&&isVid(x)).map(x=>({f:x,i:epInfo(x.name)})).filter(o=>o.i).sort((a,b)=>(a.i.e||0)-(b.i.e||0));
   if(vids.length)return vids[0].f.id;const any=list.find(x=>!isFolder(x)&&isVid(x));return any?any.id:null}
  return id};
 const draw=()=>{box.innerHTML=epHTML(E,all);requestAnimationFrame(()=>{const c=box.querySelector('.ept.cur,.seat.cur');if(c)reveal(c)})};draw();
 box.onclick=e=>{const a=e.target.closest('[data-epall]'),g=e.target.closest('[data-epgo]'),seat=e.target.closest('.seat[data-ep]'),ept=e.target.closest('.ept[data-ep]');
  if(a){e.preventDefault();e.stopPropagation();S.chirp(3);all=!all;draw();const n=box.querySelector('[data-epall]');if(n)focusEl(n);return}
  if(g&&g.dataset.epgo){e.preventDefault();e.stopPropagation();S.click();go('#/edit/'+g.dataset.epgo);return}
  if(seat){e.preventDefault();e.stopPropagation();S.click();const to=firstEpId(seat);if(to)go('#/edit/'+to);return}
  if(ept){e.preventDefault();e.stopPropagation();S.click();if(tvish())go('#/play/'+ept.dataset.id);else go('#/edit/'+ept.dataset.id);return}};
 box.onfocusin=e=>{const t=e.target.closest&&e.target.closest('.ept,.seat,.epbtn');if(t)reveal(t)}}
function fileChips(f){const t=items.get(target(f))||f,g=k=>f[k]!=null?f[k]:t[k];let ext=g('ext');const mt=g('mimeType')||'';
 if(!ext){const m=(t.name||f.name).match(/\.([a-z0-9]{2,4})$/i);ext=m?m[1]:({'video/mp4':'mp4','video/x-matroska':'mkv','video/x-msvideo':'avi','video/quicktime':'mov','video/webm':'webm','video/mp2t':'ts','video/x-m4v':'m4v','video/mpeg':'mpg','video/x-ms-wmv':'wmv'}[mt]||(/^video\/(?:x-)?([a-z0-9]+)$/.exec(mt)||[])[1])}
 let size=+g('size')||0;if(!size&&window.FEX&&FEX.size){try{size=+FEX.size(target(f))||0}catch(e){}}
 const hs=size?(size>=1e9?(size/1e9).toFixed(1)+' GB':(size/1e6).toFixed(0)+' MB'):'';
 const rm=(f.name+' '+(t.name||'')).match(/\b(4K|2160p|1080p|720p|576p|480p|360p|UHD)\b/i),res=rm?(/2160|uhd/i.test(rm[1])?'4K':rm[1].toUpperCase().replace('P','p')):'';
 const dur=g('duration')||g('durationMillis');let ds=dur?(()=>{const m=Math.round(+dur/(dur>1e5?6e4:60));return m>=60?Math.floor(m/60)+'h '+(m%60)+'m':m+'m'})():'';
 if(!ds){const F=(window.FEX&&FEX.film(f.id,target(f)))||null;if(F&&F.runtime)ds=F.runtime+'m'}
 const c=[ext&&ext.toUpperCase(),hs,res,ds].filter(Boolean);return c.length?`<div class="fchips" aria-label="File info"><span class="fl">FILE</span>${c.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}
/* blurred backdrop: low-res canvas upscaled by the browser (no CSS blur filter; cheap on iOS) */
function detCover(f){let x=items.get(target(f))||f,g=0;const ids=[];while(x&&x.parent&&g++<30){ids.push(x.parent);x=items.get(x.parent)}if(f.parent)ids.unshift(f.parent);
 for(const p of ids){if(p===ROOT)break;const t=fthumbs[p];if(t)return t.startsWith('assets/')?t:'https://drive.google.com/thumbnail?sz='+thumbSz()+'&id='+t}return null}
function detBackdrop(f,pu){const d=$('#details');let c=d.querySelector('canvas.lc-bg');if(!c){c=document.createElement('canvas');c.className='lc-bg';c.width=40;c.height=24;d.prepend(c)}
 const x=c.getContext('2d');x.clearRect(0,0,40,24);c.classList.remove('on');const src=detCover(f)||pu;if(!src)return;const im=new Image(),want=f.id;
 im.onload=()=>{if(d.dataset.id!==want)return;const r=Math.max(40/im.width,24/im.height),w=im.width*r,h=im.height*r;x.drawImage(im,(40-w)/2,(24-h)/2,w,h);c.classList.add('on')};im.onerror=()=>{if(pu&&src!==pu&&!im.dataset.fb){im.dataset.fb=1;im.src=pu}};im.src=src}
function timeAgo(ts){if(!ts)return'';const diff=Math.max(0,Date.now()-ts),m=Math.floor(diff/60000),h=Math.floor(m/60),d=Math.floor(h/24);if(m<1)return'just now';if(m<60)return m+'m ago';if(h<24)return h+'h ago';if(d===1)return'yesterday';if(d<30)return d+'d ago';return new Date(ts).toLocaleDateString()}
/* one-screen detail layout: TV and large non-touch desktops (see body.fit in style.css) */
function fitMode(){document.body.classList.toggle('fit',document.body.classList.contains('tv')||(innerWidth>=1100&&innerHeight>=640&&!document.body.classList.contains('touch')))}
addEventListener('resize',fitMode);
function refreshOpenDetails(){const d=$('#details');if(!d||d.hidden||!d.dataset.id)return;const f=items.get(d.dataset.id);if(f&&!isFolder(f))details(f,false)}
async function details(f,push=true){fitMode();
 const _same=$('#details')&&!$('#details').hidden&&$('#details').dataset.id===f.id;
 if(!_same){S.open();S.ambience(false)}
 $('#bar').hidden=false;document.body.classList.add('details-open');
 if(window.NA&&NA.menuHTML)try{menu()}catch(e){}
 const b=$('#bar');if(b)document.documentElement.style.setProperty('--barh',(b.offsetHeight||56)+'px');
 const p=parse(f.name),id=target(f),m=meta[f.id]||meta[id]||{};
 const F=(window.FEX&&FEX.film(f.id,id))||(meta.films&&meta.map&&meta.films[meta.map[f.id]||meta.map[id]])||null;
 const film=F?{title:F.title,year:F.year,director:(F.director||[]).join(', ')}:(m.sourceFilm||{title:p.film,year:p.year});
 const cast=m.cast&&m.cast.length?m.cast:(F&&F.cast||[]).map(n=>({name:n})),desc=m.description,plot=F&&F.plot;
 const old=m.ratings||[],R=[];
 const imdbId=F&&F.imdb||((old.find(r=>/^IMDb/.test(r.source))||{}).url||'').replace(/.*title\/(tt\d+).*/,'$1')||null;
 if(imdbId||F&&F.imdbRating)R.push({ico:'imdb',name:'IMDb',val:F&&F.imdbRating?F.imdbRating+'/10':'VIEW ›',sub:F&&F.imdbVotes?fmtV(F.imdbVotes)+' votes':'',url:imdbId?`https://www.imdb.com/title/${imdbId}/`:null});
 const rto=old.find(r=>/Tomatometer/.test(r.source));const rtUrl=F&&F.rt?'https://www.rottentomatoes.com/'+F.rt:rto&&rto.url;const rts=F&&F.rtScore!=null?F.rtScore+'%':rto&&rto.value;
 if(rtUrl||rts)R.push({ico:'rt',name:'Rotten Tomatoes',val:rts||'VIEW ›',sub:rts?'Tomatometer'+(F&&F.rtAudience!=null?' · Audience '+F.rtAudience+'%':''):'',url:rtUrl||null});
 const ifdb=(meta.ifdb||{})[f.id]||(meta.ifdb||{})[id]||((old.find(r=>/FanEdit/.test(r.source))||{}).url);
 const FE=[],fer=FER[f.id]||FER[id]||{},fsc=x=>x&&x.score!=null?(+x.score).toFixed(1).replace(/\.0$/,'')+'/'+(x.scale||10):'VIEW ›',fsub=x=>x&&x.votes?fmtV(x.votes)+' vote'+(x.votes===1?'':'s'):'';
 {const x=fer.ifdb||(ifdb?{url:ifdb}:null);if(x&&x.url)FE.push({ico:'fe',name:'FanEdit.org',val:fsc(x),sub:fsub(x)||'IFDB entry',url:x.url})}
 {const mro=old.find(r=>/Movies Remastered/.test(r.source)&&(r.url||r.value)),x=fer.mrdb||(mro?{url:mro.url,score:null}:null);if(x&&x.url)FE.push({ico:'mr',name:'Movies Remastered',val:fsc(x),sub:fsub(x)||'MRDb entry',url:x.url})}
 {const x=fer.changes;if(x&&x.url)FE.push({ico:'fe',name:'Fan Edit Changes',val:x.label||(x.n!=null?x.n+' changes':'VIEW ›'),sub:x.label?'IFDB change list':(fsub(x)||'IFDB change list'),url:x.url})}
 const tr=m.trailer&&m.trailer.youtubeId?{id:m.trailer.youtubeId}:F&&F.trailer;
 /* Fire TV / TV: RT + IMDb as plain text; web: hyperlinks */
 const tvPlain=document.body.classList.contains('tv')||document.body.classList.contains('firetv')||!!window.FEFCNative;
 const rateHTML=(r,plain)=>{const inner=`<span class="rn">${ICO[r.ico]}<span>${esc(r.name)}${r.sub?`<small>${esc(r.sub)}</small>`:''}</span></span><b>${esc(r.val)}</b>`;return (plain||!r.url)?`<span class="rr">${inner}</span>`:`<a href="${esc(r.url)}" target="_blank" rel="noopener" class="rr">${inner}</a>`};
 const rt=R.map(r=>rateHTML(r,tvPlain)).join('')||'<p class="src">No ratings found for the source media.</p>';
 const feRt=FE.map(r=>rateHTML(r,false)).join('');
 const T=m.title||p.raw,meta1=[film.year,F&&F.runtime?F.runtime+' min':'',F&&F.tv?'TV series':''].filter(Boolean).join(' · ');
 const PS=posters[f.id]||posters[id],PU=F&&F.fx&&F.poster&&(!PS||(meta.map&&(meta.map[f.id]||meta.map[id])))?F.poster:PS&&PS.url;
 const fn=(f.name||'').toLowerCase();let fp=fn,curF=f,gc=0;while(curF&&curF.parent&&gc++<15){curF=items.get(curF.parent);if(curF&&curF.name)fp+=' '+curF.name.toLowerCase()}
 if(f.targetId){let tF=items.get(f.targetId),gc2=0;while(tF&&gc2++<15){if(tF.name)fp+=' '+tF.name.toLowerCase();tF=tF.parent?items.get(tF.parent):null}}
 const isPurr=/purr|purassic/i.test(fp),isJura=!isPurr&&fp.includes('jurassic'),isDexter=/\bdexter\b(?!'?s?\s+lab)/i.test(fp);
 if(!_same){if(isPurr){if(window.S&&S.catMeow)S.catMeow();else S.fx(['assets/sfx/cat-meow.wav','assets/sfx/cat-meow.m4a'])}
 else if(isJura){S.fx(['assets/sfx/trex-roar.mp3','assets/sfx/trex-roar.m4a'])}
 else if(isDexter){S.fx(['assets/sfx/dexter-tonights-the-night.mp3','assets/sfx/dexter-tonights-the-night.m4a'])}}
 $('#details').innerHTML=`<div class="lc-top"><div class="lc-elbow"></div><div class="lc-bars"><span class="p2" style="width:60px"></span><span class="p3" style="flex:1"></span></div><div class="lc-bars" style="flex:0 0 40px"><span class="p1" style="flex:1;border-radius:0 13px 13px 0"></span></div></div>
 <div class="lc-side"><button class="pill p1" data-act="back">◀ Back</button>${tr?'<button class="pill p2" data-jump="trailer">Trailer</button>':''}${(()=>{const on=!!(window.UD&&UD.isStarred(f.id));return `<button class="pill p4 star-btn side-star${on?' on':''}" data-star="${f.id}" aria-pressed="${on}">${starLbl(on)}</button>`})()}<div class="grow"></div></div>
 <div class="lc-body${PU?'':' nopo'}"><div class="lc-head${PU?' has-poster':''}">${PU?`<div class="lc-poster"><img src="${esc(PU)}" alt="" decoding="async" onload="if(this.naturalWidth>this.naturalHeight*.8)this.classList.add('wide')"></div>`:''}<div class="lc-info"><h1 class="lc-title">${esc(T)}</h1>${meta1||film.title?`<div class="lc-sub">${esc(film.title&&film.title!==T?film.title:'')}${meta1?(film.title&&film.title!==T?' · ':'')+esc(meta1):''}</div>`:''}${fileChips(f)}<div class="det-acts">${(window.FEFCNative&&typeof FEFCNative.openInVlc==='function')?`<button class="bigplay" data-act="play" tabindex="0" data-default aria-label="Play ${esc(T)}"><span class="tri"></span>PLAY</button><button type="button" class="pill p5 det-ext" data-act="vlc" aria-label="Open in VLC">Open in VLC</button><button type="button" class="pill p3 det-ext" data-act="drive" aria-label="Open in Drive">Open in Drive</button>`:`<button class="bigplay" data-act="play" tabindex="0" data-default aria-label="Play ${esc(T)}"><span class="tri"></span>PLAY</button><a class="pill p3 det-ext" href="https://drive.google.com/file/d/${id}/view" target="_blank" rel="noopener">Open in Drive</a>`}</div></div></div><div>
  ${desc?`<h3 class="lc-h">Fan edit</h3><div class="tv-scroll" tabindex="0" data-tvscroll="desc"><p>${esc(desc)}</p></div>${m.descriptionSource?`<p class="src">Source: <a href="${esc(m.descriptionSource.url)}" target="_blank" rel="noopener">${esc(m.descriptionSource.name)}</a></p>`:''}`:''}
  <div id="lc-fanedit"></div>
  <h3 class="lc-h l">Source Media</h3><p><b>${esc(film.title||'Unknown')}</b>${film.year?' ('+esc(film.year)+')':''}${film.director?'<br>Directed by '+esc(film.director):''}${F&&F.genres?'<br><span class="src">'+esc(F.genres.join(' · '))+'</span>':''}${m.editor?'<br><span class="src">Fan edit by '+esc(m.editor)+'</span>':''}</p>
  ${plot?`<h3 class="lc-h l">Overview</h3><div class="tv-scroll" tabindex="0" data-tvscroll="plot"><p class="plot">${esc(plot)}</p></div>${F.wiki?`<p class="src">Plot: <a href="${esc(F.wiki)}" target="_blank" rel="noopener">Wikipedia</a></p>`:''}`:''}
  <div id="lc-eps"></div>
  ${cast.length?`<h3 class="lc-h p">Cast</h3><div class="cast">${cast.map(c=>`<span>${esc(c.name)}</span>`).join('')}</div>`:''}
 </div><div>
  ${FE.length?`<h3 class="lc-h b" id="lc-feratings">Fan Edit Ratings</h3><div class="rt fer">${feRt}</div>`:''}
  <h3 class="lc-h b" id="lc-ratings">Source Ratings</h3><div class="rt">${rt}</div>
  <div id="lc-fileinfo-slot"></div>
  <h3 class="lc-h p" id="lc-trailer" style="margin-top:14px">Trailer${film.title?' · '+esc(film.title):''}</h3><div class="trailer">${tr?`<iframe src="https://www.youtube-nocookie.com/embed/${esc(tr.id)}" allowfullscreen allow="encrypted-media" loading="lazy" title="Trailer"></iframe>`:`<span>No trailer on file.<br><a href="https://www.youtube.com/results?search_query=${encodeURIComponent((film.title||p.raw)+' '+(film.year||'')+' official trailer')}" target="_blank" rel="noopener">Search YouTube ›</a></span>`}</div>
 </div></div><div class="lc-foot"><div class="lc-elbow" style="background:var(--l)"></div><span></span><span></span><span></span></div>`;
 const _det=$('#details');_det.classList.remove('leaving');_det.dataset.id=f.id;_det.classList.add('det-enter');_det.hidden=false;requestAnimationFrame(()=>requestAnimationFrame(()=>_det.classList.remove('det-enter')));detBackdrop(f,PU);const E=episodes(f);epWire(f,E);if(window.FEX)FEX.ready.then(()=>FEX.enhance(f,{items,target,root:ROOT},F));$('#details').scrollTop=0;const lb=$('#details .lc-body');if(lb)lb.scrollTop=0;
 if(isPurr){
  $('#details').onclick=e=>{if(e.target.closest('button,a,.pill,.bigplay,.ol-tile')){if(window.S&&S.catMeow)S.catMeow();else S.fx(['assets/sfx/cat-meow.wav','assets/sfx/cat-meow.m4a'])}};
 }
 $('#details').querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>{S.chirp(2);const t=$('#lc-'+b.dataset.jump);if(t)t.scrollIntoView({behavior:'smooth',block:'start'})}));
 let n=0;$('#details').querySelectorAll('.pill,.rt a,.rt .rr,.bigplay').forEach(el=>el.addEventListener('pointerenter',()=>S.chirp(n++)));
 requestAnimationFrame(()=>{document.querySelectorAll('#details .tv-scroll').forEach(el=>{const o=el.scrollHeight>el.clientHeight+8;el.classList.toggle('can-scroll',o);el.classList.toggle('at-top',el.scrollTop<=0);el.classList.toggle('at-bot',el.scrollTop+el.clientHeight>=el.scrollHeight-2);el.addEventListener('scroll',()=>{el.classList.toggle('at-top',el.scrollTop<=0);el.classList.toggle('at-bot',el.scrollTop+el.clientHeight>=el.scrollHeight-2)},{passive:true})});});
}
let playerTimer=null,closedFor=null;
function stopPlayerTimer(){if(playerTimer){clearTimeout(playerTimer);clearInterval(playerTimer);playerTimer=null}}
function closePlayer(){try{stopPlayerTimer()}catch(e){}clearStreamWait();const pl=$('#player');if(pl){pl.hidden=true;pl.classList.remove('floating')}try{killFrame()}catch(e){}const fb=$('#pstream-fallback');if(fb)fb.hidden=true;document.body.classList.remove('shuf-player');window.__shufPlay=0}
function killFrame(){killVideo();const o=$('#pframe');if(o){o.removeAttribute('src');o.hidden=true}}
/* Web player (Silk on Fire TV included): HTML5 <video> pointed at /api/stream/{id}/{file}.
   Never a Drive preview iframe and never a Google sign-in gate. The old probe fetched
   Range: bytes=0-0 and, when the edge answered with the whole file, Silk waited on that
   download forever, then swapped in drive.google.com/file/preview (sign-in / spinner). */
let streamTok=0;
function clearStreamWait(){if(startStream._t){clearTimeout(startStream._t);startStream._t=0}}
function quietForExternal(){try{if(window.SFX&&SFX.suspendAll)SFX.suspendAll()}catch(e){}try{document.querySelectorAll('video,audio').forEach(m=>{try{m.pause()}catch(err){}})}catch(e){}}
function killVideo(){try{window.__fefcPlayerSave&&window.__fefcPlayerSave()}catch(e){}streamTok++;clearStreamWait();const v=$('#pvideo');if(v){try{v.pause()}catch(e){}v.removeAttribute('src');try{v.load()}catch(e){}v.remove()}const w=$('#player .pwrap');if(w)w.classList.remove('vid')}
const STREAM_EXT=/^(mp4|m4v|mkv|webm|mov|avi|mpg|mpeg|m2ts|ts)$/i;
function streamUrlFor(id,name){
 let ext=(String(name||'').match(/\.([a-z0-9]{2,5})$/i)||[])[1]||'';
 ext=ext.toLowerCase();
 if(!STREAM_EXT.test(ext))ext='mp4';
 const base=String(name||'video').replace(/\.[^.]+$/,'').replace(/[^A-Za-z0-9._-]+/g,'_').slice(0,72)||'video';
 return '/api/stream/'+encodeURIComponent(id)+'/'+encodeURIComponent(base+'.'+ext);
}
function hideDriveFrame(){const o=$('#pframe');if(!o)return;o.removeAttribute('src');o.hidden=true}
function showStreamFallback(id,url,name,why){
 clearStreamWait();
 const v=$('#pvideo');if(v){try{v.pause()}catch(e){}v.hidden=true}
 hideDriveFrame();
 const w=$('#player .pwrap');if(!w)return;
 w.classList.remove('vid');
 let box=$('#pstream-fallback');
 if(!box){box=document.createElement('div');box.id='pstream-fallback';w.appendChild(box)}
 const abs=new URL(url,location.origin).href;
 const mkv=/\.mkv$/i.test(name||'')||/\.mkv$/i.test(url);
 const msg=why||(mkv?'This .mkv can’t play in the Fire TV browser.':'The video didn’t start.');
 box.hidden=false;
 box.innerHTML=`<p class="psf-why">${esc(msg)}</p><p class="psf-sub">The stream does not need a Google sign-in. Open it directly, or open the file in Drive.</p><div class="psf-row"><a class="pill p2" href="${esc(abs)}" target="_blank" rel="noopener">Open stream</a><a class="pill p3" href="${'https://drive.google.com/file/d/'+encodeURIComponent(id)+'/view'}" target="_blank" rel="noopener">Open in Drive</a><button type="button" class="pill p5" id="psf-retry">Try again</button></div>`;
 const b=box.querySelector('#psf-retry');if(b)b.onclick=()=>{box.hidden=true;startStream(id,name)};
 try{b&&b.focus({preventScroll:true})}catch(e){}
}

/* Sidecar captions in the same Drive folder (matching base name, optional .en/.sdh/…). Read-only stream via /api/stream. */
const SUB_LANG_SUF=['.en','.eng','.en-us','.en-gb','.es','.fr','.de','.it','.pt','.ja','.ko','.zh','.forced','.sdh','.cc','.hi','.nl','.ru'];
function stemBase(name){let s=String(name||'').replace(/\.[^.]+$/,'');const low=s.toLowerCase();for(const suf of SUB_LANG_SUF){if(low.endsWith(suf))return s.slice(0,s.length-suf.length)}return s}
function findSidecarSub(f){
  if(!f)return null;const id=target(f),parent=f.parent;if(!parent||!kids)return null;
  const sibs=kids.get(parent)||[];
  const want=stemBase(f.name).toLowerCase();
  let best=null;
  for(const s of sibs){
    const n=(s.name||'').toLowerCase();
    if(!/\.(srt|vtt|webvtt)$/.test(n))continue;
    const st=stemBase(s.name).toLowerCase();
    if(st===want||(s.name||'').replace(/\.[^.]+$/,'').toLowerCase()===want){
      const sid=target(s);if(sid===id)continue;
      best={id:sid,name:s.name,mime:/\.vtt|webvtt/.test(n)?'text/vtt':'application/x-subrip'};
      if(/\.en(\.|$)|english|sdh|\.cc\./i.test(n))return best;
    }
  }
  return best;
}
function srtToVtt(txt){
  let b=String(txt||'').replace(/^\uFEFF/,'').replace(/\r+/g,'');
  if(/^WEBVTT/i.test(b))return b;
  b=b.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g,'$1.$2');
  return 'WEBVTT\n\n'+b;
}
function attachSidecarTrack(v,sub){
  if(!v||!sub)return;
  const url='/api/stream/'+encodeURIComponent(sub.id);
  const add=(src,mime)=>{const tr=document.createElement('track');tr.kind='captions';tr.label=sub.name||'Captions';tr.srclang='en';tr.default=true;tr.src=src;if(mime)tr.setAttribute('data-mime',mime);v.appendChild(tr);try{if(v.textTracks&&v.textTracks[0])v.textTracks[0].mode='showing'}catch(e){}};
  if(sub.mime==='text/vtt'){add(url,'text/vtt');return}
  fetch(url).then(r=>r.ok?r.text():Promise.reject()).then(txt=>{
    const vtt=srtToVtt(txt);const blob=new Blob([vtt],{type:'text/vtt'});const u=URL.createObjectURL(blob);
    add(u,'text/vtt');v.addEventListener('emptied',()=>{try{URL.revokeObjectURL(u)}catch(e){}},{once:true});
  }).catch(()=>{/* sidecar optional */});
}
function playerScaleMode(){try{return localStorage.fefcScale||'contain'}catch(e){return 'contain'}}
function setPlayerScale(mode){window.setPlayerScale=setPlayerScale;const order=['contain','cover','ratio','fill'],lab={contain:'Fit',cover:'Fill',ratio:'16:9',fill:'Stretch'};let m=mode;if(!m||order.indexOf(m)<0){const i=Math.max(0,order.indexOf(playerScaleMode()));m=order[(i+1)%order.length]}try{localStorage.fefcScale=m}catch(e){}const v=$('#pvideo');if(v){v.classList.remove('ar-fit','ar-fill','ar-16','ar-stretch');v.classList.add(m==='contain'?'ar-fit':m==='cover'?'ar-fill':m==='ratio'?'ar-16':'ar-stretch');v.style.objectFit=m==='ratio'?'fill':m}const b=$('#pscale');if(b)b.textContent='Scale: '+lab[m];try{window.dispatchEvent(new CustomEvent('fefc-scale',{detail:m}))}catch(e){}return m}
window.setPlayerScale=setPlayerScale;
function ensurePlayerExtras(){
  const top=$('#player .ptop');if(!top||top.dataset.extras)return;top.dataset.extras=1;
  const mk=(id,label,title)=>{const b=document.createElement('button');b.id=id;b.type='button';b.className='pill p5';b.textContent=label;b.title=title;top.insertBefore(b,$('#popen'));return b};
  const sc=mk('pscale','Scale: Fit','Cycle Fit, Fill, 16:9, Stretch');sc.onclick=()=>{S.chirp(1);setPlayerScale()};
  const cc=mk('pcc','CC','Toggle captions');cc.onclick=()=>{S.chirp(1);const v=$('#pvideo');if(!v||!v.textTracks||!v.textTracks.length){cc.textContent='CC n/a';return}const t=v.textTracks[0];t.mode=t.mode==='showing'?'hidden':'showing';cc.textContent=t.mode==='showing'?'CC on':'CC off'};
  const au=mk('paudio','Audio','Audio track');au.onclick=()=>{S.chirp(1);const v=$('#pvideo');const list=v&&v.audioTracks;if(!list||!list.length){au.textContent='Audio n/a';return}let i=0;for(let x=0;x<list.length;x++)if(list[x].enabled)i=x;const n=(i+1)%list.length;for(let x=0;x<list.length;x++)list[x].enabled=x===n;au.textContent='Audio '+(n+1)+'/'+list.length};
  setPlayerScale(playerScaleMode());
}
function restreamIfNamed(){
 const pl=$('#player');if(!pl||pl.hidden)return;
 const fb=$('#pstream-fallback');if(fb&&!fb.hidden)return;
 const f=items.get(pl.dataset.pid);if(!f||!f.name||f.name==='Fan edit')return;
 const url=streamUrlFor(target(f),f.name);
 const v=$('#pvideo');
 if(v&&v.dataset.stream===url)return;
 if(v&&v.readyState>=3)return;
 startStream(target(f),f.name);
}
function startStream(id,name){
 killVideo();const tok=streamTok;
 const w=$('#player .pwrap');if(!w)return;
 hideDriveFrame();
 const fb=$('#pstream-fallback');if(fb)fb.hidden=true;
 const url=streamUrlFor(id,name||'');
 const ext=(url.match(/\.([a-z0-9]+)$/i)||[])[1]||'';
 const v=document.createElement('video');
 v.id='pvideo';v.controls=false;v.autoplay=true;v.playsInline=true;v.preload='auto';
 v.setAttribute('playsinline','');v.tabIndex=-1;v.style.objectFit=playerScaleMode();
 v.dataset.stream=url;
 let live=true;
 const giveUp=why=>{if(!live||tok!==streamTok)return;live=false;showStreamFallback(id,url,name,why)};
 /* Silk often never fires error for .mkv and never reaches canplay when moov is at the end of a multi-hundred-MB file. Cap the wait. */
 startStream._t=setTimeout(()=>{
  if(!live||tok!==streamTok)return;
  if(v.readyState>=3||v.currentTime>0){live=false;return}
  giveUp(ext==='mkv'?'This .mkv can’t play in Silk on Fire TV. Open the stream (no sign-in) or Open in Drive.':'The video didn’t start in this browser. Open the stream, or Open in Drive.');
 },8000);
 v.addEventListener('loadedmetadata',()=>{if(tok!==streamTok)return;let p=0;try{p=+localStorage.getItem('fefcPos:'+id)||0}catch(e){}if(p>8&&(!v.duration||p<v.duration-15)){try{v.currentTime=p}catch(e){}}});
 const savePos=()=>{if(tok!==streamTok||!v.duration)return;const p=v.currentTime;try{if(p<8||p>v.duration-15)localStorage.removeItem('fefcPos:'+id);else localStorage.setItem('fefcPos:'+id,String(p))}catch(e){}};
 v.addEventListener('pause',savePos);v.addEventListener('timeupdate',()=>{if(v.currentTime%2<0.3)savePos()});
 window.__fefcPlayerSave=savePos;
 v.addEventListener('canplay',()=>{if(tok!==streamTok)return;live=false;clearStreamWait();const box=$('#pstream-fallback');if(box)box.hidden=true;v.hidden=false});
 v.addEventListener('error',()=>{
  if(tok!==streamTok)return;clearStreamWait();
  giveUp(ext==='mkv'?'This .mkv can’t play in the browser. Open the stream link or Open in Drive.':'Playback stopped. Open the stream link or Open in Drive.');
 });
 v.src=url;w.classList.add('vid');w.appendChild(v);
 try{const f=items.get($('#player').dataset.pid);attachSidecarTrack(v,findSidecarSub(f))}catch(e){}
 ensurePlayerExtras();setPlayerScale(playerScaleMode());
 const pp=v.play&&v.play();if(pp&&pp.catch)pp.catch(()=>{});
}
function started(){return !!window._u&&document.body.classList.contains('intro-done')}
/* Fire TV: when a details page opens, warm the streaming proxy (shortcut resolve cache + TLS) so the native player starts faster */
const _warm={};function warmStream(f){const nb=window.FEFCNative;if(!f||!nb||!nb.playVideo||isFolder(f)||!isVid(f))return;const id=target(f);if(_warm[id])return;_warm[id]=1;try{const ac=new AbortController();fetch('/api/stream/'+id,{headers:{Range:'bytes=0-0'},signal:ac.signal,cache:'no-store'}).then(()=>ac.abort(),()=>{}).catch(()=>{})}catch(e){}}
function nativeMime(name){const n=String(name||'').toLowerCase();if(n.endsWith('.mkv'))return 'video/x-matroska';if(n.endsWith('.webm'))return 'video/webm';if(n.endsWith('.mov'))return 'video/quicktime';if(n.endsWith('.avi'))return 'video/x-msvideo';return 'video/mp4'}
function nativePlay(f){const nb=window.FEFCNative;if(!f||!nb)return false;const id=target(f),title=parse(f.name).raw||f.name||'Fan edit',file=f.name||'video.mp4';let sub='';try{const s=findSidecarSub(f);if(s)sub='/api/stream/'+encodeURIComponent(s.id)}catch(e){}
 quietForExternal();try{if(typeof nb.playVideoWithFile==='function'){nb.playVideoWithFile(id,title,file,sub);return true}if(typeof nb.playVideoWithOptions==='function'){nb.playVideoWithOptions(id,title,nativeMime(file),sub);return true}if(typeof nb.playVideo==='function'){nb.playVideo(id,title);return true}}catch(e){}return false}
function playDirect(url,title){
 S.ambience(false);S.click();
 document.body.classList.remove('shuf-player');$('#player').classList.remove('floating');
 $('#player').dataset.pid='';$('#player').dataset.file=title||'';$('#ptitle').textContent=title||'Verified file';
 delete $('#player').dataset.sub;delete $('#player').dataset.submime;
 $('#player').hidden=false;killVideo();
 const w=$('#player .pwrap');if(!w)return;
 const v=document.createElement('video');
 v.id='pvideo';v.controls=false;v.autoplay=true;v.playsInline=true;v.preload='auto';
 v.setAttribute('playsinline','');v.tabIndex=-1;v.style.objectFit=playerScaleMode();
 v.dataset.stream=url;v.src=url;w.classList.add('vid');w.appendChild(v);
 v.addEventListener('error',()=>{$('#ptitle').textContent=(title||'Verified file')+' — did not start in this browser'});
 const pp=v.play&&v.play();if(pp&&pp.catch)pp.catch(()=>{});
 ensurePlayerExtras();setPlayerScale(playerScaleMode());
}
function play(f){
 const E=episodes(f),pn=$('#pprev'),nx=$('#pnext');if(pn&&nx){const p0=E&&E.idx>0?E.eps[E.idx-1].f:null,n0=E&&E.idx>=0&&E.idx<E.eps.length-1?E.eps[E.idx+1].f:null;pn.hidden=!p0;nx.hidden=!n0;pn.dataset.to=p0?p0.id:'';nx.dataset.to=n0?n0.id:''}
 const id=target(f);try{window.UD&&UD.opened(f.id,f.name)}catch(e){}S.ambience(false);S.click();
 const isShuf=!!(window.__shufPlay||((!window.__shufFullscreen)&&sessionStorage.fefcShufScope));document.body.classList.toggle('shuf-player',isShuf);$('#player').classList.toggle('floating',isShuf);if(window.__shufFullscreen)window.__shufFullscreen=0;
 const sub=findSidecarSub(f);$('#player').dataset.pid=f.id;$('#player').dataset.file=f.name||'';$('#ptitle').textContent=parse(f.name).raw;$('#player').dataset.did=id;if(sub){$('#player').dataset.sub=sub.id;$('#player').dataset.submime=sub.mime||''}else{delete $('#player').dataset.sub;delete $('#player').dataset.submime}
 startStream(id,f&&f.name);$('#popen').href=`https://drive.google.com/file/d/${id}/view`;$('#player').hidden=false;ensurePlayerExtras();
}
/* ---------- EVENTS ---------- */
document.addEventListener('click',e=>{const br=e.target.closest('#brand');if(br){e.preventDefault();S.click();if(location.hash===''||location.hash==='#/home'||location.hash==='#'){showHome()}else{location.hash=''}return}const pe=e.target.closest('#pprev,#pnext');if(pe&&pe.dataset.to){S.click();history.replaceState({fefc:1},'','#/play/'+pe.dataset.to);route();return}const nav=e.target.closest('[data-nav]');if(nav){const k=nav.dataset.nav;if(k==='up')return back(parentHash());S.click();return go(k==='home'?'#/':'#/'+k)}
 const act=e.target.closest('[data-act]');if(act){const f=items.get($('#details').dataset.id);if(act.dataset.act==='ptplay'&&act.dataset.url){playDirect(act.dataset.url,$('#details .lc-title')?$('#details .lc-title').textContent:'Verified file');return}if(act.dataset.act==='back')return goBack();if(act.dataset.act==='vlc'){S.chirp(1);try{quietForExternal();const nb=window.FEFCNative;if(nb&&nb.openInVlc&&f)nb.openInVlc(target(f),parse(f.name).raw,f.name||'video.mp4')}catch(err){}return;}if(act.dataset.act==='drive'){S.chirp(1);try{const nb=window.FEFCNative;const did=target(f);if(nb&&typeof nb.openInDrive==='function'&&did){nb.openInDrive(did,parse(f.name).raw||f.name||'')}else{window.open('https://drive.google.com/file/d/'+did+'/view','_blank')}}catch(err){}return;}S.chirp(1);go('#/play/'+f.id);return}
 const t=e.target.closest('.ol-tile');if(t&&!t.dataset.genre&&!t.classList.contains('link')){if(t.dataset.rfhome){S.click();readFirst();return}if(t.dataset.sup){S.click();go('#/supportus');return}if(t.dataset.mainc){S.click();go(HUBH.main);return}const f=items.get(t.dataset.id);if(!f)return;if(f.pt){S.click();if(isFolder(f))go('#/folder/'+f.id);else{const d=$('#details');d.hidden=false;d.classList.remove('leaving');document.body.classList.add('details-open');d.innerHTML=(window.FEFCTesting&&FEFCTesting.detailsHTML(f,esc))||'';}return}if(isFolder(f)){S.click();go('#/folder/'+target(f))}else if(rfKind(f)){openDocTile(f)}else if(!isMedia(f)){S.click();window.open('https://drive.google.com/file/d/'+target(f)+'/view','_blank')}else go('#/edit/'+f.id)}});
let lastHover=null;document.addEventListener('pointerover',e=>{const t=e.target.closest('.ol-tile,.mi');if(t&&t!==lastHover){lastHover=t;S.move()}});
let _moveT=0;document.addEventListener('focusin',e=>{if(!e.target.matches('.ol-tile,.mi,#brand,.hb,.hint-btn,[data-nav],.gnr,.sortpill,.ml-btn,.ml-hist-tog,.sync-go,#ml-sync .mi'+(isTvEnv()?'':',.tk-i:not(.tk-dup)')))return;const tv=isTvEnv()||document.body.classList.contains('tv')||document.body.classList.contains('firetv');if(!tv){S.move();return}const now=Date.now();if(now-_moveT<90)return;_moveT=now;S.move()});
/* ---------- Semantic concept search (instant local fallback for concept queries like "Space Movies") ---------- */
const SEMANTIC_MAP = {
  space: ["star wars", "star trek", "interstellar", "2001", "alien", "dune", "spaceballs", "guardians of the galaxy", "martian", "gravity", "apollo", "serenity", "battlestar", "firefly", "solaris", "contact", "galaxy quest", "flash gordon", "stargate", "farscape", "babylon 5", "the expanse", "pitch black", "riddick", "event horizon", "armageddon", "deep impact", "silent running", "first man", "moon", "ad astra", "valerian", "fifth element", "the right stuff"],
  superhero: ["batman", "superman", "spider-man", "spiderman", "avengers", "iron man", "captain america", "thor", "x-men", "justice league", "hulk", "daredevil", "deadpool", "wolverine", "guardians of the galaxy", "black panther", "doctor strange", "aquaman", "wonder woman", "flash", "green lantern", "watchmen", "blade", "punisher", "spawn"],
  horror: ["halloween", "friday the 13th", "nightmare on elm", "evil dead", "scream", "shining", "chucky", "hellraiser", "exorcist", "texas chainsaw", "thing", "dracula", "frankenstein", "alien", "predator", "poltergeist", "conjuring", "insidious", "saw", "ring", "grudge", "babadook", "hereditary", "midsommar"],
  timetravel: ["back to the future", "terminator", "donnie darko", "tenet", "12 monkeys", "edge of tomorrow", "primer", "looper", "time machine", "groundhog day", "interstellar", "source code", "butterfly effect", "about time", "predestination"],
  comedy: ["airplane", "naked gun", "monty python", "austin powers", "spaceballs", "ghostbusters", "anchorman", "lebowski", "borat", "tropic thunder", "superbad", "step brothers", "dumb and dumber", "ace ventura", "mask", "liar liar", "billy madison", "happy gilmore", "waterboy", "big daddy"],
  action: ["die hard", "matrix", "john wick", "terminator", "predator", "mad max", "mission impossible", "fast and furious", "bourne", "robocop", "rambo", "rocky", "speed", "gladiator", "taken", "crank", "transporter", "equalizer"],
  fantasy: ["lord of the rings", "hobbit", "harry potter", "game of thrones", "willow", "conan", "chronicles of narnia", "wizard of oz", "neverending story", "dark crystal", "labyrinth", "pan's labyrinth", "excalibur", "princess bride"],
  mob: ["godfather", "goodfellas", "scarface", "casino", "sopranos", "irishman", "departed", "donnie brasco", "untouchables", "heat", "carlito's way", "miller's crossing"],
  western: ["good, the bad", "django", "unforgiven", "fistful of dollars", "magnificent seven", "tombstone", "true grit", "wild bunch", "once upon a time in the west", "butch cassidy", "deadwood", "hateful eight"]
};

function semanticSearch(q) {
  if (window.FEFCAttrs) {
    const recs = [];
    items.forEach(f => {
      if (isFolder(f) || !isVid(f)) return;
      const mm = (meta.map && meta.films && meta.films[meta.map[f.id] || meta.map[target(f)]]) || {};
      const people = []
        .concat(mm.director || [], (mm.cast || []).map(c => c && (c.name || c)), mm.editor || [])
        .filter(Boolean).join(' ');
      let path = (f.name || '');
      let c = f, n = 0;
      while (c && c.parent && n++ < 8) { c = items.get(c.parent); if (c && c.name) path += ' ' + c.name; }
      const notes = (mm.description || '') + ' ' + (mm.plot || '');
      recs.push({ id: f.id, blob: path + ' ' + notes, people: people + ' ' + path });
    });
    const hit = FEFCAttrs.search(q, recs);
    if (hit && hit.handled) {
      const by = new Map(recs.map(r => [r.id, r]));
      return hit.results.map(r => ({ item: items.get(r.id), why: r.why })).filter(x => x.item);
    }
  }
  const norm = (q || '').toLowerCase();
  const matchedKeywords = new Set();
  for (const [key, targets] of Object.entries(SEMANTIC_MAP)) {
    const re = new RegExp("\\b" + key + "\\b|\\b" + key + "s\\b|\\b" + key + " movies?\\b", "i");
    if (re.test(norm)) targets.forEach(t => matchedKeywords.add(t));
  }
  if (!matchedKeywords.size) return [];
  const results = [];
  const seen = new Set();
  const pathOf = f => {
    let s = (f.name || '').toLowerCase(), c = f, n = 0;
    while (c && c.parent && n++ < 8) {
      c = items.get(c.parent);
      if (c && c.name) s += ' ' + c.name.toLowerCase();
    }
    return s;
  };
  for (const item of items.values()) {
    if (isFolder(item)) continue;
    const full = pathOf(item);
    for (const kw of matchedKeywords) {
      if (full.includes(kw) && !seen.has(target(item))) {
        seen.add(target(item));
        results.push({ item, why: 'Vault match for ' + kw.replace(/\b\w/g, l => l.toUpperCase()) });
        break;
      }
    }
    if (results.length >= 100) break;
  }
  return results;
}

function searchPage(q){
  q=(q||'').trim();
  if(!q)return showHome();
  closeSpot(true);
  hideHome();
  cur='virtual';
  view='search';
  $('#crumb').textContent='Search: '+q;
  $('#arena').innerHTML='';
  status('');
  menu();
  $('#main').scrollTop=0;
  const qNorm=spNorm(q);
  const words=qNorm.split(/\s+/).filter(w=>w.length>1||qNorm.length<3);
  const hit=s=>words.every(w=>s.includes(w))||s.includes(qNorm);
  const idx=spBuild();
  const seen=new Set();
  const folds=[],vidsList=[];
  for(const r of idx){
    if(hit(r.n)||r.cn.some(c=>c.includes(qNorm))||r.dn.some(d=>d.includes(qNorm))){
      const k=target(r.f);
      if(!seen.has(k)){
        seen.add(k);
        if(r.fold)folds.push(r.f);else vidsList.push(r.f);
      }
    }
  }
  const sem=semanticSearch(q);
  sem.forEach(s=>{
    const k=target(s.item);
    if(!seen.has(k)){seen.add(k);vidsList.push(s.item)}
  });
  const CAP=LEAN()?600:Infinity,total=folds.length+vidsList.length,shown=[...folds,...vidsList].slice(0,CAP);
  render(shown,'Search: '+q,'home');
  $('#sec2').textContent=total+' result'+(total===1?'':'s')+' for “'+q+'”'+(total>shown.length?' · showing the first '+shown.length+', type more to narrow':'');
}

/* ---------- AI search (server-side Gemini via /api/ai-search; key never in the browser) ---------- */
let aiSeq=0;
async function aiSearch(q){q=(q||'').trim();if(!q)return;const my=++aiSeq;pageShell('Ask Fan Edit Optimus','Looking for: “'+q+'”');const g=$('#grid');g.className='sectioned';g.innerHTML=`<div class="opt-head"><img class="opt-av" src="assets/optimus.png" alt="" width="40" height="40"><div><b>Fan Edit Optimus</b><small>Powered by Fan Edit Optimus</small></div></div><div class="opt-chat"><img class="opt-av" src="assets/optimus.png" alt="" width="40" height="40"><div class="opt-bubble thinking"><span class="dots"><i></i><i></i><i></i></span> Searching the vault for “${esc(q)}”…</div></div>`;
 const showOptimus=(res,intro)=>{if(my!==aiSeq)return;$('#sec2').textContent=res.length+' picks from Fan Edit Optimus for “'+q+'”';g.innerHTML=`<div class="opt-head"><img class="opt-av" src="assets/optimus.png" alt="" width="40" height="40"><div><b>Fan Edit Optimus</b><small>Powered by Fan Edit Optimus</small></div></div><div class="opt-chat"><img class="opt-av" src="assets/optimus.png" alt="" width="40" height="40"><div class="opt-bubble">${esc(intro)}</div></div><div class="ol-div"><span>OPTIMUS PICKS</span><i></i><b>${res.length}</b></div><div class="sgrid vids ai-res">${res.map(x=>`<div class="ai-cell">${tile(x.f)}<p class="ai-why"><img src="assets/optimus.png" alt="" class="opt-mini">${esc(x.why)}</p></div>`).join('')}</div>`;g.querySelectorAll('.ol-tile').forEach(lazyArt)};
 try{const r=await fetch('/api/ai-search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({q:q.slice(0,200)})});if(!r.ok)throw 0;const j=await r.json();if(my!==aiSeq)return;
  const res=(j.results||[]).map(x=>({f:items.get(x.id),why:x.reason})).filter(x=>x.f);if(!res.length)throw 0;
  const intro=j.intro||`I found ${res.length} fan edit${res.length===1?'':'s'} for you!`;showOptimus(res,intro)}
 catch(e){if(my!==aiSeq)return;const sem=semanticSearch(q);if(sem.length){const picks=sem.slice(0,36).map(x=>({f:x.item,why:x.why}));showOptimus(picks,`I searched the vault for “${q}” and picked ${picks.length} fan edits for you! Text match only. Optimus (Gemini) did not answer this request.`)}else{$('#sec2').textContent='Text match only. Optimus (Gemini) did not answer.';searchPage(q)}}}
const looksLikeQuestion=q=>/\?$/.test(q)||q.trim().split(/\s+/).length>=3;
let qt;$('#q').readOnly=true;['focus','click'].forEach(ev=>$('#q').addEventListener(ev,e=>{if(spOpen())return;e.preventDefault();$('#q').blur();openSpot('')}));
setTimeout(sm2,0);
/* ---------- TV / D-PAD SPATIAL NAVIGATION ---------- */
function focSel(){const base='.priv-req,.priv-back,.sortpill,.bigplay,#details .ol-tile,#details .epbtn:not([disabled]),#rfclose,#rfdoc,.hb,.hint-btn,#brand,.mi,#ml-update,.ml-btn,.ml-hist-tog,#q,.ol-tile,#details .pill:not(.lab),#details a,#details .tv-scroll,#ml-sync .mi,.sync-go,#player .pill:not([hidden]),#ptap';return (isTvEnv()||document.body.classList.contains('tv')||document.body.classList.contains('firetv')||!!window.FEFCNative)?base:base+',.tk-i:not(.tk-dup)'}
function visible(el){const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden'}
function layer(){if(!$('#rfpanel').hidden)return $('#rfpanel');if(!$('#player').hidden)return $('#player');if(!$('#details').hidden)return $('#details');return $('#app')}
/* 0.8.18: cache rects once per move — avoid layout reads per candidate in the key handler. */
function move(dir){const t0=(window.__fefcKeyT0=performance.now());const L=layer(),els=[].slice.call(L.querySelectorAll(focSel())).filter(visible),a=document.activeElement;
 if(!a||!L.contains(a)||a===document.body||a===document.documentElement){if(recoverFocus(!$('#home').hidden))return;if(els[0])focusEl(els[0]);return}
 const rectOf=e=>{let r=e._fefcR;if(!r||e._fefcRFrame!==window.__fefcKeyFrame){r=e.getBoundingClientRect();e._fefcR=r;e._fefcRFrame=window.__fefcKeyFrame}return r};
 window.__fefcKeyFrame=(window.__fefcKeyFrame||0)+1;
 const r=rectOf(a),cx=r.left+r.width/2,cy=r.top+r.height/2;let best=null,bd=1e9;
 els.forEach(e=>{if(e===a)return;const q=rectOf(e),x=q.left+q.width/2,y=q.top+q.height/2,dx=x-cx,dy=y-cy;
  const ok=dir==='left'?q.right<=r.left+4:dir==='right'?q.left>=r.right-4:dir==='up'?q.bottom<=r.top+4:q.top>=r.bottom-4;if(!ok)return;
  const main=dir==='left'||dir==='right'?Math.abs(dx):Math.abs(dy),off=dir==='left'||dir==='right'?Math.abs(dy):Math.abs(dx),d=main+off*2.5;if(d<bd){bd=d;best=e}});
 if(best){focusEl(best);try{const ms=+(performance.now()-t0).toFixed(1);window.__fefcLastKeyMs=ms;if(ms>24)console.log('FEFC_KEY_LAT '+ms)}catch(e){}return}
  /* nothing below in the DOM yet: render the next batch of lazily-added tiles and retry (TV grids only keep a few screens rendered) */
  if(dir==='down'&&!mvRetry&&typeof drainOne==='function'&&document.body.classList.contains('tv')){mvRetry=1;let n=0;try{while(n++<3&&drainOne());}catch(e){}requestAnimationFrame(()=>{mvRetry=0;move(dir)})}}
let mvRetry=0;
function tvReveal(m,e){const R=x=>x&&x.getClientRects().length?x.getBoundingClientRect():null,r=e.getBoundingClientRect(),bar=R($('#bar')),hn=R($('#hints')),tk=R($('#ticker')),pad=Math.round(innerHeight*.025);
 let top=Math.max(m.getBoundingClientRect().top,bar?bar.bottom:0)+pad,bot=innerHeight-pad;if(hn)bot=Math.min(bot,hn.top-pad);if(tk)bot=Math.min(bot,tk.top-pad);
 if(r.height>bot-top||r.top<top)m.scrollTop+=r.top-top;else if(r.bottom>bot)m.scrollTop+=r.bottom-bot}
function focusEl(e){if(!e)return;try{e.focus({preventScroll:true})}catch(err){try{e.focus()}catch(_){}}if(!e.scrollIntoView)return;const m=e.closest&&e.closest('#main');if(m&&m.scrollHeight>m.clientHeight){tvReveal(m,e);try{e.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'})}catch(_){}return}try{e.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'})}catch(_){}}
let gbT=0;
function pulseHint(which){/* Fire TV: remote Back must light the Back control, never Home/#brand */
 const map={back:['#hints .hb-back','#menu .mi[data-nav="up"]'],home:['#hints .hb-home','#brand'],select:['#hints .hb-sel'],menu:['#hints .hb-search','#hints .hb-menu']};
 const sels=map[which]||[];sels.forEach(sel=>{document.querySelectorAll(sel).forEach(el=>{el.classList.add('pressed');clearTimeout(el._pulseT);el._pulseT=setTimeout(()=>el.classList.remove('pressed'),280)})})}
window.__fefcConsumeBack=function(){try{if(closeShufPick&&closeShufPick())return true}catch(e){}try{if(window.__fefcCloseSync&&document.body.classList.contains('sp-open')){window.__fefcCloseSync();return true}var sp=document.getElementById('syncpanel');if(sp&&!sp.hidden&&window.__fefcCloseSync){window.__fefcCloseSync();return true}}catch(e){}try{if(closeTvMenu&&closeTvMenu())return true}catch(e){}try{var am=document.querySelector('.acct-menu');if(am&&!am.hidden){am.hidden=true;return true}}catch(e){}try{if(typeof closeSpot==='function'&&document.body.classList.contains('sp-lock')){closeSpot();return true}}catch(e){}try{if(typeof rfDismiss==='function'&&!$('#rfpanel').hidden){rfDismiss();return true}}catch(e){}return false};
function goBack(){const nw=Date.now();if(nw-gbT<250)return;gbT=nw;try{pulseHint('back')}catch(e){}if(closeTvMenu()){S.back();return}S.back();if(!$('#rfpanel').hidden)return rfDismiss();if(!$('#player').hidden){const fb=window.__shufPrevHash||parentHash()||'#/';window.__shufPrevHash=null;closedFor=location.hash;closePlayer();return back(fb)}back(parentHash())}
document.addEventListener('keydown',e=>{const k=e.keyCode,inInput=e.target===$('#q');{const it=document.getElementById('intro');if(it&&(!it.classList.contains('done')||Date.now()-(window.__ie||0)<900))return}
 const dir={37:'left',38:'up',39:'right',40:'down'}[k];
 const shp=$('#shufpick');if(shp&&!shp.hidden){if(k===10009||k===461||k===27||(k===8&&!inInput)||e.key==='GoBack'||e.key==='BrowserBack'){e.preventDefault();closeShufPick();return}return}
 const tvm=$('#tvmenu');if(tvm&&!tvm.hidden){if(k===10009||k===461||k===27||(k===8&&!inInput)||e.key==='GoBack'||e.key==='BrowserBack'){e.preventDefault();closeTvMenu();return}
  if(k===38||k===40){e.preventDefault();const L=[].slice.call(tvm.querySelectorAll('.tvm-i:not([disabled])'));if(!L.length)return;let i=L.indexOf(document.activeElement);i=k===40?(i<0?0:Math.min(L.length-1,i+1)):(i<0?L.length-1:Math.max(0,i-1));L[i].focus({preventScroll:true});return}
  if((k===13||k===23)&&document.activeElement&&document.activeElement.matches('.tvm-i')){e.preventDefault();document.activeElement.click();return}return}
 if(dir&&!$('#rfpanel').hidden&&(k===38||k===40)){e.preventDefault();const w=$('.rf-scroll');if(w)w.scrollBy(0,k===40?220:-220);return}
 if(dir&&!(inInput&&(k===37||k===39))){e.preventDefault();S.unlock();move(dir);return}
 if(k===10009||k===461||k===27||(k===8&&!inInput)||e.key==='GoBack'||e.key==='BrowserBack'){e.preventDefault();goBack();return}
 if((k===13||k===23)&&document.activeElement&&document.activeElement.matches('.ol-tile,[data-act],[data-nav],[data-href],[data-ml],[data-sync],.ml-btn,.ml-hist-tog,.mi,.sync-go')){e.preventDefault();S.unlock();document.activeElement.click()}});
/* ---------- TV grid navigation, MODEL-BASED (not viewport geometry) ----------
   rows are rebuilt from DOM order + each grid's column count (computed track list) and offsetTop, so they never depend on what is on screen,
   on scroll position, or on whether the WebView skipped layout/paint of offscreen rows. Up from row N always goes to row N-1 (scrolled into view);
   the menu bar is reached only from the FIRST row of the page. Arrow keys are always preventDefault'ed on TV so the WebView's native focus search never runs. */
let tvGoalX=null;
function tvRows(){const boxes=['#grid','#arena'].map(s=>$(s)).filter(x=>x&&!x.hidden&&x.querySelector('.ol-tile,.sortpill,.ml-btn'));if(!boxes.length)return null;const c=boxes[0];
 const els=[].slice.call(c.querySelectorAll('.sortpill,.ol-tile,#na-more,#ml-update,.ml-btn,.ml-hist-tog,#ml-sync .mi,.sync-go')).filter(e=>!e.hidden&&!e.closest('[hidden]')&&getComputedStyle(e).display!=='none'),groups=new Map();
 els.forEach(e=>{const g=e.closest('.sgrid')||e.parentElement;if(!groups.has(g))groups.set(g,[]);groups.get(g).push(e)});
 const rows=[];groups.forEach((a,g)=>{const cs=getComputedStyle(g);if(cs.display==='grid'){let n=cs.gridTemplateColumns.split(/\s+/).filter(x=>x&&x!=='none'&&x!=='subgrid').length;n=Math.max(1,n||1);/* Guard: if track count looks absurd vs tile count, derive from first-row geometry. */if(n>a.length)n=a.length||1;if(a.length>1){const y0=a[0].offsetTop,first=a.filter(e=>Math.abs(e.offsetTop-y0)<Math.max(8,a[0].offsetHeight*.2));if(first.length>=2&&first.length<n)n=first.length}for(let i=0;i<a.length;i+=n)rows.push(a.slice(i,i+n))}
  else{/* geometry buckets large enough that uneven title heights stay one visual row */const by=[];a.forEach(e=>{const y=e.offsetTop||0;let row=by.find(r=>Math.abs(r.y-y)<Math.max(28,(e.offsetHeight||80)*.4));if(!row){row={y,els:[]};by.push(row)}row.els.push(e)});by.sort((p,q)=>p.y-q.y).forEach(r=>rows.push(r.els))}});
 return rows}
function tvGridNav(k,a){if(!a||!a.closest)return false;const cur=(a.matches&&a.matches('#ml-sync .mi,.sync-go')?a:null)||a.closest('.ol-tile,.sortpill,#na-more,#ml-update,.ml-btn,.ml-hist-tog,.sync-go');if(!cur)return false;let rows=tvRows();if(!rows||!rows.length)return false;
 /* Flat DOM order across rows — Left/Right always advance to the previous/next tile and wrap across row ends. */
 const flat=rows.reduce((acc,r)=>acc.concat(r),[]);
 let fi=flat.indexOf(cur);if(fi<0){/* tile not in model (stale layout): rebuild once */rows=tvRows()||rows;flat.length=0;rows.forEach(r=>r.forEach(e=>flat.push(e)));fi=flat.indexOf(cur);if(fi<0)return false}
 const cx=e=>e.offsetLeft+(e.offsetWidth||0)/2,nearest=(row,x)=>{let b=row[0],bd=1e9;row.forEach(e=>{const d=Math.abs(cx(e)-x);if(d<bd){bd=d;b=e}});return b};
 const find=()=>{for(let i=0;i<rows.length;i++){const j=rows[i].indexOf(cur);if(j>=0)return[i,j]}return null};
 if(k===37||k===39){const n=flat[fi+(k===39?1:-1)];if(!n)return false;/* edge of grid: let caller try geometric / menu */focusEl(n);tvGoalX=cx(n);tvEnsure(n);return true}
 let p=find();if(!p)return false;let[ri]=p;
 if(tvGoalX==null)tvGoalX=cx(cur);
 if(k===38){if(ri===0){tvGoalX=null;toMenu();return true}const t=nearest(rows[ri-1],tvGoalX);focusEl(t);tvEnsure(t);return true}
 if(ri>=rows.length-1&&typeof drainOne==='function'){let n=0,grew=true;try{while(grew&&n++<40){const before=document.querySelectorAll('#grid .ol-tile,#arena .ol-tile').length;grew=!!drainOne()&&document.querySelectorAll('#grid .ol-tile,#arena .ol-tile').length>before}}catch(er){}rows=tvRows()||rows;p=find();if(p)ri=p[0]}
 if(ri<rows.length-1){const t=nearest(rows[ri+1],tvGoalX);focusEl(t);tvEnsure(t);return true}return false}
/* belt and braces: after a vertical jump make sure the target really is inside the visible band of #main */
function tvEnsure(t){requestAnimationFrame(()=>{const m=$('#main');if(!m||!t.isConnected)return;const r=t.getBoundingClientRect(),bar=$('#bar').getBoundingClientRect();if(r.bottom<bar.bottom||r.top>innerHeight-10){m.scrollTop+=r.top-(bar.bottom+Math.round(innerHeight*.1))}})}
document.addEventListener('click',()=>{tvGoalX=null},true);
/* ---------- Top menu bar D-pad navigation (TV / keyboard) ---------- */
let lastTile=null,lastDet=null;
const barItems=()=>[].slice.call(document.querySelectorAll('#bar #brand,#bar .mi,#bar #tvq,#bar #q,#bar #aiq')).filter(x=>x.offsetParent&&!x.hidden&&getComputedStyle(x).display!=='none');
const menuCurrent=()=>{const L=barItems();const backBtn=document.querySelector('#menu .mi[data-nav="up"]');if(backBtn)return backBtn;const on=document.querySelector('#menu .mi.on');if(on)return on;const mi=L.find(x=>x.closest&&x.closest('#menu'));return mi||null};
const inBar=el=>el&&el.closest&&el.closest('#bar');
const pageVisible=()=>$('#player').hidden&&$('#bar').offsetHeight>0&&($('#home').hidden||!$('#details').hidden);
function toMenu(){const m=menuCurrent();if(m){focusEl(m);m.scrollIntoView({block:'nearest',inline:'center'});return true}return false}
function toGrid(){if(!$('#details').hidden){const t=(lastDet&&lastDet.isConnected&&lastDet.offsetParent)?lastDet:document.querySelector('#details .bigplay,#details [data-act="play"],#details .pill,#details .ol-tile,#details a.rr');if(t){focusEl(t);try{t.scrollIntoView({block:'nearest'})}catch(e){}return true}}
 /* Prefer last focused tile/control; on My List fall back to first list control (not Check for updates at bottom). */
 const t=(lastTile&&document.contains(lastTile)&&lastTile.offsetParent)?lastTile:document.querySelector('#arena .ol-tile,#grid .ol-tile,#grid .ml-btn,#grid .ml-hist-tog,#grid .sortpill,#ml-update');
 if(t){focusEl(t);try{t.scrollIntoView({block:'nearest'})}catch(e){}return true}return false}
/* true when some other focusable in scope sits above el (D-pad Up still has somewhere to go inside the page) */
function focusAbove(scope,el){if(!scope||!el||!el.getClientRects().length)return false;const r=el.getBoundingClientRect();return [].some.call(scope.querySelectorAll(focSel()),e=>{if(e===el||!e.getClientRects().length||getComputedStyle(e).visibility==='hidden')return false;const q=e.getBoundingClientRect();return q.width>0&&q.height>0&&q.bottom<=r.top+4})}
addEventListener('keydown',e=>{if(!pageVisible())return;const k=e.keyCode,a=document.activeElement,tv=document.body.classList.contains('tv');
 const back=k===10009||k===461||k===27||e.key==='GoBack'||e.key==='BrowserBack';
 if(a&&a.id==='q'){if(k===40||back){e.preventDefault();e.stopImmediatePropagation();a.blur();if(k===40)toGrid();else toMenu()}return}
 if(inBar(a)){const L=barItems(),i=L.indexOf(a);
  if(k===37||k===39){e.preventDefault();e.stopImmediatePropagation();const n=L[Math.max(0,Math.min(L.length-1,i+(k===39?1:-1)))];if(n){focusEl(n);n.scrollIntoView({block:'nearest',inline:'nearest'})}return}
  if(k===40){e.preventDefault();e.stopImmediatePropagation();toGrid();return}
  if(k===38){e.preventDefault();e.stopImmediatePropagation();return}
  if((k===13||k===23)&&(a.matches('button')||a.id==='brand'||a.closest&&a.closest('#brand'))){e.preventDefault();e.stopImmediatePropagation();S.unlock();(a.id==='brand'?a:a.closest('#brand')||a).click();return}
  return}
 /* Video details: Up from the topmost control moves into the top menu so those items can be selected. Other arrows stay inside the details page (the grid underneath is not the navigation model). */
 if(!$('#details').hidden&&a&&a.closest&&a.closest('#details')){
  if(k===38&&!focusAbove($('#details'),a)){e.preventDefault();e.stopImmediatePropagation();toMenu();return}
  if(k>=37&&k<=40){e.preventDefault();e.stopImmediatePropagation();
   /* 0.8.6: spatial D-pad inside details so File Info / side pills stay reachable; scroll focused into view */
   const els=[].slice.call($('#details').querySelectorAll(focSel())).filter(el=>el.offsetParent&&getComputedStyle(el).visibility!=='hidden'&&!el.disabled);
   if(!els.length)return;
   const cx=el=>{const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2,r}};
   const cur=els.includes(a)?a:(els.find(x=>x.contains&&x.contains(a))||els[0]);
   const C=cx(cur);let best=null,bd=1e12;
   els.forEach(el=>{if(el===cur)return;const P=cx(el);const dx=P.x-C.x,dy=P.y-C.y;
    let ok=false;if(k===39)ok=dx>8&&Math.abs(dy)<=Math.abs(dx)+40;else if(k===37)ok=dx<-8&&Math.abs(dy)<=Math.abs(dx)+40;else if(k===40)ok=dy>8&&Math.abs(dx)<=Math.abs(dy)+80;else if(k===38)ok=dy<-8&&Math.abs(dx)<=Math.abs(dy)+80;
    if(!ok)return;const d=Math.hypot(dx,dy)+(k===40||k===38?Math.abs(dx)*.35:Math.abs(dy)*.35);if(d<bd){bd=d;best=el}});
   if(k===40&&best){const hop=els.filter(el=>el.classList.contains('tv-scroll')).reduce((pick,el)=>{const y=cx(el).y;if(y<=C.y+8||y>=cx(best).y-4)return pick;if(!pick||y<cx(pick).y)return el;return pick},null);if(hop)best=hop}
   /* 0.8.23: nothing reachable above (e.g. an off-screen/decorative focusable counted as 'above') -> top menu bar */
   if(k===38&&!best){toMenu();return}
   if(best){focusEl(best);try{best.scrollIntoView({block:'nearest',inline:'nearest'})}catch(err){}
    const body=$('#details .lc-body');if(body){const br=best.getBoundingClientRect(),bb=body.getBoundingClientRect();if(br.bottom>bb.bottom-8)body.scrollTop+=br.bottom-bb.bottom+24;if(br.top<bb.top+8)body.scrollTop-=bb.top-br.top+24}
    /* 0.8.16: keep focused episode/season chip visible inside its own scroller */
    const epSc=best.closest&&best.closest('.seas,.eps.all,#lc-eps');
    if(epSc){const br=best.getBoundingClientRect(),sr=epSc.getBoundingClientRect();
     if(br.bottom>sr.bottom-6)epSc.scrollTop+=br.bottom-sr.bottom+12;if(br.top<sr.top+6)epSc.scrollTop-=sr.top-br.top+12;
     if(br.right>sr.right-6)epSc.scrollLeft+=br.right-sr.right+12;if(br.left<sr.left+6)epSc.scrollLeft-=sr.left-br.left+12}}
   return}}
 const tile=a&&a.closest&&a.closest('.ol-tile');if(tile)lastTile=tile;
 /* (C) Focused long-text block: Up/Down scroll ~1/3 viewport; at end move to next/prev focusable — never trap; Back untouched. */
 if(a&&a.classList&&a.classList.contains('tv-scroll')&&(k===38||k===40)){e.preventDefault();e.stopImmediatePropagation();
  const step=Math.max(80,Math.round(a.clientHeight/3));const before=a.scrollTop;
  if(k===40){a.scrollTop=Math.min(a.scrollHeight-a.clientHeight,a.scrollTop+step);if(a.scrollTop===before||a.scrollTop+a.clientHeight>=a.scrollHeight-2){const els=[].slice.call($('#details').querySelectorAll(focSel())).filter(el=>el.offsetParent&&!el.disabled);const i=els.indexOf(a);const n=els[i+1];if(n)focusEl(n)} }
  else{a.scrollTop=Math.max(0,a.scrollTop-step);if(a.scrollTop===before||a.scrollTop<=0){const els=[].slice.call($('#details').querySelectorAll(focSel())).filter(el=>el.offsetParent&&!el.disabled);const i=els.indexOf(a);const n=els[i-1];if(n)focusEl(n);else if(!focusAbove($('#details'),a))toMenu()}}
  return}
 const tvNav=tv||document.body.classList.contains('firetv')||(typeof isTvEnv==='function'&&isTvEnv());
 if(tvNav&&k>=37&&k<=40){e.preventDefault();if(tvGridNav(k,a)){e.stopImmediatePropagation();return}
  /* geometric fallback — must not drop the key when the model miss-fires */const dir={37:'left',38:'up',39:'right',40:'down'}[k];if(dir){move(dir);e.stopImmediatePropagation();return}}
 if(k===38&&tile){const r=tile.getBoundingClientRect(),above=[].slice.call(document.querySelectorAll('#arena .ol-tile,#grid .ol-tile,#grid .sortpill')).some(x=>x!==tile&&x.getClientRects().length&&x.getBoundingClientRect().bottom<=r.top+4);
  if(!above){e.preventDefault();e.stopImmediatePropagation();toMenu();return}}
 if(back&&tvNav&&$('#details').hidden&&$('#rfpanel').hidden&&tile){e.preventDefault();e.stopImmediatePropagation();try{pulseHint('back')}catch(err){}goBack();return}},true);
document.addEventListener('focusin',e=>{const t=e.target.closest&&e.target.closest('.ol-tile');if(t)lastTile=t;if(e.target.closest&&e.target.closest('#details')&&e.target.matches&&e.target.matches(focSel()))lastDet=e.target});
/* TV: search input becomes a 'Search' button that opens an on-screen search overlay */
(function(){const b=document.createElement('button');b.id='tvq';b.type='button';b.className='mi tv-only';b.innerHTML='<span class="tvq-row"><svg class="tvq-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.2" fill="none" stroke="currentColor" stroke-width="2"/><path stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M15.2 15.2L20 20"/></svg><span>Search</span></span>';$('#bar').insertBefore(b,$('#q'));b.onclick=()=>{S.click();openSpot('')}})();
/* ---------- Spotlight search: one box, instant local results + automatic Smart picks (AI) ---------- */
const OPT_SVG=`<div class="op-ph" aria-hidden="true"><div class="op-scene"><img class="op-watch" src="assets/optimus-watch.webp" alt="" decoding="async"><div class="op-screen"><div class="op-stars"></div><div class="op-ship s1"></div><div class="op-ship s2"></div><div class="op-laser"></div><div class="op-term"><b>&gt; SEARCH:</b><i class="op-cur"></i></div></div><div class="op-kernel"><div class="op-corn-puff"></div></div><div class="op-screen-glow"></div><div class="op-type-hands"></div></div><b class="op-cue"></b></div>`;
let spKeyFn=null,spEl=null,spSeq=0,spT=null,spAiT=null,spMoodT=null,spIdx=null,spIdxN=-1,spSel=-1,spLastFocus=null;
const spOpen=()=>!!(spEl&&spEl.classList.contains('on'));
const spNorm=t=>(t||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
function spBuild(){if(spIdx&&spIdxN===items.size)return spIdx;spIdxN=items.size;const out=[];
 items.forEach(f=>{const fold=isFolder(f);if(!fold&&!isVid(f))return;const mm=meta.map&&meta.films&&meta.films[meta.map[f.id]||meta.map[target(f)]]||{};const p=parse(f.name);
  const cast=(mm.cast||[]).map(c=>c&&c.name||c).filter(Boolean),dir=[].concat(mm.director||[]).filter(Boolean);
  out.push({f,fold,n:spNorm(fold?f.name:p.raw+' '+(mm.title||'')),cast,dir,cn:cast.map(spNorm),dn:dir.map(spNorm),year:mm.year||p.year||''})});
 return spIdx=out}
function spThumb(f){if(isFolder(f)){const pp=people[target(f)];if(pp)return /^assets\/people\/[^/]+\.jpg$/.test(pp.url)?pp.url.replace('assets/people/','assets/people/t/'):pp.url;const t=fthumbs[target(f)];return t?(t.startsWith('assets/')?t:'https://drive.google.com/thumbnail?sz=w200&id='+t):''}const ps=posters[f.id]||posters[target(f)];return ps?ps.url:''}
function spLocal(q){const n=spNorm(q).trim();if(!n)return[];const words=n.split(/\s+/).filter(w=>w.length>1||n.length<3),idx=spBuild(),seenT=new Set();
 const hit=s=>words.every(w=>s.includes(w))||s.includes(n);
 const titles=[],cols=[],ppl=[],peopleHits={};
 for(const r of idx){if(r.fold){if(hit(r.n)){(people[target(r.f)]?ppl:cols).push({f:r.f,sub:people[target(r.f)]?(function(pp){const k=personKind(pp);return k==='ACTOR / DIRECTOR'?'Actor / Director':(k==='DIRECTOR'?'Director':'Actor')})(people[target(r.f)]):'Collection'})}continue}
  if(hit(r.n)){const k=target(r.f);if(!seenT.has(k)){seenT.add(k);titles.push({f:r.f,sub:r.year?String(r.year):'Fan edit'})}}
  r.cn.forEach((c,i)=>{if(n.length>2&&c.includes(n))(peopleHits[r.cast[i]]=peopleHits[r.cast[i]]||[]).push(r.f)});
  r.dn.forEach((c,i)=>{if(n.length>2&&c.includes(n))(peopleHits[r.dir[i]+' (director)']=peopleHits[r.dir[i]+' (director)']||[]).push(r.f)})}
 const byStart=(a,b)=>{const an=spNorm(isFolder(a.f)?a.f.name:parse(a.f.name).raw),bn=spNorm(isFolder(b.f)?b.f.name:parse(b.f.name).raw);return (bn.startsWith(n)-an.startsWith(n))||an.localeCompare(bn)};
 titles.sort(byStart);cols.sort(byStart);
 const castFilms=[];Object.keys(peopleHits).slice(0,4).forEach(nm=>peopleHits[nm].forEach(f=>{const k=target(f);if(!seenT.has(k)){seenT.add(k);castFilms.push({f,sub:'with '+nm.replace(' (director)','')+(/director\)$/.test(nm)?' (dir.)':'')})}}));
 const G=new Set();Object.keys(genreMap).forEach(k=>genreMap[k].genres.forEach(g=>G.add(g)));const gen=[...G].filter(g=>spNorm(g).includes(n)).map(g=>({genre:g,sub:'Genre'}));
 return [['Titles',titles.slice(0,8)],['Actors & Directors',ppl.slice(0,4).concat(castFilms.slice(0,6))],['Collections',cols.slice(0,5)],['Genres',gen.slice(0,4)]].filter(x=>x[1].length)}
const spNatural=q=>/\?/.test(q)||q.trim().split(/\s+/).length>=3||/\b(like|with|where|about|movies?|films?|edits?|similar|starring|featuring|without|who|what|which|something|funny|scary|best)\b/i.test(q);
function spRow(x,ai){const thumb=x.genre?'':spThumb(x.f),label=x.genre||(isFolder(x.f)?x.f.name:parse(x.f.name).raw);
 return `<button type="button" class="sp-it${ai?' ai':''}" ${x.genre?`data-g="${esc(x.genre)}"`:`data-id="${x.f.id}"`}><span class="sp-th${x.genre?' gn':''}">${thumb?`<img src="${esc(thumb)}" alt="" loading="lazy" decoding="async">`:(x.genre?'♦':isFolder(x.f)?'▦':'▶')}</span><span class="sp-tx"><b>${esc(label)}</b><small>${esc(x.sub||'')}</small></span></button>`}
function spMood(m,hold){clearTimeout(spMoodT);const o=spEl.querySelector('.sp-opt');const set=()=>{o.className='sp-opt m-'+m};if(o.dataset.lock&&Date.now()<+o.dataset.lock){spMoodT=setTimeout(set,+o.dataset.lock-Date.now())}else set();if(hold)o.dataset.lock=Date.now()+hold}
function spSay(t){spEl.querySelector('.sp-say').textContent=t}
function triggerStarshipEasterEgg(){
 let ship=document.getElementById('starship-egg');
 if(!ship){
  ship=document.createElement('div');ship.id='starship-egg';
  ship.innerHTML=`<div class="starship-wrap"><div class="starship-body"><div class="ss-nose"></div><div class="ss-fins top"></div><div class="ss-barrel"></div><div class="ss-fins bot"></div><div class="ss-flame"><div class="ss-core"></div><div class="ss-trail"></div></div></div><div class="ss-text">🚀 STARSHIP FLIGHT TEST • MECHAZILLA CATCH READY 🦾</div></div>`;
  document.body.appendChild(ship);
 }
 ship.classList.remove('launch');void ship.offsetWidth;ship.classList.add('launch');
 if(window.S&&S.open)S.open();
 setTimeout(()=>{ship.classList.remove('launch')},4200);
}
function spMk(){spEl=document.createElement('div');spEl.id='spot';spEl.setAttribute('role','dialog');spEl.setAttribute('aria-label','Search');spEl.innerHTML=`<div class="sp-back"></div><div class="sp-panel"><div class="sp-top"><div class="sp-opt m-idle">${OPT_SVG}</div><div class="sp-in"><span class="sp-ic">⌕</span><input id="sp-q" type="search" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search" placeholder="Search titles, actors, genres… or just describe it"><span class="sp-say">Optimus is watching a fan edit. Type to interrupt him.</span></div></div><div class="sp-res" role="listbox"></div><div class="sp-hint"><span>↑↓ move</span><span>↵ open</span><span>esc close</span></div></div>`;document.body.appendChild(spEl);
 const inp=spEl.querySelector('#sp-q');
 spEl.querySelector('.sp-back').addEventListener('click',closeSpot);
 let typeT=null;
 const onKeyOrType=()=>{
  const o=spEl.querySelector('.sp-opt');
  if(!o)return;
  o.classList.add('typing');
  o.classList.remove('m-idle');
  const term=spEl.querySelector('.op-term b');
  if(term)term.textContent='> '+(inp.value.toUpperCase()||'SEARCH');
  clearTimeout(typeT);
  typeT=setTimeout(()=>{
    if(o){
      o.classList.remove('typing');
      if(!inp.value.trim())o.classList.add('m-idle');
    }
  },600);
 };
 inp.addEventListener('input',()=>{
  onKeyOrType();
  const q=inp.value;
  const o=spEl.querySelector('.sp-opt');
  const nq=q.trim().toLowerCase();
  const EE=window.FEFCEasterEggs||{};
  if(nq){
   if(/^(starship|spacex|ift|boca chica|super heavy)/i.test(nq)){
    spMood('yay');
    spSay('🚀 Starship Flight Test initiated! Catching Super Heavy with Mechazilla chopsticks!');
    triggerStarshipEasterEgg();
   }else if(/^(mechazilla|chopsticks)/i.test(nq)){
    spMood('yay');
    spSay('🦾 Mechazilla Chopsticks Catch initiated!');
    if(EE.triggerMechazilla)EE.triggerMechazilla();
   }else if(/^(plaid|ludicrous)/i.test(nq)){
    spMood('yay');
    spSay('⚡ Plaid Mode engaged! Accelerating from 0 to 60 in 1.99s. Autonomously indexing fan edits!');
    if(EE.triggerPlaidMode)EE.triggerPlaidMode();
   }else if(/^(cybertruck|armor glass|franz)/i.test(nq)){
    spMood('yay');
    spSay('🔨 Cybertruck Armor Glass Test! Franz: It didn\'t go through!');
    if(EE.triggerCybertruckTest)EE.triggerCybertruckTest();
   }else if(/^(fsd|autopilot|full self driving)/i.test(nq)){
    spMood('yay');
    spSay('🚗 Tesla FSD Autopilot engaged! Autonomous vault cruise active.');
    if(EE.toggleFSDMode)EE.toggleFSDMode();
   }else if(/^(boring|not a flamethrower|flamethrower)/i.test(nq)){
    spMood('yay');
    spSay('🔥 Not a Flamethrower active! Click anywhere to blast flames!');
    if(EE.toggleFlamethrower)EE.toggleFlamethrower();
   }else if(/^(tunnel|hyperloop)/i.test(nq)){
    spMood('yay');
    spSay('🚇 Boring Company Hyperloop tunnel engaged! 150 MPH underground.');
    if(EE.toggleTunnelMode)EE.toggleTunnelMode();
   }else if(/^(grok|xai|unhinged)/i.test(nq)){
    spMood('think');
    spSay('🤖 Grok mode enabled! Cosmic curiosity level: Maximum. Answer: 42.');
    if(window.FEFCGrok&&!FEFCGrok.isGrok)FEFCGrok.toggle();
   }else if(/^(42|dont panic|don't panic)/i.test(nq)){
    spMood('think');
    spSay('🪐 DON\'T PANIC. The Answer is 42.');
    if(EE.trigger42Terminal)EE.trigger42Terminal();
   }else if(/^(horn|fart|whoopee)/i.test(nq)){
    spSay('💨 Tesla Boombox deployed!');
    if(EE.triggerTeslaHorn)EE.triggerTeslaHorn();
   }else{
    spMood('think');
    spSay(window.FEFCGrok&&FEFCGrok.isGrok?`🤖 Grok: Searching “${q}”... Let's see what edits survive the cosmic filter.`:'Optimus is searching for “'+q+'”…');
   }
  }else{
   o.className='sp-opt m-idle';
   spSay('Optimus is watching a fan edit. Type to interrupt him.');
  }
  clearTimeout(spT);clearTimeout(spAiT);
  spT=setTimeout(()=>spRun(q),220);
 });
 spEl.addEventListener('click',e=>{const it=e.target.closest('.sp-it');if(it)spGo(it)});
 spKeyFn=e=>{
  const k=e.keyCode;e.stopPropagation();
  const L=[].slice.call(spEl.querySelectorAll('.sp-it'));
  if(e.key&&e.key.length===1&&!e.ctrlKey&&!e.metaKey){
   onKeyOrType();
  }
  if(k===27||k===10009||k===461||e.key==='GoBack'||e.key==='BrowserBack'){e.preventDefault();closeSpot();return}
  if(k===40||k===38){e.preventDefault();if(!L.length)return;spSel=k===40?Math.min(L.length-1,spSel+1):spSel-1;if(spSel<0){spSel=-1;inp.focus();spHi(L);return}spHi(L);L[spSel].focus({preventScroll:true});L[spSel].scrollIntoView({block:'nearest'});return}
  if(k===13){
   e.preventDefault();
   const a=document.activeElement&&document.activeElement.closest('.sp-it');
   if(a)return spGo(a);
   if(spSel>=0&&L[spSel])return spGo(L[spSel]);
   const q=inp.value.trim();
   if(!q&&document.activeElement===inp){spSoft();return}
   if(q){
    closeSpot(true);
    go('#/search/'+encodeURIComponent(q));
   }
   return;
  }
  if(document.activeElement!==inp&&e.key&&e.key.length===1){inp.focus()}
 };spEl.addEventListener('keydown',spKeyFn,false);
 {const q0=spEl.querySelector('#sp-q');q0.addEventListener('click',spSoft)}}
function spHi(L){L.forEach((x,i)=>x.classList.toggle('sel',i===spSel))}
function spGo(it){S.click();const g=it.dataset.g,f=it.dataset.id&&items.get(it.dataset.id);closeSpot(true);if(g)return go('#/genre/'+encodeURIComponent(g));if(!f)return;if(isFolder(f))go('#/folder/'+target(f));else go('#/edit/'+f.id)}
function spPaint(groups,smart){const R=spEl.querySelector('.sp-res');let h=groups.map(([t,L])=>`<div class="sp-g"><div class="sp-gh">${t}<i>${L.length}</i></div>${L.map(x=>spRow(x)).join('')}</div>`).join('');
 if(smart)h+=`<div class="sp-g sp-smart"><div class="sp-gh">✦ Smart picks from Optimus${smart.list?`<i>${smart.list.length}</i>`:''}</div>${smart.wait?'<div class="sp-wait"><span class="dots"><i></i><i></i><i></i></span> Optimus is scanning the vault…</div>':smart.list.length?smart.list.map(x=>spRow(x,1)).join(''):'<div class="sp-wait">No smart picks this time.</div>'}</div>`;
 R.innerHTML=h;spSel=-1;R.classList.toggle('has',!!h)}
function spRun(q){const my=++spSeq;q=q.trim();if(!q){spPaint([]);return}const groups=spLocal(q),n=groups.reduce((a,g)=>a+g[1].length,0),ai=spNatural(q)||n<3;
 spPaint(groups,ai?{wait:1}:null);
 if(!ai){spMood(n?'yay':'shrug',0);spSay(n?`Found ${n} match${n===1?'':'es'}!`:'Hmm, nothing for that.');return}
 spMood(n?'yay':'think');spSay(n?`${n} instant match${n===1?'':'es'}. Asking my smart circuits too…`:'Let me think about that…');
 spAiT=setTimeout(async()=>{if(my!==spSeq)return;spMood('think');try{const r=await fetch('/api/ai-search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({q:q.slice(0,200)})});if(!r.ok)throw 0;const j=await r.json();if(my!==spSeq)return;
   const local=new Set();groups.forEach(g=>g[1].forEach(x=>x.f&&local.add(target(x.f))));
   let list=(j.results||[]).map(x=>({f:items.get(x.id),sub:x.reason})).filter(x=>x.f&&!local.has(target(x.f))).slice(0,10);
   if(!list.length){const sem=semanticSearch(q);list=sem.map(x=>({f:x.item,sub:x.why})).filter(x=>x.f&&!local.has(target(x.f))).slice(0,10)}
   spPaint(groups,{list});
   const t=n+list.length;spMood(t?'yay':'shrug');spSay(t?(list.length?`I found ${list.length} smart pick${list.length===1?'':'s'} for you!`:`Found ${n} match${n===1?'':'es'}!`):'Hmm, nothing for that. Try other words?')}
  catch(e){if(my!==spSeq)return;const local=new Set();groups.forEach(g=>g[1].forEach(x=>x.f&&local.add(target(x.f))));const sem=semanticSearch(q);const list=sem.map(x=>({f:x.item,sub:x.why})).filter(x=>x.f&&!local.has(target(x.f))).slice(0,10);spPaint(groups,{list});const t=n+list.length;spMood(t?'yay':'shrug');spSay(t?(list.length?`I found ${list.length} smart pick${list.length===1?'':'s'} for you!`:`Found ${n} match${n===1?'':'es'}!`):'Hmm, nothing for that.')}},600)}
let spVV=null;
function spFit(){const v=window.visualViewport,r=document.documentElement.style;if(!v){r.setProperty('--vvh',innerHeight+'px');r.setProperty('--vvt','0px');return}r.setProperty('--vvh',Math.round(v.height)+'px');r.setProperty('--vvt',Math.round(v.offsetTop)+'px');r.setProperty('--vvl',Math.round(v.offsetLeft)+'px');r.setProperty('--vvw',Math.round(v.width)+'px')}
function spVVon(){spFit();if(window.visualViewport&&!spVV){spVV=()=>{spFit();if(spEl){const pn=spEl.querySelector('.sp-panel');if(pn&&(pn.scrollLeft||pn.scrollTop)){pn.scrollLeft=0;pn.scrollTop=0}}};visualViewport.addEventListener('resize',spVV);visualViewport.addEventListener('scroll',spVV)}}
function spVVoff(){if(window.visualViewport&&spVV){visualViewport.removeEventListener('resize',spVV);visualViewport.removeEventListener('scroll',spVV);spVV=null}}
function openSpot(q){if(!spEl)spMk();spVVon();spLastFocus=document.activeElement;const inp=spEl.querySelector('#sp-q');spEl.hidden=false;document.body.classList.add('sp-lock');requestAnimationFrame(()=>spEl.classList.add('on'));
 inp.value=q||'';spSeq++;clearTimeout(spAiT);spPaint([]);const o=spEl.querySelector('.sp-opt');o.dataset.lock=0;spMood('idle');spSay('Optimus is watching a fan edit. Type to interrupt him.');if(q){inp.dispatchEvent(new Event('input'))}
 [30,200,600].forEach(ms=>setTimeout(()=>{if(!spOpen())return;if(document.activeElement!==inp){try{inp.focus({preventScroll:true})}catch(e){inp.focus()}}spSoft()},ms))}
/* 0.8.23: ask the Fire TV WebView for its on-screen keyboard (retried on open; Select on an empty field reopens it) */
function spSoft(){try{const nb=window.FEFCNative;if(nb&&typeof nb.showSoftInput==='function')nb.showSoftInput()}catch(e){}}
/* 0.8.23: focus trap. While the search popup is open every key and every focus change stays inside it; Back closes it. Runs first (window capture) so no page handler behind the popup can move focus. */
addEventListener('keydown',e=>{if(!spOpen()||!spKeyFn)return;const inp=spEl.querySelector('#sp-q');e.stopImmediatePropagation();
 if(spEl.contains(e.target)){spKeyFn(e);return}
 const k=e.keyCode,back=k===27||k===10009||k===461||k===8||e.key==='GoBack'||e.key==='BrowserBack';
 e.preventDefault();if(back){closeSpot();return}try{inp.focus({preventScroll:true})}catch(_){}spKeyFn(e)},true);
document.addEventListener('focusin',e=>{if(!spOpen()||spEl.contains(e.target))return;const inp=spEl.querySelector('#sp-q');try{inp.focus({preventScroll:true})}catch(_){}},true);
function closeSpot(nav){if(!spOpen())return;spVVoff();spSeq++;clearTimeout(spT);clearTimeout(spAiT);spEl.classList.remove('on');document.body.classList.remove('sp-lock');const inp=spEl.querySelector('#sp-q');inp.blur();setTimeout(()=>{if(!spOpen())spEl.hidden=true},260);
 if(nav!==true&&spLastFocus&&document.contains(spLastFocus)&&spLastFocus.id!=='q'&&spLastFocus!==document.body){try{spLastFocus.focus({preventScroll:true})}catch(e){}}}
window.FEFCSpot={open:openSpot,close:closeSpot};

// focus first item after views open
const _render=render;render=function(){_render.apply(this,arguments);if(document.body.classList.contains('tv')){const t=document.querySelector('#arena .ol-tile,#grid .ol-tile');if(t)focusEl(t)}};
const _details=details;details=async function(){await _details.apply(this,arguments);const p=document.querySelector('#details .bigplay')||document.querySelector('#details [data-act="play"]');if(p){const id=$('#details').dataset.id;if(id&&window.UD&&!p.parentNode.querySelector('.star-btn')){const on=UD.isStarred(id);p.insertAdjacentHTML('afterend',`<button class="pill p4 star-btn${on?' on':''}" data-star="${id}" aria-pressed="${on}">${starLbl(on)}</button>`)}const B=document.body.classList,D=$('#details');if(B.contains('tv')||B.contains('kbd')){try{p.focus({preventScroll:true})}catch(e){p.focus()}}else if(document.activeElement&&D.contains(document.activeElement))document.activeElement.blur();D.scrollTop=0;D.querySelectorAll('.lc-body').forEach(x=>x.scrollTop=0)}};
const _play=play;play=function(f){S.ambience(false);_play(f);(()=>{let b=$('#pshuf');if(!b){b=document.createElement('button');b.id='pshuf';b.className='pill p6 shuf-again';b.innerHTML=SHUF_ICON+'Shuffle again';b.onclick=()=>shuffle(sessionStorage.fefcShufScope||'all');$('#popen').before(b)}let sc='';try{sc=sessionStorage.fefcShufScope||''}catch(e){}if(!window.__shufPlay){try{sessionStorage.removeItem('fefcShufScope')}catch(e){}sc=''}window.__shufPlay=0;b.hidden=!sc})();setTimeout(()=>{if($('#player').hidden)return;const pt=$('#ptap');if(document.body.classList.contains('tv')&&pt&&pt.offsetParent)focusEl(pt);else focusEl($('#back'))},50)};
if(isTvEnv())document.body.classList.add('tv');
/* Home version badge: Fire TV uses FEFCNative.version() (versionName); web uses /firetv/version.json (same SoT as the updater). */
const HOME_VER_FALLBACK='0.8.26';
function formatHomeVer(name){const n=String(name||'').trim();if(!n)return '';const base=n.replace(/\s*beta$/i,'').trim();return 'v'+base+' beta'}

function formatMlUpdVer(name,code){const n=String(name||'').trim();if(!n)return '';const base=n.replace(/^v/i,'').replace(/\s*beta$/i,'').trim();return 'v'+base}
function paintMlUpdVer(){const el=document.getElementById('ml-upd-ver');if(!el)return;let name='',code=null;
 try{const nb=window.FEFCNative;if(nb){if(typeof nb.version==='function'){const v=nb.version();if(v!=null&&String(v).trim()!=='')name=String(v).trim()}
  if(typeof nb.versionCode==='function'){const c=nb.versionCode();if(c!=null&&String(c).trim()!=='')code=c}}}catch(e){}
 if(!name){try{const hv=document.getElementById('home-ver');if(hv&&hv.dataset&&hv.dataset.ver)name=hv.dataset.ver}catch(e){}}
 if(!name)name=HOME_VER_FALLBACK;
 el.textContent=formatMlUpdVer(name,code);
 if(code!=null)el.title='versionCode '+code;else el.removeAttribute('title')}

function paintHomeVer(name){const el=$('#home-ver');if(!el)return;const label=formatHomeVer(name);if(label){el.textContent=label;el.dataset.ver=String(name||'')}}
function resolveHomeVer(){const el=$('#home-ver');if(!el)return;try{const nb=window.FEFCNative;if(nb&&typeof nb.version==='function'){const v=nb.version();if(v!=null&&String(v).trim()!==''){paintHomeVer(v);el.dataset.src='native';try{paintMlUpdVer()}catch(e){}return}}}catch(e){}
 if(!el.dataset.ver)paintHomeVer(HOME_VER_FALLBACK);
 if(el.dataset.src==='native'||resolveHomeVer._once)return;resolveHomeVer._once=1;
 tmo('firetv/version.json',8000).then(m=>{if(m&&m.versionName){paintHomeVer(m.versionName);try{paintMlUpdVer()}catch(e){}}}).catch(()=>{})}
resolveHomeVer();afterIntro(resolveHomeVer);


/* ---------- TV Menu popup (Fire TV 3-line control) ---------- */
let _tvMenuPrev=null;
function focusedMediaId(){const a=document.activeElement,t=a&&a.closest&&a.closest('.ol-tile');const id=t?t.dataset.id:(!$('#details').hidden?$('#details').dataset.id:null);return id||null}
function closeTvMenu(){const el=$('#tvmenu');if(!el||el.hidden)return false;el.hidden=true;el.setAttribute('aria-hidden','true');document.body.classList.remove('tvmenu-open');
  const prev=_tvMenuPrev;_tvMenuPrev=null;if(prev&&document.contains(prev))try{focusEl(prev)}catch(e){}return true}
function openTvMenu(){if(!document.body.classList.contains('tv')&&!document.body.classList.contains('firetv')){starFocused();return}
  let el=$('#tvmenu');
  if(!el){el=document.createElement('div');el.id='tvmenu';el.setAttribute('role','dialog');el.setAttribute('aria-label','Menu');
   el.innerHTML='<div class="tvm-box"><p class="tvm-h">Menu</p><button type="button" class="tvm-i" data-tm="star"></button><button type="button" class="tvm-i" data-tm="search"></button><button type="button" class="tvm-i" data-tm="mute"></button></div>';
   document.body.appendChild(el);
   el.addEventListener('click',e=>{const b=e.target.closest('[data-tm]');if(!b)return;const k=b.dataset.tm;S.click&&S.click();
    if(k==='star'){closeTvMenu();starFocused();return}
    if(k==='search'){closeTvMenu();doSearch();return}
    if(k==='mute'){doMute();paintTvMenu();try{b.focus({preventScroll:true})}catch(err){}return}});
  }
  _tvMenuPrev=document.activeElement;
  paintTvMenu();
  el.hidden=false;el.setAttribute('aria-hidden','false');document.body.classList.add('tvmenu-open');
  const first=el.querySelector('[data-tm="search"]')||el.querySelector('.tvm-i');if(first)try{first.focus({preventScroll:true})}catch(e){first.focus()}
}
function paintTvMenu(){const el=$('#tvmenu');if(!el)return;const id=focusedMediaId()||(_tvMenuPrev&&_tvMenuPrev.closest&&_tvMenuPrev.closest('.ol-tile')&&_tvMenuPrev.closest('.ol-tile').dataset.id)||($('#details').hidden?null:$('#details').dataset.id);
  const star=el.querySelector('[data-tm="star"]'),mute=el.querySelector('[data-tm="mute"]'),search=el.querySelector('[data-tm="search"]');
  let on=false;try{on=!!(id&&window.UD&&UD.isStarred(id))}catch(e){}
  const ST='<svg class="tvm-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2.6l2.7 6.5 7 .6-5.3 4.6 1.6 6.8L12 17.8 5.99 21.1l1.62-6.8L2.3 9.7l7-.6L12 2.6z"/></svg>',SO='<svg class="tvm-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M12 3.2l2.4 5.8 6.2.5-4.7 4.1 1.4 6-5.3-3.2-5.3 3.2 1.4-6-4.7-4.1 6.2-.5L12 3.2z"/></svg>',SE='<svg class="tvm-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.2" fill="none" stroke="currentColor" stroke-width="2"/><path stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M15.2 15.2L20 20"/></svg>',SK='<svg class="tvm-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 9v6h3.2L12 19V5L7.2 9H4zm11.5 3a3.5 3.5 0 00-1.1-2.55l1.2-1.2A5.2 5.2 0 0118.2 12a5.2 5.2 0 01-2.6 4.55l-1.2-1.2A3.5 3.5 0 0015.5 12z"/></svg>',SX='<svg class="tvm-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.9 8.9 0 003.69-1.81L19.73 21 21 19.73 4.27 3zM14 3.23v2.06c1.94.6 3.5 2.1 4.06 4.06h2.08C19.4 6.04 17 3.85 14 3.23zM12 5.5l-1.91 1.91L12 9.32V5.5z"/></svg>';
  const ico=(svg,lab)=>'<span class="tvm-row">'+svg+'<span class="tvm-lab">'+lab+'</span></span>';
  if(star){star.disabled=!id;star.innerHTML=ico(on?ST:SO,id?(on?'Unstar this item':'Star this item'):'Star (select a title first)');star.setAttribute('aria-disabled',id?'false':'true')}
  if(search)search.innerHTML=ico(SE,'Search');
  if(mute)mute.innerHTML=ico(S.muted?SX:SK,(S.muted?'Sound off':'Sound on')+' — tap to toggle')}
if(document.body.classList.contains('tv')&&(/AFT\w|FEFCFireTV|Fire TV/i.test(navigator.userAgent)||window.FEFCNative)){document.body.classList.add('firetv');
 /* Alexa Voice Remote Gen3: Back = left-curving U-turn ↩; Select = solid center in thin D-pad ring; Home glyph = FEFC logo. */
 const BK='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M15.2 7.2h-3.4c-3.1 0-5.6 2.4-5.6 5.4s2.5 5.4 5.6 5.4h6.2"/><path fill="currentColor" d="M15.05 4.55L11.2 7.35l3.85 2.8V4.55z"/></svg>',MN='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 6h18v2.2H3V6zm0 4.9h18v2.2H3v-2.2zM3 15.8h18V18H3z"/></svg>',SEL='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.85"/><circle cx="12" cy="12" r="4.35" fill="currentColor"/></svg>',HM='<img class="g-ftv-logo" src="assets/fefc-logo-carson.png" alt="" width="24" height="24" decoding="async">';
 const backI=document.querySelector('#hints .hb-back .g'),selI=document.querySelector('#hints .hb-sel .g'),homeI=document.querySelector('#hints .hb-home .g'),menuBtn=document.querySelector('#hints .hb-search'),menuI=menuBtn&&menuBtn.querySelector('.g');
 if(homeI){homeI.className='g g-ftv g-ftv-home';homeI.setAttribute('aria-hidden','true');homeI.innerHTML=HM}
 if(backI){backI.className='g g-ftv g-ftv-back';backI.setAttribute('aria-hidden','true');backI.innerHTML=BK}
 if(selI){selI.className='g g-ftv g-ftv-sel';selI.setAttribute('aria-hidden','true');selI.innerHTML=SEL}
 /* 3-line control opens Menu popup (Star / Search / Sound) — not star-direct. Performance mode removed 0.8.17 (tiers auto). Web keeps Y/S/M shortcuts. */
 if(menuBtn){menuBtn.classList.add('hb-menu');menuBtn.classList.remove('hb-star');menuBtn.dataset.hint='menu';menuBtn.setAttribute('aria-label','Menu');const lab=menuBtn.querySelector('span');if(lab)lab.textContent='Menu'}
 if(menuI){menuI.className='g g-ftv g-ftv-menu';menuI.setAttribute('aria-hidden','true');menuI.innerHTML=MN}
 try{sm2()}catch(e){}}
else if(document.body.classList.contains('tv')){try{sm2()}catch(e){}}
document.addEventListener('keydown',()=>document.body.classList.add('kbd'),{once:true});
/* ---------- BOOT ---------- */
intro();if(C.GOOGLE_API_KEY){live=true;}
afterIntro(()=>{tmo('data/folderthumbs.json',10000).then(m=>{fthumbs=m;document.querySelectorAll('#grid .ol-tile').forEach(el=>{const f=items.get(el.dataset.id);if(f&&isFolder(f)&&!el.querySelector('img')&&!el.classList.contains('rfhome'))art(el,f)})}).catch(()=>{})});
const reArt=()=>document.querySelectorAll('#grid .ol-tile,#arena .ol-tile').forEach(el=>{const f=items.get(el.dataset.id);if(!f)return;
 /* Always re-apply person photos even if a folderthumb img already painted (folderthumbs often loads before people.json). */
 if(isFolder(f)&&people[target(f)]){const id=f.id;el.outerHTML=tile(f);const n=document.querySelector('#grid [data-id="'+id+'"],#arena [data-id="'+id+'"]');n&&art(n,f);return}
 if(!el.querySelector('img'))art(el,f)});
afterIntro(()=>{tmo('data/posters.json',15000).then(m=>{posters=m;reArt()}).catch(()=>{});tmo('data/people.json',10000).then(m=>{people=m;reArt()}).catch(()=>{});});
const TVB=/Tizen|Web0S|webOS|SMART-TV|SmartTV|NetCast|AFT|CrKey|BRAVIA|Android TV|GoogleTV|Silk/i.test(navigator.userAgent)||!!P.get('tv');
/* On TV the big secondary JSON files (genres 0.5 MB, dates 1.6 MB, metadata 1.7 MB, details extras 3.7 MB) are fetched/parsed one after another after the hub is up, not all at once during startup. */
const later=(fn,ms)=>TVB?afterIntro(()=>setTimeout(fn,ms)):fn();
/* After native Home reveal: push non-critical work to idle a few seconds later so first paint stays smooth. */
const laterIdle=(fn,ms)=>{const kick=()=>{(window.requestIdleCallback||(f=>setTimeout(f,1)))(()=>fn(),{timeout:(ms|0)+8000})};
 const wait=()=>{if(document.body.classList.contains('native-waiting'))addEventListener('fefc-home-revealed',()=>setTimeout(kick,ms|0),{once:true});else setTimeout(kick,ms|0)};
 TVB||window.FEFCNative?afterIntro(wait):fn()};
/* Genres: Fire TV previously raced a 10s timeout vs local/network JSON and .catch(()=>{}) left genreMap={} → FEFCGenres hub stuck on "Loading genres…" forever. Load from bundled/local URL with a long TV timeout, retry once, and surface fail+retry UI. */
window.loadGenres=(force)=>{if(window._genresP&&!force)return window._genresP;const ms=isTvEnv()?60000:20000;const once=()=>tmo('data/genres.json',ms).then(g=>tmo('data/video-genres.json',ms).catch(()=>null).then(v=>{const o={};if(v&&v.sets&&v.ids)for(const id in v.ids)o[id]=v.sets[v.ids[id]];VG=o;return g})).then(g=>{GC=g.__collections||{};delete g.__collections;genreMap=g;try{if(window.FEFCGenres&&FEFCGenres.loaded)FEFCGenres.loaded()}catch(e){}softRefresh();return g});window._genresP=once().catch(e=>{console.warn('genres',e);return once()}).then(g=>{window._genresP=Promise.resolve(g);return g},e=>{window._genresP=null;try{if(window.FEFCGenres&&FEFCGenres.fail)FEFCGenres.fail(e&&e.message||e)}catch(err){}throw e});return window._genresP};
/* Genres/softRefresh deferred until a few seconds after Home reveal on Fire TV. */
laterIdle(()=>window.loadGenres(),isTvEnv()?3500:1500);
afterIntro(()=>{tmo('data/mosaic.json',10000).then(m=>{mosaicList=m;if(!$('#home').hidden)mosaic();else if(window.FEFCNative)setTimeout(()=>window.__fefcMarkHomeReady&&window.__fefcMarkHomeReady(),1500)}).catch(()=>{if(window.FEFCNative)window.__fefcMarkHomeReady&&window.__fefcMarkHomeReady()});});
laterIdle(()=>tmo('data/dates.json',15000).then(m=>{NA.dates=m;(window.requestIdleCallback||setTimeout)(()=>NA.top(rootVids()));softRefresh()}).catch(e=>console.warn(e)),4000);
laterIdle(()=>tmo('data/metadata.json',8000).then(m=>{meta=m;refreshOpenDetails()}).catch(e=>console.warn(e)),isTvEnv()?6000:800);laterIdle(()=>{const sx=document.createElement('script');sx.src='details-extra.js';sx.onload=()=>{if(window.FEX)FEX.ready.then(()=>refreshOpenDetails()).catch(()=>{})};document.head.appendChild(sx)},isTvEnv()?9000:1200);
/* 0.8.18: Do NOT prefetch/parse the 6.7MB index during native-waiting.
   Decompress+JSON.parse starved the main thread for tens of seconds on Fire TV —
   timers/evaluateJavascript stalled, body.native-waiting kept #home at opacity:0
   (blank blue: tagline+hints only). Hub tiles need no index; load catalog after
   first paint / reveal, then softRefresh counts in place. */
const idxMs=isTvEnv()?180000:30000;
const idxFetch=()=>tmo('data/index.json',idxMs).catch(e=>{console.warn('index retry',e);return tmo('data/index.json',idxMs)});
const startIndex=()=>idxFetch().then(async d=>{window._idx=d.items;window._links=d.links||window._links||null;if(!live){add(d.items);applyLinks(window._links);try{await (window.FEFCTesting&&FEFCTesting.mount(add))}catch(e){console.warn('testing',e)}if(!window._links){try{window._links=await tmo('data/links.json',30000);applyLinks(window._links)}catch(e){console.warn('links',e)}}else{tmo('data/links.json',30000).then(L=>{window._links=L;applyLinks(L);if(!document.body.classList.contains('native-waiting'))softRefresh()}).catch(e=>console.warn('links',e))}}if(d.partial!==false&&!live)tmo('data/index.interim.json',30000).then(x=>{add(x.items.filter(f=>!items.has(f.id)));applyLinks(window._links);window._idx=Array.from(items.values());if(!document.body.classList.contains('native-waiting'))softRefresh()}).catch(()=>{})}).catch(e=>{console.warn(e);status('Saved index unavailable')}).then(()=>{
 /* Index is in memory; paint hub behind intro. Defer softRefresh (genres counts etc.) until after reveal on Fire TV. */
 const paint=()=>{try{hub()}catch(e){}const mos=$('#mosaic');if(!window.__fefcHomePaintReady&&!(mos&&mos.querySelector('.mc')))setTimeout(()=>window.__fefcMarkHomeReady&&window.__fefcMarkHomeReady(),1200)};
 paint();
 const doSoft=()=>{(window.requestIdleCallback||setTimeout)(()=>softRefresh(),{timeout:5000})};
 if(document.body.classList.contains('native-waiting'))addEventListener('fefc-home-revealed',()=>setTimeout(doSoft,2500),{once:true});else softRefresh();
 if(P.get('focus')){setTimeout(()=>{document.body.classList.add('kbd');const t=document.querySelectorAll('.ol-tile,.hb')[+P.get('focus')];if(t)focusEl(t)},300)}
 const e=P.get('edit');if(e)go('#/edit/'+e);const pp=P.get('play');if(pp)go('#/play/'+pp);if(P.get('readfirst'))go('#/readfirst')});
afterIntro(()=>{
 const run=()=>startIndex();
 if(document.body.classList.contains('native-waiting')){
  const go=()=>setTimeout(run,400);
  if(window.__fefcHomePaintReady)go();
  else{addEventListener('fefc-home-revealed',go,{once:true});setTimeout(run,12000)}
 }else if(isTvEnv()){(window.requestIdleCallback||setTimeout)(run,{timeout:2500})}
 else run();
});
$('#back').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();goBack()});
$('#player').addEventListener('click',e=>{if(e.target.closest('#pclose')||(e.target.id==='player'&&!e.target.closest('.pcard'))){e.preventDefault();e.stopPropagation();goBack()}});
/* Idle-bug fix: never paint Home first when the hash already points at a folder/list —
   that + a later route() after index/links was the Home↔collection bounce. */
if(/^#\/(folder|all|arena|newarrivals|people|actors|directors|mylist|genres|genre|support|supportus|search|edit|play|readfirst)\b/.test(location.hash))route();
else showHome();
/* 0.8.18: if hub/mosaic still empty after 2.5s / 5s, force re-paint from whatever index is in memory (or empty counts) and clear native-waiting. */
(function fefcHomeWatchdog(){const kick=why=>{try{
  if(document.body.classList.contains('native-waiting')){console.warn('FEFC_HOME_WATCHDOG reveal',why);window.__fefcRevealHome&&window.__fefcRevealHome()}
  const home=$('#home'),hub=$('#hub'),mos=$('#mosaic');
  if(!home||home.hidden)return;
  const nHb=hub?hub.querySelectorAll('.hb').length:0;
  const nMc=(document.querySelectorAll('#hub .mc').length)||(mos?mos.querySelectorAll('.mc').length:0);
  if(nHb<9){console.warn('FEFC_HOME_WATCHDOG empty hub',why,'hb='+nHb);try{hub()}catch(e){}try{showHome(document.body.classList.contains('genres-mode'))}catch(e){}}
  else if(nMc<1&&(mosaicList&&mosaicList.length)){console.warn('FEFC_HOME_WATCHDOG empty mosaic',why,'nMc='+nMc);try{mosaic()}catch(e){}}else{try{console.log('FEFC_HOME_WATCHDOG ok',why,'hb='+nHb,'mc='+nMc)}catch(e){}}
  try{placeHeader()}catch(e){}
 }catch(e){console.warn('FEFC_HOME_WATCHDOG',e)}};
 setTimeout(()=>kick(2500),2500);setTimeout(()=>kick(5000),5000)})();
})();

/* ---------- INSTALL BUTTON (bottom legend bar only) ---------- */
(function(){const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||navigator.standalone===true;
 const ua=navigator.userAgent,ios=/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);
 const mk=(id,cls)=>{const b=document.createElement('button');b.id=id;b.type='button';b.className=cls;b.hidden=true;b.innerHTML='<i class="g g-inst">⤓</i>Install App';b.onclick=doInstall;return b};
 const hb=mk('hinstall','hint-btn inst-btn');/* bottom hint-bar button only; no install button in the top menu bar */
 const hints=document.getElementById('hints');if(hints)hints.appendChild(hb);
 const droid=/Android/i.test(ua)&&!document.body.classList.contains('tv');
 const upd=()=>{const ok=!isStandalone()&&!document.body.classList.contains('tv')&&(!!window.__bip||(ios&&!localStorage.fefcIosTipDone)||droid);hb.hidden=!ok;hb.setAttribute('aria-hidden',ok?'false':'true')};
 function doInstall(){if(window.__bip){const e=window.__bip;e.prompt();e.userChoice.then(c=>{if(c&&c.outcome==='accepted')window.__bip=null;upd()}).catch(()=>{});return}
  if(ios){const t=document.createElement('div');t.className='ios-tip';t.innerHTML='To install: tap <b>Share</b> <span class="ios-share">⬆︎</span> then <b>Add to Home Screen</b>.<button type="button">OK</button>';document.body.appendChild(t);t.querySelector('button').onclick=()=>t.remove();localStorage.fefcIosTipDone='1';upd();return}
  if(droid){const t=document.createElement('div');t.className='ios-tip';t.innerHTML='If Chrome shows neither <b>Install app</b> nor <b>Add to Home screen</b>: (1) Settings → Apps — uninstall any existing <b>FEFC</b> / <b>Collection</b> / <b>Fan Edit Fan Club</b> app; (2) open this URL in the real <b>Chrome</b> app (not a link preview / in-app browser); (3) try a normal (non-incognito) tab, or Incognito if a managed profile is interfering; (4) reload. Otherwise: ⋮ → Install app / Add to Home screen, or tap Install above.<button type="button">OK</button>';document.body.appendChild(t);t.querySelector('button').onclick=()=>t.remove()}}
 /* preventDefault keeps deferred.prompt() for our Install UI; Chrome ⋮ Install may hide while deferred.
   If BOTH Install and Add to Home screen are missing, Chrome likely already has a WebAPK for this origin/manifest id. */
addEventListener('beforeinstallprompt',e=>{e.preventDefault();window.__bip=e;upd()});
 addEventListener('appinstalled',()=>{window.__bip=null;upd()});matchMedia('(display-mode: standalone)').addEventListener&&matchMedia('(display-mode: standalone)').addEventListener('change',upd);upd()})();
/* ---------- INSTALL (PWA) ---------- */
(function(){const ua=navigator.userAgent,standalone=matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||navigator.standalone===true;
 const isTV=document.body.classList.contains('tv'),mobile=/Android|iPhone|iPad|iPod/i.test(ua)||(navigator.maxTouchPoints>1&&/Macintosh/.test(ua)&&'ontouchend' in document);
 const ios=/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1),snoozed=+localStorage.fefcInstallSnooze>Date.now();
 let deferred=null;const box=document.getElementById('install');
 /* Fire TV / Leanback / native shell: no SW. Auto controllerchange→reload was painting Home then
    route()-ing back into the collection (idle bounce). Web keeps SW but only reloads off TV. */
 const skipSW=isTV||!!window.FEFCNative||document.body.classList.contains('firetv')||/AFT|Android TV|GoogleTV|Silk/i.test(ua);
 if(skipSW&&'serviceWorker' in navigator){try{navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()));if(window.caches)caches.keys().then(ks=>ks.forEach(k=>caches.delete(k)))}catch(e){}}
 if('serviceWorker' in navigator&&location.protocol!=='file:'&&!skipSW){
  navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(reg=>{
    try{reg.update()}catch(e){}
    if(reg.waiting)try{reg.waiting.postMessage({type:'SKIP_WAITING'})}catch(e){}
    reg.addEventListener('updatefound',()=>{const w=reg.installing;if(!w)return;w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller){try{w.postMessage({type:'SKIP_WAITING'})}catch(e){}}})});
  }).catch(()=>{});
  let reloaded;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloaded)return;reloaded=1;try{location.reload()}catch(e){}});
 }
 const allowed=()=>(mobile||new URLSearchParams(location.search).get('installdemo'))&&!standalone&&!isTV&&!snoozed;
 function show(){if(!allowed()||!box.hidden)return;const go=document.getElementById('ins-go'),msg=document.getElementById('ins-msg');
  if(ios){msg.innerHTML='Tap <b>Share</b> <span class="ios-share">⬆︎</span> then <b>Add to Home Screen</b>.';go.hidden=true}
  else if(!deferred&&!new URLSearchParams(location.search).get('installdemo'))return;
  box.hidden=false;requestAnimationFrame(()=>box.classList.add('open'))}
 addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;if(document.body.classList.contains('intro-done'))setTimeout(show,800)});
 document.getElementById('ins-go').onclick=()=>{if(!deferred)return;deferred.prompt();deferred.userChoice.then(()=>{deferred=null;box.hidden=true})};
 document.getElementById('ins-no').onclick=()=>{localStorage.fefcInstallSnooze=Date.now()+7*864e5;box.hidden=true};
 const t=setInterval(()=>{if(document.body.classList.contains('intro-done')){clearInterval(t);setTimeout(show,1200)}},400)})();
/* clips.js also in index.html (defer); keep late inject as fallback if markup omitted */
(function(){let done=0;const inj=()=>{if(done||document.querySelector('script[src*="clips.js"]'))return;done=1;const s=document.createElement('script');s.src='clips.js?v='+(document.querySelector('script[src*="app.js?v="]')||{src:''}).src.split('v=')[1];s.async=true;document.body.appendChild(s)};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inj);else inj();addEventListener('load',inj)})();
;(function(){const sync=()=>{const d=!document.getElementById('details').hidden&&document.getElementById('player').hidden;const isShuf=document.body.classList.contains('shuf-player');document.body.classList.toggle('overlay',(!document.getElementById('details').hidden||!document.getElementById('player').hidden)&&!isShuf);document.body.classList.toggle('details-open',d);if(d||isShuf){const b=document.getElementById('bar');document.documentElement.style.setProperty('--barh',(b.offsetHeight||56)+'px');if(window.NA&&NA.menuHTML)try{menu()}catch(e){}}};const mo=new MutationObserver(sync);['details','player'].forEach(i=>mo.observe(document.getElementById(i),{attributes:true,attributeFilter:['hidden','class']}));sync()})();
addEventListener('load',()=>{const w=document.getElementById('wordmark');if(w)window.dispatchEvent(new Event('resize'))});

(()=>{const h=document.getElementById('hints'),pl=document.getElementById('player'),rf=document.getElementById('rfpanel'),up=()=>{if(h){const isShuf=document.body.classList.contains('shuf-player');h.style.display=(rf&&!rf.hidden)||(pl&&!pl.hidden&&!isShuf)?'none':''}};if(window.MutationObserver)[pl,rf].forEach(x=>x&&new MutationObserver(up).observe(x,{attributes:true,attributeFilter:['hidden','class']}));up()})(); // one sound/legend control on every page, hidden in the player

/* keep tile subtitles inside their tiles: wrap at the dot, then shrink until nothing overflows */
function fitSmalls(){document.querySelectorAll('#hub .hb small,#grid.gnrs .gnr small').forEach(el=>{el.style.removeProperty('font-size');const p=el.parentElement;if(!p||!el.offsetWidth)return;
 const room=()=>{const r=el.getBoundingClientRect(),q=p.getBoundingClientRect();return el.scrollWidth<=el.clientWidth+1&&r.left>=q.left-1&&r.right<=q.right+1&&r.bottom<=q.bottom+1};let fs=parseFloat(getComputedStyle(el).fontSize),i=0;while(!room()&&fs>7&&i++<30){fs-=.5;el.style.setProperty('font-size',fs+'px','important')}})}
window.fitSmalls=fitSmalls;addEventListener('resize',()=>setTimeout(fitSmalls,60));new MutationObserver(()=>{clearTimeout(fitSmalls._t);fitSmalls._t=setTimeout(fitSmalls,80)}).observe(document.documentElement,{childList:true,subtree:true});
