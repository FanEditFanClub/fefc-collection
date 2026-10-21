(()=>{
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
function intro(){const el=$('#intro');if(P.get('nointro')){el.remove();return}const seen=localStorage.fefcSeen==='1',d=seen?1.4:3.2;el.style.setProperty('--d',d+'s');
 const sun=el.querySelector('.sun');for(let i=0;i<24;i++){const t=document.createElement('i'),a=i/24*360,r=(i%2?24:19);t.style.transform=`rotate(${a}deg) translate(${r}vmin) rotate(90deg)`;t.style.animationDelay=(i%6)*.05+'s';sun.appendChild(t)}
 if(P.get('introframe')){el.querySelectorAll('*').forEach(e=>{e.style.animationPlayState='paused';e.style.animationDelay=(-P.get('introframe'))+'s'});el.style.animation='none';return}
 let done=false;const end=()=>{if(done)return;done=true;localStorage.fefcSeen='1';el.classList.add('done');S.ambience(view!=='player')};
 try{S.unlock();S.intro(seen)}catch(e){}
 el.addEventListener('pointerdown',()=>{S.unlock();end()},{once:true});setTimeout(end,d*1000+300)}
// first interaction anywhere unlocks audio (autoplay rules)
addEventListener('pointerdown',()=>{const first=!window._u;window._u=1;S.unlock();if(first&&$('#details').hidden&&$('#player').hidden)S.ambience(true)},{capture:true});
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
 if(!isFolder(f))src=f.thumb?f.thumb.replace(/=s\d+$/,'=s640'):'https://drive.google.com/thumbnail?sz=w640&id='+target(f);
 if(!src){const r=await tmdbFind(isFolder(f)?f.name:p.film,p.year);if(r)src='https://image.tmdb.org/t/p/w780'+(r.backdrop_path||r.poster_path)}
 if(src){const im=new Image();im.alt='';im.loading='lazy';im.onload=()=>{if(im.naturalWidth>40)el.insertBefore(im,el.firstChild)};im.src=src}}
/* ---------- DASHBOARD ---------- */
function status(t){$('#status').textContent=t}
function menu(){const m=[['home','Home'],['arena','New Arrivals'],['collections','Collections']];
 $('#menu').innerHTML=(cur!==ROOT?`<button class="mi" data-nav="up">◀ Back</button>`:'')+m.map(([k,l])=>`<button class="mi ${view===k?'on':''}" data-nav="${k}">${l}</button>`).join('')}
function render(list,title,mode){const fold=list.filter(isFolder).sort((a,b)=>a.name.localeCompare(b.name)),vids=list.filter(f=>!isFolder(f)).sort((a,b)=>a.name.localeCompare(b.name));
 const recent=[...vids].sort((a,b)=>(b.modified||'').localeCompare(a.modified||'')).slice(0,4);
 $('#crumb').textContent=title;
 $('#arena').innerHTML=mode!=='collections'?recent.map(f=>tile(f,1)).join(''):'';
 const all=mode==='arena'?[...vids].sort((a,b)=>(b.modified||'').localeCompare(a.modified||'')):mode==='collections'?fold:[...fold,...vids];
 $('#sec2').textContent=mode==='arena'?'All fan edits by date':`${fold.length} collections · ${vids.length} fan edits`;
 $('#grid').innerHTML=all.map(f=>tile(f)).join('');
 document.querySelectorAll('#arena .ol-tile,#grid .ol-tile').forEach(el=>art(el,items.get(el.dataset.id)));
 status(all.length?'':(live?'Empty':'Not in saved index — sign in for live Drive'));menu();$('#main').scrollTop=0}
async function open(id,mode='home'){cur=id;view=id===ROOT?mode:'folder';$('#q').value='';if(live&&!kids.has(id)){try{await loadFolder(id)}catch(e){live=false;status('');add(window._idx||[])}}
 const f=items.get(id);render(kids.get(id)||[],id===ROOT?{home:'The Fan Edit Fan Club Collection',arena:'New Arrivals',collections:'Collections'}[mode]:f.name,id===ROOT?mode:'home')}
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
 $('#details').hidden=false;$('#details').dataset.id=f.id;if(push)history.pushState({d:f.id},'');
 let n=0;$('#details').querySelectorAll('.pill,.rt a').forEach(el=>el.addEventListener('pointerenter',()=>S.chirp(n++)))}
function play(f){const id=target(f);S.ambience(false);S.click();$('#ptitle').textContent=parse(f.name).raw;$('#pframe').src=`https://drive.google.com/file/d/${id}/preview`;$('#popen').href=`https://drive.google.com/file/d/${id}/view`;$('#player').hidden=false;history.pushState({p:1},'')}
addEventListener('popstate',()=>{if(!$('#player').hidden){$('#player').hidden=true;$('#pframe').src='about:blank';if($('#details').hidden)S.ambience(true);return}
 if(!$('#details').hidden){$('#details').hidden=true;S.ambience(true)}});
/* ---------- EVENTS ---------- */
document.addEventListener('click',e=>{const nav=e.target.closest('[data-nav]');if(nav){S.click();const k=nav.dataset.nav;if(k==='up'){const f=items.get(cur);return open(f?.parent&&items.has(f.parent)?f.parent:ROOT)}return open(ROOT,k)}
 const act=e.target.closest('[data-act]');if(act){S.chirp(1);const f=items.get($('#details').dataset.id);if(act.dataset.act==='back')history.back();else play(f);return}
 const t=e.target.closest('.ol-tile');if(t){const f=items.get(t.dataset.id);if(!f)return;if(isFolder(f)){S.click();open(target(f))}else details(f)}});
let lastHover=null;document.addEventListener('pointerover',e=>{const t=e.target.closest('.ol-tile,.mi');if(t&&t!==lastHover){lastHover=t;S.move()}});
document.addEventListener('focusin',e=>{if(e.target.matches('.ol-tile,.mi'))S.move()});
let qt;$('#q').addEventListener('input',e=>{clearTimeout(qt);qt=setTimeout(async()=>{const q=e.target.value.trim().toLowerCase();if(!q)return open(cur);
 let res=[...items.values()].filter(f=>f.name.toLowerCase().includes(q));
 if(live){try{const s=q.replace(/'/g,"\\'");const r=await api(`name contains '${s}' and trashed=false and (mimeType contains 'video/' or mimeType='${SC}')`);r.files.map(f=>norm(f)).forEach(f=>{if(!items.has(f.id)){items.set(f.id,f);res.push(f)}})}catch(e){}}
 view='search';render(res,'Search: '+q,'home')},250)});
const mb=$('#mute');const sm=()=>mb.textContent=S.muted?'🔇':'🔊';sm();mb.onclick=()=>{S.unlock();S.toggle();sm()};$('#auth').onclick=signIn;
/* ---------- TV / D-PAD SPATIAL NAVIGATION ---------- */
const FOC='.mi,#q,#mute,#auth,.ol-tile,#details .pill:not(.lab),#details a,#player .pill,#pframe';
function visible(el){const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden'}
function layer(){if(!$('#player').hidden)return $('#player');if(!$('#details').hidden)return $('#details');return $('#app')}
function move(dir){const L=layer(),els=[].slice.call(L.querySelectorAll(FOC)).filter(visible),a=document.activeElement;
 if(!a||!L.contains(a)||a===document.body){if(els[0])focusEl(els[0]);return}
 const r=a.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let best=null,bd=1e9;
 els.forEach(e=>{if(e===a)return;const q=e.getBoundingClientRect(),x=q.left+q.width/2,y=q.top+q.height/2,dx=x-cx,dy=y-cy;
  const ok=dir==='left'?q.right<=r.left+4:dir==='right'?q.left>=r.right-4:dir==='up'?q.bottom<=r.top+4:q.top>=r.bottom-4;if(!ok)return;
  const main=dir==='left'||dir==='right'?Math.abs(dx):Math.abs(dy),off=dir==='left'||dir==='right'?Math.abs(dy):Math.abs(dx),d=main+off*2.5;if(d<bd){bd=d;best=e}});
 if(best)focusEl(best)}
function focusEl(e){e.focus({preventScroll:true});if(e.scrollIntoView)e.scrollIntoView({block:'nearest',inline:'nearest'})}
function goBack(){if(!$('#player').hidden||!$('#details').hidden){history.back();return}if(cur!==ROOT){const f=items.get(cur);S.click();open(f&&f.parent&&items.has(f.parent)?f.parent:ROOT)}}
document.addEventListener('keydown',e=>{const k=e.keyCode,inInput=e.target===$('#q');
 const dir={37:'left',38:'up',39:'right',40:'down'}[k];
 if(dir&&!(inInput&&(k===37||k===39))){e.preventDefault();S.unlock();move(dir);return}
 if(k===10009||k===461||k===27||(k===8&&!inInput)||e.key==='GoBack'||e.key==='BrowserBack'){e.preventDefault();goBack();return}
 if(k===13&&document.activeElement&&document.activeElement.matches('.ol-tile,[data-act],[data-nav]')){e.preventDefault();S.unlock();document.activeElement.click()}});
// focus first item after views open
const _render=render;render=function(){_render.apply(this,arguments);if(document.body.classList.contains('tv')){const t=document.querySelector('#arena .ol-tile,#grid .ol-tile');if(t)focusEl(t)}};
const _details=details;details=async function(){await _details.apply(this,arguments);const p=document.querySelector('#details [data-act="play"]');if(p)focusEl(p)};
const _play=play;play=function(f){_play(f);setTimeout(()=>focusEl($('#back')),50)};
if(/Tizen|Web0S|webOS|SMART-TV|SmartTV|NetCast|AFT|CrKey|BRAVIA|Android TV|GoogleTV|Silk/i.test(navigator.userAgent)||P.get('tv'))document.body.classList.add('tv');
document.addEventListener('keydown',()=>document.body.classList.add('kbd'),{once:true});
/* ---------- BOOT ---------- */
intro();if(C.GOOGLE_API_KEY){live=true;$('#auth').textContent='Sign in';}
Promise.all([fetch('data/index.json').then(r=>r.json()),fetch('data/metadata.json').then(r=>r.json()).catch(()=>({}))]).then(([d,md])=>{meta=md;window._idx=d.items;if(!live)add(d.items);open(ROOT);
 if(P.get('focus')){setTimeout(()=>{document.body.classList.add('kbd');const t=document.querySelectorAll('.ol-tile')[+P.get('focus')];if(t)focusEl(t)},300)}const e=P.get('edit');if(e&&items.get(e))details(items.get(e),false);const pp=P.get('play');if(pp&&items.get(pp))play(items.get(pp))}).catch(()=>status('No saved index — sign in'));
})();
