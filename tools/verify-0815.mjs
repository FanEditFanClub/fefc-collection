import { chromium } from 'playwright';
import fs from 'fs';
const OUT='/tmp/fefc-shots/0815';
fs.mkdirSync(OUT,{recursive:true});
const url='https://collection.faneditfanclub.com/?tv=1&nointro=1&apk=24';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
await page.waitForSelector('#hub .hb',{timeout:90000}).catch(()=>null);
await page.waitForTimeout(2500);
// Mock native bridge like Fire TV
await page.evaluate(()=>{
  document.body.classList.add('tv','firetv','tk-on');
  window.FEFCNative={
    playVideo(){}, openInVlc(){}, openInDrive(){},
    log(){}, videoTiles(){return 2}
  };
});
await page.waitForTimeout(500);

// --- Item 4/5: layout metrics ---
const layout=await page.evaluate(()=>{
  const hints=document.getElementById('hints');
  const ticker=document.getElementById('ticker');
  const app=document.getElementById('app');
  const cs=(el)=>el?getComputedStyle(el):null;
  const r=(el)=>el?el.getBoundingClientRect():null;
  const hr=r(hints), tr=r(ticker), ar=r(app);
  const hcs=cs(hints), tcs=cs(ticker), acs=cs(app);
  return {
    bodyClass: document.body.className,
    appPad: acs&&acs.padding,
    hints:{display:hcs&&hcs.display,visibility:hcs&&hcs.visibility,bottom:hcs&&hcs.bottom,left:hcs&&hcs.left,right:hcs&&hcs.right,height:hr&&hr.height,top:hr&&hr.top,bottomEdge:hr&&hr.bottom,hidden:hints&&hints.hidden,html:(hints&&hints.innerHTML||'').slice(0,200)},
    ticker:{display:tcs&&tcs.display,bottom:tcs&&tcs.bottom,left:tcs&&tcs.left,right:tcs&&tcs.right,height:tr&&tr.height,top:tr&&tr.top,bottomEdge:tr&&tr.bottom,tkh:tcs&&tcs.getPropertyValue('--tkh')},
    gap: (hr&&tr)?(tr.top-hr.bottom):null,
    leftInset: tr?tr.left:null,
    bottomInset: tr?(1080-tr.bottom):null
  };
});
console.log('LAYOUT', JSON.stringify(layout,null,2));
await page.screenshot({path:OUT+'/pw-home.png'});

// Force hints visible if needed and reshoot bottom
await page.evaluate(()=>{
  const h=document.getElementById('hints');
  if(h){h.hidden=false;h.style.display='flex';}
  document.body.classList.add('tk-on');
  const t=document.getElementById('ticker');
  if(t) t.style.display='block';
});
await page.waitForTimeout(300);
const layout2=await page.evaluate(()=>{
  const hints=document.getElementById('hints');
  const ticker=document.getElementById('ticker');
  const hr=hints.getBoundingClientRect(), tr=ticker.getBoundingClientRect();
  return {hintsBottom:hr.bottom,hintsTop:hr.top,tickerTop:tr.top,tickerBottom:tr.bottom,gap:tr.top-hr.bottom,hintsLeft:hr.left,tickerLeft:tr.left,hintsText:hints.innerText.slice(0,120)};
});
console.log('LAYOUT2', JSON.stringify(layout2,null,2));
await page.screenshot({path:OUT+'/pw-home-hints.png'});
await page.locator('body').screenshot({path:OUT+'/pw-bottom.png',clip:{x:0,y:850,width:1920,height:230}});
await page.locator('body').screenshot({path:OUT+'/pw-left.png',clip:{x:0,y:0,width:200,height:1080}});

// --- Item 1: Back closes modal ---
await page.evaluate(()=>{
  // open TV menu
  if(typeof openTvMenu==='function') openTvMenu();
  else {
    // try via exported path
    const b=document.querySelector('[data-hint="menu"]');
    if(b) b.click();
  }
});
await page.waitForTimeout(400);
let back1=await page.evaluate(()=>{
  const tvm=document.getElementById('tvmenu');
  const before=!(!tvm||tvm.hidden);
  const consumed=window.__fefcConsumeBack&&window.__fefcConsumeBack();
  const after=!(!document.getElementById('tvmenu')||document.getElementById('tvmenu').hidden);
  return {menuWasOpen:before,consumed,menuStillOpen:after,bodyModal:document.body.className};
});
console.log('BACK_TVMENU', JSON.stringify(back1));
await page.screenshot({path:OUT+'/01-tvmenu-open.png'});
// reopen and screenshot then back
await page.evaluate(()=>{ if(typeof openTvMenu==='function') openTvMenu(); });
await page.waitForTimeout(300);
await page.screenshot({path:OUT+'/01a-tvmenu.png'});
await page.evaluate(()=>window.__fefcConsumeBack&&window.__fefcConsumeBack());
await page.waitForTimeout(200);
await page.screenshot({path:OUT+'/01b-after-back.png'});

// --- Item 2: Sync My List ---
await page.evaluate(()=>{
  if(window.__fefcPaintSync) window.__fefcPaintSync();
  // open sync panel via Sync My List card if present
  const card=document.querySelector('#ml-sync .mi, #ml-sync button, [data-act="sync"], .acct-btn');
  if(card) card.click();
  else if(typeof window.openSync==='function') window.openSync();
});
await page.waitForTimeout(800);
// Navigate to My List first
await page.evaluate(()=>{ location.hash='#/mylist'; });
await page.waitForTimeout(2000);
await page.evaluate(()=>{
  if(window.__fefcPaintSync) window.__fefcPaintSync();
  const card=document.querySelector('#ml-sync button, #ml-sync .mi, #ml-sync [data-sp], .sp-opt');
  const syncBtn=[...document.querySelectorAll('button,a,.mi')].find(el=>/sync/i.test(el.textContent||''));
  if(card) card.click();
  else if(syncBtn) syncBtn.click();
});
await page.waitForTimeout(800);
const syncState=await page.evaluate(()=>{
  const sp=document.getElementById('syncpanel');
  const opts=sp?[...sp.querySelectorAll('.sp-opt')].map(b=>({t:b.querySelector('b')?.textContent,d:b.querySelector('span')?.textContent,act:b.dataset.sp})):[];
  const text=(sp&&!sp.hidden)?sp.innerText.slice(0,500):'';
  // also try opening via syncui API
  return {open:sp&&!sp.hidden,opts,text,bodySp:document.body.classList.contains('sp-open'),html:(sp&&sp.innerHTML||'').slice(0,300)};
});
console.log('SYNC', JSON.stringify(syncState,null,2));
// Force open sync menu via syncui if needed
await page.evaluate(()=>{
  // Look for how sync opens
  const el=document.getElementById('syncpanel');
  if(el){el.hidden=false;document.body.classList.add('sp-open');}
});
// Call into sync module - check window exports
const syncApi=await page.evaluate(()=>{
  return {
    close:typeof window.__fefcCloseSync,
    paint:typeof window.__fefcPaintSync,
    keys:Object.keys(window).filter(k=>/sync|Sync|fefc/i.test(k)).slice(0,40)
  };
});
console.log('SYNCAPI', syncApi);
await page.screenshot({path:OUT+'/02-mylist.png'});

// Try clicking Sync card properly
await page.evaluate(()=>{
  const ml=document.getElementById('ml-sync');
  if(ml){
    const b=ml.querySelector('button,.mi,a')||ml;
    b.click();
  }
});
await page.waitForTimeout(600);
await page.screenshot({path:OUT+'/02a-sync-open.png'});
const sync2=await page.evaluate(()=>{
  const sp=document.getElementById('syncpanel');
  const opts=sp?[...sp.querySelectorAll('.sp-opt,button')].map(b=>({t:(b.innerText||'').slice(0,80),act:b.dataset.sp,disabled:b.disabled})):[];
  return {open:sp&&!sp.hidden&&document.body.classList.contains('sp-open'),opts,text:(sp?sp.innerText:'').slice(0,600)};
});
console.log('SYNC2', JSON.stringify(sync2,null,2));

// Back closes sync
const backSync=await page.evaluate(()=>{
  const before=document.body.classList.contains('sp-open');
  const c=window.__fefcConsumeBack&&window.__fefcConsumeBack();
  return {before,consumed:c,after:document.body.classList.contains('sp-open')};
});
console.log('BACK_SYNC', backSync);

// --- Item 3: Open in Drive on details ---
await page.evaluate(()=>{ location.hash='#/all'; });
await page.waitForTimeout(3000);
// open first video tile
await page.evaluate(()=>{
  const t=document.querySelector('#grid .ol-tile.vid, #grid .ol-tile[data-id]');
  if(t) t.click();
});
await page.waitForTimeout(2000);
const drive=await page.evaluate(()=>{
  const det=document.getElementById('details');
  const btns=[...document.querySelectorAll('.det-ext, .det-acts a, .det-acts button, #details .pill')].map(b=>({
    tag:b.tagName, cls:b.className, text:(b.textContent||'').trim().slice(0,60),
    html:b.innerHTML.slice(0,120), w:b.getBoundingClientRect().width, h:b.getBoundingClientRect().height,
    color:getComputedStyle(b).color, bg:getComputedStyle(b).backgroundColor, opacity:getComputedStyle(b).opacity
  }));
  return {detailsHidden:det&&det.hidden, btns, bodyHtml:(det?det.innerHTML:'').includes('Drive')};
});
console.log('DRIVE', JSON.stringify(drive,null,2));
await page.screenshot({path:OUT+'/03-details-drive.png'});
// Focus Drive button if present
await page.evaluate(()=>{
  const b=[...document.querySelectorAll('.det-ext,.pill')].find(el=>/drive/i.test(el.textContent||el.getAttribute('aria-label')||''));
  if(b){b.focus();b.scrollIntoView({block:'center'});}
});
await page.waitForTimeout(200);
await page.screenshot({path:OUT+'/03b-drive-focus.png'});

await browser.close();
console.log('DONE');
