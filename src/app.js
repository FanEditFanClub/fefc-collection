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
 const R=window.FEFCIntro.create({tv,tagline:tg});el.prepend(R.canvas);
 fetch('data/mosaic.json').then(r=>r.json()).then(m=>R.setTiles(m.map(x=>x.target||x.id))).catch(()=>{});
 try{S.loadIntro()}catch(e){}
 const fr=P.get('introframe');if(fr!==null){document.body.classList.add('frozen');el.querySelector('.ihint').hidden=true;const draw=()=>R.frame(+fr);draw();[300,1000,2000,3500].forEach(t=>setTimeout(draw,t));return}
 let done=false,raf=0,ia=null;const end=skipped=>{if(done)return;done=true;cancelAnimationFrame(raf);localStorage.fefcSeen='1';sndHint(false);if(skipped){S.introStop();if(ia){try{ia.pause()}catch(e){}}}
  tg.style.opacity='';tg.style.clipPath='';tg.style.visibility='';document.body.classList.remove('cintro');el.classList.add('done');document.body.classList.add('intro-done');window.__ie=Date.now();$('#home').classList.add('enter');setTimeout(()=>{S.ambience($('#player').hidden&&$('#details').hidden);el.remove()},skipped?600:1870)};
 let t0=performance.now(),last=0;const hint=el.querySelector('.ihint');let sndOn=false;
 const loop=now=>{const r=(now-t0)/1000,s=short?R.mapC(r):R.mapF(r);last=r;R.frame(s);if(s>=24.2)return end(false);raf=requestAnimationFrame(loop)};
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
function tile(f,live_){const fold=isFolder(f),p=parse(f.name),vid=!fold&&isVid(f),pp=fold&&people[target(f)];const cls=fold?(pp?'person':'fold'):vid?'vid':'doc';const ad=cls==='doc'&&/^\s*\w{1,3}\s*-\s*support\b|support patreon|paypal\/venmo/i.test(f.name);return `<button class="ol-tile ${cls}${ad?' ad':''} ${live_?'live':''}" data-id="${f.id}" title="${esc(f.name)}"><div class="art" style="background:${artBg(f)}">${vid?`<div class="ptitle">${esc(p.raw)}</div>`:''}</div><span class="kind">${live_?'NEW':pp?(pp.role==='director'?'DIRECTOR':'ACTOR'):fold?'COLLECTION':vid?'FAN EDIT':'DOCUMENT'}</span>${(fold||vid)?`<span class="star${window.UD&&UD.isStarred(f.id)?' on':''}" data-star="${f.id}" role="button" aria-label="Star" title="Star (S)">★</span>`:''}${vid?`<div class="pcap ${(()=>{const n=p.raw.length;return n>90?'c4':n>55?'c3':n>30?'c2':'c1'})()}">${esc(p.raw)}</div>`:''}<div class="nm">${esc(fold?f.name:p.raw)}</div></button>`}
async function art(el,f){let src=null;const p=parse(f.name);
 if(isFolder(f)&&people[target(f)])src=people[target(f)].url;else if(!isFolder(f)&&isVid(f)){const ps=posters[f.id]||posters[target(f)];if(!ps)return;src=ps.url;el.classList.add('has-poster')}else
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
document.addEventListener('click',e=>{const g=e.target.closest('[data-genre]');if(!g)return;S.click();go('#/genre/'+encodeURIComponent(g.dataset.genre))});
const allVids=()=>vids();let _vc=null,_vk=-1;function vids(){if(_vk!==items.size){_vk=items.size;_vc=Array.from(items.values()).filter(f=>!isFolder(f)&&isVid(f))}return _vc}
const DOCX=/\.(pdf|docx?|txt|xlsx?|pptx?|url|html?|rtf|csv|md|webloc|lnk|json|xml|zip|rar|7z|jpe?g|png|gif|mp3|flac|wav|srt)$/i;
function isVid(f,d){if(!f)return false;if(f.kind)return f.kind==='video';/* resolved type stored by tools/classify.py */
 const t=f.targetId;if(t&&t!==f.id&&(d|0)<3){const x=items.get(t);if(x)return isVid(x,(d|0)+1)}
 const m=f.mimeType||'';if(/^\._|^\./.test(f.name||''))return false;if(/^application\/vnd\.google-apps\.(?!shortcut)/.test(m)||/^(text|image|audio)\/|pdf|html|url/.test(m)||DOCX.test(f.name))return false;
 return /^video\//.test(m)||/\.(mkv|mp4|m4v|avi|mov|webm|ts|m2ts|mts|mpg|mpeg|wmv|flv|3gp|ogv|vob|divx)$/i.test(f.name)}
const JUNK=/^\.|^thumbs\.db$|^desktop\.ini$/i,_dc={};
const mdate=f=>{const D=NA.dates||{},r=D[f.id]||D[f.targetId||'']||D[target(f)];return (r&&r.m)||f.modified||''};
function deepCounts(id){if(_dc[id]&&_dc[id].k===items.size&&_dc[id].d===!!NA.dates)return _dc[id];let c=0,n=0,sz=0,nw='';const seen={},st=[id];while(st.length){const x=st.pop();if(seen[x])continue;seen[x]=1;(kids.get(x)||[]).forEach(f=>{if(isFolder(f)){const t=target(f);if(id!==ROOT&&t!==id&&(t===ROOT||Object.values(FOLD).includes(t)))return;if(!seen[t]){c++;st.push(t)}}else if(!JUNK.test(f.name||'')){n++;sz+=f.size||0;const m=mdate(f);if(m>nw)nw=m}})}return _dc[id]={k:items.size,d:!!NA.dates,c,n,sz,nw}}
/* per-folder stats for sorting: own subtree only (real subfolders; folder shortcuts are not followed, so cross-links can't inflate counts) */
const _sc={};function sortCounts(id){const c=_sc[id];if(c&&c.k===items.size&&c.d===!!NA.dates)return c;let n=0,sz=0,nw='';const seen={},st=[id];while(st.length){const x=st.pop();if(seen[x])continue;seen[x]=1;(kids.get(x)||[]).forEach(f=>{if(isFolder(f)){const t=target(f);if(t===f.id&&!f.targetId&&(items.get(t)||f).parent===x&&t!==ROOT&&!Object.values(FOLD).includes(t))st.push(t)}else if(!JUNK.test(f.name||'')){n++;sz+=f.size||0;const m=mdate(f);if(m>nw)nw=m}})}return _sc[id]={k:items.size,d:!!NA.dates,n,sz,nw}}
const fmtN=n=>n.toLocaleString('en-US');
function countsLine(id){const d=deepCounts(id);return fmtN(d.c)+(d.c===1?' collection':' collections')+' · '+fmtN(d.n)+(d.n===1?' file':' files')}
/* Any Drive file link (details "Open in Drive" etc.) counts as opening the file: record it in History like Play */
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href*="drive.google.com"],a[href*="docs.google.com"]');if(!a||!window.UD)return;
 const m=a.href.match(/\/(?:file|document|spreadsheets|presentation)\/d\/([\w-]{20,})/)||a.href.match(/[?&]id=([\w-]{20,})/);if(!m)return;
 const id=m[1],f=[...(items.get(id)?[items.get(id)]:[])][0]||[...items.values()].find(x=>x.targetId===id),did=$('#details')&&!$('#details').hidden?$('#details').dataset.id:null,rec=(did&&(did===id||target(items.get(did)||{id:did})===id))?items.get(did):f;
 try{UD.opened(rec?rec.id:id,rec?rec.name:(a.title||a.textContent||'Drive file'))}catch(err){}},true);
function cnt(id){const k=kids.get(id);return k?k.length:0}
function hub(){if(document.body.classList.contains('genres-mode')&&window.FEFCGenres&&FEFCGenres.hub)return FEFCGenres.hub();const newN=NA.newCount(vids());
 const T=[['readfirst','Read First',''],['arena','New Arrivals',newN?newN+(newN===1?' New File':' New Files'):''],['support','Support Us','Patreon · PayPal · Venmo'],
  ['folder:'+FOLD.collections,'Fan Edit Collections',countsLine(FOLD.collections)],['main','',''],['folder:'+FOLD.tbc,'To Be Catalogued',countsLine(FOLD.tbc)],
  ['people','Actors\n&\nDirectors',NA.plural(peopleList().length,'Collection')],['mylist','My List','History & Starred'],['genres','Genres',(()=>{const h={};Object.keys(genreMap).forEach(x=>genreMap[x].genres.forEach(g=>h[g]=1));const n=GORDER.filter(g=>h[g]).length;return n?n+(n===1?' Genre':' Genres'):''})()]];
 const keep=[].slice.call(document.querySelectorAll('#hub .mc'));$('#hub').innerHTML=T.map((t,i)=>t[0]==='main'?`<button class="hb hb-logo" data-hub="main" aria-label="Main Collection"><img src="assets/fefc-logo.png" alt=""><small>Main Collection</small><small class="hb-cnt">${countsLine(ROOT)}</small></button>`
  :`<button class="hb" data-hub="${t[0]}">${t[0]==='mylist'?'<i class="hb-star" aria-hidden="true">★</i>':''}<span>${esc(t[1]).replace(/\n&amp;\n/,'<br><i class="amp">&amp;</i><br>').replace(/\n/g,'<br>')}</span>${t[2]?`<small>${esc(t[2])}</small>`:''}</button>`).join('');keep.forEach(x=>$('#hub').appendChild(x))}
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
 const need=h+2*Math.max(6,H.s*.7)-(gt-rb);if(need>1){H.D+=need*1.15;[].forEach.call(hb.querySelectorAll('.mc.above'),c=>c.style.top=c._top(H.D));rb=Math.max(...row.map(c=>c.getBoundingClientRect().bottom))}
 tg.style.top=Math.round((rb+gt)/2-h/2)+'px';
 const sp=$('#tagline span'),wm=$('#wordmark'),tr=[];if(wm&&wm.offsetWidth)tr.push(wm.getBoundingClientRect());const gt2=document.querySelector('#tagline .gtitle');if(gt2&&gt2.offsetWidth)tr.push(gt2.getBoundingClientRect());if(sp){const rg=document.createRange();rg.selectNodeContents(sp);[].forEach.call(rg.getClientRects(),r=>r.width&&tr.push(r))}
 [].forEach.call(hb.querySelectorAll('.mc:not(.toprow)'),c=>{const r=c.getBoundingClientRect();c.style.visibility=tr.some(t=>r.left<t.right+8&&r.right>t.left-8&&r.top<t.bottom+4&&r.bottom>t.top-4)?'hidden':''})}
addEventListener('resize',()=>requestAnimationFrame(placeHeader));
addEventListener('resize',syncTag);
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
  el.innerHTML='<img class="mi1" alt="" referrerpolicy="no-referrer"><img class="mi2" alt="" referrerpolicy="no-referrer">';hb.appendChild(el);cells.push(el);budget--}
 const pick=()=>pool.length?pool[Math.floor(Math.random()*pool.length)]:null;
 const set=(c,first)=>{const v=pick(),layers=c.children,on=c._on?0:1;c._on=!c._on;const L=layers[on];
  if(v){L.src='https://drive.google.com/thumbnail?sz=w480&id='+v.target;c.dataset.id=v.id}else{c.style.background='radial-gradient(circle at 60% 30%,hsl('+(Math.random()*360|0)+' 70% 45%),#050a14 80%)'}
  L.style.animationName='none';void L.offsetWidth;L.style.animationName='';L.className=(on?'mi2':'mi1')+' kb'+(Math.random()*4|0);
  layers[on].style.opacity=1;layers[1-on].style.opacity=0};
 cells.forEach(c=>set(c,true));requestAnimationFrame(fitHeader);clearInterval(mosaicTimer);
 mosaicTimer=setInterval(()=>{if($('#home').hidden||document.hidden)return;const k=tv?1:2;for(let j=0;j<k;j++)set(cells[Math.random()*cells.length|0])},tv?3500:1800)}
let mosT;if(window.ResizeObserver)new ResizeObserver(()=>{clearTimeout(mosT);mosT=setTimeout(()=>{if(!$('#home').hidden)mosaic()},150)}).observe(document.getElementById('hub'));addEventListener('resize',()=>{clearTimeout(mosT);mosT=setTimeout(()=>{if(!$('#home').hidden)mosaic()},250)});
function showHome(gm){document.body.classList.toggle('genres-mode',!!gm);view=gm?'genres':'home';cur=ROOT;$('#home').hidden=false;document.body.classList.add('at-home');$('#main').hidden=true;$('#bar').hidden=true;hub();const lay=()=>{const r=$('#hub').getBoundingClientRect(),k=Math.round(r.left)+'x'+Math.round(r.top)+'x'+Math.round(r.width);if($('#mosaic')._k!==k){$('#mosaic')._k=k;mosaic()}};requestAnimationFrame(lay);setTimeout(lay,500);setTimeout(lay,1500);if(document.fonts&&document.fonts.ready)document.fonts.ready.then(lay);
 setTimeout(()=>{if(document.body.classList.contains('kbd')||document.body.classList.contains('tv')){const t=$('.hb-logo')||$('#hub .hb:not(.gempty)');if(t)focusEl(t)}},30)}
function hideHome(){document.body.classList.remove('at-home');$('#home').hidden=true;$('#main').hidden=false;$('#bar').hidden=false}
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
function toggleStarFor(id){if(!window.UD||!id)return;const f=items.get(id),on=UD.toggleStar(id,f&&f.name);S.chirp&&S.chirp(on?1:0);
 document.querySelectorAll('[data-star="'+id+'"]').forEach(x=>{x.classList.toggle('on',on);x.setAttribute('aria-pressed',on)});const db=document.querySelector('#details .star-btn');if(db&&db.dataset.star===id){db.classList.toggle('on',on);db.textContent=on?'★ Starred':'☆ Star'}
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
 if(k==='search'){hideHome();open(ROOT,'all');setTimeout(()=>$('#q').focus(),50);return}
 if(k==='genres'){showHome(true);if(window.FEFCGenres&&FEFCGenres.hub)FEFCGenres.hub({get genreMap(){return genreMap},order:GORDER,items,isVid,esc});return}
 if(k==='support'){hideHome();cur='virtual';view='folder';$('#crumb').textContent='Support Us';$('#arena').innerHTML='';$('#sec2').textContent='Thank you for supporting the collection';
  $('#grid').className='support-grid';$('#grid').innerHTML=SUPPORT.map(s=>`<a class="ol-tile link sup sup-${s.name.toLowerCase()}" href="${s.url}" target="_blank" rel="noopener" aria-label="${s.name} (opens in a new tab)"><span class="sup-logo">${s.logo}</span><span class="sup-nm">${s.name}</span><small>${s.sub}</small></a>`).join('');status('');menu()}}
const HUBH={main:'#/all',arena:'#/newarrivals',readfirst:'#/readfirst',genres:'#/genres',support:'#/supportus',people:'#/people',mylist:'#/mylist',search:'#/search'};
document.addEventListener('click',e=>{const h=e.target.closest('[data-hub]');if(!h)return;S.click();const k=h.dataset.hub;go(k.indexOf('folder:')===0?'#/folder/'+k.slice(7):HUBH[k]||'#/')});
document.addEventListener('pointerover',e=>{const h=e.target.closest('.hb');if(h&&h!==lastHub){lastHub=h;S.move()}});let lastHub=null;
function doSearch(){S.click();go('#/search')}
function doMute(){S.unlock();S.toggle();sm2()}
function sm2(){const l=$('#hmutel');if(l)l.textContent=S.muted?'Sound off':'Sound on';if($('#mute'))$('#mute').textContent=S.muted?'🔇':'🔊'}
document.addEventListener('click',e=>{const h=e.target.closest('[data-hint]');if(!h)return;h.dataset.hint==='search'?doSearch():doMute()});
document.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;if(e.key==='/'||e.keyCode===403){e.preventDefault();doSearch()}else if(e.key==='m'||e.key==='M'||e.keyCode===404){doMute()}});
const RF_DOC='https://docs.google.com/document/d/1KWjoQ-wDzkj1f97lHoe1H_o41V-IYCwXj48pamczPVk/preview';
function readFirst(){const p=$('#rfpanel'),d=$('#rfdoc');{const sp=p.querySelector('.rf-top span');if(sp)sp.textContent='Read First'}if(d&&d.dataset.src&&d.dataset.src!=='data/readfirst.html'){delete d.dataset.ok;d.dataset.src='data/readfirst.html'}if(d&&!d.dataset.ok){d.dataset.ok=1;fetch('data/readfirst.html').then(r=>{if(!r.ok)throw 0;return r.text()}).then(h=>{d.innerHTML=h}).catch(()=>{d.innerHTML='<iframe src="'+RF_DOC+'" title="Read First" style="width:100%;height:80vh;border:0;background:#fff"></iframe>'})}p.hidden=false;void p.offsetWidth;RFX.open(p);setTimeout(()=>focusEl($('#rfclose')),60)}
function closeRF(){const p=$('#rfpanel');if(p.hidden)return false;S.click();RFX.close(p,()=>{p.hidden=true;const t=document.querySelector('[data-hub="readfirst"]');if(t)focusEl(t)});return true}
$('#rfclose').onclick=()=>rfDismiss();
let rfInPlace=false;function rfDismiss(){if(rfInPlace){rfInPlace=false;closeRF()}else back('#/')}
$('#rfpanel').addEventListener('click',e=>{if(!e.target.closest('.rf-in'))rfDismiss()});
const RF_IDS={'1KWjoQ-wDzkj1f97lHoe1H_o41V-IYCwXj48pamczPVk':1};
function rfKind(f){if(!f||isFolder(f)||isVid(f))return null;if(/support|patreon|paypal|venmo/i.test(f.name))return 'support';if(/\bread (first|me)\b/i.test(f.name))return 'readfirst';return null}
function openDocTile(f){const k=rfKind(f);if(k==='support'){S.click();go('#/supportus');return}const p=$('#rfpanel'),d=$('#rfdoc'),src='data/readfirst.html',ttl='Read First';
 const sp=p.querySelector('.rf-top span');if(sp)sp.textContent=ttl;if(d.dataset.src!==src){d.dataset.src=src;d.dataset.ok=1;d.innerHTML='';fetch(src).then(r=>{if(!r.ok)throw 0;return r.text()}).catch(()=>fetch('data/readfirst.html').then(r=>r.text())).then(h=>{d.innerHTML=h}).catch(()=>{})}
 rfInPlace=true;S.click();p.hidden=false;void p.offsetWidth;RFX.open(p);setTimeout(()=>focusEl($('#rfclose')),60)}
/* ---------- HASH ROUTER ---------- */
function go(h){if(location.hash===h)return route();history.pushState({fefc:1},'',h);route()}
function back(fallback){navBack=true;const h=location.hash,fb=()=>{history.replaceState(null,'',fallback||'#/');route()};if(history.state&&history.state.fefc){history.back();setTimeout(()=>{if(location.hash===h)fb()},450)}else fb()}
function parentHash(){const r=parseH();if(r[0]==='play')return r[1]?'#/edit/'+encodeURIComponent(r[1]):'#/';if(r[0]==='edit'||r[0]==='readfirst')return '#/';if(r[0]==='folder'){const f=items.get(r[1]);if(f&&(f.parent===FOLD.actors||f.parent===FOLD.directors))return '#/people';return f&&f.parent&&f.parent!==ROOT&&items.has(f.parent)?'#/folder/'+f.parent:(f&&f.parent===ROOT?'#/all':'#/')}if(r[0]==='genre')return '#/genres';return '#/'}
function parseH(){if(/^#\/arena/.test(location.hash))history.replaceState(history.state,'','#/newarrivals');return (location.hash.replace(/^#\/?newarrivals/,'#/arena').replace(/^#\/?/,'')||'').split('/').map(decodeURIComponent)}
function itemOr(id){return items.get(id)||{id:id,name:'Fan edit',mimeType:'video/mp4'}}
let baseKey=null;
function route(){const r=parseH(),k=r[0]||'';
 // overlays
 if(k!=='play'&&!$('#player').hidden){$('#player').hidden=true;killFrame();if(started())S.ambience(true)}
 if(k!=='edit'&&k!=='play'&&!$('#details').hidden){$('#details').hidden=true}
 if(k!=='readfirst')closeRF();
 if(k==='edit'){details(itemOr(r[1]),false);if(baseKey===null)renderBase('');return}
 if(k==='play'){if(baseKey===null)renderBase('');play(itemOr(r[1]));return}
 if(k==='readfirst'){if(baseKey===null||baseKey!=='')renderBase('');readFirst();return}
 renderBase(location.hash);if(view==='home'||k==='')S.ambience(true)}
function renderBase(h){baseKey=h;const r=(h.replace(/^#\/?/,'')||'').split('/').map(decodeURIComponent),k=(r[0]==='newarrivals'?'arena':r[0])||'';
 if(k==='')return showHome();
 if(k==='all')return hideHome(),open(ROOT,'all');
 if(k==='arena')return hideHome(),open(ROOT,'arena');
 if(k==='folder')return hideHome(),open(r[1]);
 if(k==='support'){history.replaceState(history.state,'','#/supportus');return hubGo('support')}
 if(k==='genres'||k==='supportus')return hubGo(k==='supportus'?'support':k);
 if(k==='people'||k==='actors'||k==='directors'){if(k!=='people')history.replaceState(history.state,'','#/people');return peoplePage()}
 if(k==='mylist')return myListPage();
 if(k==='genre'){window.__gscope=r[1];const G=r[1],list=genreList(G),folders=Object.keys(genreMap).filter(x=>genreMap[x].genres.indexOf(G)>=0).map(x=>items.get(x)||{id:x,name:genreMap[x].folder,mimeType:FOLDER,parent:ROOT});return virtual(list.length?list:folders,G)}
 if(k==='search'){hideHome();open(ROOT,'all');setTimeout(()=>{$('#q').value=r[1]||'';$('#q').focus();if(r[1])$('#q').dispatchEvent(new Event('input'))},60);return}
 showHome()}
window.addEventListener('popstate',()=>{navBack=true;route()});
/* ---------- DASHBOARD ---------- */
function status(t){$('#status').textContent=t}
function menu(){$('#menu').innerHTML=NA.menuHTML(FOLD,cur!==ROOT);const o=$('#menu .mi.on');o&&o.scrollIntoView&&o.scrollIntoView({block:'nearest',inline:'nearest'})}
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
/* ---------- SHUFFLE PLAY ---------- */
let SHUF=null;tmo('data/shuffle.json',15000).then(d=>{SHUF=new Set(d.ids)}).catch(()=>{SHUF=new Set()});
const SHUF_ICON='<svg class="shuf-ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17 3l4 4-4 4V8h-2.6l-2.2 2.7-1.3-1.6L13.4 6H17V3zM3 6h4.6l8 10H17v-3l4 4-4 4v-3h-2.6l-8-10H3V6zm0 10h3.4l2.1-2.6 1.3 1.6L7.6 18H3v-2z"/></svg>';
function shufPool(scope){if(!SHUF)return [];const seen={};return vids().filter(f=>{const t=target(f);if(seen[t]||!SHUF.has(t))return false;if(scope&&scope!=='all'&&genresOf(f).indexOf(scope)<0)return false;return seen[t]=1})}
function shufPick(scope){const pool=shufPool(scope);if(!pool.length)return null;let rec=[];try{rec=JSON.parse(localStorage.fefcShufRecent||'[]')}catch(e){}
 const fresh=pool.filter(f=>rec.indexOf(target(f))<0),from=fresh.length?fresh:pool,f=from[Math.floor(Math.random()*from.length)];
 rec.push(target(f));rec=rec.slice(-20);try{localStorage.fefcShufRecent=JSON.stringify(rec)}catch(e){}return f}
function shuffle(scope){const f=shufPick(scope);if(!f){status('Nothing to shuffle yet');return}try{sessionStorage.fefcShufScope=scope}catch(e){}window.__shufPlay=1;go('#/play/'+encodeURIComponent(f.id))}
const shufBtn=scope=>`<button class="sortpill shuf-btn" data-shuffle="${esc(scope)}" title="Play a random fan edit">${SHUF_ICON}Shuffle Play</button>`;
document.addEventListener('click',e=>{const b=e.target.closest('[data-shuffle]');if(!b)return;e.preventDefault();S.unlock&&S.unlock();shuffle(b.dataset.shuffle)});
function render(list,title,mode){const fold=list.filter(isFolder).sort((a,b)=>a.name.localeCompare(b.name)),vids=list.filter(f=>!isFolder(f)).sort((a,b)=>a.name.localeCompare(b.name));
 $('#crumb').textContent=title;hideHome();
 $('#arena').innerHTML='';NA.top(allVids());const isNew={};if(mode!=='collections')list.forEach(f=>{if(NA.isNew(f))isNew[f.id]=1});
 const all=mode==='arena'?vids:mode==='collections'?fold:[...fold,...vids];
 $('#sec2').textContent=mode==='arena'?'Every fan edit in the collection · newest first':(cur===ROOT||cur===FOLD.collections||cur===FOLD.tbc)?countsLine(cur):`${fold.length} collections · ${vids.length} fan edits`;
 const isAd=f=>!isVid(f)&&/^\s*\w{1,3}\s*-\s*support\b|support patreon|paypal\/venmo/i.test(f.name),nat=(a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}),docs=vids.filter(f=>!isVid(f)&&!isAd(f)),ck=mode==='arena'?'az':csortGet(cur),evs=csortList(vids.filter(f=>isVid(f)||isAd(f)),ck,isAd),Q=[],sec=(k,l,a)=>{if(!a.length)return '';const qi=Q.length;Q.push(a.slice(FIRST_TILES));return `<div class="ol-div"><span>${l}</span><i></i><b>${a.length}</b></div><div class="sgrid ${k}" data-q="${qi}">${a.slice(0,FIRST_TILES).map(f=>tile(f,isNew[f.id])).join('')}</div>`};
 const g=$('#grid');if(mode==='arena'){$('#arena').innerHTML='';NA.render(window._idx?Array.from(items.values()).filter(f=>!isFolder(f)&&isVid(f)):all,tile,art,i=>items.get(i))}else{g.className='sectioned';const shs=cur===ROOT&&mode!=='collections'?'all':cur==='virtual'&&window.__gscope&&title===window.__gscope?window.__gscope:'',sb=(list.length>1&&cur!=='virtual')||shs?`<div class="sortbar csort" role="toolbar" aria-label="Sort" data-for="${cur}">${shs?shufBtn(shs):''}${cur==='virtual'?'':CSORTS.map(([v,l])=>`<button class="sortpill${v===ck?' on':''}" data-csort="${v}" aria-pressed="${v===ck}">${l}</button>`).join('')}</div>`:'';const fsorted=csortList(fold,ck,isAd);g.innerHTML=sb+sec('folds','COLLECTIONS',fsorted.filter(f=>!people[target(f)]))+sec('folds','PEOPLE',fsorted.filter(f=>people[target(f)]))+(mode==='collections'?'':sec('vids','FAN EDITS',evs)+sec('docs','DOCUMENTS',docs))}
 document.querySelectorAll('#arena .ol-tile,#grid .ol-tile').forEach(lazyArt);if(mode!=='arena')drain(Q,isNew);
 status(all.length?'':(live?'Empty':'Nothing here yet'));menu();restoreScroll()}
async function open(id,mode='home'){cur=id;view=id===ROOT?mode:'folder';$('#q').value='';if(live&&!kids.has(id)){try{await loadFolder(id)}catch(e){live=false;status('');add(window._idx||[])}}
 const f=items.get(id);if(id===ROOT&&mode==='home')return showHome();render(kids.get(id)||[],id===ROOT?{home:'The Fan Edit Fan Club Collection',all:'The Fan Edit Fan Club Collection',arena:'New Arrivals',collections:'Collections'}[mode]:f.name,id===ROOT?mode:'home')}
/* ---------- DETAILS (LCARS) ---------- */
async function omdb(title,year){if(!C.OMDB_API_KEY)return null;try{const j=await(await fetch(`https://www.omdbapi.com/?apikey=${C.OMDB_API_KEY}&t=${encodeURIComponent(title)}${year?'&y='+year:''}`)).json();return j.Response==='True'?j:null}catch(e){return null}}
async function ytTrailer(q){if(!C.YOUTUBE_API_KEY)return null;try{const j=await(await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(q)}&key=${C.YOUTUBE_API_KEY}`)).json();const v=j.items?.[0];return v?{youtubeId:v.id.videoId,title:v.snippet.title,auto:true}:null}catch(e){return null}}
async function details(f,push=true){S.open();S.ambience(false);const p=parse(f.name),m=meta[f.id]||meta[target(f)]||{};let film=m.sourceFilm||{title:p.film,year:p.year};
 let ratings=[...(m.ratings||[])],cast=m.cast||[],desc=m.description,trailer=m.trailer;
 if(!m.ratings){const o=await omdb(film.title,film.year);if(o){film={title:o.Title,year:o.Year,director:o.Director};cast=o.Actors?o.Actors.split(', ').map(n=>({name:n})):[];
   if(o.imdbRating&&o.imdbRating!=='N/A')ratings.push({source:'IMDb',value:o.imdbRating+'/10',url:`https://www.imdb.com/title/${o.imdbID}/`});
   (o.Ratings||[]).filter(r=>r.Source==='Rotten Tomatoes').forEach(r=>ratings.push({source:'Rotten Tomatoes',value:r.Value,url:`https://www.rottentomatoes.com/search?search=${encodeURIComponent(o.Title)}`}));
   desc=desc||null;m.filmPlot=o.Plot}}
 if(!trailer)trailer=await ytTrailer(p.raw+' fan edit trailer');
 const need=['IMDb','Rotten Tomatoes','FanEdit.org','Movies Remastered'].filter(s=>!ratings.some(r=>r.source.startsWith(s)));
 const rt=ratings.map(r=>r.url?`<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.source)}<b>${r.value?esc(r.value):'VIEW ›'}</b></a>`:`<span class="na">${esc(r.source)}<span>${esc(r.note||'Not available')}</span></span>`).join('')+need.map(s=>`<span class="na">${s}<span>No data</span></span>`).join('');
 const id=target(f);
 $('#details').innerHTML=`<div class="lc-top"><div class="lc-elbow"></div><div class="lc-bars"><span class="p2" style="width:60px"></span><span class="p3" style="flex:1"></span></div><div class="lc-title${(m.title||p.raw).length>34?' long':''}" title="${esc(m.title||p.raw)}">${esc(m.title||p.raw)}</div><div class="lc-bars" style="flex:0 0 40px"><span class="p1" style="flex:1;border-radius:0 13px 13px 0"></span></div></div>
 <div class="lc-side"><button class="pill p1" data-act="back">◀ Back</button><button class="pill p6" data-act="play">▶ Play</button><a class="pill p3" href="https://drive.google.com/file/d/${id}/view" target="_blank" rel="noopener">Open in Drive</a><div class="pill p2 lab">FEFC ${String(hash(f.id)%9000+1000)}</div><div class="pill p5 lab">${esc(sz(f.size)||'—')}</div><div class="grow"></div></div>
 <div class="lc-body"><div>
  <h3 class="lc-h">Description</h3>${desc?`<p>${esc(desc)}</p>${m.descriptionSource?`<p class="src">Source: <a href="${esc(m.descriptionSource.url)}" target="_blank" rel="noopener">${esc(m.descriptionSource.name)}</a></p>`:''}`:`<p class="src">No fan-edit description available.</p>`}
  ${m.filmPlot?`<p class="src">Source film plot (OMDb): ${esc(m.filmPlot)}</p>`:''}
  <h3 class="lc-h l">Source film</h3><p>${esc(film.title||'Unknown')}${film.year?' ('+esc(film.year)+')':''}${film.director?' · Dir. '+esc(film.director):''}${m.editor?'<br><span class="src">Fan edit by '+esc(m.editor)+'</span>':''}</p>
  <h3 class="lc-h p">Cast</h3>${cast.length?`<div class="cast">${cast.map(c=>`<span>${esc(c.name)}</span>`).join('')}</div>${m.castSource?`<p class="src">Source: <a href="${esc(m.castSource.url)}" target="_blank" rel="noopener">${esc(m.castSource.name)}</a></p>`:''}`:'<p class="src">No cast data.</p>'}
 </div><div>
  <h3 class="lc-h b">Ratings</h3><div class="rt">${rt}</div>
  <h3 class="lc-h p" style="margin-top:14px">Trailer</h3><div class="trailer">${trailer?.youtubeId?`<iframe src="https://www.youtube-nocookie.com/embed/${esc(trailer.youtubeId)}" allowfullscreen allow="encrypted-media"></iframe>`:`<span>No trailer found for this fan edit.<br><a href="https://www.youtube.com/results?search_query=${encodeURIComponent(p.raw+' fan edit trailer')}" target="_blank" rel="noopener">Search YouTube ›</a></span>`}</div>
  ${trailer?.auto?'<p class="src">Trailer is the top YouTube search result — may not be official.</p>':''}
  <p class="lc-num">LCARS ACCESS ${new Date().getFullYear()}.${String(hash(f.name)%999).padStart(3,'0')} · STARDATE ${(Date.now()/864e5).toFixed(1)}</p>
 </div></div><div class="lc-foot"><div class="lc-elbow" style="background:var(--l)"></div><span></span><span></span><span></span></div>`;
 $('#details').hidden=false;$('#details').dataset.id=f.id;
 let n=0;$('#details').querySelectorAll('.pill,.rt a').forEach(el=>el.addEventListener('pointerenter',()=>S.chirp(n++)))}
function killFrame(){const o=$('#pframe');if(o){const n=o.cloneNode(false);n.removeAttribute('src');o.replaceWith(n)}}
function newFrame(u){const o=$('#pframe'),n=o.cloneNode(false);n.src=u;o.replaceWith(n)}
function started(){return !!window._u&&document.body.classList.contains('intro-done')}
function play(f){const id=target(f);try{window.UD&&UD.opened(f.id,f.name)}catch(e){}S.ambience(false);S.click();$('#ptitle').textContent=parse(f.name).raw;newFrame(`https://drive.google.com/file/d/${id}/preview`);$('#popen').href=`https://drive.google.com/file/d/${id}/view`;$('#player').hidden=false}
/* ---------- EVENTS ---------- */
document.addEventListener('click',e=>{const nav=e.target.closest('[data-nav]');if(nav){S.click();const k=nav.dataset.nav;if(k==='up')return back(parentHash());return go(k==='home'?'#/':'#/'+k)}
 const act=e.target.closest('[data-act]');if(act){S.chirp(1);const f=items.get($('#details').dataset.id);if(act.dataset.act==='back')back('#/');else go('#/play/'+f.id);return}
 const t=e.target.closest('.ol-tile');if(t&&!t.dataset.genre&&!t.classList.contains('link')){const f=items.get(t.dataset.id);if(!f)return;if(isFolder(f)){S.click();go('#/folder/'+target(f))}else if(rfKind(f)){openDocTile(f)}else if(!isVid(f)){S.click();window.open('https://drive.google.com/file/d/'+target(f)+'/view','_blank')}else go('#/edit/'+f.id)}});
let lastHover=null;document.addEventListener('pointerover',e=>{const t=e.target.closest('.ol-tile,.mi');if(t&&t!==lastHover){lastHover=t;S.move()}});
document.addEventListener('focusin',e=>{if(e.target.matches('.ol-tile,.mi'))S.move()});
/* ---------- AI search (server-side Gemini via /api/ai-search; key never in the browser) ---------- */
let aiSeq=0;
async function aiSearch(q){q=(q||'').trim();if(!q)return;const my=++aiSeq;pageShell('Ask AI','Looking for: “'+q+'”');const g=$('#grid');g.className='sectioned';g.innerHTML='<div class="ai-wait">✦ Searching the collection…</div>';
 try{const r=await fetch('/api/ai-search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({q:q.slice(0,200)})});if(!r.ok)throw 0;const j=await r.json();if(my!==aiSeq)return;
  const res=(j.results||[]).map(x=>({f:items.get(x.id),why:x.reason})).filter(x=>x.f);if(!res.length)throw 0;
  $('#sec2').textContent=res.length+' AI matches for “'+q+'”';
  g.innerHTML=`<div class="ol-div"><span>AI MATCHES</span><i></i><b>${res.length}</b></div><div class="sgrid vids ai-res">${res.map(x=>`<div class="ai-cell">${tile(x.f)}<p class="ai-why">${esc(x.why)}</p></div>`).join('')}</div>`;g.querySelectorAll('.ol-tile').forEach(lazyArt)}
 catch(e){if(my!==aiSeq)return;open(ROOT,'all').then(()=>{$('#q').value=q;$('#q').dispatchEvent(new Event('input'))})}}
const looksLikeQuestion=q=>/\?$/.test(q)||q.trim().split(/\s+/).length>=3;
$('#aiq').addEventListener('click',()=>{const q=$('#q').value.trim();if(q)aiSearch(q);else{$('#q').focus();$('#q').placeholder='Describe a fan edit, then Ask AI'}});
$('#q').addEventListener('keydown',e=>{if(e.key==='Enter'){const q=e.target.value.trim();if(q&&looksLikeQuestion(q)){e.preventDefault();clearTimeout(qt);aiSearch(q)}}});
let qt;$('#q').addEventListener('input',e=>{clearTimeout(qt);qt=setTimeout(async()=>{const q=e.target.value.trim().toLowerCase();if(!q)return open(cur);
 let res=[...items.values()].filter(f=>f.name.toLowerCase().includes(q));
 if(live){try{const s=q.replace(/'/g,"\\'");const r=await api(`name contains '${s}' and trashed=false and (mimeType contains 'video/' or mimeType='${SC}')`);r.files.map(f=>norm(f)).forEach(f=>{if(!items.has(f.id)){items.set(f.id,f);res.push(f)}})}catch(e){}}
 view='search';render(res,'Search: '+q,'home')},250)});
setTimeout(sm2,0);
/* ---------- TV / D-PAD SPATIAL NAVIGATION ---------- */
const FOC='#rfclose,#rfdoc,.hb,.hint-btn,.mi,#q,.ol-tile,.sortpill,#details .pill:not(.lab),#details a,#player .pill,#pframe';
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
function goBack(){if(!$('#rfpanel').hidden)return rfDismiss();S.click();back(parentHash())}
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
(function(){const b=document.createElement('button');b.id='tvq';b.type='button';b.className='mi tv-only';b.textContent='⌕ Search';$('#bar').insertBefore(b,$('#q'));
 const ov=document.createElement('div');ov.id='tvsearch';ov.hidden=true;ov.innerHTML='<div class="tvs-box"><label>Search the collection</label><input id="tvs-in" type="search" autocomplete="off" placeholder="Title, or describe a fan edit…"><div class="tvs-row"><button type="button" class="mi" data-tvs="find">Search</button><button type="button" class="mi ai-btn" data-tvs="ai">✦ Ask AI</button><button type="button" class="mi" data-tvs="close">Close</button></div></div>';document.body.appendChild(ov);
 const inp=ov.querySelector('#tvs-in'),close=()=>{ov.hidden=true;focusEl(b)},run=ai=>{const q=inp.value.trim();ov.hidden=true;if(!q)return focusEl(b);if(ai||looksLikeQuestion(q))aiSearch(q);else go('#/search/'+encodeURIComponent(q))};
 b.onclick=()=>{ov.hidden=false;inp.value='';setTimeout(()=>inp.focus(),30)};
 ov.addEventListener('click',e=>{const x=e.target.closest('[data-tvs]');if(!x)return;x.dataset.tvs==='close'?close():run(x.dataset.tvs==='ai')});
 ov.addEventListener('keydown',e=>{const k=e.keyCode;e.stopPropagation();const btns=[].slice.call(ov.querySelectorAll('button')),i=btns.indexOf(document.activeElement);
  if(k===27||k===10009||k===461||e.key==='GoBack'){e.preventDefault();close();return}
  if(e.target===inp){if(k===13){e.preventDefault();run(false)}else if(k===40){e.preventDefault();btns[0].focus()}return}
  if(k===37||k===39){e.preventDefault();(btns[i+(k===39?1:-1)]||btns[i]).focus()}else if(k===38){e.preventDefault();inp.focus()}else if(k===13){e.preventDefault();document.activeElement.click()}},true)})();
// focus first item after views open
const _render=render;render=function(){_render.apply(this,arguments);if(document.body.classList.contains('tv')){const t=document.querySelector('#arena .ol-tile,#grid .ol-tile');if(t)focusEl(t)}};
const _details=details;details=async function(){await _details.apply(this,arguments);const p=document.querySelector('#details [data-act="play"]');if(p){const id=$('#details').dataset.id;if(id&&window.UD&&!p.parentNode.querySelector('.star-btn')){const on=UD.isStarred(id);p.insertAdjacentHTML('afterend',`<button class="pill p4 star-btn${on?' on':''}" data-star="${id}">${on?'★ Starred':'☆ Star'}</button>`)}focusEl(p)}};
const _play=play;play=function(f){_play(f);(()=>{let b=$('#pshuf');if(!b){b=document.createElement('button');b.id='pshuf';b.className='pill p6 shuf-again';b.innerHTML=SHUF_ICON+'Shuffle again';b.onclick=()=>shuffle(sessionStorage.fefcShufScope||'all');$('#popen').before(b)}let sc='';try{sc=sessionStorage.fefcShufScope||''}catch(e){}if(!window.__shufPlay){try{sessionStorage.removeItem('fefcShufScope')}catch(e){}sc=''}window.__shufPlay=0;b.hidden=!sc})();setTimeout(()=>focusEl($('#back')),50)};
if(/Tizen|Web0S|webOS|SMART-TV|SmartTV|NetCast|AFT|CrKey|BRAVIA|Android TV|GoogleTV|Silk/i.test(navigator.userAgent)||P.get('tv'))document.body.classList.add('tv');
document.addEventListener('keydown',()=>document.body.classList.add('kbd'),{once:true});
/* ---------- BOOT ---------- */
intro();if(C.GOOGLE_API_KEY){live=true;}
tmo('data/folderthumbs.json',10000).then(m=>{fthumbs=m;document.querySelectorAll('#grid .ol-tile').forEach(el=>{const f=items.get(el.dataset.id);if(f&&isFolder(f)&&!el.querySelector('img'))art(el,f)})}).catch(()=>{});
const reArt=()=>document.querySelectorAll('#grid .ol-tile,#arena .ol-tile').forEach(el=>{const f=items.get(el.dataset.id);if(f&&!el.querySelector('img')){if(isFolder(f)&&people[target(f)]){el.outerHTML=tile(f);const n=document.querySelector('[data-id="'+f.id+'"]');n&&art(n,f)}else art(el,f)}});
tmo('data/posters.json',15000).then(m=>{posters=m;reArt()}).catch(()=>{});tmo('data/people.json',10000).then(m=>{people=m;reArt()}).catch(()=>{});
tmo('data/genres.json',10000).then(g=>{genreMap=g;if(!$('#home').hidden)hub()}).catch(()=>{});
tmo('data/mosaic.json',10000).then(m=>{mosaicList=m;if(!$('#home').hidden)mosaic()}).catch(()=>{});
tmo('data/dates.json',15000).then(m=>{NA.dates=m;(window.requestIdleCallback||setTimeout)(()=>NA.top(vids()));if(!$('#home').hidden)hub();else if(/^#\/(newarrivals|arena|folder)/.test(location.hash))route()}).catch(e=>console.warn(e));
tmo('data/metadata.json',8000).then(m=>meta=m).catch(e=>console.warn(e));
tmo('data/index.json',15000).then(d=>{window._idx=d.items;if(!live)add(d.items);if(!live)tmo('data/links.json',15000).then(L=>{for(const p in L){if(!kids.has(p))kids.set(p,[]);const a=kids.get(p);for(const id of L[p]){const f=items.get(id);if(f&&!a.includes(f))a.push(f)}}if(/^#\/(folder|all|people|actors|directors|mylist|genre\/)/.test(location.hash))route();else if(!$('#home').hidden)hub()}).catch(()=>{});if(d.partial!==false&&!live)tmo('data/index.interim.json',20000).then(x=>{add(x.items.filter(f=>!items.has(f.id)));window._idx=Array.from(items.values());route()}).catch(()=>{})}).catch(e=>{console.warn(e);status('Saved index unavailable')}).then(()=>{route();
 if(P.get('focus')){setTimeout(()=>{document.body.classList.add('kbd');const t=document.querySelectorAll('.ol-tile,.hb')[+P.get('focus')];if(t)focusEl(t)},300)}
 const e=P.get('edit');if(e)go('#/edit/'+e);const pp=P.get('play');if(pp)go('#/play/'+pp);if(P.get('readfirst'))go('#/readfirst')});
$('#back').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();goBack()});
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
;(function(){const sync=()=>{const d=!document.getElementById('details').hidden&&document.getElementById('player').hidden;document.body.classList.toggle('overlay',!document.getElementById('details').hidden||!document.getElementById('player').hidden);document.body.classList.toggle('details-open',d);if(d){const b=document.getElementById('bar');document.documentElement.style.setProperty('--barh',(b.offsetHeight||56)+'px');if(window.NA&&NA.menuHTML)try{menu()}catch(e){}}};const mo=new MutationObserver(sync);['details','player'].forEach(i=>mo.observe(document.getElementById(i),{attributes:true,attributeFilter:['hidden']}));sync()})();
addEventListener('load',()=>{const w=document.getElementById('wordmark');if(w)window.dispatchEvent(new Event('resize'))});

(()=>{const h=document.getElementById('hints'),pl=document.getElementById('player'),rf=document.getElementById('rfpanel'),up=()=>{if(h)h.style.display=(pl&&!pl.hidden)||(rf&&!rf.hidden)?'none':''};if(window.MutationObserver)[pl,rf].forEach(x=>x&&new MutationObserver(up).observe(x,{attributes:true,attributeFilter:['hidden']}));up()})(); // one sound/legend control on every page, hidden in the player
