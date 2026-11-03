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

await page.locator('body').screenshot({path:OUT+'/04-ticker-hints-flush.png',clip:{x:0,y:900,width:1920,height:180}});
await page.locator('body').screenshot({path:OUT+'/05-left-edge.png',clip:{x:0,y:0,width:160,height:1080}});
await page.screenshot({path:OUT+'/04-05-home-overscan.png'});
const lay=await page.evaluate(()=>{
  const h=document.getElementById('hints').getBoundingClientRect();
  const t=document.getElementById('ticker').getBoundingClientRect();
  return {gap:t.top-h.bottom, left:t.left, bottomSafe:1080-t.bottom, hintsH:h.height, tickerH:t.height};
});
console.log('LAYOUT', lay);

await page.keyboard.press('ContextMenu');
await page.waitForTimeout(400);
await page.screenshot({path:OUT+'/01-popup-open.png'});
const back1=await page.evaluate(()=>{
  const before=!!(document.getElementById('tvmenu')&&!document.getElementById('tvmenu').hidden);
  const consumed=window.__fefcConsumeBack();
  const after=!!(document.getElementById('tvmenu')&&!document.getElementById('tvmenu').hidden);
  return {before,consumed,after};
});
console.log('BACK_MENU', back1);
await page.screenshot({path:OUT+'/01-after-back.png'});

await page.evaluate(()=>{ location.hash='#/mylist'; });
await page.waitForTimeout(2500);
await page.evaluate(()=>{
  const b=document.querySelector('#ml-sync button, #ml-sync .mi, #ml-sync .sync-go');
  if(b) b.click();
});
await page.waitForTimeout(700);
await page.screenshot({path:OUT+'/02-sync-menu.png'});
await page.evaluate(()=>{ const b=document.querySelector('.sp-opt[data-sp="pair"]'); if(b) b.click(); });
await page.waitForTimeout(600);
await page.evaluate(()=>{ const b=document.querySelector('.sp-opt[data-sp="pair-new"]'); if(b) b.click(); });
await page.waitForTimeout(1800);
const pairNew=await page.evaluate(()=>{
  const sp=document.getElementById('syncpanel');
  const t=(sp?sp.innerText:'');
  return {open:!!(sp&&!sp.hidden), text:t.slice(0,500), deadEnd:/not switched on|not set up|Cloud sync is not/i.test(t), hasCode:!!(sp&&(/\b\d{4,}\b/.test(t)||sp.querySelector('.sp-code')))};
});
console.log('PAIRNEW', pairNew);
await page.screenshot({path:OUT+'/02c-sync-code.png'});
await page.evaluate(()=>window.__fefcConsumeBack());
await page.waitForTimeout(200);
await page.evaluate(()=>window.__fefcConsumeBack());
await page.waitForTimeout(200);
await page.screenshot({path:OUT+'/02d-after-sync-back.png'});
console.log('AFTER_SYNC_BACK', await page.evaluate(()=>({sp:document.body.classList.contains('sp-open'), hash:location.hash})));

await page.evaluate(()=>{ location.hash='#/all'; });
await page.waitForTimeout(4500);
const tiles=await page.evaluate(()=>{
  return [...document.querySelectorAll('#grid .ol-tile')].slice(0,12).map(t=>({
    id:t.dataset.id, cls:t.className, txt:(t.innerText||'').slice(0,40)
  }));
});
console.log('TILES', tiles);

for(let depth=0; depth<6; depth++){
  const state=await page.evaluate(()=>{
    const d=document.getElementById('details');
    if(d&&!d.hidden){
      const acts=[...d.querySelectorAll('.det-ext,.pill,a,button')].map(b=>({text:(b.textContent||'').replace(/\s+/g,' ').trim().slice(0,50),cls:b.className}));
      return {kind:'details',acts,hasDrive:acts.some(a=>/drive/i.test(a.text))};
    }
    const t=document.querySelector('#grid .ol-tile');
    if(t){ t.click(); return {kind:'clicked',cls:t.className,id:t.dataset.id}; }
    return {kind:'empty'};
  });
  console.log('DEPTH', depth, state);
  await page.waitForTimeout(2200);
  if(state.kind==='details') break;
}

const det=await page.evaluate(()=>{
  const d=document.getElementById('details');
  if(!d||d.hidden) return {hidden:true};
  const acts=[...d.querySelectorAll('.det-acts .det-ext, .det-acts a, .det-acts button, .pill')].map(b=>{
    const r=b.getBoundingClientRect();
    return {text:(b.textContent||'').replace(/\s+/g,' ').trim(), cls:b.className, w:Math.round(r.width), h:Math.round(r.height), color:getComputedStyle(b).color, bg:getComputedStyle(b).backgroundColor, opacity:getComputedStyle(b).opacity, blank:!(b.textContent||'').trim()};
  });
  return {hidden:false, acts, htmlHasDrive:/Drive|det-ext/.test(d.innerHTML)};
});
console.log('DETAILS', JSON.stringify(det,null,2));
await page.screenshot({path:OUT+'/03-details.png'});
const box=await page.evaluate(()=>{
  const row=document.querySelector('#details .det-acts');
  if(row){
    const r=row.getBoundingClientRect();
    return {x:Math.max(0,r.x-20),y:Math.max(0,r.y-20),width:Math.min(1200,Math.max(100,r.width+40)),height:Math.min(160,Math.max(40,r.height+40))};
  }
  const b=[...document.querySelectorAll('#details .pill')].find(el=>/drive|vlc|play/i.test(el.textContent||''));
  if(!b) return null;
  const r=b.getBoundingClientRect();
  return {x:Math.max(0,r.x-30),y:Math.max(0,r.y-30),width:Math.min(900,r.width+400),height:Math.min(160,r.height+60)};
});
console.log('BOX', box);
if(box && box.width>10 && box.height>10){
  await page.locator('body').screenshot({path:OUT+'/03-drive-crop.png', clip:box});
}

await browser.close();
console.log('DONE');
