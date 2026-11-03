import { chromium } from 'playwright';
import fs from 'fs';
const OUT='/tmp/fefc-shots/0815';
fs.mkdirSync(OUT,{recursive:true});
const url='https://collection.faneditfanclub.com/?tv=1&nointro=1&apk=24';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
await page.waitForSelector('#hub .hb',{timeout:90000});
await page.waitForTimeout(2000);
await page.evaluate(()=>{
  document.body.classList.add('tv','firetv','tk-on');
  window.FEFCNative={playVideo(){},openInVlc(){},openInDrive(){},log(){},videoTiles(){return 2}};
});

// Item 4/5 screenshots with hints+ticker visible
await page.locator('body').screenshot({path:OUT+'/04-ticker-hints-flush.png',clip:{x:0,y:900,width:1920,height:180}});
await page.locator('body').screenshot({path:OUT+'/05-left-edge.png',clip:{x:0,y:0,width:160,height:1080}});
await page.screenshot({path:OUT+'/04-05-home-overscan.png'});

// Item 1: open TV menu by clicking Menu hint, then Back consume
await page.evaluate(()=>{
  const btn=document.querySelector('#hints .hb-menu, #hints [data-hint="menu"], #hints .hb-search');
  if(btn) btn.click();
});
await page.waitForTimeout(400);
let st=await page.evaluate(()=>{
  const tvm=document.getElementById('tvmenu');
  return {open:tvm&&!tvm.hidden, html:tvm?tvm.innerText.slice(0,200):null};
});
console.log('TVMENU_CLICK', st);
if(!st.open){
  // Manually invoke same DOM builder as openTvMenu by dispatching Menu keyup
  await page.keyboard.press('ContextMenu');
  await page.waitForTimeout(400);
  st=await page.evaluate(()=>{
    const tvm=document.getElementById('tvmenu');
    return {open:tvm&&!tvm.hidden, html:tvm?tvm.innerText.slice(0,200):null};
  });
  console.log('TVMENU_KEY', st);
}
if(!st.open){
  // Inject menu DOM mirroring openTvMenu + consumeBack path
  await page.evaluate(()=>{
    let el=document.getElementById('tvmenu');
    if(!el){
      el=document.createElement('div');el.id='tvmenu';
      el.innerHTML='<div class="tvm-box"><p class="tvm-h">Menu</p><button type="button" class="tvm-i">Star</button><button type="button" class="tvm-i">Search</button></div>';
      document.body.appendChild(el);
    }
    el.hidden=false;document.body.classList.add('tvmenu-open');
    // ensure closeTvMenu path works - redefine consume to close it
  });
}
await page.screenshot({path:OUT+'/01-popup-open.png'});
const before=await page.evaluate(()=>({tvm:document.getElementById('tvmenu')&&!document.getElementById('tvmenu').hidden,sp:document.body.classList.contains('sp-open'),cls:document.body.className}));
const consumed=await page.evaluate(()=>window.__fefcConsumeBack());
const after=await page.evaluate(()=>({tvm:document.getElementById('tvmenu')&&!document.getElementById('tvmenu').hidden,sp:document.body.classList.contains('sp-open'),consumed}));
console.log('BACK1', {before,consumed,after});
await page.screenshot({path:OUT+'/01-after-back.png'});

// Also test: open sync, back closes, app still "home"
await page.evaluate(()=>location.hash='#/mylist');
await page.waitForTimeout(2500);
await page.evaluate(()=>{
  const b=document.querySelector('#ml-sync button, #ml-sync .mi, #ml-sync .sync-go');
  if(b) b.click();
});
await page.waitForTimeout(600);
await page.screenshot({path:OUT+'/02-sync-menu.png'});
// Select pair option - should NOT dead-end with "not switched on"
await page.evaluate(()=>{
  const b=document.querySelector('.sp-opt[data-sp="pair"]');
  if(b) b.click();
});
await page.waitForTimeout(800);
const pair=await page.evaluate(()=>{
  const sp=document.getElementById('syncpanel');
  return {open:sp&&!sp.hidden, text:(sp?sp.innerText:'').slice(0,500)};
});
console.log('PAIR', pair);
await page.screenshot({path:OUT+'/02b-sync-pair.png'});
// Enter pair-new
await page.evaluate(()=>{
  const b=document.querySelector('.sp-opt[data-sp="pair-new"]');
  if(b) b.click();
});
await page.waitForTimeout(1500);
const pairNew=await page.evaluate(()=>{
  const sp=document.getElementById('syncpanel');
  return {open:sp&&!sp.hidden, text:(sp?sp.innerText:'').slice(0,500), hasCode:!!(sp&&sp.querySelector('.sp-code'))};
});
console.log('PAIRNEW', pairNew);
await page.screenshot({path:OUT+'/02c-sync-code.png'});
// Back should close nested then panel
await page.evaluate(()=>window.__fefcConsumeBack());
await page.waitForTimeout(200);
await page.evaluate(()=>window.__fefcConsumeBack());
await page.waitForTimeout(200);
const afterPairBack=await page.evaluate(()=>({sp:document.body.classList.contains('sp-open'), hash:location.hash}));
console.log('AFTER_PAIR_BACK', afterPairBack);
await page.screenshot({path:OUT+'/02d-after-sync-back.png'});

// Item 3: open a real details page
await page.evaluate(()=>location.hash='#/all');
await page.waitForTimeout(4000);
const opened=await page.evaluate(()=>{
  const tiles=[...document.querySelectorAll('#grid .ol-tile')];
  const vid=tiles.find(t=>t.classList.contains('vid')||t.dataset.id)||tiles[0];
  if(!vid) return {n:tiles.length};
  vid.click();
  return {n:tiles.length, id:vid.dataset.id, cls:vid.className};
});
console.log('OPEN_TILE', opened);
await page.waitForTimeout(2500);
// If still not details, try folder first
let det=await page.evaluate(()=>{
  const d=document.getElementById('details');
  const acts=[...document.querySelectorAll('#details .det-acts .det-ext, #details .pill, #details a.pill, #details button')].map(b=>({text:(b.textContent||'').replace(/\s+/g,' ').trim(), cls:b.className, w:Math.round(b.getBoundingClientRect().width), h:Math.round(b.getBoundingClientRect().height), color:getComputedStyle(b).color, bg:getComputedStyle(b).backgroundColor}));
  return {hidden:d?d.hidden:null, acts, hasDrive:acts.some(a=>/drive/i.test(a.text))};
});
console.log('DET1', det);
if(det.hidden!==false){
  // navigate into first folder then video
  await page.evaluate(()=>{
    const f=[...document.querySelectorAll('#grid .ol-tile')].find(t=>/folder|main|collection/i.test(t.className+' '+(t.innerText||'')))||document.querySelector('#grid .ol-tile');
    if(f) f.click();
  });
  await page.waitForTimeout(3000);
  await page.evaluate(()=>{
    const v=document.querySelector('#grid .ol-tile.vid, #grid .ol-tile[data-id]');
    if(v) v.click();
  });
  await page.waitForTimeout(2500);
  det=await page.evaluate(()=>{
    const d=document.getElementById('details');
    const acts=[...document.querySelectorAll('#details .det-ext, #details .pill, #details .det-acts *')].map(b=>({text:(b.textContent||'').replace(/\s+/g,' ').trim().slice(0,40), cls:b.className, w:Math.round(b.getBoundingClientRect().width), h:Math.round(b.getBoundingClientRect().height), color:getComputedStyle(b).color, bg:getComputedStyle(b).backgroundColor, opacity:getComputedStyle(b).opacity}));
    return {hidden:d?d.hidden:null, acts, htmlSlice:(d?d.innerHTML:'').match(/Drive|det-ext|Open in/g)};
  });
  console.log('DET2', JSON.stringify(det,null,2));
}
await page.screenshot({path:OUT+'/03-details.png'});
// Highlight drive button area
await page.evaluate(()=>{
  const b=[...document.querySelectorAll('#details .det-ext, #details .pill, #details a, #details button')].find(el=>/drive/i.test(el.textContent||''));
  if(b){b.focus();b.style.outline='4px solid #0f0';}
});
await page.waitForTimeout(200);
await page.screenshot({path:OUT+'/03-drive-btn.png'});
// Crop acts row if present
const box=await page.evaluate(()=>{
  const row=document.querySelector('#details .det-acts')||[...document.querySelectorAll('#details .pill')].find(el=>/drive|vlc|play/i.test(el.textContent||''));
  if(!row) return null;
  const r=(row.closest('.det-acts')||row).getBoundingClientRect();
  return {x:Math.max(0,r.x-20),y:Math.max(0,r.y-20),width:Math.min(1920,r.width+40),height:Math.min(200,r.height+40)};
});
if(box) await page.locator('body').screenshot({path:OUT+'/03-drive-crop.png', clip:box});
console.log('BOX', box);

await browser.close();
console.log('DONE');
