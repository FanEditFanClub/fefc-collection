(()=>{
const tmo=(u,ms)=>Promise.race([fetch(u).then(r=>{if(!r.ok)throw Error(r.status);return r.json()}),new Promise((_,rj)=>setTimeout(()=>rj(Error('timeout '+u)),ms))]);
const C=window.FEFC_CONFIG||{},ROOT=C.ROOT_ID,FOLDER='application/vnd.google-apps.folder',SC='application/vnd.google-apps.shortcut',S=window.SFX;
const $=s=>document.querySelector(s),P=new URLSearchParams(location.search);
const HUES=[205,190,220,265,30,160,340,15];
let token=null,items=new Map(),kids=new Map(),meta={},cur=ROOT,live=false,view='home';
const hash=s=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))|0;return Math.abs(h)};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const isFolder=f=>f.mimeType===FOLDER||(f.mimeType===SC&&f.targetMime===FOLDER);
const target=f=>f.targetId||f.id;
function add(list){for(const f of list){items.set(f.id,f);const p=f.parent||ROOT;if(!kids.has(p))kids.set(p,[]);const a=kids.get(p);if(!a.some(x=>x.id===f.id))a.push(f)}}
function parse(n){const base=n.replace(/\.[a-z0-9]{2,4}$/i,'');const parts=base.split(' - ').map(s=>s.trim()).filter(s=>!/^fan edit$/i.test(s));
 return{title:parts.length>1?parts.slice(1).join(' · '):parts[0],series:parts.length>1?parts[0]:'',raw:base,film:parts[0].replace(/\s*\(\d{4}\)\s*/,''),year:(base.match(/\((\d{4})\)/)||[])[1]}}
const sz=b=>b?(b/1e9).toFixed(2)+' GB':'';
/* ---------- INTRO ---------- */
(function(){var d=document.createElement('div').style;if(!('perspective' in d||'webkitPerspective' in d))document.documentElement.classList.add('no3d')})();
function intro(){requestAnimationFrame(placeHeader);const wmi=document.getElementById('wordmark');if(wmi&&!wmi.complete)wmi.addEventListener('load',placeHeader);const el=$('#intro');if(P.get('nointro')){el.remove();document.body.classList.add('intro-done','no-intro');return}
 const short=!!P.get('shortintro'),tv=document.body.classList.contains('tv')||/Tizen|Web0S|webOS|SMART-TV|SmartTV|NetCast|AFT|BRAVIA|Android TV|GoogleTV/i.test(navigator.userAgent);
 document.body.classList.add('cintro');const tg=$('#tagline');
 const lite=!tv&&(/iPhone|iPad|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1)||matchMedia('(prefers-reduced-motion: reduce)').matches||(navigator.hardwareConcurrency||8)<=4||!!P.get('lite'));if(lite)document.body.classList.add('lite');
 const R=window.FEFCIntro.create({tv,lite,tagline:tg});el.prepend(R.canvas);
 fetch('data/mosaic.json').then(r=>r.json()).then(m=>R.setTiles(m.map(x=>x.target||x.id))).catch(()=>{});
 try{S.loadIntro()}catch(e){}
 const fr=P.get('introframe');if(fr!==null){document.body.classList.add('frozen');el.querySelector('.ihint').hidden=true;const draw=()=>R.frame(+fr);draw();[300,1000,2000,3500].forEach(t=>setTimeout(draw,t));return}
 let done=false,raf=0,ia=null;const end=skipped=>{if(done)return;done=true;cancelAnimationFrame(raf);localStorage.fefcSeen='1';sndHint(false);if(skipped){S.introStop();if(ia){try{ia.pause()}catch(e){}}}
  tg.style.opacity='';tg.style.clipPath='';tg.style.visibility='';document.body.classList.remove('cintro');el.classList.add('done');document.body.classList.add('intro-done');window.__ie=Date.now();$('#home').classList.add('enter');setTimeout(()=>{S.ambience($('#player').hidden&&$('#details').hidden);el.remove()},skipped?600:1870)};
 let t0=performance.now(),last=0;const hint=el.querySelector('.ihint');let sndOn=false;
 const fd=[];let pn=0,dg=0;const loop=now=>{if(pn&&!dg){fd.push(now-pn);if(fd.length>12)fd.shift();if(fd.length>=3){const m=fd.slice().sort((a,b)=>a-b)[fd.length>>1];if(m>26&&R.degrade){dg=1;if(R.degrade())document.body.classList.add('lite')}}}pn=now;const r=(now-t0)/1000,s=short?R.mapC(r):R.mapF(r);last=r;R.frame(s);if(s>=24.2)return end(false);raf=requestAnimationFrame(loop)};
 const off=()=>(performance.now()-t0)/1000;
 const hEl=document.createElement('div');hEl.className='isnd';hEl.textContent='Click or press any key for sound';el.appendChild(hEl);
 function sndHint(on){hEl.classList.toggle('on',!!on)}
 const muted=()=>{try{return !!S.muted}catch(e){return false}};
 // (a) HTMLAudioElement path: may be allowed by media-engagement even when the AudioContext is suspended
 const tryEl=()=>{if(short||sndOn||done)return Promise.resolve(false);if(!ia){ia=window.__ia=new Audio(S.INTRO_MP3||'assets/intro.mp3');ia.preload='auto';}ia.muted=muted();try{ia.currentTime=Math.max(0,off())}catch(e){}
  const pr=ia.play();return (pr&&pr.then?pr:Promise.resolve()).then(()=>{if(sndOn&&sndOn!=='el'){ia.pause();return false}if(done){ia.pause();return false}sndOn='el';try{ia.currentTime=Math.max(0,off())}catch(e){}sndHint(false);return true},()=>false)};
 let st='suspended';try{S.unlock();st=S.state()}catch(e){}
 const go=()=>{if(sndOn||done)return;let s2='suspended';try{S.unlock();s2=S.state()}catch(e){}if(s2==='running'){if(ia&&!ia.paused)return;sndOn='ctx';sndHint(false);try{S.introSeq(short,Math.max(0,(performance.now()-t0)/1000-.05),()=>(performance.now()-t0)/1000)}catch(e){}}};
 if(st==='running'){sndOn='ctx';try{S.introSeq(short,0,()=>(performance.now()-t0)/1000)}catch(e){}}
 else{tryEl().then(ok=>{if(!ok&&!sndOn&&!done&&!short)sndHint(true)});const tick=setInterval(()=>{if(sndOn||done)return clearInterval(tick);go()},250);['pointerdown','touchstart','keydown','click'].forEach(ev=>addEventListener(ev,go,{capture:true,passive:true}))}
 R.frame(0);raf=requestAnimationFrame(loop);
 const sk=e=>{if(e.type==='keydown'&&e.repeat)return;if(!sndOn&&!short&&!done){/* (b) first press while blocked: start sound, don't skip */S.unlock();tryEl().then(ok=>{if(!ok)go()});setTimeout(go,60);e.stopPropagation&&e.stopPropagation();return}e.preventDefault&&e.preventDefault();e.stopPropagation&&e.stopPropagation();removeEventListener('keydown',sk,true);el.removeEventListener('pointerdown',sk);S.unlock();end(true)};
 setTimeout(()=>{if(!done){addEventListener('keydown',sk,true);el.addEventListener('pointerdown',sk)}},sndOn?250:0)}
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
function tile(f,live_){const fold=isFolder(f),p=parse(f.name),aud=!fold&&!isVid(f)&&isAud(f),vid=!fold&&(isVid(f)||aud),pp=fold&&people[target(f)];const cls=fold?(pp?'person':'fold'):vid?'vid':'doc';if(fold){const fid=target(f);if((fid===FOLD.collections||f.id===FOLD.collections)&&cur!==FOLD.collections)return `<button class="ol-tile fecc" data-id="${f.id}" data-fecc="1" aria-label="Fan Edit Collections"><span class="fecc-t">Fan Edit Collections</span><small class="fecc-c">${esc(countsLine(FOLD.collections)).replace(/ · /g,' <wbr>· ')}</small></button>`;if((fid===FOLD.tbc||f.id===FOLD.tbc)&&cur!==FOLD.tbc)return `<button class="ol-tile fecc fecc-tbc" data-id="${f.id}" data-fecc="1" aria-label="To Be Catalogued"><span class="fecc-t">To Be Catalogued</span><small class="fecc-c">${esc(countsLine(FOLD.tbc)).replace(/ · /g,' <wbr>· ')}</small></button>`}if(fold&&target(f)===ROOT&&f.parent===FOLD.collections)return `<button class="ol-tile mainc" data-id="${f.id}" data-mainc="1" aria-label="Main Collection"><img src="assets/fefc-logo.png" alt=""><small class="mc-l">Main Collection</small><small class="mc-c">${esc(countsLine(ROOT)).replace(/ · /g,' <wbr>· ')}</small></button>`;if(!fold&&!vid&&isSupportDoc(f))return `<button class="ol-tile sup" data-id="${f.id}" data-sup="1" aria-label="Support Us: Patreon, PayPal, Venmo"><span class="sup-t">Support Us</span><small class="sup-s">Patreon · <wbr>PayPal · <wbr>Venmo</small></button>`;const ad=cls==='doc'&&/^\s*\w{1,3}\s*-\s*support\b|support patreon|paypal\/venmo/i.test(f.name);return `<button class="ol-tile ${cls}${ad?' ad':''} ${live_?'live':''}" data-id="${f.id}" title="${esc(f.name)}"><div class="art" style="background:${artBg(f)}"></div><span class="kind">${live_?'NEW':pp?(pp.role==='director'?'DIRECTOR':'ACTOR'):fold?'':aud?'AUDIO':vid?'FAN EDIT':'DOCUMENT'}</span>${(fold||vid)?(()=>{const on=!!(window.UD&&UD.isStarred(f.id));return `<span class="star${on?' on':''}" data-star="${f.id}" role="button" aria-pressed="${on}" aria-label="${on?'Remove from My List':'Add to My List'}" title="${on?'Starred':'Star'} (S)">${on?'★':'☆'}</span>`})():''}${vid?`<div class="pcap ${(()=>{const n=p.raw.length;return n>90?'c4':n>55?'c3':n>30?'c2':'c1'})()}">${esc(p.raw)}</div>`:''}${fold&&typeof isDenied==='function'&&isDenied(target(f))?'<span class="lockb" title="Private library" aria-label="Private">🔒</span>':''}<div class="nm">${esc(fold?f.name:p.raw)}</div></button>`}
async function art(el,f){if(el.dataset&&el.dataset.fecc)return;if(!f||el.classList.contains('sup')||el.classList.contains('mainc'))return;let src=null;const p=parse(f.name);
 if(isFolder(f)&&people[target(f)])src=people[target(f)].url;else if(!isFolder(f)&&isMedia(f)){const ps=posters[f.id]||posters[target(f)]||(isAud(f)?(()=>{const sb=kids.get(f.parent)||[],pf=parse(f.name).film;for(const x of sb){const q=!isFolder(x)&&isVid(x)&&parse(x.name).film===pf&&(posters[x.id]||posters[target(x)]);if(q)return q}return null})():null);if(!ps)return;src=ps.url;el.classList.add('has-poster')}else
 if(isFolder(f)){const fid=target(f);let t=fthumbs[fid];if(!t){let q=[fid];for(let d=0;d<3&&!t&&q.length;d++){const nq=[];for(const id of q){const ks=kids.get(id)||[],v=ks.find(x=>!isFolder(x)&&isVid(x));if(v){t=target(v);break}ks.forEach(x=>{if(isFolder(x))nq.push(target(x))})}q=nq.slice(0,40)}}if(t)src=t.startsWith('assets/')?t:'https://drive.google.com/thumbnail?sz=w640&id='+t}
 else if(f.mimeType==='application/octet-stream'&&!f.targetId)src=null;else src=f.thumb?f.thumb.replace(/=s\d+$/,'=s640'):'https://drive.google.com/thumbnail?sz=w640&id='+target(f);
 if(!src){const r=await tmdbFind(isFolder(f)?f.name:p.film,p.year);if(r)src='https://image.tmdb.org/t/p/w780'+(r.backdrop_path||r.poster_path)}
 if(src){const im=new Image();im.alt='';im.referrerPolicy='no-referrer';im.onload=()=>{if(im.naturalWidth>40){const a=el.querySelector('.art');const pp=isFolder(f)&&people[target(f)];
  if(pp&&pp.fx!=null){const vis=Math.min(1,im.naturalWidth*9/16/im.naturalHeight),py=vis>=1?50:Math.max(0,Math.min(100,(pp.fy-vis/2)/(1-vis)*100));
   if(pp.fit==='contain'){const bg=new Image();bg.alt='';bg.className='pbg';bg.referrerPolicy='no-referrer';bg.src=src;bg.style.objectPosition='50% '+py+'%';(a||el).appendChild(bg);im.className='pfit'}else im.style.objectPosition=(pp.fx*100).toFixed(1)+'% '+py.toFixed(1)+'%'}
  a?a.appendChild(im):el.insertBefore(im,el.firstChild)}};im.src=src}}
/* ---------- ONLIVE HOME HUB ---------- */
const FOLD={readFirst:'1Aw4hr8uM3dsj_txpxPkEJxPDfNjmcYRT',collections:'1fEaxNbFIrEwKRygETVm4jgtJGVAqKxGB',tbc:'1503Wl56hzRppaIFcQisvQksOaeYOEjnk',actors:'1Jb0DtQC05fOdpiNg-O88fUpwI5ic3UHS',directors:'1u2B5d9cb1zAtrtdF_rA3eXhtcFgggSib'};
const SUPPORT=[{name:'Patreon',url:'https://www.patreon.com/cw/FanEditFanClub',sub:'From $1 / month',logo:'<svg viewBox="0 0 24 24"><circle cx="15" cy="9.5" r="6.5" fill="currentColor"/><rect x="3" y="3" width="3.6" height="18" fill="currentColor"/></svg>'},{name:'PayPal',url:'https://www.paypal.biz/faneditfanclub',sub:'One-time donation',logo:'<b>P</b>'},{name:'Venmo',url:'https://venmo.com/u/FanEditFanClub',sub:'@FanEditFanClub',logo:'<b>V</b>'}];
let posters={},people={},mosaicList=[],mosaicTimer=null,genreMap={},fthumbs={};
const GORDER=['Action','Sci-Fi','Horror','Comedy','Animation','Drama','Fantasy','Superhero','Thriller','Adventure','War','Western','Family','Musical','Documentary','Uncategorized'];
function topFolder(f){let x=f,guard=0;while(x&&x.parent&&x.parent!==ROOT&&guard++<30)x=items.get(x.parent);return x&&x.parent===ROOT?x.id:null}
function genresOf(f){const t=topFolder(f),g=t&&genreMap[t];return g?g.genres:['Uncategorized']}
function genreList(g){return vids().filter(f=>genresOf(f).indexOf(g)>=0)}
function genreStrip(){const have={};Object.keys(genreMap).forEach(k=>genreMap[k].genres.forEach(g=>have[g]=1));have.Uncategorized=1;
 $('#genres').innerHTML='<span class="glab">Genres</span>'+GORDER.filter(g=>have[g]).map(g=>`<button class="gt" data-genre="${g}">${g}</button>`).join('')}
document.addEventListener('click',e=>{const g=e.target.closest('[data-genre]');if(!g)return;S.click();go('#/genres/'+encodeURIComponent(g.dataset.genre))});
const allVids=()=>vids();let _vc=null,_vk=-1;function vids(){if(_vk!==items.size){_vk=items.size;_vc=Array.from(items.values()).filter(f=>!isFolder(f)&&isVid(f))}return _vc}
let _rvc=null,_rvk=-1;function rootVids(){if(_rvk!==items.size){_rvk=items.size;_rvc=Array.from(items.values()).filter(f=>!isFolder(f)&&isVid(f)&&(f.parent===ROOT||(!f.parent&&f.id!==ROOT)))}return _rvc}
const DOCX=/\.(pdf|docx?|txt|xlsx?|pptx?|url|html?|rtf|csv|md|webloc|lnk|json|xml|zip|rar|7z|jpe?g|png|gif|mp3|flac|wav|srt)$/i;
function isVid(f,d){if(!f)return false;if(f.kind)return f.kind==='video';/* resolved type stored by tools/classify.py */
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
function deepCounts(id){if(_dc[id]&&_dc[id].k===items.size&&_dc[id].d===!!NA.dates)return _dc[id];const noT=id===ROOT;let c=0,n=0,sz=0,nw='';const seen={},fs={},qd={},st=[id];while(st.length){const x=st.pop();if(seen[x])continue;seen[x]=1;(kids.get(x)||[]).forEach(f=>{if(noT&&underTBC(target(f)))return;if(isFolder(f)){const t=target(f);if(id!==ROOT&&t!==id&&(t===ROOT||Object.values(FOLD).includes(t)))return;if(!seen[t]&&!qd[t]){qd[t]=1;c++;st.push(t)}}else if(!JUNK.test(f.name||'')&&isVid(f)&&!fs[target(f)]){fs[target(f)]=1;const ck=vcanon(f);if(ck===null||fs['c:'+ck])return;fs['c:'+ck]=1;n++;sz+=f.size||0;const m=mdate(f);if(m>nw)nw=m}})}return _dc[id]={k:items.size,d:!!NA.dates,c,n,sz,nw}}
/* per-folder stats for sorting: own subtree only (real subfolders; folder shortcuts are not followed, so cross-links can't inflate counts) */
const _sc={};function sortCounts(id){const c=_sc[id];if(c&&c.k===items.size&&c.d===!!NA.dates)return c;let n=0,sz=0,nw='';const seen={},fs={},st=[id];while(st.length){const x=st.pop();if(seen[x])continue;seen[x]=1;(kids.get(x)||[]).forEach(f=>{if(isFolder(f)){const t=target(f);if(t===f.id&&!f.targetId&&(items.get(t)||f).parent===x&&t!==ROOT&&!Object.values(FOLD).includes(t))st.push(t)}else if(!JUNK.test(f.name||'')&&!fs[target(f)]){fs[target(f)]=1;n++;sz+=f.size||0;const m=mdate(f);if(m>nw)nw=m}})}return _sc[id]={k:items.size,d:!!NA.dates,n,sz,nw}}
const fmtN=n=>n.toLocaleString('en-US');
function countsLine(id){const d=deepCounts(id);return fmtN(d.c)+(d.c===1?' collection':' collections')+' · '+fmtN(d.n)+(d.n===1?' file':' files')}
/* Any Drive file link (details "Open in Drive" etc.) counts as opening the file: record it in History like Play */
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href*="drive.google.com"],a[href*="docs.google.com"]');if(!a||!window.UD)return;
 const m=a.href.match(/\/(?:file|document|spreadsheets|presentation)\/d\/([\w-]{20,})/)||a.href.match(/[?&]id=([\w-]{20,})/);if(!m)return;
 const id=m[1],f=[...(items.get(id)?[items.get(id)]:[])][0]||[...items.values()].find(x=>x.targetId===id),did=$('#details')&&!$('#details').hidden?$('#details').dataset.id:null,rec=(did&&(did===id||target(items.get(did)||{id:did})===id))?items.get(did):f;
 try{UD.opened(rec?rec.id:id,rec?rec.name:(a.title||a.textContent||'Drive file'))}catch(err){}},true);
function cnt(id){const k=kids.get(id);return k?k.length:0}
function hub(){if(document.body.classList.contains('genres-mode')&&window.FEFCGenres&&FEFCGenres.hub)return FEFCGenres.hub();const newN=NA.newCount(rootVids());
 const T=[['readfirst','Read First',''],['arena','New Arrivals',newN?newN+(newN===1?' New File':' New Files'):''],['support','Support Us','Patreon · PayPal · Venmo'],
  ['folder:'+FOLD.collections,'Fan Edit Collections',countsLine(FOLD.collections)],['main','',''],['folder:'+FOLD.tbc,'To Be Catalogued',countsLine(FOLD.tbc)],
  ['people','Actors\n&\nDirectors',NA.plural(peopleList().length,'Collection')],['mylist','My List','History & Starred'],['genres','Genres',(()=>{const h={};Object.keys(genreMap).forEach(x=>genreMap[x].genres.forEach(g=>h[g]=1));const n=GORDER.filter(g=>h[g]).length;return n?n+(n===1?' Genre':' Genres'):''})()]];
 const keep=[].slice.call(document.querySelectorAll('#hub .mc'));$('#hub').innerHTML=T.map((t,i)=>t[0]==='main'?`<button class="hb hb-logo" data-hub="main" aria-label="Main Collection"><img src="assets/fefc-logo.png" alt=""><small>Main Collection</small><small class="hb-cnt">${esc(countsLine(ROOT)).replace(/ · /g,' <wbr>· ')}</small></button>`
  :`<button class="hb" data-hub="${t[0]}">${t[0]==='mylist'?'<i class="hb-star" aria-hidden="true">★</i>':''}<span>${esc(t[1]).replace(/\n&amp;\n/,'<br><i class="amp">&amp;</i><br>').replace(/\n/g,'<br>')}</span>${t[2]?`<small>${esc(t[2]).replace(/ · /g,' <wbr>· ')}</small>`:''}</button>`).join('');keep.forEach(x=>$('#hub').appendChild(x))}
function syncTag(){placeHeader()}
/* Home/Genres header: one full row of 3 clip tiles above the text, text between that row and the 3x3 grid */
function placeHeader(){const tg=$('#tagline'),hb=$('#hub'),sp=$('#tagline span'),wm=$('#wordmark');if(!tg||!hb||!sp)return;
 const W=innerWidth,H=innerHeight;tg.style.fontSize='';if(wm)wm.style.height='';hb.style.width='';hb.style.top='';
 let natW=hb.offsetWidth||W*.6;const cs=getComputedStyle(tg),base=parseFloat(cs.fontSize)||20,wmH=wm?wm.offsetHeight:0;
 const g=parseFloat(getComputedStyle(hb).columnGap)||Math.min(W,H)*.014,s=Math.max(6,Math.min(14,H*.014)),top0=Math.max(4,H*.012);
 const hi=$('#hints'),hr=hi&&hi.offsetHeight?hi.getBoundingClientRect():null,bot=(hr&&hr.top>H*.5?H-hr.top+Math.max(6,H*.01):H*.08)+H*.035;
 const SW=w=>Math.round(H<520?Math.min(W*.9,Math.max(w,w*1.9)):w)+'px';let k=1,hw,h;for(let i=0;i<6;i++){sp.style.width=SW(hw||natW);sp.style.maxWidth='none';h=tg.offsetHeight;
  const hh=(H-top0-bot-2*s-h+2*g/3)*3/4;hw=Math.min(natW,hh*1.55,W*.94);sp.style.width=SW(hw);h=tg.offsetHeight;
  const hh2=(H-top0-bot-2*s-h+2*g/3)*3/4;hw=Math.min(natW,hh2*1.55,W*.94);if(hw>=natW*.86||k<=.62)break;
  k-=.08;tg.style.fontSize=(base*k).toFixed(1)+'px';if(wm&&wmH)wm.style.height=(wmH*k).toFixed(1)+'px'}
 sp.style.width=SW(hw);h=tg.offsetHeight;const hh=hw/1.55,th=(hh-2*g)/3,HR=$('#home').hidden?{top:0}:$('#home').getBoundingClientRect();
 const D=2*s+h;hb.style.width=Math.round(hw)+'px';hb.style.top=Math.round(top0+th+D+hh/2-HR.top)+'px';hb._hdr={D,s,h,top0};
 tg.style.top=Math.round(top0+th+s)+'px';fitHeader()}
/* correct for the 3D tilt: measure the real top-row bottom and grid top, keep the text centred between them */
function fitHeader(){const tg=$('#tagline'),hb=$('#hub');if(!tg||!hb||!hb._hdr)return;const row=[].slice.call(hb.querySelectorAll('.mc.toprow')),b=hb.querySelector('.hb');
 if(!row.length||!b||$('#home').hidden)return;const H=hb._hdr;let rb=Math.max(...row.map(c=>c.getBoundingClientRect().bottom)),gt=b.getBoundingClientRect().top,h=tg.offsetHeight;
 const need=h+2*Math.max(6,H.s*.7)-(gt-rb);if(need>1){H.D+=need*1.15;[].forEach.call(hb.querySelectorAll('.mc.above'),c=>c.style.top=c._top(H.D));[].forEach.call(hb.querySelectorAll('.mc.band'),c=>bandFit(c,H.D,hb._g||8));rb=Math.max(...row.map(c=>c.getBoundingClientRect().bottom))}
 tg.style.top=Math.round((rb+gt)/2-h/2)+'px';
 const sp=$('#tagline span'),wm=$('#wordmark'),tr=[];if(wm&&wm.offsetWidth)tr.push(wm.getBoundingClientRect());const gt2=document.querySelector('#tagline .gtitle');if(gt2&&gt2.offsetWidth)tr.push(gt2.getBoundingClientRect());if(sp){const rg=document.createRange();rg.selectNodeContents(sp);[].forEach.call(rg.getClientRects(),r=>r.width&&tr.push(r))}
 [].forEach.call(hb.querySelectorAll('.mc:not(.toprow)'),c=>{const r=c.getBoundingClientRect();c.style.visibility=tr.some(t=>r.left<t.right+8&&r.right>t.left-8&&r.top<t.bottom+4&&r.bottom>t.top-4)?'hidden':''})}
addEventListener('resize',()=>requestAnimationFrame(placeHeader));
addEventListener('resize',syncTag);
/* band tiles stay 16:9: fit inside the band slot (column width x band height), centred */
function bandFit(el,D,g){const sh=Math.max(0,D-2*g),tw=el._tw||0;let w=tw,h=tw*9/16;if(h>sh){h=sh;w=h*16/9}el.style.width=w+'px';el.style.height=h+'px';el.style.marginLeft=((tw-w)/2)+'px';el.style.top=(-(D-g)+(sh-h)/2)+'px'}
function mosaic(){syncTag();const M=$('#mosaic');const tv=document.body.classList.contains('tv');
 const n=tv?14:Math.max(10,Math.min(22,Math.round(innerWidth*innerHeight/60000)));
 let pool=mosaicList.length?mosaicList.slice():vids().slice(0,40).map(f=>({id:f.id,target:target(f),name:f.name}));
 M.innerHTML='';[].slice.call(document.querySelectorAll('#hub .mc')).forEach(x=>x.remove());const cells=[];
 // geometry: tiles sized like hub tiles, aligned to hub edges, only OUTSIDE the hub box and below the tagline
 const H=$('#home'),hb=$('#hub');const _tf=hb.style.transform;hb.style.transform='translate(-50%,-50%)';const W=H.clientWidth,Ht=H.clientHeight,HR=H.getBoundingClientRect(),BR=hb.getBoundingClientRect(),hw=BR.width,hh=BR.height;
 const hx=BR.left-HR.left,hy=BR.top-HR.top,g=parseFloat(getComputedStyle(hb).columnGap)||8;
 const tw=(hw-2*g)/3,th=(hh-2*g)/3;const hr=H.getBoundingClientRect(),tr=(()=>{const sp=$('#tagline span'),wm=$('#wordmark'),a=[];if(wm)a.push(wm.getBoundingClientRect());if(sp&&document.createRange){const rg=document.createRange();rg.selectNodeContents(sp);[].forEach.call(rg.getClientRects(),r=>a.push(r))}else if(sp)a.push(sp.getBoundingClientRect());a.splice(0,a.length,...a.filter(r=>r.width));if(!a.length)return null;const px=Math.max(16,innerWidth*.02);return {left:Math.min(...a.map(r=>r.left))-px,right:Math.max(...a.map(r=>r.right))+px,top:-1e9,bottom:Math.max(...a.map(r=>r.bottom))+6,height:1}})();
 const tb=tr?{l:tr.left-hr.left,t:-1e9,r:tr.right-hr.left,b:tr.bottom-hr.top}:null;
 hb.style.transform=_tf;const ov=(a,b)=>a.l<b.r&&a.r>b.l&&a.t<b.b&&a.b>b.t,hub={l:hx-g/2,t:hy-g/2,r:hx+hw+g/2,b:hy+hh+g/2};
 const cols=Math.ceil(hx/(tw+g))+1,rows=Math.ceil(hy/(th+g))+2;let budget=tv?40:90;
 for(let r=-rows;r<3+rows&&budget>0;r++)for(let c=-cols;c<3+cols&&budget>0;c++){
  const x=hx+c*(tw+g)+(c<0?-g:c>2?g:0),y=hy+r*(th+g)+(r<0?-g:r>2?g:0),box={l:x,t:y,r:x+tw,b:y+th};
  const toprow=r===-1&&c>=0&&c<=2,above=r<0,sh=above&&hb._hdr?Math.max(0,hb._hdr.D-2*g):0;if(above){box.t-=sh;box.b-=sh}if(box.r<-tw*.6||box.b<-th*.4||box.l>W+tw*.6||box.t>Ht+th*.6||ov(box,hub)||(!above&&tb&&ov(box,tb)))continue;
  const el=document.createElement('div');el.className='mc';const ex=(c<0?-g:c>2?g:0),ey=(r<0?-g:r>2?g:0);
  el.style.cssText=`left:calc(${c} * ((100% - ${2*g}px) / 3 + ${g}px) + ${ex}px);top:calc(${r} * ((100% - ${2*g}px) / 3 + ${g}px) + ${ey}px);width:calc((100% - ${2*g}px) / 3);height:calc((100% - ${2*g}px) / 3)`;
  if(above){if(toprow)el.classList.add('toprow');el.classList.add('above');el._top=D=>`calc(${r} * ((100% - ${2*g}px) / 3 + ${g}px) + ${ey}px - ${Math.max(0,D-2*g)}px)`;el.style.top=el._top((hb._hdr&&hb._hdr.D)||2*g)}
  el.style.height='auto';el.style.aspectRatio='16 / 9';el.style.marginTop=((th-tw*9/16)/2)+'px';
  el.innerHTML='<img class="mi1" alt="" referrerpolicy="no-referrer"><img class="mi2" alt="" referrerpolicy="no-referrer">';hb.appendChild(el);cells.push(el);budget--}
 // band beside the headline: fill its left/right sides with tiles (text area itself stays clear)
 if(hb._hdr){hb._g=g;const D=hb._hdr.D;let bb=12;for(let c=-cols;c<3+cols&&bb>0;c++){if(c>=0&&c<=2)continue;const ex=(c<0?-g:c>2?g:0),x=hx+c*(tw+g)+ex;if(x+tw<-tw*.6||x>W+tw*.6)continue;
  const el=document.createElement('div');el.className='mc band';el.style.cssText=`left:calc(${c} * ((100% - ${2*g}px) / 3 + ${g}px) + ${ex}px);width:calc((100% - ${2*g}px) / 3);top:${-(D-g)}px;height:${Math.max(0,D-2*g)}px`;el._tw=tw;bandFit(el,D,g);
  el.innerHTML='<img class="mi1" alt="" referrerpolicy="no-referrer"><img class="mi2" alt="" referrerpolicy="no-referrer">';hb.appendChild(el);cells.push(el);bb--}}
 const pick=()=>pool.length?pool[Math.floor(Math.random()*pool.length)]:null;
 const set=(c,first)=>{const v=pick(),layers=c.children,on=c._on?0:1;c._on=!c._on;const L=layers[on];
  if(v){L.src='https://drive.google.com/thumbnail?sz=w480&id='+v.target;c.dataset.id=v.id}else{c.style.background='radial-gradient(circle at 60% 30%,hsl('+(Math.random()*360|0)+' 70% 45%),#050a14 80%)'}
  L.style.animationName='none';void L.offsetWidth;L.style.animationName='';L.className=(on?'mi2':'mi1')+' kb'+(Math.random()*4|0);
  layers[on].style.opacity=1;layers[1-on].style.opacity=0};
 cells.forEach(c=>set(c,true));requestAnimationFrame(fitHeader);clearInterval(mosaicTimer);
 mosaicTimer=setInterval(()=>{if($('#home').hidden||document.hidden)return;const k=tv?1:2;for(let j=0;j<k;j++)set(cells[Math.random()*cells.length|0])},tv?3500:1800)}
let mosT;if(window.ResizeObserver)new ResizeObserver(()=>{clearTimeout(mosT);mosT=setTimeout(()=>{if(!$('#home').hidden)mosaic()},150)}).observe(document.getElementById('hub'));addEventListener('resize',()=>{clearTimeout(mosT);mosT=setTimeout(()=>{if(!$('#home').hidden)mosaic()},250)});
let homeHideTimer=null;
function showHome(gm){
 clearTimeout(homeHideTimer);
 const home=$('#home'),main=$('#main'),bar=$('#bar');
 home.classList.remove('leaving');main.classList.remove('entering');
 document.body.classList.toggle('genres-mode',!!gm);view=gm?'genres':'home';cur=ROOT;home.hidden=false;document.body.classList.add('at-home');main.hidden=true;bar.hidden=true;hub();const lay=()=>{const r=$('#hub').getBoundingClientRect(),k=Math.round(r.left)+'x'+Math.round(r.top)+'x'+Math.round(r.width);if($('#mosaic')._k!==k){$('#mosaic')._k=k;mosaic()}};requestAnimationFrame(lay);setTimeout(lay,500);setTimeout(lay,1500);if(document.fonts&&document.fonts.ready)document.fonts.ready.then(lay);
 setTimeout(()=>{if(document.body.classList.contains('kbd')||document.body.classList.contains('tv')){const t=$('.hb-logo')||$('#hub .hb:not(.gempty)');if(t)focusEl(t)}},30)}
function hideHome(){
 clearTimeout(homeHideTimer);
 document.body.classList.remove('at-home');
 const home=$('#home'),main=$('#main'),bar=$('#bar');
 if(!home.hidden){
  home.classList.add('leaving');
  main.hidden=false;
  main.classList.add('entering');
  bar.hidden=false;
  homeHideTimer=setTimeout(()=>{
   home.hidden=true;
   home.classList.remove('leaving');
   main.classList.remove('entering');
  },320);
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
 pageShell('Actors & Directors',NA.plural(L.length,'Collection'));const g=$('#grid');g.className='sectioned';g.innerHTML=secHTML('folds','ACTORS & DIRECTORS',L);g.querySelectorAll('.ol-tile').forEach(lazyArt)}
let mlSort=localStorage.fefcStarSort||'date';
function myListPage(){const U=window.UD;if(!U)return;const H=U.history(50).map(r=>items.get(r.id)).filter(Boolean);
 let St=U.stars().map(r=>({r,f:items.get(r.id)})).filter(x=>x.f);St.sort(mlSort==='az'?(a,b)=>a.f.name.localeCompare(b.f.name):(a,b)=>b.r.starredAt-a.r.starredAt);St=St.map(x=>x.f);
 pageShell('My List',`${NA.plural(St.length,'Starred')} · ${H.length} in history`.replace('Starreds','Starred'));const g=$('#grid');g.className='sectioned mylist';
 const vids_=a=>a.filter(f=>!isFolder(f)),fold_=a=>a.filter(isFolder);
 g.innerHTML='<div id="ml-sync"></div>'+secHTML('vids','HISTORY',H,H.length?'<button class="mi ml-btn" data-ml="clear">Clear history</button>':'')+(H.length?'':'<p class="ml-empty">Fan edits you open in the player show up here.</p>')
  +`<div class="ol-div"><span>STARRED</span><i></i><button class="mi ml-btn${mlSort==='date'?' on':''}" data-ml="date">Date starred</button><button class="mi ml-btn${mlSort==='az'?' on':''}" data-ml="az">A–Z</button><b>${St.length}</b></div>`
  +(St.length?(fold_(St).length?`<div class="sgrid folds">${fold_(St).map(f=>tile(f)).join('')}</div>`:'')+(vids_(St).length?`<div class="sgrid vids">${vids_(St).map(f=>tile(f)).join('')}</div>`:''):'<p class="ml-empty">Star fan edits and collections with ★ to keep them here.</p>')+'<footer class="ml-foot"><a href="privacy.html">Privacy</a> · <a href="terms.html">Terms</a></footer>';if(window.FEFCSync){const c=$('#ml-sync');c&&FEFCSync.subscribe&&0}
 g.querySelectorAll('.ol-tile').forEach(lazyArt)}
document.addEventListener('click',e=>{const b=e.target.closest('[data-ml]');if(!b)return;S.click();const k=b.dataset.ml;if(k==='clear'){if(confirm('Clear your watch history?'))UD.clearHistory()}else{mlSort=localStorage.fefcStarSort=k}myListPage()});
let starLast={};if(window.UD&&UD.subscribe)UD.subscribe(()=>requestAnimationFrame(()=>document.querySelectorAll('[data-star]').forEach(x=>{const on=UD.isStarred(x.dataset.star);if((x.getAttribute('aria-pressed')==='true')!==on)paintStars(x.dataset.star,on)})));
function starToast(t){let el=$('#startoast');if(!el){el=document.createElement('div');el.id='startoast';el.setAttribute('role','status');el.setAttribute('aria-live','polite');document.body.appendChild(el)}el.textContent=t;el.classList.remove('show');void el.offsetWidth;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),1600)}
function paintStars(id,on){document.querySelectorAll('[data-star="'+id+'"]').forEach(x=>{x.classList.toggle('on',on);x.setAttribute('aria-pressed',String(on));if(x.classList.contains('star')){x.textContent=on?'★':'☆';x.setAttribute('aria-label',on?'Remove from My List':'Add to My List');x.title=(on?'Starred':'Star')+' (S)';x.classList.remove('pop');void x.offsetWidth;x.classList.add('pop')}else if(x.classList.contains('star-btn'))x.textContent=on?'★ Starred':'☆ Star'})}
function toggleStarFor(id){if(!window.UD||!id)return;const t=Date.now();if(starLast[id]&&t-starLast[id]<250)return;starLast[id]=t;const f=items.get(id),on=UD.toggleStar(id,f&&f.name);S.chirp&&S.chirp(on?1:0);
 paintStars(id,on);starToast(on?'Added to My List':'Removed from My List');
 if(view!=='home'&&parseH()[0]==='mylist'&&!on)myListPage();if(!$('#home').hidden)hub()}
document.addEventListener('click',e=>{const st=e.target.closest('[data-star]');if(!st)return;e.preventDefault();e.stopPropagation();toggleStarFor(st.dataset.star)},true);
document.addEventListener('keydown',e=>{if(e.target&&/INPUT|TEXTAREA/.test(e.target.tagName))return;if(e.keyCode===83||e.keyCode===405||e.key==='ColorF2Yellow'){const a=document.activeElement,t=a&&a.closest&&a.closest('.ol-tile');const id=t?t.dataset.id:(!$('#details').hidden?$('#details').dataset.id:null);if(id&&(t?t.querySelector('[data-star]'):1)){e.preventDefault();toggleStarFor(id)}}});
function _x(){}
function hubGo(k){S.click();
 if(k==='main')return hideHome(),open(ROOT,'all');
 if(k==='arena'||k==='collections')return hideHome(),open(ROOT,k);
 if(k==='readfirst')return readFirst();
 if(k.indexOf('folder:')===0)return hideHome(),open(k.slice(7));
 if(k==='people')return go('#/people');
 if(k==='actors')return virtual([items.get(FOLD.actors)||{id:FOLD.actors,name:'Actors',mimeType:FOLDER},items.get(FOLD.directors)||{id:FOLD.directors,name:'Directors',mimeType:FOLDER}],'Actors & Directors');
 if(k==='search'){openSpot('');return}
 if(k==='genres'){showHome(true);if(window.FEFCGenres&&FEFCGenres.hub)FEFCGenres.hub({get genreMap(){return genreMap},order:GORDER,items,isVid,esc});return}
 if(k==='support'){hideHome();cur='virtual';view='folder';$('#crumb').textContent='Support Us';$('#arena').innerHTML='';$('#sec2').textContent='Thank you for supporting the collection';
  $('#grid').className='support-grid';$('#grid').innerHTML=SUPPORT.map(s=>`<a class="ol-tile link sup sup-${s.name.toLowerCase()}" href="${s.url}" target="_blank" rel="noopener" aria-label="${s.name} (opens in a new tab)"><span class="sup-logo">${s.logo}</span><span class="sup-nm">${s.name}</span><small>${s.sub}</small></a>`).join('');status('');menu()}}
const HUBH={main:'#/all',arena:'#/newarrivals',readfirst:'#/readfirst',genres:'#/genres',support:'#/supportus',people:'#/people',mylist:'#/mylist',search:'#/search'};
document.addEventListener('click',e=>{const h=e.target.closest('[data-hub]');if(!h)return;S.click();const k=h.dataset.hub;go(k.indexOf('folder:')===0?'#/folder/'+k.slice(7):HUBH[k]||'#/')});
document.addEventListener('pointerover',e=>{const h=e.target.closest('.hb');if(h&&h!==lastHub){lastHub=h;S.move()}});let lastHub=null;
function doSearch(){S.click();openSpot('')}
function doMute(){S.unlock();S.toggle();sm2()}
function sm2(){const l=$('#hmutel');if(l)l.textContent=S.muted?'Sound off':'Sound on';if($('#mute'))$('#mute').textContent=S.muted?'🔇':'🔊'}
let lastFocus=null;document.addEventListener('focusin',e=>{if(!e.target.closest('#hints'))lastFocus=e.target});
document.addEventListener('click',e=>{const h=e.target.closest('[data-hint]');if(!h)return;const k=h.dataset.hint;
 if(k==='search')return doSearch();if(k==='mute')return doMute();if(k==='home'){S.click&&S.click();return go('#/')}if(k==='back'){if(history.length>1&&location.hash&&location.hash!=='#/'){S.back();return history.back()}return goBack()}
 if(k==='select'){const t=lastFocus&&document.contains(lastFocus)&&lastFocus.matches('.ol-tile,[data-act],[data-nav],.hb,.pill,.sortpill,.bigplay,.mi')?lastFocus:null;if(t){S.unlock&&S.unlock();t.click()}}});
(function(){const B=document.body,u=()=>{const t=!B.classList.contains('tv')&&((window.matchMedia&&matchMedia('(pointer:coarse)').matches)||('ontouchstart' in window&&navigator.maxTouchPoints>0));B.classList.toggle('touch',t)};u();window.addEventListener('touchstart',()=>{if(!B.classList.contains('tv'))B.classList.add('touch')},{passive:true,once:true});if(window.matchMedia)try{matchMedia('(pointer:coarse)').addEventListener('change',u)}catch(e){}})();
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K')){e.preventDefault();doSearch();return}if(e.target&&/INPUT|TEXTAREA/.test(e.target.tagName))return;if(e.key==='y'||e.key==='Y'||e.key==='/'||e.keyCode===403){e.preventDefault();doSearch()}else if(e.key==='m'||e.key==='M'||e.keyCode===404){doMute()}});
const RF_DOC='https://docs.google.com/document/d/1KWjoQ-wDzkj1f97lHoe1H_o41V-IYCwXj48pamczPVk/preview';
function readFirst(){const p=$('#rfpanel'),d=$('#rfdoc');{const sp=p.querySelector('.rf-top span');if(sp)sp.textContent='Read First'}if(d&&d.dataset.src&&d.dataset.src!=='data/readfirst.html'){delete d.dataset.ok;d.dataset.src='data/readfirst.html'}if(d&&!d.dataset.ok){d.dataset.ok=1;fetch('data/readfirst.html').then(r=>{if(!r.ok)throw 0;return r.text()}).then(h=>{d.innerHTML=h}).catch(()=>{d.innerHTML='<iframe src="'+RF_DOC+'" title="Read First" style="width:100%;height:80vh;border:0;background:#fff"></iframe>'})}p.hidden=false;void p.offsetWidth;RFX.open(p);setTimeout(()=>focusEl($('#rfclose')),60)}
function closeRF(){const p=$('#rfpanel');if(p.hidden)return false;S.click();RFX.close(p,()=>{p.hidden=true;const t=document.querySelector('[data-hub="readfirst"]');if(t)focusEl(t)});return true}
$('#rfclose').onclick=()=>rfDismiss();
let rfInPlace=false;function rfDismiss(){if(rfInPlace){rfInPlace=false;closeRF()}else back('#/')}
$('#rfpanel').addEventListener('click',e=>{if(!e.target.closest('.rf-in'))rfDismiss()});
const RF_IDS={'1KWjoQ-wDzkj1f97lHoe1H_o41V-IYCwXj48pamczPVk':1};
function rfKind(f){if(!f||isFolder(f)||isMedia(f))return null;if(/support|patreon|paypal|venmo/i.test(f.name))return 'support';if(/\bread (first|me)\b/i.test(f.name))return 'readfirst';return null}
function openDocTile(f){const k=rfKind(f);if(k==='support'){S.click();go('#/supportus');return}const p=$('#rfpanel'),d=$('#rfdoc'),src='data/readfirst.html',ttl='Read First';
 const sp=p.querySelector('.rf-top span');if(sp)sp.textContent=ttl;if(d.dataset.src!==src){d.dataset.src=src;d.dataset.ok=1;d.innerHTML='';fetch(src).then(r=>{if(!r.ok)throw 0;return r.text()}).catch(()=>fetch('data/readfirst.html').then(r=>r.text())).then(h=>{d.innerHTML=h}).catch(()=>{})}
 rfInPlace=true;S.click();p.hidden=false;void p.offsetWidth;RFX.open(p);setTimeout(()=>focusEl($('#rfclose')),60)}
/* ---------- HASH ROUTER ---------- */
/* per-folder sound effects (data/folder-sfx.json: folder id or name -> files) */
let FSFX={};tmo('data/folder-sfx.json',10000).then(m=>{FSFX=m;const pre=()=>{Object.keys(m).forEach(k=>Array.isArray(m[k])&&S.loadFx&&S.loadFx(m[k]));(m._rules||[]).forEach(r=>{if(!S.loadFx)return;const V=Array.isArray(r.file)&&Array.isArray(r.file[0])?r.file:[r.files||(Array.isArray(r.file)?r.file:[r.file])];V.forEach(x=>S.loadFx(x))})};(window.requestIdleCallback||setTimeout)(pre,{timeout:4000})}).catch(()=>{});
let _lastSfxId=null,_lastSfxAt=0,_sandlerLast=-1,_cruiseLast=-1;
const DIR_IDS={'1eQuWxYXhHhE1j_as84WDDZDb-4BfvAPP':1,'1wUX7MQ6lUdz0xNvjUMpuB7VDia1cb1p4':1,'13ANvT9oxL6Voklf1qtJxwJZcFlUXzP-v':1,'1Pv0xjKKHMDrP7U_djiEDynT4Nmhn6fR2':1,'1Bj8vx-7styFpcsc6IQc8eWfefN4uNtGg':1,'1ZRwXWitDCwFVRQu3cgKvuisZItGH9R5o':1,'1Nrgv4vgoeqtBPiIt_7RZqVrvZeOQ7LjF':1,'1zzodzguDJ-9kbx6uGpDUlbgGdQvaC1el':1,'1XamnD6tgeL17vW3ecYEBez7iPOSFIY0t':1,'1yUwoHrLOcwR7CDE9Fx2Usu7V72zQSfNC':1};
function folderSfx(id){
 if(navBack||!id||id===ROOT)return;
 const now=Date.now();
 if(_lastSfxId===id&&(now-_lastSfxAt)<1200)return;
 _lastSfxId=id;_lastSfxAt=now;
 if(window.S&&S.unlock)try{S.unlock()}catch(e){}
 const f=items.get(id);let L=FSFX[id]||(f&&FSFX[f.name]);
 if(!L){
  const p=people[id]||(f&&(people[f.id]||people[f.targetId]));
  const pName=(p?(p.name+' '+(p.folder||'')):(f?f.name:'')).toLowerCase();
  const isDir=DIR_IDS[id]||(p&&p.role==='director')||(f&&f.parent===FOLD.directors)||/^(abrams|bay|cameron|emmerich|nolan|ritchie|scott|snyder|spielberg|verhoeven)$/i.test(f?f.name:'');
  let fullPath = pName;
  if(f){let c=f,g=0;while(c&&c.parent&&g++<15){c=items.get(c.parent);if(c&&c.name)fullPath+=' '+c.name.toLowerCase()}}
  if(/purr|purassic/i.test(fullPath)){
   L=['assets/sfx/cat-meow.m4a','assets/sfx/cat-meow.wav']
  }else if(fullPath.includes('jurassic')){
   L=['assets/sfx/trex-roar.mp3','assets/sfx/trex-roar.m4a']
  }else if(/carrey/i.test(pName)||id==='10AA5RFZKOrtyeALpY891WpIKTiqASZbZ'){
   L=['assets/sfx/bruce-almighty-beautiful.mp3']
  }else if(/cage/i.test(pName)||id==='19gM-ZhG481Xv3-z1-7BIrxRmPGSuMTBq'){
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
 if(!L&&f&&Array.isArray(FSFX._rules)){const names=[],ids=[];let c=f,n=0;while(c&&n++<30){names.push((c.name||'').toLowerCase());ids.push(c.id,c.targetId||'');c=items.get(c.parent)}
  const sc=[...items.values()].find(x=>x.targetId===id&&x.id!==id);if(sc)names.push((sc.name||'').toLowerCase());
  const r=FSFX._rules.find(r=>{if(r.ids&&r.ids.some(x=>x===id||(r.path!==false&&ids.indexOf(x)>=0)))return true;if(r.regex){let re;try{re=new RegExp(r.regex,'i')}catch(e){}if(re&&(r.path?names:names.slice(0,1)).some(x=>re.test(x)))return true}const q=(r.match||'').toLowerCase();return q&&(r.path?names:names.slice(0,1).concat(sc?[(sc.name||'').toLowerCase()]:[])).some(x=>x.includes(q))});if(r){if(Array.isArray(r.file)&&Array.isArray(r.file[0])){const V=r.file;let i=Math.random()*V.length|0;if(V.length>1&&i===r._last)i=(i+1+(Math.random()*(V.length-1)|0))%V.length;r._last=i;L=V[i]}else L=r.files||(Array.isArray(r.file)?r.file:[r.file])}}
 if(Array.isArray(L)&&S.fx)S.fx(L)}
addEventListener('hashchange',()=>{const m=location.hash.match(/^#\/folder\/([^/?]+)/);if(m&&!navBack)folderSfx(decodeURIComponent(m[1]))});
function go(h){const m=h.match(/^#\/folder\/([^/?]+)/);if(m)folderSfx(decodeURIComponent(m[1]));if(location.hash===h)return route();history.pushState({fefc:1},'',h);route()}
function back(fallback){S.back();navBack=true;const h=location.hash,fb=()=>{history.replaceState(null,'',fallback||'#/');route()};if(history.state&&history.state.fefc){history.back();setTimeout(()=>{if(location.hash===h)fb()},450)}else fb()}
function parentHash(){const r=parseH();if(r[0]==='play')return window.__shufPrevHash||(r[1]?'#/edit/'+encodeURIComponent(r[1]):'#/');if(r[0]==='edit'||r[0]==='readfirst'||r[0]==='search')return '#/';if(r[0]==='folder'){const f=items.get(r[1]);if(f&&(f.parent===FOLD.actors||f.parent===FOLD.directors))return '#/people';return f&&f.parent&&f.parent!==ROOT&&items.has(f.parent)?'#/folder/'+f.parent:(f&&f.parent===ROOT?'#/all':'#/')}if(r[0]==='genre')return '#/genres';if(r[0]==='genres'&&r[2])return '#/genres/'+encodeURIComponent(r[1]);if(r[0]==='genres'&&r[1])return '#/genres';return '#/'}
function parseH(){if(/^#\/arena/.test(location.hash))history.replaceState(history.state,'','#/newarrivals');return (location.hash.replace(/^#\/?newarrivals/,'#/arena').replace(/^#\/?/,'')||'').split('/').map(decodeURIComponent)}
function itemOr(id){return items.get(id)||{id:id,name:'Fan edit',mimeType:'video/mp4'}}
let baseKey=null;
function route(){const r=parseH(),k=r[0]||'';
 // overlays
 if(k!=='play'&&!$('#player').hidden){stopPlayerTimer();$('#player').hidden=true;killFrame();document.body.classList.remove('shuf-player');$('#player').classList.remove('floating');window.__shufPrevHash=null;if(started())S.ambience(true)}
 if(k!=='edit'&&k!=='play'&&!$('#details').hidden){$('#details').hidden=true;document.body.classList.remove('details-open')}
 if(k!=='readfirst')closeRF();
 if(k==='edit'){details(itemOr(r[1]),false);if(baseKey===null)renderBase('');return}
 if(k==='play'){if(baseKey===null)renderBase('');play(itemOr(r[1]));return}
 if(k==='readfirst'){if(baseKey===null||baseKey!=='')renderBase('');readFirst();return}
 renderBase(location.hash);if(view==='home'||k==='')S.ambience(true)}
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
window.addEventListener('popstate',()=>{S.back();navBack=true;route()});(window.requestIdleCallback||setTimeout)(()=>{try{S.loadFx(S.BACK)}catch(e){}},{timeout:3000});
if(P.get('debug'))window._fefc={items,kids,episodes:i=>episodes(items.get(i))};
/* ---------- DASHBOARD ---------- */
function status(t){$('#status').textContent=t}
function menu(){$('#menu').innerHTML=NA.menuHTML(FOLD,cur!==ROOT||!$('#details').hidden||parseH()[0]==='search'||parseH()[0]==='edit');const o=$('#menu .mi.on');o&&o.scrollIntoView&&o.scrollIntoView({block:'nearest',inline:'nearest'})}
const FIRST_TILES=36;let drainGen=0,artIO=null;
function lazyArt(el){if(!window.IntersectionObserver)return art(el,items.get(el.dataset.id));if(!artIO)artIO=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){artIO.unobserve(e.target);art(e.target,items.get(e.target.dataset.id))}}),{root:null,rootMargin:'800px 0px'});artIO.observe(el)}
function drain(Q,isNew){const gen=++drainGen,idle=window.requestIdleCallback?cb=>requestIdleCallback(cb,{timeout:400}):cb=>setTimeout(cb,30);let qi=0;
 const one=()=>{if(gen!==drainGen)return false;while(qi<Q.length&&!Q[qi].length)qi++;if(qi>=Q.length)return false;const box=document.querySelector('#grid .sgrid[data-q="'+qi+'"]');if(!box){qi++;return true}
  const part=Q[qi].splice(0,60),t=document.createElement('div');t.innerHTML=part.map(f=>tile(f,isNew[f.id])).join('');const fr=document.createDocumentFragment();const els=[].slice.call(t.children);els.forEach(e=>fr.appendChild(e));box.appendChild(fr);els.forEach(lazyArt);return true};
 drainOne=one;const step=()=>{if(one())idle(step)};setTimeout(()=>idle(step),700)}
/* ---------- scroll restoration ---------- */
let drainOne=()=>false,navBack=false;
const scrollKey=h=>'fefcScroll:'+(h||location.hash||'#/')+'|'+(window.FEFCSortKey||localStorage.fefcSort||'');
function saveScroll(id){try{const m=$('#main');if(!m||m.hidden)return;sessionStorage.setItem(scrollKey(),JSON.stringify({y:m.scrollTop,id:id||null}))}catch(e){}}
document.addEventListener('click',e=>{const t=e.target.closest&&e.target.closest('#grid .ol-tile,#arena .ol-tile');if(t&&!e.target.closest('[data-star]'))saveScroll(t.dataset.id)},true);

function restoreScroll(){const m=$('#main');if(!m)return;let rec=null;if(navBack){try{rec=JSON.parse(sessionStorage.getItem(scrollKey())||'null')}catch(e){}}navBack=false;
 if(!rec){m.scrollTop=0;return}
 const need=()=>m.scrollHeight<rec.y+m.clientHeight+40||(rec.id&&!document.querySelector('#grid [data-id="'+rec.id+'"]'));
 let guard=0;while(need()&&guard++<400){if(drainOne())continue;const more=document.getElementById('na-more');if(more&&!more.hidden&&more.offsetParent){more.onclick&&NA&&more.click();continue}break}
 const prev=m.style.scrollBehavior;m.style.scrollBehavior='auto';m.scrollTop=rec.y;m.style.scrollBehavior=prev;
 if(rec.id){const t=document.querySelector('#grid [data-id="'+rec.id+'"]');if(t){try{t.focus({preventScroll:true})}catch(e){t.focus()}if(document.body.classList.contains('kbd')||document.body.classList.contains('tv'))t.classList.add('ret')}}}
const CSORTS=[['az','Name A–Z'],['za','Name Z–A'],['added','Recently Added'],['updated','Recently Updated'],['files','Most Files'],['size','Largest']];
const csortGet=id=>{try{const v=localStorage.getItem('fefcSort:'+id);return CSORTS.some(x=>x[0]===v)?v:'az'}catch(e){return 'az'}};
function csortFn(k){const nat=(a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}),dc=f=>isFolder(f)?sortCounts(target(f)):{n:1,sz:f.size||0,nw:mdate(f)},own=mdate;
 const by=g=>(a,b)=>{const x=g(a),y=g(b);return x<y?1:x>y?-1:nat(a,b)};
 return k==='za'?(a,b)=>nat(b,a):k==='added'?by(f=>dc(f).nw||own(f)):k==='updated'?by(own):k==='files'?by(f=>dc(f).n):k==='size'?by(f=>dc(f).sz):nat}
/* sort a list but keep support-ad tiles in their A–Z slots */
function csortList(a,k,isAd){const az=a.slice().sort(csortFn('az'));if(k==='az')return az;const rest=az.filter(f=>!isAd(f)).sort(csortFn(k));return az.map(f=>isAd(f)?f:rest.shift())}
document.addEventListener('click',e=>{const b=e.target.closest('[data-csort]');if(!b)return;try{localStorage.setItem('fefcSort:'+b.closest('.sortbar').dataset.for,b.dataset.csort)}catch(_){}S.click&&S.click();const keep=b.dataset.csort;const sy=$('#main').scrollTop;open(cur,view==='folder'?'folder':view).then(()=>{$('#main').scrollTop=sy;const n=document.querySelector(`[data-csort="${keep}"]`);if(n&&document.body.classList.contains('tv'))focusEl(n)})});
/* ---------- GENRE PAGES: collection folders/franchises first, then loose edits (#/genres/<genre>[/<collection>]) ---------- */
let GC={};const _cv={};
function genreColls(G){return GC[G]||[]}
function collVids(c){const k=c.slug+'|'+items.size;if(_cv[k])return _cv[k];const fs={},seen={};c.folders.forEach(x=>fs[x]=1);const out=[];
 vids().forEach(f=>{const t=target(f);if(!seen[t]&&fs[topFolder(f)]){seen[t]=1;out.push(f)}});(c.extra||[]).forEach(id=>{const f=items.get(id);if(f&&!seen[target(f)]){seen[target(f)]=1;out.push(f)}});return _cv[k]=out}
function genrePage(G,slug){hideHome();cur='virtual';view='folder';const C=genreColls(G);
 if(slug){const c=C.find(x=>x.slug===slug);if(!c){if(!Object.keys(GC).length)return status('Loading…');return go('#/genres/'+encodeURIComponent(G))}
  window.__gscope='gc:'+G+'/'+slug;window.__gtitle=c.name;const fl=c.folders.map(x=>items.get(x)).filter(Boolean),vs=collVids(c).filter(f=>c.folders.indexOf(topFolder(f))<0);
  virtual(fl.concat(vs),c.name);const n=collVids(c).length;$('#sec2').textContent=G+' · '+NA.plural(c.folders.length,'folder')+' · '+fmtN(n)+' fan edit'+(n===1?'':'s');return}
 window.__gscope=G;window.__gtitle=G;$('#crumb').textContent=G;$('#arena').innerHTML='';
 const inColl={},big=C.filter(c=>collVids(c).length>=2);big.forEach(c=>collVids(c).forEach(f=>inColl[target(f)]=1));
 const seen={},loose=genreList(G).filter(f=>{const t=target(f);if(inColl[t]||seen[t])return false;return seen[t]=1}).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}));
 const ctile=c=>{const fid=c.folders[0],n=collVids(c).length;return tile({id:fid,targetId:fid,name:c.name,mimeType:FOLDER,parent:ROOT}).replace(/data-id="/,`data-gc="#/genres/${encodeURIComponent(G)}/${c.slug}" data-id="`).replace('COLLECTION',c.folders.length>1||(c.extra||[]).length?'FRANCHISE · '+fmtN(n):'COLLECTION · '+fmtN(n))};
 const Q=[loose.slice(FIRST_TILES)];
 $('#sec2').textContent=NA.plural(big.length,'collection')+' · '+fmtN(loose.length+Object.keys(inColl).length)+' fan edits';
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
 let gcs=null;if(/^gc:/.test(scope||'')){const m=scope.slice(3),i=m.indexOf('/'),c=genreColls(m.slice(0,i)).find(x=>x.slug===m.slice(i+1));gcs={};if(c)collVids(c).forEach(f=>gcs[target(f)]=1)}return vids().filter(f=>{const t=target(f);if(seen[t]||!SHUF.has(t))return false;if(scope&&scope!=='all'&&(gcs?!gcs[t]:genresOf(f).indexOf(scope)<0))return false;return seen[t]=1})}
function shufPick(scope){const pool=shufPool(scope);if(!pool.length)return null;let rec=[];try{rec=JSON.parse(localStorage.fefcShufRecent||'[]')}catch(e){}
 const fresh=pool.filter(f=>rec.indexOf(target(f))<0),from=fresh.length?fresh:pool,f=from[Math.floor(Math.random()*from.length)];
 rec.push(target(f));rec=rec.slice(-20);try{localStorage.fefcShufRecent=JSON.stringify(rec)}catch(e){}return f}
function shuffle(scope){const f=shufPick(scope);if(!f){status('Nothing to shuffle yet');return}const doWarp=()=>{try{sessionStorage.fefcShufScope=scope}catch(e){}if(!window.__shufPrevHash&&location.hash&&!/^#\/play\//.test(location.hash)){window.__shufPrevHash=location.hash}window.__shufPlay=1;const targetHash='#/play/'+encodeURIComponent(f.id);if(parseH()[0]==='play'){history.replaceState({fefc:1},'',targetHash);route()}else{go(targetHash)}};if(window.FEFCHotStage){window.FEFCHotStage(doWarp)}else{doWarp()}}
const shufBtn=scope=>`<button class="sortpill shuf-btn" data-shuffle="${esc(scope)}" title="Play a random fan edit">${SHUF_ICON}Shuffle Play</button>`;
document.addEventListener('click',e=>{const b=e.target.closest('[data-shuffle]');if(!b)return;e.preventDefault();S.unlock&&S.unlock();shuffle(b.dataset.shuffle)});
function render(list,title,mode){const fold=list.filter(isFolder).sort((a,b)=>a.name.localeCompare(b.name)),vids=list.filter(f=>!isFolder(f)).sort((a,b)=>a.name.localeCompare(b.name));
 $('#crumb').textContent=title;hideHome();
 $('#arena').innerHTML='';NA.top(rootVids());const isNew={};if(mode!=='collections')list.forEach(f=>{if(NA.isNew(f))isNew[f.id]=1});
 const all=mode==='arena'?vids:mode==='collections'?fold:[...fold,...vids];
 $('#sec2').textContent=mode==='arena'?'Every fan edit in the collection · newest first':(cur===ROOT||cur===FOLD.collections||cur===FOLD.tbc)?countsLine(cur):`${fold.length} collections · ${vids.length} fan edits`;
 const isAd=f=>!isVid(f)&&/^\s*\w{1,3}\s*-\s*support\b|support patreon|paypal\/venmo/i.test(f.name),nat=(a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}),docs=vids.filter(f=>!isVid(f)&&!isAd(f)),ck=mode==='arena'?'az':csortGet(cur),evs=csortList(vids.filter(f=>isVid(f)||isAd(f)),ck,isAd),Q=[],sec=(k,l,a)=>{if(!a.length)return '';const qi=Q.length;Q.push(a.slice(FIRST_TILES));return `<div class="ol-div"><span>${l}</span><i></i><b>${a.length}</b></div><div class="sgrid ${k}" data-q="${qi}">${a.slice(0,FIRST_TILES).map(f=>tile(f,isNew[f.id])).join('')}</div>`};
 const g=$('#grid');if(mode==='arena'){$('#arena').innerHTML='';NA.render(rootVids(),tile,art,i=>items.get(i),typeof shufBtn==='function'?shufBtn('newarrivals'):'')}else if(mode==='all'&&cur===ROOT){g.className='sectioned';sortedAll(fold,vids,g,typeof shufBtn==='function'?shufBtn('all'):'')}else{g.className='sectioned';const shs=cur===ROOT&&mode!=='collections'?'all':(cur===FOLD.collections||mode==='collections')?'collections':cur==='virtual'&&window.__gscope&&title===window.__gtitle?window.__gscope:'',sb=(list.length>1&&cur!=='virtual')||shs?`<div class="sortbar csort" role="toolbar" aria-label="Sort" data-for="${cur}">${shs?shufBtn(shs):''}${cur==='virtual'?'':CSORTS.map(([v,l])=>`<button class="sortpill${v===ck?' on':''}" data-csort="${v}" aria-pressed="${v===ck}">${l}</button>`).join('')}</div>`:'';const fsorted=csortList(fold,ck,isAd);g.innerHTML=sb+sec('folds','COLLECTIONS',fsorted.filter(f=>!people[target(f)]))+sec('folds','PEOPLE',fsorted.filter(f=>people[target(f)]))+(mode==='collections'?'':sec('vids','FAN EDITS',evs)+sec('docs','DOCUMENTS',docs))}
 document.querySelectorAll('#arena .ol-tile,#grid .ol-tile').forEach(lazyArt);if(mode!=='arena'&&!(mode==='all'&&cur===ROOT))drain(Q,isNew);
 status(all.length?'':(live?'Empty':'Nothing here yet'));menu();restoreScroll()}
/* ---------- private / not-shared folders: Request Access prompt (app-side only, no requests sent) ---------- */
const DENIED=new Set();let INACC=new Set();tmo('data/inaccessible.json',10000).then(j=>{INACC=new Set(j.ids||[]);document.querySelectorAll('.ol-tile.fold').forEach(el=>{const f=items.get(el.dataset.id);if(f&&isDenied(target(f))&&!el.querySelector('.lockb'))el.insertAdjacentHTML('beforeend','<span class="lockb" title="Private library" aria-label="Private">🔒</span>')})}).catch(()=>{});
function isDenied(id){return DENIED.has(id)||INACC.has(id)}
function privatePrompt(id,f){const g=$('#grid');if(!g)return;const own=f&&(f.owner||f.ownerName),url='https://drive.google.com/drive/folders/'+encodeURIComponent(id);g.className='sectioned';
 g.innerHTML=`<div class="priv"><div class="priv-box"><div class="priv-bar"><span>ACCESS RESTRICTED</span><i></i><b>🔒</b></div><h2>This library is private.</h2><p>Request access from the owner${own?` (<b>${esc(own)}</b>)`:''} to view it.</p><div class="priv-row"><a class="pill priv-req" href="${url}" target="_blank" rel="noopener" data-privreq="1">Request Access</a><button class="pill priv-back" type="button" data-privback="1">Back</button></div><small>Opens Google Drive, where you can ask the owner for access.</small></div></div>`;
 status('');const b=g.querySelector('.priv-req');setTimeout(()=>{try{b.focus({preventScroll:true})}catch(e){}},60)}
document.addEventListener('click',e=>{if(e.target.closest('[data-privback]')){e.preventDefault();back(parentHash())}});
async function open(id,mode='home'){cur=id;view=id===ROOT?mode:'folder';$('#q').value='';if(!navBack&&id!==ROOT)folderSfx(id);if(live&&!kids.has(id)){try{await loadFolder(id)}catch(e){if(/drive (403|404)/.test(e&&e.message||''))DENIED.add(id);live=false;status('');add(window._idx||[])}}
 const f=items.get(id);if(id===ROOT&&mode==='home')return showHome();render(kids.get(id)||[],id===ROOT?{home:'The Fan Edit Fan Club Collection',all:'The Fan Edit Fan Club Collection',arena:'New Arrivals',collections:'Collections'}[mode]:f.name,id===ROOT?mode:'home');if(id!==ROOT&&!(kids.get(id)||[]).length&&isDenied(id))privatePrompt(id,f)}
/* ---------- SORT (#/all) ---------- */
const SORTS=[['az','A–Z'],['za','Z–A'],['newest','Newest'],['oldest','Oldest'],['film','Source Film'],['genre','Genre'],['size','Largest']];
function curSort(){const m=location.hash.match(/[?&]sort=([a-z]+)/);return m&&SORTS.some(s=>s[0]===m[1])?m[1]:'az'}
let sortJob=0;
function sortedAll(fold,vids,g,extra){const k=curSort(),list=[...fold,...vids],nm=(a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'});
 const dt=f=>NA.d(f)||'',film=f=>{const mm=meta.map&&meta.films&&meta.films[meta.map[f.id]||meta.map[target(f)]];return (mm&&mm.title)||(isFolder(f)?f.name.replace(/^\s*\d+[A-Z]?\s*-\s*/,''):parse(f.name).film)||f.name},gen=f=>{const x=isFolder(f)?(genreMap[target(f)]||{}).genres:genresOf(f);return x&&x[0]||'Uncategorized'};
 let groups;
 if(k==='az'||k==='za'){list.sort(k==='az'?nm:(a,b)=>nm(b,a));const L=f=>{const c=(f.name||'').trim().charAt(0).normalize('NFD').charAt(0).toUpperCase();return /[A-Z]/.test(c)?c:'#'};const by=new Map();list.forEach(f=>{const x=L(f);if(!by.has(x))by.set(x,[]);by.get(x).push(f)});groups=[...by.entries()].map(([x,a])=>[x,a,1])}
 else if(k==='newest'||k==='oldest'){const s=k==='newest'?-1:1;groups=[['',list.sort((a,b)=>(dt(a)<dt(b)?-s:dt(a)>dt(b)?s:0)||nm(a,b))]]}
 else if(k==='size')groups=[['',list.sort((a,b)=>(+b.size||0)-(+a.size||0)||nm(a,b))]];
 else{const by=new Map(),key=k==='film'?film:gen;list.forEach(f=>{const x=key(f);if(!by.has(x))by.set(x,[]);by.get(x).push(f)});
  groups=[...by.entries()].sort((a,b)=>(a[0]==='Uncategorized')-(b[0]==='Uncategorized')||a[0].localeCompare(b[0],undefined,{sensitivity:'base'})).map(([x,a])=>[x,a.sort(nm)])}
 const bar=`<div class="sortbar" role="toolbar" aria-label="Sort">${extra||''}${SORTS.map(([v,l])=>`<button class="sortpill${v===k?' on':''}" data-sort="${v}" aria-pressed="${v===k}">${l}</button>`).join('')}</div>`;
 g.innerHTML=bar+groups.map(([x,a,lt],n)=>(x?`<div class="ol-div${lt?' letter':''}" id="${lt?'L-'+(x==='#'?'num':x):''}"><span>${esc(x)}</span><i></i><b>${a.length}</b></div>`:'')+`<div class="sgrid folds" data-g="${n}f"></div><div class="sgrid vids" data-g="${n}v"></div>`).join('');
 const job=++sortJob,q=[];groups.forEach(([x,a],n)=>{[['f',a.filter(f=>!isMedia(f))],['v',a.filter(f=>isMedia(f))]].forEach(([t,b])=>{const el=g.querySelector(`[data-g="${n}${t}"]`);if(!b.length)el.remove();for(let i=0;i<b.length;i+=60)q.push([el,b.slice(i,i+60)])})});
 const step=()=>{if(job!==sortJob||!q.length)return;const t=Date.now();while(q.length&&Date.now()-t<12){const[el,a]=q.shift();el.insertAdjacentHTML('beforeend',a.map(f=>tile(f)).join(''));el.querySelectorAll('.ol-tile:not([data-arted])').forEach(e=>{e.dataset.arted=1;lazyArt(e)})}if(q.length)requestAnimationFrame(step)};
 const first=q.shift();if(first){first[0].insertAdjacentHTML('beforeend',first[1].map(f=>tile(f)).join(''));first[0].querySelectorAll('.ol-tile').forEach(e=>{e.dataset.arted=1;lazyArt(e)})}requestAnimationFrame(step)}
document.addEventListener('click',e=>{const b=e.target.closest('[data-sort]');if(!b)return;S.click();const h='#/all'+(b.dataset.sort==='az'?'':'?sort='+b.dataset.sort);if(location.hash!==h){history.pushState({fefc:1},'',h);route()}setTimeout(()=>{const n=document.querySelector(`[data-sort="${b.dataset.sort}"]`);if(n)focusEl(n)},30)});
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
function epWire(f,E){const box=$('#lc-eps');if(!box||!E)return;let all=false;const draw=()=>{box.innerHTML=epHTML(E,all)};draw();
 box.addEventListener('click',e=>{const a=e.target.closest('[data-epall]'),g=e.target.closest('[data-epgo]');if(a){S.chirp(3);all=!all;draw();const n=box.querySelector('[data-epall]');if(n)focusEl(n);const c=box.querySelector('.ept.cur');if(c)c.scrollIntoView({block:'nearest'})}else if(g&&g.dataset.epgo){S.click();go('#/edit/'+g.dataset.epgo)}})}
function fileChips(f){const t=items.get(target(f))||f,g=k=>f[k]!=null?f[k]:t[k];let ext=g('ext');const mt=g('mimeType')||'';
 if(!ext){const m=(t.name||f.name).match(/\.([a-z0-9]{2,4})$/i);ext=m?m[1]:({'video/mp4':'mp4','video/x-matroska':'mkv','video/x-msvideo':'avi','video/quicktime':'mov','video/webm':'webm','video/mp2t':'ts','video/x-m4v':'m4v','video/mpeg':'mpg','video/x-ms-wmv':'wmv'}[mt]||(/^video\/(?:x-)?([a-z0-9]+)$/.exec(mt)||[])[1])}
 const size=+g('size')||0,hs=size?(size>=1e9?(size/1e9).toFixed(1)+' GB':(size/1e6).toFixed(0)+' MB'):'';
 const rm=(f.name+' '+(t.name||'')).match(/\b(4K|2160p|1080p|720p|576p|480p|360p|UHD)\b/i),res=rm?(/2160|uhd/i.test(rm[1])?'4K':rm[1].toUpperCase().replace('P','p')):'';
 const dur=g('duration')||g('durationMillis');const ds=dur?(()=>{const m=Math.round(+dur/(dur>1e5?6e4:60));return m>=60?Math.floor(m/60)+'h '+(m%60)+'m':m+'m'})():'';
 const c=[ext&&ext.toUpperCase(),hs,res,ds].filter(Boolean);return c.length?`<div class="fchips" aria-label="File info"><span class="fl">FILE</span>${c.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}
/* blurred backdrop: low-res canvas upscaled by the browser (no CSS blur filter; cheap on iOS) */
function detCover(f){let x=items.get(target(f))||f,g=0;const ids=[];while(x&&x.parent&&g++<30){ids.push(x.parent);x=items.get(x.parent)}if(f.parent)ids.unshift(f.parent);
 for(const p of ids){if(p===ROOT)break;const t=fthumbs[p];if(t)return t.startsWith('assets/')?t:'https://drive.google.com/thumbnail?sz=w640&id='+t}return null}
function detBackdrop(f,pu){const d=$('#details');let c=d.querySelector('canvas.lc-bg');if(!c){c=document.createElement('canvas');c.className='lc-bg';c.width=40;c.height=24;d.prepend(c)}
 const x=c.getContext('2d');x.clearRect(0,0,40,24);c.classList.remove('on');const src=detCover(f)||pu;if(!src)return;const im=new Image(),want=f.id;
 im.onload=()=>{if(d.dataset.id!==want)return;const r=Math.max(40/im.width,24/im.height),w=im.width*r,h=im.height*r;x.drawImage(im,(40-w)/2,(24-h)/2,w,h);c.classList.add('on')};im.onerror=()=>{if(pu&&src!==pu&&!im.dataset.fb){im.dataset.fb=1;im.src=pu}};im.src=src}
function timeAgo(ts){if(!ts)return'';const diff=Math.max(0,Date.now()-ts),m=Math.floor(diff/60000),h=Math.floor(m/60),d=Math.floor(h/24);if(m<1)return'just now';if(m<60)return m+'m ago';if(h<24)return h+'h ago';if(d===1)return'yesterday';if(d<30)return d+'d ago';return new Date(ts).toLocaleDateString()}
let playTimerInterval=null,playSec=0,playRunning=false,activePlayFile=null;
function stopPlayerTimer(){clearInterval(playTimerInterval);if(activePlayFile&&playRunning&&playSec>10&&window.UD){UD.setPlayback(activePlayFile.id,playSec,activePlayFile.name,{log:true})}playRunning=false}
function wirePlayerTimeControls(){
 const bar=$('#ptime-bar');if(!bar||bar._wired)return;bar._wired=true;
 const toggle=$('#pt-toggle'),clock=$('#pt-clock'),toast=$('#pt-toast');
 const showToast=msg=>{if(!toast)return;toast.textContent=msg;toast.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>{toast.hidden=true},3400)};
 if(toggle)toggle.addEventListener('click',()=>{
  S.click();playRunning=!playRunning;toggle.textContent=playRunning?'⏸ PAUSE STOPWATCH':'▶ START STOPWATCH';
  toggle.classList.toggle('is-paused',!playRunning);if(clock)clock.classList.toggle('paused',!playRunning);
  if(!playRunning&&activePlayFile&&window.UD){UD.setPlayback(activePlayFile.id,playSec,activePlayFile.name,{log:true});showToast('⏸ Stopwatch paused at '+UD.formatTime(playSec))}
  else if(playRunning&&window.UD){showToast('⏱️ Stopwatch tracking from '+UD.formatTime(playSec))}
 });
 bar.querySelectorAll('.pt-pill').forEach(btn=>btn.addEventListener('click',()=>{
  S.click();const d=parseInt(btn.dataset.adj,10)||0;playSec=Math.max(0,playSec+d);
  if(clock&&window.UD)clock.textContent=UD.formatTime(playSec);
  if(activePlayFile&&window.UD)UD.setPlayback(activePlayFile.id,playSec,activePlayFile.name);
  const lbl=Math.abs(d)>=60?(d/60)+'m':d+'s';
  showToast((d>0?'+':'')+lbl+' → '+(window.UD?UD.formatTime(playSec):playSec));
 }));
 const setBtn=$('#pt-set');
 if(setBtn)setBtn.addEventListener('click',()=>{
  S.click();const curStr=window.UD?UD.formatTime(playSec):'00:00:00';
  const ans=prompt('Enter the timestamp shown on your Drive player (e.g. 1:24:35 or 45:10):',curStr);
  if(ans&&window.UD){const s=UD.parseTime(ans);playSec=s;if(clock)clock.textContent=UD.formatTime(playSec);if(activePlayFile)UD.setPlayback(activePlayFile.id,playSec,activePlayFile.name,{log:true});showToast('⏱️ Logged timestamp '+UD.formatTime(playSec)+' saved!')}
 });
 if(clock)clock.addEventListener('click',()=>{if(setBtn)setBtn.click()});
 const copyBtn=$('#pt-copy');
 if(copyBtn)copyBtn.addEventListener('click',()=>{
  S.click();const str=window.UD?UD.formatTime(playSec):'00:00:00';
  try{navigator.clipboard.writeText(str)}catch(_){}
  showToast('📋 Copied '+str+'! Seek or fast-forward to '+str+' in Drive');
 });
 const markBtn=$('#pt-mark');
 if(markBtn)markBtn.addEventListener('click',()=>{
  S.click();const str=window.UD?UD.formatTime(playSec):'00:00:00';
  if(activePlayFile&&window.UD)UD.setPlayback(activePlayFile.id,playSec,activePlayFile.name,{log:true});
  showToast('📌 Logged timestamp '+str+' to Watch History!');
 });
 const resetBtn=$('#pt-reset');
 if(resetBtn)resetBtn.addEventListener('click',()=>{
  S.click();playSec=0;playRunning=false;if(clock){clock.textContent='00:00:00';clock.classList.add('paused')}
  if(toggle){toggle.textContent='▶ START STOPWATCH';toggle.classList.add('is-paused')}
  if(activePlayFile&&window.UD)UD.setPlayback(activePlayFile.id,0,activePlayFile.name);showToast('↺ Timestamp reset to 00:00:00');
 });
 const rBanner=$('#presume-banner'),prCopy=$('#pr-copy'),prResume=$('#pr-resume'),prRestart=$('#pr-restart'),prClose=$('#pr-close');
 if(prCopy)prCopy.addEventListener('click',()=>{
  S.click();const str=window.UD?UD.formatTime(playSec):'00:00:00';try{navigator.clipboard.writeText(str)}catch(_){}showToast('📋 Copied '+str+'! Seek Drive progress bar to '+str);
 });
 if(prResume)prResume.addEventListener('click',()=>{
  S.click();if(rBanner)rBanner.hidden=true;if(setBtn)setBtn.click();
 });
 if(prRestart)prRestart.addEventListener('click',()=>{
  S.click();if(rBanner)rBanner.hidden=true;playSec=0;if(clock)clock.textContent='00:00:00';if(activePlayFile&&window.UD)UD.setPlayback(activePlayFile.id,0,activePlayFile.name);
 });
 if(prClose)prClose.addEventListener('click',()=>{S.click();if(rBanner)rBanner.hidden=true});
}
async function details(f,push=true){S.open();S.ambience(false);
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
 if(rtUrl)R.push({ico:'rt',name:'Rotten Tomatoes',val:rts||'VIEW ›',sub:rts?'Tomatometer'+(F&&F.rtAudience!=null?' · Audience '+F.rtAudience+'%':''):'',url:rtUrl});
 const ifdb=(meta.ifdb||{})[f.id]||(meta.ifdb||{})[id]||((old.find(r=>/FanEdit/.test(r.source))||{}).url);
 if(ifdb)R.push({ico:'fe',name:'FanEdit.org',val:'IFDB ›',sub:'Fan edit database entry',url:ifdb});
 const mr=old.find(r=>/Movies Remastered/.test(r.source)&&(r.url||r.value));if(mr)R.push({ico:'mr',name:'Movies Remastered',val:mr.value||'VIEW ›',sub:'',url:mr.url});
 const tr=m.trailer&&m.trailer.youtubeId?{id:m.trailer.youtubeId}:F&&F.trailer;
 const rt=R.map(r=>`<a ${r.url?`href="${esc(r.url)}" target="_blank" rel="noopener"`:''} class="rr"><span class="rn">${ICO[r.ico]}<span>${esc(r.name)}${r.sub?`<small>${esc(r.sub)}</small>`:''}</span></span><b>${esc(r.val)}</b></a>`).join('')||'<p class="src">No ratings found for the source film.</p>';
 const T=m.title||p.raw,meta1=[film.year,F&&F.runtime?F.runtime+' min':'',F&&F.tv?'TV series':''].filter(Boolean).join(' · ');
 const PS=posters[f.id]||posters[id],PU=F&&F.fx&&F.poster&&(!PS||(meta.map&&(meta.map[f.id]||meta.map[id])))?F.poster:PS&&PS.url;
 const fn=(f.name||'').toLowerCase();let fp=fn,curF=f,gc=0;while(curF&&curF.parent&&gc++<15){curF=items.get(curF.parent);if(curF&&curF.name)fp+=' '+curF.name.toLowerCase()}
 const isPurr=/purr|purassic/i.test(fp),isJura=!isPurr&&fp.includes('jurassic');
 if(isPurr){S.fx(['assets/sfx/cat-meow.m4a','assets/sfx/cat-meow.wav'])}
 else if(isJura){S.fx(['assets/sfx/trex-roar.mp3','assets/sfx/trex-roar.m4a'])}
 const pbRec=window.UD&&(UD.getPlayback(f.id)||UD.getPlayback(id));
 const pbHTML=(pbRec&&pbRec.sec>10)?`<div class="fx-playback" id="fx-playback"><div class="pb-head"><h3 class="pb-title">⏱️ Watch Progress & Time Log</h3></div><div class="pb-status">Left off at: <b>${esc(pbRec.formatted)}</b><small style="color:#94a3b8;margin-left:8px">${timeAgo(pbRec.updatedAt)}</small></div><div class="pb-actions"><button class="pb-btn pb-resume" data-pbresume="${esc(f.id)}" data-time="${pbRec.sec}">▶ Resume at ${esc(pbRec.formatted)}</button><button class="pb-btn pb-copy" data-pbcopy="${esc(pbRec.formatted)}">📋 Copy Timestamp (${esc(pbRec.formatted)})</button><button class="pb-btn pb-clear" data-pbclear="${esc(f.id)}">↺ Reset</button></div>${pbRec.log&&pbRec.log.length?`<ul class="pb-log">${pbRec.log.map(item=>`<li><span>Stopped at <b>${esc(item.formatted)}</b> <small style="color:#64748b">(${timeAgo(item.at)})</small></span><button class="pb-copy-mini" data-pbcopy="${esc(item.formatted)}">Copy</button></li>`).join('')}</ul>`:''}</div>`:'';
 $('#details').innerHTML=`<div class="lc-top"><div class="lc-elbow"></div><div class="lc-bars"><span class="p2" style="width:60px"></span><span class="p3" style="flex:1"></span></div><div class="lc-bars" style="flex:0 0 40px"><span class="p1" style="flex:1;border-radius:0 13px 13px 0"></span></div></div>
 <div class="lc-side"><button class="pill p1" data-act="back">◀ Back</button><button class="pill p6" data-act="play">▶ Play</button><a class="pill p3" href="https://drive.google.com/file/d/${id}/view" target="_blank" rel="noopener">Open in Drive</a>${tr?'<button class="pill p2" data-jump="trailer">Trailer</button>':''}${(()=>{const on=!!(window.UD&&UD.isStarred(f.id));return `<button class="pill p4 star-btn side-star${on?' on':''}" data-star="${f.id}" aria-pressed="${on}">${on?'★ Starred':'☆ Star'}</button>`})()}<div class="grow"></div></div>
 <div class="lc-body"><div class="lc-head${PU?' has-poster':''}">${PU?`<div class="lc-poster"><img src="${esc(PU)}" alt="" decoding="async" onload="if(this.naturalWidth>this.naturalHeight*.8)this.classList.add('wide')"></div>`:''}<div class="lc-info"><h1 class="lc-title">${esc(T)}</h1>${meta1||film.title?`<div class="lc-sub">${esc(film.title&&film.title!==T?film.title:'')}${meta1?(film.title&&film.title!==T?' · ':'')+esc(meta1):''}</div>`:''}${fileChips(f)}<button class="bigplay" data-act="play" aria-label="Play ${esc(T)}"><span class="tri"></span>PLAY</button></div></div><div>
  ${pbHTML}
  ${desc?`<h3 class="lc-h">Fan edit</h3><p>${esc(desc)}</p>${m.descriptionSource?`<p class="src">Source: <a href="${esc(m.descriptionSource.url)}" target="_blank" rel="noopener">${esc(m.descriptionSource.name)}</a></p>`:''}`:''}
  <h3 class="lc-h l">Source ${F&&F.tv?'series':'film'}</h3><p><b>${esc(film.title||'Unknown')}</b>${film.year?' ('+esc(film.year)+')':''}${film.director?'<br>Directed by '+esc(film.director):''}${F&&F.genres?'<br><span class="src">'+esc(F.genres.join(' · '))+'</span>':''}${m.editor?'<br><span class="src">Fan edit by '+esc(m.editor)+'</span>':''}</p>
  ${plot?`<p>${esc(plot)}</p>${F.wiki?`<p class="src">Plot: <a href="${esc(F.wiki)}" target="_blank" rel="noopener">Wikipedia</a></p>`:''}`:''}
  <div id="lc-eps"></div>
  ${cast.length?`<h3 class="lc-h p">Cast</h3><div class="cast">${cast.map(c=>`<span>${esc(c.name)}</span>`).join('')}</div>`:''}
 </div><div>
  <h3 class="lc-h b" id="lc-ratings">Ratings</h3><div class="rt">${rt}</div>
  <h3 class="lc-h p" id="lc-trailer" style="margin-top:14px">Trailer${film.title?' · '+esc(film.title):''}</h3><div class="trailer">${tr?`<iframe src="https://www.youtube-nocookie.com/embed/${esc(tr.id)}" allowfullscreen allow="encrypted-media" loading="lazy" title="Trailer"></iframe>`:`<span>No trailer on file.<br><a href="https://www.youtube.com/results?search_query=${encodeURIComponent((film.title||p.raw)+' '+(film.year||'')+' official trailer')}" target="_blank" rel="noopener">Search YouTube ›</a></span>`}</div>
 </div></div><div class="lc-foot"><div class="lc-elbow" style="background:var(--l)"></div><span></span><span></span><span></span></div>`;
 $('#details').hidden=false;$('#details').dataset.id=f.id;detBackdrop(f,PU);const E=episodes(f);epWire(f,E);if(window.FEX)FEX.ready.then(()=>FEX.enhance(f,{items,target,root:ROOT},F));$('#details').scrollTop=0;const lb=$('#details .lc-body');if(lb)lb.scrollTop=0;
 $('#details').querySelectorAll('[data-pbresume]').forEach(b=>b.addEventListener('click',e=>{
  e.preventDefault();S.click();window.__resumeSec=+b.dataset.time;
  try{navigator.clipboard.writeText(b.closest('.fx-playback').querySelector('.pb-status b').textContent)}catch(_){}
  go('#/play/'+b.dataset.pbresume);
 }));
 $('#details').querySelectorAll('[data-pbcopy]').forEach(b=>b.addEventListener('click',e=>{
  e.preventDefault();S.click();const t=b.dataset.pbcopy;try{navigator.clipboard.writeText(t)}catch(_){}
  b.textContent='✓ Copied!';setTimeout(()=>{b.textContent=b.dataset.pbcopy?'📋 Copy Timestamp ('+t+')':'Copy'},2000);
 }));
 $('#details').querySelectorAll('[data-pbclear]').forEach(b=>b.addEventListener('click',e=>{
  e.preventDefault();S.click();if(window.UD)UD.clearPlayback(b.dataset.pbclear);const el=$('#fx-playback');if(el)el.remove();
 }));
 if(isPurr){
  $('#details').addEventListener('click',e=>{if(e.target.closest('button,a,.pill,.bigplay,.ol-tile'))S.fx(['assets/sfx/cat-meow.m4a','assets/sfx/cat-meow.wav'])});
 }
 $('#details').querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>{S.chirp(2);const t=$('#lc-'+b.dataset.jump);if(t)t.scrollIntoView({behavior:'smooth',block:'start'})}));
 let n=0;$('#details').querySelectorAll('.pill,.rt a,.bigplay').forEach(el=>el.addEventListener('pointerenter',()=>S.chirp(n++)))}
function killFrame(){const o=$('#pframe');if(o){const n=o.cloneNode(false);n.removeAttribute('src');o.replaceWith(n)}}
function newFrame(u){const o=$('#pframe'),n=o.cloneNode(false);n.src=u;o.replaceWith(n)}
function started(){return !!window._u&&document.body.classList.contains('intro-done')}
function play(f){
 activePlayFile=f;const E=episodes(f),pn=$('#pprev'),nx=$('#pnext');if(pn&&nx){const p0=E&&E.idx>0?E.eps[E.idx-1].f:null,n0=E&&E.idx>=0&&E.idx<E.eps.length-1?E.eps[E.idx+1].f:null;pn.hidden=!p0;nx.hidden=!n0;pn.dataset.to=p0?p0.id:'';nx.dataset.to=n0?n0.id:''}
 const id=target(f);try{window.UD&&UD.opened(f.id,f.name)}catch(e){}S.ambience(false);S.click();
 const isShuf=!!(window.__shufPlay||sessionStorage.fefcShufScope);document.body.classList.toggle('shuf-player',isShuf);$('#player').classList.toggle('floating',isShuf);
 $('#ptitle').textContent=parse(f.name).raw;newFrame(`https://drive.google.com/file/d/${id}/preview`);$('#popen').href=`https://drive.google.com/file/d/${id}/view`;$('#player').hidden=false;
 wirePlayerTimeControls();
 const pbRec=window.UD&&(UD.getPlayback(f.id)||UD.getPlayback(id));
 const resumeBanner=$('#presume-banner'),prTime=$('#pr-time'),prTime2=$('#pr-time2'),ptClock=$('#pt-clock'),ptToggle=$('#pt-toggle');
 if(window.__resumeSec!=null){playSec=window.__resumeSec;window.__resumeSec=null;if(resumeBanner)resumeBanner.hidden=true}
 else if(pbRec&&pbRec.sec>10){playSec=pbRec.sec;if(resumeBanner&&prTime){prTime.textContent=pbRec.formatted;if(prTime2)prTime2.textContent=pbRec.formatted;resumeBanner.hidden=false}}
 else{playSec=0;if(resumeBanner)resumeBanner.hidden=true}
 playRunning=false;
 if(ptClock){ptClock.textContent=window.UD?UD.formatTime(playSec):'00:00:00';ptClock.classList.add('paused')}
 if(ptToggle){ptToggle.textContent='▶ START STOPWATCH';ptToggle.classList.add('is-paused')}
 clearInterval(playTimerInterval);let ticks=0;
 playTimerInterval=setInterval(()=>{
  if(!$('#player').hidden&&playRunning){
   playSec++;if(ptClock&&window.UD)ptClock.textContent=UD.formatTime(playSec);
   if(++ticks%5===0&&window.UD&&activePlayFile)UD.setPlayback(activePlayFile.id,playSec,activePlayFile.name);
  }
 },1000);
}
/* ---------- EVENTS ---------- */
document.addEventListener('click',e=>{const pe=e.target.closest('#pprev,#pnext');if(pe&&pe.dataset.to){S.click();history.replaceState({fefc:1},'','#/play/'+pe.dataset.to);route();return}const nav=e.target.closest('[data-nav]');if(nav){const k=nav.dataset.nav;if(k==='up')return back(parentHash());S.click();return go(k==='home'?'#/':'#/'+k)}
 const act=e.target.closest('[data-act]');if(act){const f=items.get($('#details').dataset.id);if(act.dataset.act==='back')return back('#/');S.chirp(1);go('#/play/'+f.id);return}
 const t=e.target.closest('.ol-tile');if(t&&!t.dataset.genre&&!t.classList.contains('link')){if(t.dataset.sup){S.click();go('#/supportus');return}if(t.dataset.mainc){S.click();go(HUBH.main);return}const f=items.get(t.dataset.id);if(!f)return;if(isFolder(f)){S.click();go('#/folder/'+target(f))}else if(rfKind(f)){openDocTile(f)}else if(!isMedia(f)){S.click();window.open('https://drive.google.com/file/d/'+target(f)+'/view','_blank')}else go('#/edit/'+f.id)}});
let lastHover=null;document.addEventListener('pointerover',e=>{const t=e.target.closest('.ol-tile,.mi');if(t&&t!==lastHover){lastHover=t;S.move()}});
document.addEventListener('focusin',e=>{if(e.target.matches('.ol-tile,.mi'))S.move()});
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
  render([...folds,...vidsList],'Search: '+q,'home');
  const total=folds.length+vidsList.length;
  $('#sec2').textContent=total+' result'+(total===1?'':'s')+' for “'+q+'”';
}

/* ---------- AI search (server-side Gemini via /api/ai-search; key never in the browser) ---------- */
let aiSeq=0;
async function aiSearch(q){q=(q||'').trim();if(!q)return;const my=++aiSeq;pageShell('Ask Fan Edit Optimus','Looking for: “'+q+'”');const g=$('#grid');g.className='sectioned';g.innerHTML=`<div class="opt-head"><img class="opt-av" src="assets/optimus.png" alt="" width="40" height="40"><div><b>Fan Edit Optimus</b><small>Powered by Fan Edit Optimus</small></div></div><div class="opt-chat"><img class="opt-av" src="assets/optimus.png" alt="" width="40" height="40"><div class="opt-bubble thinking"><span class="dots"><i></i><i></i><i></i></span> Searching the vault for “${esc(q)}”…</div></div>`;
 const showOptimus=(res,intro)=>{if(my!==aiSeq)return;$('#sec2').textContent=res.length+' picks from Fan Edit Optimus for “'+q+'”';g.innerHTML=`<div class="opt-head"><img class="opt-av" src="assets/optimus.png" alt="" width="40" height="40"><div><b>Fan Edit Optimus</b><small>Powered by Fan Edit Optimus</small></div></div><div class="opt-chat"><img class="opt-av" src="assets/optimus.png" alt="" width="40" height="40"><div class="opt-bubble">${esc(intro)}</div></div><div class="ol-div"><span>OPTIMUS PICKS</span><i></i><b>${res.length}</b></div><div class="sgrid vids ai-res">${res.map(x=>`<div class="ai-cell">${tile(x.f)}<p class="ai-why"><img src="assets/optimus.png" alt="" class="opt-mini">${esc(x.why)}</p></div>`).join('')}</div>`;g.querySelectorAll('.ol-tile').forEach(lazyArt)};
 try{const r=await fetch('/api/ai-search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({q:q.slice(0,200)})});if(!r.ok)throw 0;const j=await r.json();if(my!==aiSeq)return;
  const res=(j.results||[]).map(x=>({f:items.get(x.id),why:x.reason})).filter(x=>x.f);if(!res.length)throw 0;
  const intro=j.intro||`I found ${res.length} fan edit${res.length===1?'':'s'} for you!`;showOptimus(res,intro)}
 catch(e){if(my!==aiSeq)return;const sem=semanticSearch(q);if(sem.length){const picks=sem.slice(0,36).map(x=>({f:x.item,why:x.why}));showOptimus(picks,`I searched the vault for “${q}” and picked ${picks.length} fan edits for you!`)}else{searchPage(q)}}}
const looksLikeQuestion=q=>/\?$/.test(q)||q.trim().split(/\s+/).length>=3;
let qt;$('#q').readOnly=true;['focus','click'].forEach(ev=>$('#q').addEventListener(ev,e=>{if(spOpen())return;e.preventDefault();$('#q').blur();openSpot('')}));
setTimeout(sm2,0);
/* ---------- TV / D-PAD SPATIAL NAVIGATION ---------- */
const FOC='.priv-req,.priv-back,.sortpill,.bigplay,#details .ol-tile,#details .epbtn:not([disabled]),#rfclose,#rfdoc,.hb,.hint-btn,.mi,#q,.ol-tile,#details .pill:not(.lab),#details a,#player .pill:not([hidden]),#pframe';
function visible(el){const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden'}
function layer(){if(!$('#rfpanel').hidden)return $('#rfpanel');if(!$('#player').hidden)return $('#player');if(!$('#details').hidden)return $('#details');return $('#app')}
function move(dir){const L=layer(),els=[].slice.call(L.querySelectorAll(FOC)).filter(visible),a=document.activeElement;
 if(!a||!L.contains(a)||a===document.body){if(els[0])focusEl(els[0]);return}
 const r=a.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let best=null,bd=1e9;
 els.forEach(e=>{if(e===a)return;const q=e.getBoundingClientRect(),x=q.left+q.width/2,y=q.top+q.height/2,dx=x-cx,dy=y-cy;
  const ok=dir==='left'?q.right<=r.left+4:dir==='right'?q.left>=r.right-4:dir==='up'?q.bottom<=r.top+4:q.top>=r.bottom-4;if(!ok)return;
  const main=dir==='left'||dir==='right'?Math.abs(dx):Math.abs(dy),off=dir==='left'||dir==='right'?Math.abs(dy):Math.abs(dx),d=main+off*2.5;if(d<bd){bd=d;best=e}});
 if(best)focusEl(best)}
function focusEl(e){e.focus({preventScroll:true});if(e.scrollIntoView)e.scrollIntoView({block:'nearest',inline:'nearest'})}
function goBack(){S.back();if(!$('#rfpanel').hidden)return rfDismiss();if(!$('#player').hidden){const fb=window.__shufPrevHash||parentHash()||'#/';window.__shufPrevHash=null;return back(fb)}back(parentHash())}
document.addEventListener('keydown',e=>{const k=e.keyCode,inInput=e.target===$('#q');{const it=document.getElementById('intro');if(it&&(!it.classList.contains('done')||Date.now()-(window.__ie||0)<900))return}
 const dir={37:'left',38:'up',39:'right',40:'down'}[k];
 if(dir&&!$('#rfpanel').hidden&&(k===38||k===40)){e.preventDefault();const w=$('.rf-scroll');if(w)w.scrollBy(0,k===40?220:-220);return}
 if(dir&&!(inInput&&(k===37||k===39))){e.preventDefault();S.unlock();move(dir);return}
 if(k===10009||k===461||k===27||(k===8&&!inInput)||e.key==='GoBack'||e.key==='BrowserBack'){e.preventDefault();goBack();return}
 if(k===13&&document.activeElement&&document.activeElement.matches('.ol-tile,[data-act],[data-nav],[data-href]')){e.preventDefault();S.unlock();document.activeElement.click()}});
/* ---------- Top menu bar D-pad navigation (TV / keyboard) ---------- */
let lastTile=null;
const barItems=()=>[].slice.call(document.querySelectorAll('#bar .mi,#bar #tvq,#bar #q,#bar #aiq')).filter(x=>x.offsetParent&&!x.hidden&&getComputedStyle(x).display!=='none');
const menuCurrent=()=>{const L=barItems();return document.querySelector('#menu .mi.on')||L.find(x=>x.closest('#menu'))||L[0]};
const inBar=el=>el&&el.closest&&el.closest('#bar');
const pageVisible=()=>$('#home').hidden&&$('#player').hidden&&$('#bar').offsetHeight>0;
function toMenu(){const m=menuCurrent();if(m){focusEl(m);m.scrollIntoView({block:'nearest',inline:'center'});return true}return false}
function toGrid(){const t=(lastTile&&document.contains(lastTile)&&lastTile.offsetParent)?lastTile:document.querySelector('#details:not([hidden]) [data-act],#arena .ol-tile,#grid .ol-tile');if(t){focusEl(t);return true}return false}
addEventListener('keydown',e=>{if(!pageVisible())return;const k=e.keyCode,a=document.activeElement,tv=document.body.classList.contains('tv');
 const back=k===10009||k===461||k===27||e.key==='GoBack'||e.key==='BrowserBack';
 if(a&&a.id==='q'){if(k===40||back){e.preventDefault();e.stopImmediatePropagation();a.blur();if(k===40)toGrid();else toMenu()}return}
 if(inBar(a)){const L=barItems(),i=L.indexOf(a);
  if(k===37||k===39){e.preventDefault();e.stopImmediatePropagation();const n=L[Math.max(0,Math.min(L.length-1,i+(k===39?1:-1)))];if(n){focusEl(n);n.scrollIntoView({block:'nearest',inline:'nearest'})}return}
  if(k===40){e.preventDefault();e.stopImmediatePropagation();toGrid();return}
  if(k===38){e.preventDefault();e.stopImmediatePropagation();return}
  if(k===13&&a.matches('button')){e.preventDefault();e.stopImmediatePropagation();S.unlock();a.click();return}
  return}
 const tile=a&&a.closest&&a.closest('.ol-tile');if(tile)lastTile=tile;
 if(k===38&&tile){const r=tile.getBoundingClientRect(),above=[].slice.call(document.querySelectorAll('#arena .ol-tile,#grid .ol-tile,#grid .sortpill')).some(x=>x!==tile&&x.offsetParent&&x.getBoundingClientRect().bottom<=r.top+4&&x.getBoundingClientRect().bottom>r.top-r.height*1.6);
  if(!above){e.preventDefault();e.stopImmediatePropagation();toMenu();return}}
 if(back&&tv&&$('#details').hidden&&$('#rfpanel').hidden&&tile){e.preventDefault();e.stopImmediatePropagation();toMenu()}},true);
document.addEventListener('focusin',e=>{const t=e.target.closest&&e.target.closest('.ol-tile');if(t)lastTile=t});
/* TV: search input becomes a 'Search' button that opens an on-screen search overlay */
(function(){const b=document.createElement('button');b.id='tvq';b.type='button';b.className='mi tv-only';b.textContent='⌕ Search';$('#bar').insertBefore(b,$('#q'));b.onclick=()=>{S.click();openSpot('')}})();
/* ---------- Spotlight search: one box, instant local results + automatic Smart picks (AI) ---------- */
const OPT_SVG=`<div class="op-ph" aria-hidden="true"><div class="op-scene"><img class="op-watch" src="assets/optimus-watch.webp" alt="" decoding="async"><div class="op-screen"><div class="op-stars"></div><div class="op-ship s1"></div><div class="op-ship s2"></div><div class="op-laser"></div><div class="op-term"><b>&gt; SEARCH:</b><i class="op-cur"></i></div></div><div class="op-kernel"><div class="op-corn-puff"></div></div><div class="op-screen-glow"></div><div class="op-type-hands"></div></div><b class="op-cue"></b></div>`;
let spEl=null,spSeq=0,spT=null,spAiT=null,spMoodT=null,spIdx=null,spIdxN=-1,spSel=-1,spLastFocus=null;
const spOpen=()=>!!(spEl&&spEl.classList.contains('on'));
const spNorm=t=>(t||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
function spBuild(){if(spIdx&&spIdxN===items.size)return spIdx;spIdxN=items.size;const out=[];
 items.forEach(f=>{const fold=isFolder(f);if(!fold&&!isVid(f))return;const mm=meta.map&&meta.films&&meta.films[meta.map[f.id]||meta.map[target(f)]]||{};const p=parse(f.name);
  const cast=(mm.cast||[]).map(c=>c&&c.name||c).filter(Boolean),dir=[].concat(mm.director||[]).filter(Boolean);
  out.push({f,fold,n:spNorm(fold?f.name:p.raw+' '+(mm.title||'')),cast,dir,cn:cast.map(spNorm),dn:dir.map(spNorm),year:mm.year||p.year||''})});
 return spIdx=out}
function spThumb(f){if(isFolder(f)){const pp=people[target(f)];if(pp)return pp.url;const t=fthumbs[target(f)];return t?(t.startsWith('assets/')?t:'https://drive.google.com/thumbnail?sz=w200&id='+t):''}const ps=posters[f.id]||posters[target(f)];return ps?ps.url:''}
function spLocal(q){const n=spNorm(q).trim();if(!n)return[];const words=n.split(/\s+/).filter(w=>w.length>1||n.length<3),idx=spBuild(),seenT=new Set();
 const hit=s=>words.every(w=>s.includes(w))||s.includes(n);
 const titles=[],cols=[],ppl=[],peopleHits={};
 for(const r of idx){if(r.fold){if(hit(r.n)){(people[target(r.f)]?ppl:cols).push({f:r.f,sub:people[target(r.f)]?(people[target(r.f)].role==='director'?'Director':'Actor'):'Collection'})}continue}
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
  spT=setTimeout(()=>spRun(q),120);
 });
 spEl.addEventListener('click',e=>{const it=e.target.closest('.sp-it');if(it)spGo(it)});
 spEl.addEventListener('keydown',e=>{
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
   if(q){
    closeSpot(true);
    go('#/search/'+encodeURIComponent(q));
   }
   return;
  }
  if(document.activeElement!==inp&&e.key&&e.key.length===1){inp.focus()}
 },false)}
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
function openSpot(q){if(!spEl)spMk();spLastFocus=document.activeElement;const inp=spEl.querySelector('#sp-q');spEl.hidden=false;document.body.classList.add('sp-lock');requestAnimationFrame(()=>spEl.classList.add('on'));
 inp.value=q||'';spSeq++;clearTimeout(spAiT);spPaint([]);const o=spEl.querySelector('.sp-opt');o.dataset.lock=0;spMood('idle');spSay('Optimus is watching a fan edit. Type to interrupt him.');if(q){inp.dispatchEvent(new Event('input'))}
 setTimeout(()=>{try{inp.focus({preventScroll:true})}catch(e){inp.focus()}},30)}
function closeSpot(nav){if(!spOpen())return;spSeq++;clearTimeout(spT);clearTimeout(spAiT);spEl.classList.remove('on');document.body.classList.remove('sp-lock');const inp=spEl.querySelector('#sp-q');inp.blur();setTimeout(()=>{if(!spOpen())spEl.hidden=true},260);
 if(nav!==true&&spLastFocus&&document.contains(spLastFocus)&&spLastFocus.id!=='q'&&spLastFocus!==document.body){try{spLastFocus.focus({preventScroll:true})}catch(e){}}}
window.FEFCSpot={open:openSpot,close:closeSpot};

// focus first item after views open
const _render=render;render=function(){_render.apply(this,arguments);if(document.body.classList.contains('tv')){const t=document.querySelector('#arena .ol-tile,#grid .ol-tile');if(t)focusEl(t)}};
const _details=details;details=async function(){await _details.apply(this,arguments);const p=document.querySelector('#details .bigplay')||document.querySelector('#details [data-act="play"]');if(p){const id=$('#details').dataset.id;if(id&&window.UD&&!p.parentNode.querySelector('.star-btn')){const on=UD.isStarred(id);p.insertAdjacentHTML('afterend',`<button class="pill p4 star-btn${on?' on':''}" data-star="${id}" aria-pressed="${on}">${on?'★ Starred':'☆ Star'}</button>`)}const B=document.body.classList,D=$('#details');if(B.contains('tv')||B.contains('kbd')){try{p.focus({preventScroll:true})}catch(e){p.focus()}}else if(document.activeElement&&D.contains(document.activeElement))document.activeElement.blur();D.scrollTop=0;D.querySelectorAll('.lc-body').forEach(x=>x.scrollTop=0)}};
const _play=play;play=function(f){S.ambience(false);_play(f);(()=>{let b=$('#pshuf');if(!b){b=document.createElement('button');b.id='pshuf';b.className='pill p6 shuf-again';b.innerHTML=SHUF_ICON+'Shuffle again';b.onclick=()=>shuffle(sessionStorage.fefcShufScope||'all');$('#popen').before(b)}let sc='';try{sc=sessionStorage.fefcShufScope||''}catch(e){}if(!window.__shufPlay){try{sessionStorage.removeItem('fefcShufScope')}catch(e){}sc=''}window.__shufPlay=0;b.hidden=!sc})();setTimeout(()=>focusEl($('#back')),50)};
if(/Tizen|Web0S|webOS|SMART-TV|SmartTV|NetCast|AFT|CrKey|BRAVIA|Android TV|GoogleTV|Silk/i.test(navigator.userAgent)||P.get('tv'))document.body.classList.add('tv');
document.addEventListener('keydown',()=>document.body.classList.add('kbd'),{once:true});
/* ---------- BOOT ---------- */
intro();if(C.GOOGLE_API_KEY){live=true;}
tmo('data/folderthumbs.json',10000).then(m=>{fthumbs=m;document.querySelectorAll('#grid .ol-tile').forEach(el=>{const f=items.get(el.dataset.id);if(f&&isFolder(f)&&!el.querySelector('img'))art(el,f)})}).catch(()=>{});
const reArt=()=>document.querySelectorAll('#grid .ol-tile,#arena .ol-tile').forEach(el=>{const f=items.get(el.dataset.id);if(f&&!el.querySelector('img')){if(isFolder(f)&&people[target(f)]){el.outerHTML=tile(f);const n=document.querySelector('[data-id="'+f.id+'"]');n&&art(n,f)}else art(el,f)}});
tmo('data/posters.json',15000).then(m=>{posters=m;reArt()}).catch(()=>{});tmo('data/people.json',10000).then(m=>{people=m;reArt()}).catch(()=>{});
tmo('data/genres.json',10000).then(g=>{GC=g.__collections||{};delete g.__collections;genreMap=g;if(!$('#home').hidden)hub();else if(/^#\/genres?\/./.test(location.hash))route()}).catch(()=>{});
tmo('data/mosaic.json',10000).then(m=>{mosaicList=m;if(!$('#home').hidden)mosaic()}).catch(()=>{});
tmo('data/dates.json',15000).then(m=>{NA.dates=m;(window.requestIdleCallback||setTimeout)(()=>NA.top(rootVids()));if(!$('#home').hidden)hub();else if(/^#\/(newarrivals|arena|folder)/.test(location.hash))route()}).catch(e=>console.warn(e));
tmo('data/metadata.json',8000).then(m=>meta=m).catch(e=>console.warn(e));{const sx=document.createElement('script');sx.src='details-extra.js';document.head.appendChild(sx)}
tmo('data/index.json',15000).then(d=>{window._idx=d.items;if(!live)add(d.items);if(!live)tmo('data/links.json',15000).then(L=>{for(const p in L){if(!kids.has(p))kids.set(p,[]);const a=kids.get(p);for(const id of L[p]){const f=items.get(id);if(f&&!a.includes(f))a.push(f)}}if(/^#\/(folder|all|people|actors|directors|mylist|genre\/)/.test(location.hash))route();else if(!$('#home').hidden)hub()}).catch(()=>{});if(d.partial!==false&&!live)tmo('data/index.interim.json',20000).then(x=>{add(x.items.filter(f=>!items.has(f.id)));window._idx=Array.from(items.values());route()}).catch(()=>{})}).catch(e=>{console.warn(e);status('Saved index unavailable')}).then(()=>{route();
 if(P.get('focus')){setTimeout(()=>{document.body.classList.add('kbd');const t=document.querySelectorAll('.ol-tile,.hb')[+P.get('focus')];if(t)focusEl(t)},300)}
 const e=P.get('edit');if(e)go('#/edit/'+e);const pp=P.get('play');if(pp)go('#/play/'+pp);if(P.get('readfirst'))go('#/readfirst')});
$('#back').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();goBack()});
$('#player').addEventListener('click',e=>{if(e.target.closest('#pclose')||(e.target.id==='player'&&!e.target.closest('.pcard'))){e.preventDefault();e.stopPropagation();goBack()}});
showHome();if(/^#\/(genres|supportus|support|mylist)\b/.test(location.hash))route();
})();

/* ---------- INSTALL BUTTONS (legend + mobile top bar) ---------- */
(function(){const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||navigator.standalone===true;
 const ua=navigator.userAgent,ios=/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);
 const mk=(id,cls)=>{const b=document.createElement('button');b.id=id;b.type='button';b.className=cls;b.hidden=true;b.innerHTML='<i class="g g-inst">⤓</i>Install App';b.onclick=doInstall;return b};
 const hb=mk('hinstall','hint-btn inst-btn'),tb=mk('tinstall','mi inst-btn top-inst');
 const hints=document.getElementById('hints');if(hints)hints.appendChild(hb);const bar=document.getElementById('bar');if(bar)bar.insertBefore(tb,document.getElementById('q'));
 const upd=()=>{const ok=!isStandalone()&&(!!window.__bip||(ios&&!localStorage.fefcIosTipDone));hb.hidden=tb.hidden=!ok};
 function doInstall(){if(window.__bip){const e=window.__bip;e.prompt();e.userChoice.then(c=>{if(c&&c.outcome==='accepted')window.__bip=null;upd()}).catch(()=>{});return}
  if(ios){const t=document.createElement('div');t.className='ios-tip';t.innerHTML='To install: tap <b>Share</b> <span class="ios-share">⬆︎</span> then <b>Add to Home Screen</b>.<button type="button">OK</button>';document.body.appendChild(t);t.querySelector('button').onclick=()=>t.remove();localStorage.fefcIosTipDone='1';upd()}}
 addEventListener('beforeinstallprompt',e=>{e.preventDefault();window.__bip=e;upd()});
 addEventListener('appinstalled',()=>{window.__bip=null;upd()});matchMedia('(display-mode: standalone)').addEventListener&&matchMedia('(display-mode: standalone)').addEventListener('change',upd);upd()})();
/* ---------- INSTALL (PWA) ---------- */
(function(){const ua=navigator.userAgent,standalone=matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||navigator.standalone===true;
 const isTV=document.body.classList.contains('tv'),mobile=/Android|iPhone|iPad|iPod/i.test(ua)||(navigator.maxTouchPoints>1&&/Macintosh/.test(ua)&&'ontouchend' in document);
 const ios=/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1),snoozed=+localStorage.fefcInstallSnooze>Date.now();
 let deferred=null;const box=document.getElementById('install');
 if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});if('serviceWorker' in navigator&&navigator.serviceWorker.controller){let rl=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(rl||sessionStorage.fefcSwReload)return;rl=true;sessionStorage.fefcSwReload='1';location.reload()})}
 const allowed=()=>(mobile||new URLSearchParams(location.search).get('installdemo'))&&!standalone&&!isTV&&!snoozed;
 function show(){if(!allowed()||!box.hidden)return;const go=document.getElementById('ins-go'),msg=document.getElementById('ins-msg');
  if(ios){msg.innerHTML='Tap <b>Share</b> <span class="ios-share">⬆︎</span> then <b>Add to Home Screen</b>.';go.hidden=true}
  else if(!deferred&&!new URLSearchParams(location.search).get('installdemo'))return;
  box.hidden=false;requestAnimationFrame(()=>box.classList.add('open'))}
 addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;if(document.body.classList.contains('intro-done'))setTimeout(show,800)});
 document.getElementById('ins-go').onclick=()=>{if(!deferred)return;deferred.prompt();deferred.userChoice.then(()=>{deferred=null;box.hidden=true})};
 document.getElementById('ins-no').onclick=()=>{localStorage.fefcInstallSnooze=Date.now()+7*864e5;box.hidden=true};
 const t=setInterval(()=>{if(document.body.classList.contains('intro-done')){clearInterval(t);setTimeout(show,1200)}},400)})();
addEventListener('load',()=>{const s=document.createElement('script');s.src='clips.js?v='+(document.querySelector('script[src*="app.js?v="]')||{src:''}).src.split('v=')[1];s.async=true;document.body.appendChild(s)}); // moving edge clips (src/clips.js)
;(function(){const sync=()=>{const d=!document.getElementById('details').hidden&&document.getElementById('player').hidden;const isShuf=document.body.classList.contains('shuf-player');document.body.classList.toggle('overlay',(!document.getElementById('details').hidden||!document.getElementById('player').hidden)&&!isShuf);document.body.classList.toggle('details-open',d);if(d||isShuf){const b=document.getElementById('bar');document.documentElement.style.setProperty('--barh',(b.offsetHeight||56)+'px');if(window.NA&&NA.menuHTML)try{menu()}catch(e){}}};const mo=new MutationObserver(sync);['details','player'].forEach(i=>mo.observe(document.getElementById(i),{attributes:true,attributeFilter:['hidden','class']}));sync()})();
addEventListener('load',()=>{const w=document.getElementById('wordmark');if(w)window.dispatchEvent(new Event('resize'))});

(()=>{const h=document.getElementById('hints'),pl=document.getElementById('player'),rf=document.getElementById('rfpanel'),up=()=>{if(h){const isShuf=document.body.classList.contains('shuf-player');h.style.display=(rf&&!rf.hidden)||(pl&&!pl.hidden&&!isShuf)?'none':''}};if(window.MutationObserver)[pl,rf].forEach(x=>x&&new MutationObserver(up).observe(x,{attributes:true,attributeFilter:['hidden','class']}));up()})(); // one sound/legend control on every page, hidden in the player

/* keep tile subtitles inside their tiles: wrap at the dot, then shrink until nothing overflows */
function fitSmalls(){document.querySelectorAll('#hub .hb small,#grid.gnrs .gnr small').forEach(el=>{el.style.removeProperty('font-size');const p=el.parentElement;if(!p||!el.offsetWidth)return;
 const room=()=>{const r=el.getBoundingClientRect(),q=p.getBoundingClientRect();return el.scrollWidth<=el.clientWidth+1&&r.left>=q.left-1&&r.right<=q.right+1&&r.bottom<=q.bottom+1};let fs=parseFloat(getComputedStyle(el).fontSize),i=0;while(!room()&&fs>7&&i++<30){fs-=.5;el.style.setProperty('font-size',fs+'px','important')}})}
window.fitSmalls=fitSmalls;addEventListener('resize',()=>setTimeout(fitSmalls,60));new MutationObserver(()=>{clearTimeout(fitSmalls._t);fitSmalls._t=setTimeout(fitSmalls,80)}).observe(document.documentElement,{childList:true,subtree:true});
