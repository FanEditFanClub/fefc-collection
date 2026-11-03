import { chromium } from 'playwright';
import fs from 'fs';
const OUT='/tmp/fefc-shots/0815';
fs.mkdirSync(OUT,{recursive:true});
const url='https://collection.faneditfanclub.com/?tv=1&nointro=1&apk=24';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
await page.waitForSelector('#hub .hb',{timeout:90000});
await page.waitForTimeout(1500);
await page.evaluate(()=>{
  document.body.classList.add('tv','firetv','tk-on');
  window.FEFCNative={playVideo(){},openInVlc(){},openInDrive(){},log(){},videoTiles(){return 2}};
});
const ids=['1pnJ2frgwOXXd9e4xdZ9tbp-FFRyGYK2q','1rXGixOdx1DDw3-gpZt0AIEHkmH4ytgbQ'];
let det=null;
for(const id of ids){
  await page.evaluate((id)=>{ location.hash='#/edit/'+id; }, id);
  await page.waitForTimeout(3500);
  det=await page.evaluate(()=>{
    const d=document.getElementById('details');
    if(!d||d.hidden) return {hidden:true, hash:location.hash};
    const acts=[...d.querySelectorAll('.det-acts .det-ext, .det-acts a, .det-acts button, .pill, .bigplay')].map(b=>{
      const r=b.getBoundingClientRect();
      const text=(b.textContent||'').replace(/\s+/g,' ').trim();
      return {text, cls:b.className, w:Math.round(r.width), h:Math.round(r.height), color:getComputedStyle(b).color, bg:getComputedStyle(b).backgroundColor, opacity:getComputedStyle(b).opacity, blank:!text, aria:b.getAttribute('aria-label')};
    });
    return {hidden:false, hash:location.hash, title:(d.querySelector('.lc-title')||{}).textContent, acts};
  });
  console.log('TRY', id, JSON.stringify(det,null,2));
  if(!det.hidden) break;
}
await page.screenshot({path:OUT+'/03-details.png'});
const box=await page.evaluate(()=>{
  const row=document.querySelector('#details .det-acts');
  if(!row) return null;
  const r=row.getBoundingClientRect();
  return {x:Math.max(0,r.x-20),y:Math.max(0,r.y-20),width:Math.min(1400,Math.max(120,r.width+40)),height:Math.min(200,Math.max(50,r.height+40))};
});
console.log('BOX', box);
if(box) await page.locator('body').screenshot({path:OUT+'/03-drive-crop.png', clip:box});
// Focus Drive specifically
await page.evaluate(()=>{
  const b=[...document.querySelectorAll('#details .det-ext, #details .pill')].find(el=>/drive/i.test(el.textContent||el.getAttribute('aria-label')||''));
  if(b) b.focus();
});
await page.waitForTimeout(200);
await page.screenshot({path:OUT+'/03-drive-focus.png'});
if(box) await page.locator('body').screenshot({path:OUT+'/03-drive-btn.png', clip:box});
await browser.close();
console.log('DONE');
