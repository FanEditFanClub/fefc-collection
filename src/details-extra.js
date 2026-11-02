/* Details-page extras: fan-edit info (FanEdit.org IFDB), corrected source titles, and File Info.
   Data is precomputed at build time: data/editinfo.json (tools/editinfo.py), data/fileinfo.json (tools/fileinfo.py),
   data/drive-changes.json (tools/drive_changes.py — Drive description + README/info, READ-ONLY). */
(function(){
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let E={edits:{},films:{},map:{},conf:{}},FI={},DC={by_id:{}};
const ld=u=>fetch(u).then(r=>r.ok?r.json():{}).catch(()=>({}));
const ready=Promise.all([
  ld('data/editinfo.json').then(x=>{if(x&&x.edits)E=x}),
  ld('data/fileinfo.json').then(x=>{FI=x||{}}),
  ld('data/drive-changes.json').then(x=>{if(x&&x.by_id)DC=x})
]);
const NAMES={'faneditfanclub@gmail.com':'Fan Edit Fan Club'};
const owner=e=>e?(NAMES[e]||e.split('@')[0]):'';
const hs=b=>b>=1e9?(b/1e9).toFixed(1)+' GB':b>=1e6?(b/1e6).toFixed(0)+' MB':b?(b/1e3).toFixed(0)+' KB':'';
const css=`.fx-sec{margin:14px 0 4px}.fx-kv{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0 0 6px;font-size:15px}.fx-kv dt{color:var(--l);font-family:Antonio,sans-serif;letter-spacing:.12em;text-transform:uppercase;font-size:13px;padding-top:2px}.fx-kv dd{margin:0;overflow-wrap:anywhere}
.fx-ch{margin:4px 0 6px;padding-left:20px;font-size:15px;line-height:1.4}.fx-ch li{margin:3px 0}.fx-ch li::marker{color:var(--o)}.fx-q{border-left:6px solid var(--p);padding:4px 10px;background:#111;border-radius:0 14px 14px 0;margin:4px 0 8px}
.fx-more{background:none;border:0;color:var(--o);font:inherit;cursor:pointer;padding:2px 0}.fx-low{color:#f9a;font-size:12px}.cast span.crew{border-left-color:var(--o)}
body.tv .fx-kv,body.tv .fx-ch{font-size:1.9vh}body.tv .fx-kv dt{font-size:1.6vh}`;
const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
function film(fid,tid){const q=E.map[fid]||E.map[tid];return q&&E.films[q]?Object.assign({fx:1,low:!!(E.conf[fid]||E.conf[tid])},E.films[q]):null}
function loc(f,ctx){const its=ctx.items,ids=[];let x=f,g=0;while(x&&x.parent&&g++<40){ids.push(x.parent);if(x.parent===ctx.root)break;x=its.get(x.parent)}
 const names=ids.filter(i=>i!==ctx.root).map(i=>(its.get(i)||{}).name).filter(Boolean);return{parent:names[0],top:names[names.length-1]}}
function fileInfo(f,ctx,F,e){const t=ctx.target(f),T=ctx.items.get(t)||{},r=FI[t]||{},size=r.s||+T.size||+f.size||0,o=r.o,sc=!!(f.targetId&&f.targetId!==f.id),L=loc(f,ctx);
 const host=sc?`Shortcut → hosted by ${esc(owner(o)||'another account')}`:`Hosted directly in ${esc(L.top||'Fan Edit Fan Club Collection')}`;
 const dur=e&&e.runtime?esc(e.runtime)+(e.origRuntime?` <span class="src">vs ${esc(e.origRuntime)} original</span>`:F&&F.runtime?` <span class="src">vs ${F.runtime} min original</span>`:''):(F&&F.runtime?esc(F.runtime)+' min':'');
 return `<h3 class="lc-h b fx-sec" id="lc-fileinfo">File Info</h3><dl class="fx-kv">${dur?`<dt>Duration</dt><dd>${dur}</dd>`:''}${size?`<dt>Size</dt><dd>${hs(size)}</dd>`:''}<dt>Hosting</dt><dd>${host}</dd>${o?`<dt>Owner</dt><dd>${esc(owner(o))}${owner(o)!==o?` <span class="src">${esc(o)}</span>`:''}</dd>`:''}${L.parent?`<dt>Folder</dt><dd>${esc(L.top&&L.top!==L.parent?L.top+' › ':'')}${esc(L.parent)}</dd>`:''}</dl>`}
function fillChips(D,f,ctx,F,e){const chips=D.querySelector('.fchips');if(!chips)return;const t=ctx.target(f),T=ctx.items.get(t)||{},r=FI[t]||{},size=r.s||+T.size||+f.size||0;
 const have=[...chips.querySelectorAll('span')].map(s=>s.textContent);
 if(size&&!have.some(x=>/\bGB\b|\bMB\b|\bKB\b/.test(x)))chips.insertAdjacentHTML('beforeend',`<span>${hs(size)}</span>`);
 const durTxt=e&&e.runtime?String(e.runtime).replace(/\s*minutes?/i,'m'):(F&&F.runtime?F.runtime+'m':'');
 if(durTxt&&!have.some(x=>/\d+m\b|\dh\b|min/i.test(x)))chips.insertAdjacentHTML('beforeend',`<span>${esc(durTxt)}</span>`);
}
function normCh(s){return String(s||'').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
function mergeChanges(driveEnt,e){
  // Prefer Drive description/readme first, then IFDB/MRDb (editinfo). Dedupe by normalized text.
  const out=[], seen=new Set();
  const push=(text,source)=>{
    const t=String(text||'').trim(); if(!t)return;
    const k=normCh(t); if(k.length<6||seen.has(k))return;
    seen.add(k); out.push({text:t,source:source||''});
  };
  const kindOrder={description:0,readme:1};
  const dch=((driveEnt||{}).changes||[]).slice().sort((a,b)=>(kindOrder[a.kind]??9)-(kindOrder[b.kind]??9));
  dch.forEach(c=>push(c.text,c.source||(c.kind==='description'?'Drive description':'Drive README')));
  (e&&e.changes||[]).forEach(c=>push(c, (e&&e.src)||'FanEdit.org IFDB'));
  return out;
}
function editHTML(e,F,driveEnt){
 const hasEdit=!!e, ch=mergeChanges(driveEnt,e), n=8;
 const link=e?`<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.src||'FanEdit.org')}</a>`:'';
 const rt=e&&e.runtime?esc(e.runtime)+(e.origRuntime?` <span class="src">vs ${esc(e.origRuntime)} original</span>`:F&&F.runtime?` <span class="src">vs ${F.runtime} minutes original</span>`:''):'';
 const info=e?[['Editor',e.editor&&esc(e.editor)],['Edit type',e.type&&esc(e.type)],['Released',e.released&&esc(e.released)],['Runtime',rt],['IFDB rating',e.rating?`${e.rating}/10 <span class="src">${e.reviews||0} review${e.reviews===1?'':'s'}</span>`:'']].filter(x=>x[1]):[];
 const srcNote=(()=>{
   const labels=[];
   if(driveEnt&&(driveEnt.sources||[]).length){
     const uniq=[...new Set(driveEnt.sources.map(s=>s.label||s.kind))];
     labels.push(...uniq.map(l=>'Drive · '+l.replace(/^Drive\s+/,'')));
   }
   if(e&&e.changes&&e.changes.length) labels.push((e.src||'FanEdit.org')+' IFDB');
   return labels.length?`<p class="src">Change list sources: ${labels.map(esc).join(' · ')}</p>`:(e?`<p class="src">From the editor's notes on ${link}</p>`:'');
 })();
 let html='';
 if(hasEdit){
   html+=`<h3 class="lc-h fx-sec">Edit Info</h3><dl class="fx-kv">${info.map(x=>`<dt>${x[0]}</dt><dd>${x[1]}</dd>`).join('')}</dl><p class="src">Source: ${link}</p>`;
 }
 if((e&&(e.synopsis||e.intention||e.details))||ch.length){
   html+=`<h3 class="lc-h p fx-sec" id="lc-changes">Edit Notes · What's Changed</h3>`;
   if(e&&e.synopsis) html+=`<p>${esc(e.synopsis)}</p>`;
   if(e&&e.intention) html+=`<p class="fx-q">${esc(e.intention)}</p>`;
   if(e&&e.details) html+=`<p>${esc(e.details)}</p>`;
   if(ch.length){
     html+=`<ul class="fx-ch">${ch.map((c,i)=>`<li${i>=n?' hidden':''}>${esc(c.text)}${c.source?` <span class="src">(${esc(c.source)})</span>`:''}</li>`).join('')}</ul>`;
     if(ch.length>n) html+=`<button class="fx-more pill" data-fxmore>Show all ${ch.length} changes</button>`;
   }
   html+=srcNote;
 }
 return html;
}
function enhance(f,ctx,F){const D=document.getElementById('details');if(!D||D.dataset.id!==f.id)return;if(D.querySelector('#lc-fileinfo,.fx'))return;const t=ctx.target(f),e=E.edits[f.id]||E.edits[t];
 const driveEnt=DC.by_id[f.id]||DC.by_id[t]||(f.targetId&&DC.by_id[f.targetId])||null;
 const cols=D.querySelectorAll('.lc-body > div:not(.lc-head)'),L=cols[0],R=cols[1];if(!L)return;
 /* Fan-edit block first (Edit Info / Notes / changes); fall back to left-column top */
 const slot=D.querySelector('#lc-fanedit');
 const h=document.createElement('div');h.className='fx';h.innerHTML=editHTML(e,F,driveEnt);
 if(slot){slot.replaceWith(h)}else{L.insertBefore(h,L.firstChild)}
 // old short "Fan edit" description is superseded when IFDB notes exist
 if(e&&e.synopsis){const hs0=[...L.querySelectorAll('.lc-h')].find(x=>/^Fan edit$/i.test(x.textContent));if(hs0){let n=hs0.nextElementSibling;hs0.remove();while(n&&!n.classList.contains('lc-h')&&n.tagName==='P'){const k=n.nextElementSibling;n.remove();n=k}}}
 // Overview heading for the source plot (skip if already present); Cast & Crew with directors
 const srcH=[...L.querySelectorAll('.lc-h')].find(x=>/^Source /.test(x.textContent));if(srcH&&F&&F.game)srcH.textContent='Source game';
 if(F&&F.plot&&srcH){const p=L.querySelector('p.plot')||[...L.querySelectorAll('p')].find(x=>x.textContent===F.plot);if(p&&!(p.previousElementSibling&&/^Overview$/i.test(p.previousElementSibling.textContent||''))){const o=document.createElement('h3');o.className='lc-h l fx-sec';o.textContent='Overview';p.before(o)}}
 if(F&&F.game&&srcH){const pp=srcH.nextElementSibling;const kv=[['Developer',(F.developer||[]).join(', ')],['Platforms',(F.platforms||[]).join(', ')],['Released',F.year],['Genre',(F.genres||[]).join(', ')]].filter(x=>x[1]);if(pp&&kv.length){pp.innerHTML=`<b>${esc(F.title)}</b>`;pp.insertAdjacentHTML('afterend',`<dl class="fx-kv">${kv.map(x=>`<dt>${x[0]}</dt><dd>${esc(x[1])}</dd>`).join('')}</dl>`)}}
 if(F&&F.low&&srcH)srcH.insertAdjacentHTML('beforeend',' <small class="fx-low">low-confidence match</small>');
 const cH=[...L.querySelectorAll('.lc-h')].find(x=>/^Cast$/.test(x.textContent));const dirs=F&&F.director||[];
 if(cH){cH.textContent='Cast & Crew';const box=cH.nextElementSibling;if(box&&dirs.length&&!box.querySelector('.crew'))box.insertAdjacentHTML('afterbegin',dirs.map(d=>`<span class="crew">${esc(d)} · Director</span>`).join(''))}
 else if(dirs.length&&![...L.querySelectorAll('.lc-h')].some(x=>/Cast/.test(x.textContent))){L.insertAdjacentHTML('beforeend',`<h3 class="lc-h p fx-sec">Cast & Crew</h3><div class="cast">${dirs.map(d=>`<span class="crew">${esc(d)} · Director</span>`).join('')}</div>`)}
 // ratings: show IFDB score on Fan Edit Ratings row
 const rr=[...D.querySelectorAll('.rt a,.rt .rr')].find(a=>/FanEdit\.org/.test(a.textContent));
 if(e&&e.rating){const html=`<span class="rn"><span>FanEdit.org IFDB<small>${e.reviews||0} user review${e.reviews===1?'':'s'}${e.trusted?' · Trusted '+e.trusted:''}</small></span></span><b>${e.rating}/10</b>`;
  if(rr){const bb=rr.querySelector('b');if(bb)bb.textContent=e.rating+'/10';const s=rr.querySelector('small');if(s)s.textContent=(e.reviews||0)+' user reviews'}else{const fer=D.querySelector('.rt.fer')||D.querySelector('.rt');if(fer){const p=fer.querySelector('p.src');if(p)p.remove();fer.insertAdjacentHTML('beforeend',`<a class="rr" href="${esc(e.url)}" target="_blank" rel="noopener">${html}</a>`)}}}
 // File Info (duration + size) — prefer slot under source ratings, before trailer
 const fiHTML=fileInfo(f,ctx,F,e);
 const fiSlot=D.querySelector('#lc-fileinfo-slot');
 if(fiSlot)fiSlot.outerHTML=fiHTML;else (R||L).insertAdjacentHTML('beforeend',fiHTML);
 fillChips(D,f,ctx,F,e);
 D.querySelectorAll('[data-fxmore]').forEach(b=>b.addEventListener('click',()=>{b.previousElementSibling.querySelectorAll('li[hidden]').forEach(x=>x.hidden=false);b.remove()}))}
window.FEX={ready,film,enhance,poster:(fid,tid)=>{const F=film(fid,tid);return F&&F.poster},size:(tid)=>{const r=FI[tid];return r&&r.s}};
})();
