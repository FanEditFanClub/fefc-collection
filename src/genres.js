// Genres page: Home-style glass tiles (tilted 3D grid, big centred labels, orange focus glow) with genre art.
(function(){
var art={};fetch('data/genreart.json').then(function(r){return r.json()}).then(function(j){art=j;paint()}).catch(function(){});
var css=document.createElement('style');css.textContent=
'#grid.gnrs{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(30vw,340px),1fr));gap:1.4vmin;padding:2vmin 3vmin 6vmin;perspective:1400px}'+
'#grid.gnrs .gwrap{display:contents}'+
'#grid.gnrs .ol-tile.gnr{position:relative;aspect-ratio:1.55;border:2px solid #9fb6cf;border-radius:3px;overflow:hidden;background:#0b111a;color:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:.35em .4em .3em;gap:.1em;font:700 clamp(18px,5vmin,72px)/.98 "Source Sans 3","Segoe UI","PT Sans",sans-serif;letter-spacing:-.01em;text-shadow:0 1px 3px #000,0 0 12px #000;container-type:size;transform:rotateX(var(--tilt-x,11deg));transform-origin:50% 100%;box-shadow:inset 0 0 0 1px #000,0 6px 18px #000a;transition:box-shadow .15s,border-color .15s}'+
'#grid.gnrs .ol-tile.gnr:before{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(170deg,#ffffff26 0,#fff0 45%),linear-gradient(0deg,#000c,#0006 55%,#0003);pointer-events:none}'+
'#grid.gnrs .gimg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}'+
'#grid.gnrs .gimg.brand{object-fit:contain;padding:18%;background:radial-gradient(circle at 50% 40%,#1c2636,#05070b 75%);opacity:.55}'+
'#grid.gnrs .gnr span,#grid.gnrs .gnr small{position:relative;z-index:2;max-width:100%;overflow-wrap:break-word}'+
'#grid.gnrs .gnr small{font-size:.36em;font-weight:600;color:#ffb02e}'+
'@supports (font-size:1cqh){#grid.gnrs .gnr span{font-size:clamp(16px,min(30cqh,18.5cqw),130px)}#grid.gnrs .gnr small{font-size:clamp(10px,min(9cqh,5.5cqw),36px)}}'+
'#grid.gnrs .ol-tile.gnr:hover,#grid.gnrs .ol-tile.gnr:focus,#grid.gnrs .ol-tile.gnr:focus-visible{outline:0;transform:rotateX(var(--tilt-x,11deg));border-color:#ffb02e;box-shadow:inset 0 0 0 1px #000,inset 0 0 26px #ff9c0033,0 0 0 2px #ff9c00,0 0 24px #ff9c00cc;z-index:2}'+
'html.no3d #grid.gnrs .ol-tile.gnr{transform:none}';
document.head.appendChild(css);
function pl(n,w){return n+' '+w+(n===1?'':'s')}
function paint(){[].forEach.call(document.querySelectorAll('#grid.gnrs .gnr'),function(b){var a=art[b.dataset.genre]||art.Uncategorized;var i=b.querySelector('.gimg');if(a&&i&&!i.getAttribute('src')){i.className='gimg'+(a.brand?' brand':'');i.src=a.img}})}
function files(set,items,isV){var n=0;items.forEach(function(f){if(!isV(f))return;var p=f.parent,g=0;while(p&&g++<30){if(set[p]){n++;return}var x=items.get(p);p=x&&x.parent}});return n}
window.FEFCGenres={render:function(o){// o:{genreMap,order,kids,isFolder,isVid,esc,uncatFiles}
 var by={};Object.keys(o.genreMap).forEach(function(fid){o.genreMap[fid].genres.forEach(function(g){(by[g]=by[g]||[]).push(fid)})});
 var g=document.getElementById('grid');g.className='gnrs';
 g.innerHTML=o.order.filter(function(x){return by[x]}).map(function(x){var st={};by[x].forEach(function(i){st[i]=1});var m=files(st,o.items,o.isVid);
  return '<button class="ol-tile gnr" data-genre="'+o.esc(x)+'"><img class="gimg" alt="" referrerpolicy="no-referrer"><span>'+o.esc(x)+'</span><small>'+pl(by[x].length,'Collection')+' <wbr>· '+pl(m,'File')+'</small></button>'}).join('');
 paint()}};
})();
// Genres as a Home-style 3x3 hub (tilted grid + live edge clips), 9 per page.
(function(){
var st={page:0,o:null,list:null};
var css=document.createElement('style');css.textContent=
'#hub .hb.ghb{overflow:hidden;background:#0b111a}'+
'#hub .hb.ghb .gimg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;border-radius:inherit}'+
'#hub .hb.ghb .gimg.brand{object-fit:contain;padding:14%;box-sizing:border-box;background:radial-gradient(circle at 50% 40%,#1c2636,#05070b 75%);opacity:.6}'+
'#hub .hb.ghb:after{content:"";position:absolute;inset:0;z-index:0;background:linear-gradient(0deg,#000b,#0005 55%,#0002);pointer-events:none;border-radius:inherit}'+
'#hub .hb.ghb span,#hub .hb.ghb small{position:relative;z-index:1}#hub .hb.ghb small{color:#ffb02e}'+
'#hub .hb.gempty{visibility:hidden}'+'#hub .hb.ghb span{overflow-wrap:normal;word-break:keep-all;hyphens:none}'+'@supports (font-size:1cqh){#hub .hb.ghb span{font-size:clamp(12px,min(28cqh,14cqw),120px)}}'+
'.gnav{display:none;position:absolute;top:calc(50% + 7vh);transform:translateY(-50%);z-index:5;width:clamp(36px,5vmin,72px);height:clamp(64px,12vmin,150px);border:2px solid #9fb6cf;border-radius:4px;background:linear-gradient(180deg,#2c333ecc,#0b0e13cc);color:#fff;font:700 clamp(22px,5vmin,60px)/1 sans-serif;cursor:pointer;padding:0}'+
'.gnav:hover,.gnav:focus{outline:0;border-color:#ffb02e;box-shadow:0 0 0 2px #ff9c00,0 0 24px #ff9c00cc}.gnav[disabled]{opacity:.25;pointer-events:none}'+
'#gpage{display:none;position:absolute;left:50%;transform:translateX(-50%);bottom:calc(3.5vh + 52px);z-index:5;color:#ffb02e;font:600 clamp(12px,2vmin,22px) "Source Sans 3",sans-serif;letter-spacing:.08em;text-shadow:0 1px 3px #000}'+
'body.genres-mode .gnav,body.genres-mode #gpage{display:block}'+
'#hub.gflip .hb{animation:gflip .35s ease-out both}@keyframes gflip{from{opacity:0;filter:blur(3px)}to{opacity:1;filter:none}}'+
'@media (orientation:landscape) and (max-height:520px){#gpage{bottom:calc(2vh + 40px)}.gnav{top:calc(50% + 10vh)}}';
document.head.appendChild(css);
function pl(n,w){return n+' '+w+(n===1?'':'s')}
function list(o){if(st.list&&st.key===o.items.size+':'+Object.keys(o.genreMap).length)return st.list;
 var by={};Object.keys(o.genreMap).forEach(function(fid){o.genreMap[fid].genres.forEach(function(g){(by[g]=by[g]||[]).push(fid)})});
 var gs=Object.keys(by).sort(function(a,b){return (a==='Uncategorized')-(b==='Uncategorized')||a.localeCompare(b)});var sets={};gs.forEach(function(g){sets[g]={};by[g].forEach(function(i){sets[g][i]=1})});var cnt={};gs.forEach(function(g){cnt[g]=0});
 o.items.forEach(function(f){if(!o.isVid(f))return;var p=f.parent,k=0,hit={};while(p&&k++<30){gs.forEach(function(g){if(sets[g][p]&&!hit[g]){hit[g]=1;cnt[g]++}});var x=o.items.get(p);p=x&&x.parent}});
 st.key=o.items.size+':'+Object.keys(o.genreMap).length;st.list=gs.map(function(g){return {g:g,c:by[g].length,m:cnt[g]}});return st.list}
function art(g){var a=(window.FEFCGenres&&FEFCGenres._art)||{};return a[g]||a.Uncategorized||{img:'assets/fefc-logo.png',brand:1}}
function pages(){return Math.max(1,Math.ceil(st.list.length/9))}
function paint(){var hub=document.getElementById('hub');if(!hub||!st.o)return;var o=st.o,L=list(o),P=pages();st.page=Math.max(0,Math.min(st.page,P-1));
 var keep=[].slice.call(hub.querySelectorAll('.mc')),sl=L.slice(st.page*9,st.page*9+9),h='';
 for(var i=0;i<9;i++){var x=sl[i];if(!x){h+='<button class="hb gempty" tabindex="-1" aria-hidden="true"></button>';continue}var a=art(x.g);
  h+='<button class="hb ghb" data-genre="'+o.esc(x.g)+'"><img class="gimg'+(a.brand?' brand':'')+'" alt="" src="'+a.img+'" referrerpolicy="no-referrer"><span>'+o.esc(x.g)+'</span><small>'+pl(x.c,'Collection')+' · '+pl(x.m,'File')+'</small></button>'}
 hub.innerHTML=h;keep.forEach(function(x){hub.appendChild(x)});hub.classList.remove('gflip');void hub.offsetWidth;hub.classList.add('gflip');
 ui();document.getElementById('gpage').textContent='Page '+(st.page+1)+'/'+P;document.getElementById('gprev').disabled=st.page===0;document.getElementById('gnext').disabled=st.page>=P-1}
function ui(){if(document.getElementById('gpage'))return;var home=document.getElementById('home');
 var mk=function(id,txt,lbl){var b=document.createElement('button');b.id=id;b.className='gnav';b.textContent=txt;b.setAttribute('aria-label',lbl);home.appendChild(b);return b};
 mk('gprev','‹','Previous page').onclick=function(){flip(-1)};mk('gnext','›','Next page').onclick=function(){flip(1)};
 var pg=document.createElement('div');pg.id='gpage';home.appendChild(pg);place();addEventListener('resize',place);
 var sx=null,sy=0;home.addEventListener('touchstart',function(e){if(!on())return;var t=e.touches[0];sx=t.clientX;sy=t.clientY},{passive:true});
 home.addEventListener('touchend',function(e){if(!on()||sx===null)return;var t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;sx=null;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)flip(dx<0?1:-1)},{passive:true});
 document.addEventListener('keydown',function(e){if(!on())return;var k=e.keyCode,a=document.activeElement,hb=[].slice.call(document.querySelectorAll('#hub .hb')),i=hb.indexOf(a);
  if((k===37&&(i%3===0||a&&a.id==='gnext'))||(k===39&&(i%3===2||(i>=0&&hb[i+1]&&hb[i+1].classList.contains('gempty'))||a&&a.id==='gprev'))){var d=k===37?-1:1;if((d<0&&st.page>0)||(d>0&&st.page<pages()-1)){e.preventDefault();e.stopPropagation();flip(d,d>0?0:2)}}},true)}
function place(){var hub=document.getElementById('hub'),p=document.getElementById('gprev'),n=document.getElementById('gnext');if(!hub||!p)return;var r=hub.getBoundingClientRect(),hr=document.getElementById('home').getBoundingClientRect();
 p.style.left=Math.max(4,r.left-hr.left-p.offsetWidth-14)+'px';n.style.left=Math.min(hr.width-n.offsetWidth-4,r.right-hr.left+14)+'px';p.style.top=n.style.top=(r.top-hr.top+r.height/2)+'px'}
function on(){return document.body.classList.contains('genres-mode')&&!document.getElementById('home').hidden}
function flip(d,focusCol){var np=st.page+d;if(np<0||np>=pages())return;st.page=np;try{if(window.SFX&&SFX.zoom)SFX.zoom(d<0)}catch(_){}
 paint();setTimeout(place,0);var hb=document.querySelectorAll('#hub .hb:not(.gempty)');if(hb.length&&document.body.classList.contains('kbd')){var t=hb[Math.min(hb.length-1,focusCol||0)];t.focus()}}
window.FEFCGenres.hub=function(o){if(o){st.o=o;if(o.page!=null)st.page=o.page}paint();setTimeout(place,50);setTimeout(place,600)};
fetch('data/genreart.json').then(function(r){return r.json()}).then(function(j){window.FEFCGenres._art=j;if(on())paint()}).catch(function(){});
})();
