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
function intro(){const el=$('#intro');if(P.get('nointro')){el.remove();document.body.classList.add('intro-done','no-intro');return}
 const seen=localStorage.fefcSeen==='1'&&!P.get('fullintro'),short=seen||P.get('shortintro'),tv=document.body.classList.contains('tv')||/Tizen|Web0S|webOS|SMART-TV|SmartTV|NetCast|AFT|BRAVIA|Android TV|GoogleTV/i.test(navigator.userAgent);
 document.body.classList.add('cintro');const tg=$('#tagline');
 const R=window.FEFCIntro.create({tv,tagline:tg});el.prepend(R.canvas);
 fetch('data/mosaic.json').then(r=>r.json()).then(m=>R.setTiles(m.map(x=>x.target||x.id))).catch(()=>{});
 const fr=P.get('introframe');if(fr!==null){document.body.classList.add('frozen');el.querySelector('.ihint').hidden=true;const draw=()=>R.frame(+fr);draw();[300,1000,2000,3500].forEach(t=>setTimeout(draw,t));return}
 let done=false,raf=0;const end=skipped=>{if(done)return;done=true;cancelAnimationFrame(raf);localStorage.fefcSeen='1';if(skipped){S.introStop();S.bell()}
  tg.style.opacity='';tg.style.clipPath='';tg.style.visibility='';document.body.classList.remove('cintro');el.classList.add('done');document.body.classList.add('intro-done');$('#home').classList.add('enter');setTimeout(()=>{S.ambience($('#player').hidden&&$('#details').hidden);el.remove()},skipped?600:1800)};
 let t0=performance.now(),last=0;const hint=el.querySelector('.ihint'),snd=el.querySelector('.isnd');
 const loop=now=>{const r=(now-t0)/1000,s=short?R.mapC(r):r;last=r;R.frame(s);if(s>=24.2)return end(false);raf=requestAnimationFrame(loop)};
 let st='suspended';try{S.unlock();st=S.state()}catch(e){}
 if(st==='running'){try{S.introSeq(short)}catch(e){}}
 else if(snd){snd.hidden=false;snd.addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();snd.hidden=true;S.unlock();setTimeout(()=>{try{S.introSeq(short,(performance.now()-t0)/1000)}catch(e){}},40)})}
 R.frame(0);raf=requestAnimationFrame(loop);
 const sk=e=>{if(e.type==='keydown'&&e.repeat)return;if(e.target===snd)return;e.preventDefault&&e.preventDefault();removeEventListener('keydown',sk,true);el.removeEventListener('pointerdown',sk);S.unlock();if(snd)snd.hidden=true;end(true)};
 setTimeout(()=>{if(!done){addEventListener('keydown',sk,true);el.addEventListener('pointerdown',sk)}},250)}
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
 const go=()=>google.accounts.oauth2.initTokenClient({client_id:C.GOOGLE_CLIENT_ID,scope:'https://www.googleapis.com/auth/drive.readonly',callback:async r=>{if(r.access_token){token=r.access_token;live=true;$('#auth').textContent='Live';kids.clear();await loadFolder(ROOT);open(cur)}}}).requestAccessToken();
 if(window.google?.accounts)return go();const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.onload=go;document.head.appendChild(s)}
/* ---------- ART ---------- */
const cache=JSON.parse(localStorage.fefcCache||'{}');const save=()=>localStorage.fefcCache=JSON.stringify(cache);
async function tmdbFind(q,year){if(!C.TMDB_API_KEY)return null;const k='t:'+q+year;if(k in cache)return cache[k];
 try{const j=await(await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${C.TMDB_API_KEY}&query=${encodeURIComponent(q)}${year?'&year='+year:''}`)).json();cache[k]=(j.results||[]).find(x=>x.poster_path)||null}catch(e){cache[k]=null}save();return cache[k]}
function artBg(f){const h=HUES[hash(parse(f.name).series||f.name)%8];return `radial-gradient(circle at 75% 20%,hsl(${h} 90% 60% / .85),hsl(${h} 70% 25%) 45%,#050a14 100%)`}
function tile(f,live_){const fold=isFolder(f),p=parse(f.name);return `<button class="ol-tile ${live_?'live':''}" data-id="${f.id}" title="${esc(f.name)}"><div class="art" style="background:${artBg(f)}"></div><span class="kind">${live_?'NEW':fold?'COLLECTION':'FAN EDIT'}</span><div class="nm">${esc(fold?f.name:p.raw)}${!fold&&f.size?`<br><small style="opacity:.6">${sz(f.size)}</small>`:''}</div></button>`}
async function art(el,f){let src=null;const p=parse(f.name);
 if(isFolder(f)){const fid=target(f);let t=fthumbs[fid];if(!t){let q=[fid];for(let d=0;d<3&&!t&&q.length;d++){const nq=[];for(const id of q){const ks=kids.get(id)||[],v=ks.find(x=>!isFolder(x)&&isVid(x));if(v){t=target(v);break}ks.forEach(x=>{if(isFolder(x))nq.push(target(x))})}q=nq.slice(0,40)}}if(t)src='https://drive.google.com/thumbnail?sz=w640&id='+t}
 else if(f.mimeType==='application/octet-stream'&&!f.targetId)src=null;else src=f.thumb?f.thumb.replace(/=s\d+$/,'=s640'):'https://drive.google.com/thumbnail?sz=w640&id='+target(f);
 if(!src){const r=await tmdbFind(isFolder(f)?f.name:p.film,p.year);if(r)src='https://image.tmdb.org/t/p/w780'+(r.backdrop_path||r.poster_path)}
 if(src){const im=new Image();im.alt='';im.referrerPolicy='no-referrer';im.onload=()=>{if(im.naturalWidth>40){const a=el.querySelector('.art');a?a.appendChild(im):el.insertBefore(im,el.firstChild)}};im.src=src}}
/* ---------- ONLIVE HOME HUB ---------- */
const FOLD={readFirst:'1Aw4hr8uM3dsj_txpxPkEJxPDfNjmcYRT',collections:'1fEaxNbFIrEwKRygETVm4jgtJGVAqKxGB',tbc:'1503Wl56hzRppaIFcQisvQksOaeYOEjnk',actors:'1Jb0DtQC05fOdpiNg-O88fUpwI5ic3UHS',directors:'1u2B5d9cb1zAtrtdF_rA3eXhtcFgggSib'};
const SUPPORT=[{name:'Patreon',url:'https://www.patreon.com/cw/FanEditFanClub'},{name:'PayPal',url:'https://www.paypal.biz/faneditfanclub'},{name:'Venmo',url:'https://venmo.com/u/FanEditFanClub'}];
let mosaicList=[],mosaicTimer=null,genreMap={},fthumbs={};
const GORDER=['Action','Sci-Fi','Horror','Comedy','Animation','Drama','Fantasy','Superhero','Thriller','Adventure','War','Western','Family','Musical','Documentary','Uncategorized'];
function topFolder(f){let x=f,guard=0;while(x&&x.parent&&x.parent!==ROOT&&guard++<30)x=items.get(x.parent);return x&&x.parent===ROOT?x.id:null}
function genresOf(f){const t=topFolder(f),g=t&&genreMap[t];return g?g.genres:['Uncategorized']}
function genreList(g){return vids().filter(f=>genresOf(f).indexOf(g)>=0)}
function genreStrip(){const have={};Object.keys(genreMap).forEach(k=>genreMap[k].genres.forEach(g=>have[g]=1));have.Uncategorized=1;
 $('#genres').innerHTML='<span class="glab">Genres</span>'+GORDER.filter(g=>have[g]).map(g=>`<button class="gt" data-genre="${g}">${g}</button>`).join('')}
document.addEventListener('click',e=>{const g=e.target.closest('[data-genre]');if(!g)return;S.click();go('#/genre/'+encodeURIComponent(g.dataset.genre))});
function vids(){return Array.from(items.values()).filter(f=>!isFolder(f)&&isVid(f))}
function isVid(f){return /^video\//.test(f.mimeType)||/\.(mkv|mp4|m4v|avi|mov|webm)$/i.test(f.name)}
function cnt(id){const k=kids.get(id);return k?k.length:0}
function hub(){const newN=NA.newCount(vids());
 const T=[['readfirst','Read First',''],['arena','New Arrivals',newN?newN+' new':''],['support','Support Us','Patreon · PayPal · Venmo'],
  ['folder:'+FOLD.collections,'Fan Edit Collections',NA.plural((kids.get(FOLD.collections)||[]).filter(isFolder).length,'Collection')],['main','',''],['folder:'+FOLD.tbc,'To Be Catalogued',NA.plural(NA.deep(FOLD.tbc,kids,isFolder),'Unorganized File')],
  ['folder:'+FOLD.actors,'Actors',NA.plural(cnt(FOLD.actors),'Collection')],['folder:'+FOLD.directors,'Directors',NA.plural(cnt(FOLD.directors),'Collection')],['genres','Genres',Object.keys(genreMap).length?'Browse by genre':'']];
 const keep=[].slice.call(document.querySelectorAll('#hub .mc'));$('#hub').innerHTML=T.map((t,i)=>t[0]==='main'?`<button class="hb hb-logo" data-hub="main" aria-label="Main Collection"><img src="assets/fefc-logo.png" alt=""><small>Main Collection</small></button>`
  :`<button class="hb" data-hub="${t[0]}"><span>${esc(t[1])}</span>${t[2]?`<small>${esc(t[2])}</small>`:''}</button>`).join('');keep.forEach(x=>$('#hub').appendChild(x))}
function mosaic(){const M=$('#mosaic');const tv=document.body.classList.contains('tv');
 const n=tv?14:Math.max(10,Math.min(22,Math.round(innerWidth*innerHeight/60000)));
 let pool=mosaicList.length?mosaicList.slice():vids().slice(0,40).map(f=>({id:f.id,target:target(f),name:f.name}));
 M.innerHTML='';[].slice.call(document.querySelectorAll('#hub .mc')).forEach(x=>x.remove());const cells=[];
 // geometry: tiles sized like hub tiles, aligned to hub edges, only OUTSIDE the hub box and below the tagline
 const H=$('#home'),hb=$('#hub');const _tf=hb.style.transform;hb.style.transform='translate(-50%,-50%)';const W=H.clientWidth,Ht=H.clientHeight,HR=H.getBoundingClientRect(),BR=hb.getBoundingClientRect(),hw=BR.width,hh=BR.height;
 const hx=BR.left-HR.left,hy=BR.top-HR.top,g=parseFloat(getComputedStyle(hb).columnGap)||8;
 const tw=(hw-2*g)/3,th=(hh-2*g)/3;const tg=$('#tagline span'),tr=tg?tg.getBoundingClientRect():null,hr=H.getBoundingClientRect();
 const tb=tr&&tr.height?{l:tr.left-hr.left-g,t:tr.top-hr.top-g,r:tr.right-hr.left+g,b:tr.bottom-hr.top+g}:null;
 hb.style.transform=_tf;const ov=(a,b)=>a.l<b.r&&a.r>b.l&&a.t<b.b&&a.b>b.t,hub={l:hx-g/2,t:hy-g/2,r:hx+hw+g/2,b:hy+hh+g/2};
 const cols=Math.ceil(hx/(tw+g))+1,rows=Math.ceil(hy/(th+g))+1;let budget=tv?40:90;
 for(let r=-rows;r<3+rows&&budget>0;r++)for(let c=-cols;c<3+cols&&budget>0;c++){
  const x=hx+c*(tw+g)+(c<0?-g:c>2?g:0),y=hy+r*(th+g)+(r<0?-g:r>2?g:0),box={l:x,t:y,r:x+tw,b:y+th};
  if(box.r<-tw*.6||box.b<-th*.4||box.l>W+tw*.6||box.t>Ht+th*.6||ov(box,hub)||(tb&&ov(box,tb)))continue;
  const el=document.createElement('div');el.className='mc';const ex=(c<0?-g:c>2?g:0),ey=(r<0?-g:r>2?g:0);
  el.style.cssText=`left:calc(${c} * ((100% - ${2*g}px) / 3 + ${g}px) + ${ex}px);top:calc(${r} * ((100% - ${2*g}px) / 3 + ${g}px) + ${ey}px);width:calc((100% - ${2*g}px) / 3);height:calc((100% - ${2*g}px) / 3)`;
  el.innerHTML='<img class="mi1" alt="" referrerpolicy="no-referrer"><img class="mi2" alt="" referrerpolicy="no-referrer">';hb.appendChild(el);cells.push(el);budget--}
 const pick=()=>pool.length?pool[Math.floor(Math.random()*pool.length)]:null;
 const set=(c,first)=>{const v=pick(),layers=c.children,on=c._on?0:1;c._on=!c._on;const L=layers[on];
  if(v){L.src='https://drive.google.com/thumbnail?sz=w480&id='+v.target;c.dataset.id=v.id}else{c.style.background='radial-gradient(circle at 60% 30%,hsl('+(Math.random()*360|0)+' 70% 45%),#050a14 80%)'}
  L.style.animationName='none';void L.offsetWidth;L.style.animationName='';L.className=(on?'mi2':'mi1')+' kb'+(Math.random()*4|0);
  layers[on].style.opacity=1;layers[1-on].style.opacity=0};
 cells.forEach(c=>set(c,true));clearInterval(mosaicTimer);
 mosaicTimer=setInterval(()=>{if($('#home').hidden||document.hidden)return;const k=tv?1:2;for(let j=0;j<k;j++)set(cells[Math.random()*cells.length|0])},tv?3500:1800)}
let mosT;if(window.ResizeObserver)new ResizeObserver(()=>{clearTimeout(mosT);mosT=setTimeout(()=>{if(!$('#home').hidden)mosaic()},150)}).observe(document.getElementById('hub'));addEventListener('resize',()=>{clearTimeout(mosT);mosT=setTimeout(()=>{if(!$('#home').hidden)mosaic()},250)});
function showHome(){view='home';cur=ROOT;$('#home').hidden=false;document.body.classList.add('at-home');$('#main').hidden=true;$('#bar').hidden=true;hub();const lay=()=>{const r=$('#hub').getBoundingClientRect(),k=Math.round(r.left)+'x'+Math.round(r.top)+'x'+Math.round(r.width);if($('#mosaic')._k!==k){$('#mosaic')._k=k;mosaic()}};requestAnimationFrame(lay);setTimeout(lay,500);setTimeout(lay,1500);if(document.fonts&&document.fonts.ready)document.fonts.ready.then(lay);
 setTimeout(()=>{if(document.body.classList.contains('kbd')||document.body.classList.contains('tv'))focusEl($('.hb-logo'))},30)}
function hideHome(){document.body.classList.remove('at-home');$('#home').hidden=true;$('#main').hidden=false;$('#bar').hidden=false}
function virtual(list,title){hideHome();cur='virtual';view='folder';render(list,title,'home')}
function _x(){}
function hubGo(k){S.click();
 if(k==='main')return hideHome(),open(ROOT,'all');
 if(k==='arena'||k==='collections')return hideHome(),open(ROOT,k);
 if(k==='readfirst')return readFirst();
 if(k.indexOf('folder:')===0)return hideHome(),open(k.slice(7));
 if(k==='actors')return virtual([items.get(FOLD.actors)||{id:FOLD.actors,name:'Actors',mimeType:FOLDER},items.get(FOLD.directors)||{id:FOLD.directors,name:'Directors',mimeType:FOLDER}],'Actors & Directors');
 if(k==='search'){hideHome();open(ROOT,'all');setTimeout(()=>$('#q').focus(),50);return}
 if(k==='genres'){hideHome();cur='virtual';view='folder';const have={};Object.keys(genreMap).forEach(x=>genreMap[x].genres.forEach(g=>have[g]=(have[g]||0)+1));
  $('#crumb').textContent='Genres';$('#arena').innerHTML='';$('#sec2').textContent='Genres from Wikidata matches of each collection folder';
  $('#grid').innerHTML=GORDER.filter(g=>have[g]).map(g=>`<button class="ol-tile genre" data-genre="${g}"><div class="art" style="background:radial-gradient(circle at 70% 20%,hsl(${HUES[hash(g)%8]} 80% 50% / .8),#141b27 60%,#05070b)"></div><div class="nm" style="font-size:20px">${g}<br><small style="opacity:.7">${have[g]} collections</small></div></button>`).join('');status('');menu();
  const t=document.querySelector('#grid .ol-tile');if(t&&document.body.classList.contains('kbd'))focusEl(t);return}
 if(k==='support'){hideHome();cur='virtual';view='folder';$('#crumb').textContent='Support Us';$('#arena').innerHTML='';$('#sec2').textContent='Thank you for supporting the collection';
  $('#grid').innerHTML=SUPPORT.map(s=>`<a class="ol-tile link" href="${s.url}" target="_blank" rel="noopener"><div class="art" style="background:radial-gradient(circle at 70% 20%,#ff9c00aa,#1a2233 60%,#05070b)"></div><div class="nm" style="font-size:20px">${s.name}</div></a>`).join('');status('');menu()}}
const HUBH={main:'#/all',arena:'#/newarrivals',readfirst:'#/readfirst',genres:'#/genres',support:'#/support',search:'#/search'};
document.addEventListener('click',e=>{const h=e.target.closest('[data-hub]');if(!h)return;S.click();const k=h.dataset.hub;go(k.indexOf('folder:')===0?'#/folder/'+k.slice(7):HUBH[k]||'#/')});
document.addEventListener('pointerover',e=>{const h=e.target.closest('.hb');if(h&&h!==lastHub){lastHub=h;S.move()}});let lastHub=null;
function doSearch(){S.click();go('#/search')}
function doMute(){S.unlock();S.toggle();sm2()}
function sm2(){const l=$('#hmutel');if(l)l.textContent=S.muted?'Sound off':'Sound on';if($('#mute'))$('#mute').textContent=S.muted?'🔇':'🔊'}
document.addEventListener('click',e=>{const h=e.target.closest('[data-hint]');if(!h)return;h.dataset.hint==='search'?doSearch():doMute()});
document.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;if(e.key==='/'||e.keyCode===403){e.preventDefault();doSearch()}else if(e.key==='m'||e.key==='M'||e.keyCode===404){doMute()}});
const RF_DOC='https://docs.google.com/document/d/1KWjoQ-wDzkj1f97lHoe1H_o41V-IYCwXj48pamczPVk/preview';
function readFirst(){const p=$('#rfpanel');if(!$('#rfframe').src||$('#rfframe').src==='about:blank')$('#rfframe').src=RF_DOC;p.hidden=false;void p.offsetWidth;RFX.open(p);setTimeout(()=>focusEl($('#rfclose')),60)}
function closeRF(){const p=$('#rfpanel');if(p.hidden)return false;S.click();RFX.close(p,()=>{p.hidden=true;const t=document.querySelector('[data-hub="readfirst"]');if(t)focusEl(t)});return true}
$('#rfclose').onclick=()=>back('#/');
/* ---------- HASH ROUTER ---------- */
function go(h){if(location.hash===h)return route();history.pushState({fefc:1},'',h);route()}
function back(fallback){const h=location.hash,fb=()=>{history.replaceState(null,'',fallback||'#/');route()};if(history.state&&history.state.fefc){history.back();setTimeout(()=>{if(location.hash===h)fb()},450)}else fb()}
function parentHash(){const r=parseH();if(r[0]==='play')return r[1]?'#/edit/'+encodeURIComponent(r[1]):'#/';if(r[0]==='edit'||r[0]==='readfirst')return '#/';if(r[0]==='folder'){const f=items.get(r[1]);return f&&f.parent&&f.parent!==ROOT&&items.has(f.parent)?'#/folder/'+f.parent:(f&&f.parent===ROOT?'#/all':'#/')}if(r[0]==='genre')return '#/genres';return '#/'}
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
 if(k==='genres'||k==='support')return hubGo(k);
 if(k==='genre'){const G=r[1],list=genreList(G),folders=Object.keys(genreMap).filter(x=>genreMap[x].genres.indexOf(G)>=0).map(x=>items.get(x)||{id:x,name:genreMap[x].folder,mimeType:FOLDER,parent:ROOT});return virtual(list.length?list:folders,G)}
 if(k==='search'){hideHome();open(ROOT,'all');setTimeout(()=>{$('#q').value=r[1]||'';$('#q').focus();if(r[1])$('#q').dispatchEvent(new Event('input'))},60);return}
 showHome()}
window.addEventListener('popstate',route);
/* ---------- DASHBOARD ---------- */
function status(t){$('#status').textContent=t}
function menu(){$('#menu').innerHTML=NA.menuHTML(FOLD,cur!==ROOT);const o=$('#menu .mi.on');o&&o.scrollIntoView&&o.scrollIntoView({block:'nearest',inline:'center'})}
function render(list,title,mode){const fold=list.filter(isFolder).sort((a,b)=>a.name.localeCompare(b.name)),vids=list.filter(f=>!isFolder(f)).sort((a,b)=>a.name.localeCompare(b.name));
 const recent=NA.sort(vids).slice(0,4);
 $('#crumb').textContent=title;hideHome();
 $('#arena').innerHTML=mode!=='collections'?recent.map(f=>tile(f,1)).join(''):'';
 const all=mode==='arena'?vids:mode==='collections'?fold:[...fold,...vids];
 $('#sec2').textContent=mode==='arena'?'Every fan edit in the collection · newest first':`${fold.length} collections · ${vids.length} fan edits`;
 const g=$('#grid');if(mode==='arena'){$('#arena').innerHTML='';NA.render(window._idx?Array.from(items.values()).filter(f=>!isFolder(f)&&isVid(f)):all,tile,art,i=>items.get(i))}else{g.className='';g.innerHTML=all.map(f=>tile(f)).join('')}
 document.querySelectorAll('#arena .ol-tile,#grid .ol-tile').forEach(el=>art(el,items.get(el.dataset.id)));
 status(all.length?'':(live?'Empty':'Not in saved index — sign in for live Drive'));menu();$('#main').scrollTop=0}
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
 $('#details').innerHTML=`<div class="lc-top"><div class="lc-elbow"></div><div class="lc-bars"><span class="p2" style="width:60px"></span><span class="p3" style="flex:1"></span></div><div class="lc-title">${esc(m.title||p.raw)}</div><div class="lc-bars" style="flex:0 0 40px"><span class="p1" style="flex:1;border-radius:0 13px 13px 0"></span></div></div>
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
function play(f){const id=target(f);S.ambience(false);S.click();$('#ptitle').textContent=parse(f.name).raw;newFrame(`https://drive.google.com/file/d/${id}/preview`);$('#popen').href=`https://drive.google.com/file/d/${id}/view`;$('#player').hidden=false}
/* ---------- EVENTS ---------- */
document.addEventListener('click',e=>{const nav=e.target.closest('[data-nav]');if(nav){S.click();const k=nav.dataset.nav;if(k==='up')return back(parentHash());return go(k==='home'?'#/':'#/'+k)}
 const act=e.target.closest('[data-act]');if(act){S.chirp(1);const f=items.get($('#details').dataset.id);if(act.dataset.act==='back')back('#/');else go('#/play/'+f.id);return}
 const t=e.target.closest('.ol-tile');if(t&&!t.dataset.genre&&!t.classList.contains('link')){const f=items.get(t.dataset.id);if(!f)return;if(isFolder(f)){S.click();go('#/folder/'+target(f))}else if(!isVid(f)){S.click();window.open('https://drive.google.com/file/d/'+target(f)+'/view','_blank')}else go('#/edit/'+f.id)}});
let lastHover=null;document.addEventListener('pointerover',e=>{const t=e.target.closest('.ol-tile,.mi');if(t&&t!==lastHover){lastHover=t;S.move()}});
document.addEventListener('focusin',e=>{if(e.target.matches('.ol-tile,.mi'))S.move()});
let qt;$('#q').addEventListener('input',e=>{clearTimeout(qt);qt=setTimeout(async()=>{const q=e.target.value.trim().toLowerCase();if(!q)return open(cur);
 let res=[...items.values()].filter(f=>f.name.toLowerCase().includes(q));
 if(live){try{const s=q.replace(/'/g,"\\'");const r=await api(`name contains '${s}' and trashed=false and (mimeType contains 'video/' or mimeType='${SC}')`);r.files.map(f=>norm(f)).forEach(f=>{if(!items.has(f.id)){items.set(f.id,f);res.push(f)}})}catch(e){}}
 view='search';render(res,'Search: '+q,'home')},250)});
const mb=$('#mute');const sm=()=>mb.textContent=S.muted?'🔇':'🔊';sm();mb.onclick=()=>{S.unlock();S.toggle();sm();sm2()};setTimeout(sm2,0);$('#auth').onclick=signIn;
/* ---------- TV / D-PAD SPATIAL NAVIGATION ---------- */
const FOC='#rfclose,#rfframe,.hb,.hint-btn,.mi,#q,#mute,#auth,.ol-tile,#details .pill:not(.lab),#details a,#player .pill,#pframe';
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
function goBack(){S.click();back(parentHash())}
document.addEventListener('keydown',e=>{const k=e.keyCode,inInput=e.target===$('#q');
 const dir={37:'left',38:'up',39:'right',40:'down'}[k];
 if(dir&&!$('#rfpanel').hidden&&(k===38||k===40)){e.preventDefault();const w=$('.rf-scroll');if(w)w.scrollBy(0,k===40?220:-220);return}
 if(dir&&!(inInput&&(k===37||k===39))){e.preventDefault();S.unlock();move(dir);return}
 if(k===10009||k===461||k===27||(k===8&&!inInput)||e.key==='GoBack'||e.key==='BrowserBack'){e.preventDefault();goBack();return}
 if(k===13&&document.activeElement&&document.activeElement.matches('.ol-tile,[data-act],[data-nav],[data-href]')){e.preventDefault();S.unlock();document.activeElement.click()}});
// focus first item after views open
const _render=render;render=function(){_render.apply(this,arguments);if(document.body.classList.contains('tv')){const t=document.querySelector('#arena .ol-tile,#grid .ol-tile');if(t)focusEl(t)}};
const _details=details;details=async function(){await _details.apply(this,arguments);const p=document.querySelector('#details [data-act="play"]');if(p)focusEl(p)};
const _play=play;play=function(f){_play(f);setTimeout(()=>focusEl($('#back')),50)};
if(/Tizen|Web0S|webOS|SMART-TV|SmartTV|NetCast|AFT|CrKey|BRAVIA|Android TV|GoogleTV|Silk/i.test(navigator.userAgent)||P.get('tv'))document.body.classList.add('tv');
document.addEventListener('keydown',()=>document.body.classList.add('kbd'),{once:true});
/* ---------- BOOT ---------- */
intro();if(C.GOOGLE_API_KEY){live=true;$('#auth').textContent='Sign in';}
tmo('data/folderthumbs.json',10000).then(m=>{fthumbs=m;document.querySelectorAll('#grid .ol-tile').forEach(el=>{const f=items.get(el.dataset.id);if(f&&isFolder(f)&&!el.querySelector('img'))art(el,f)})}).catch(()=>{});
tmo('data/genres.json',10000).then(g=>{genreMap=g;if(!$('#home').hidden)hub()}).catch(()=>{});
tmo('data/mosaic.json',10000).then(m=>{mosaicList=m;if(!$('#home').hidden)mosaic()}).catch(()=>{});
tmo('data/dates.json',15000).then(m=>{NA.dates=m;if(!$('#home').hidden)hub();else if(/^#\/(newarrivals|arena|folder)/.test(location.hash))route()}).catch(e=>console.warn(e));
tmo('data/metadata.json',8000).then(m=>meta=m).catch(e=>console.warn(e));
tmo('data/index.json',15000).then(d=>{window._idx=d.items;if(!live)add(d.items);if(!live)tmo('data/links.json',15000).then(L=>{for(const p in L){if(!kids.has(p))kids.set(p,[]);const a=kids.get(p);for(const id of L[p]){const f=items.get(id);if(f&&!a.includes(f))a.push(f)}}if(/^#\/(folder|all)/.test(location.hash))route();else if(!$('#home').hidden)hub()}).catch(()=>{});if(d.partial!==false&&!live)tmo('data/index.interim.json',20000).then(x=>{add(x.items.filter(f=>!items.has(f.id)));window._idx=Array.from(items.values());route()}).catch(()=>{})}).catch(e=>{console.warn(e);status('Saved index unavailable')}).then(()=>{route();
 if(P.get('focus')){setTimeout(()=>{document.body.classList.add('kbd');const t=document.querySelectorAll('.ol-tile,.hb')[+P.get('focus')];if(t)focusEl(t)},300)}
 const e=P.get('edit');if(e)go('#/edit/'+e);const pp=P.get('play');if(pp)go('#/play/'+pp);if(P.get('readfirst'))go('#/readfirst')});
$('#back').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();goBack()});
showHome();
})();

/* ---------- INSTALL (PWA) ---------- */
(function(){const ua=navigator.userAgent,standalone=matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||navigator.standalone===true;
 const isTV=document.body.classList.contains('tv'),mobile=/Android|iPhone|iPad|iPod/i.test(ua)||(navigator.maxTouchPoints>1&&/Macintosh/.test(ua)&&'ontouchend' in document);
 const ios=/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1),snoozed=+localStorage.fefcInstallSnooze>Date.now();
 let deferred=null;const box=document.getElementById('install');
 if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
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
