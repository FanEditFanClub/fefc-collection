import { chromium } from 'playwright';
import fs from 'fs';
const url = 'https://c5d148bc.fefc-collection.pages.dev/?tv=1&nointro=1&perf=1';
const out = '/tmp/fefc-shots/0814/16-shufpick.png';
fs.mkdirSync('/tmp/fefc-shots/0814', { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#hub .hb', { timeout: 60000 });
await page.waitForTimeout(1500);
await page.evaluate(() => { location.hash = '#/all'; });
await page.waitForTimeout(3500);
await page.evaluate(() => {
  window.FEFCNative = { playVideo(){}, openInVlc(){}, openInDrive(){} };
  const b = document.querySelector('[data-shuffle]');
  if (b) b.click();
});
await page.waitForTimeout(600);
let state = await page.evaluate(() => {
  const el = document.getElementById('shufpick');
  const opts = el ? [...el.querySelectorAll('.shuf-opt')].map(b => ({t:b.textContent.trim(), hidden:!!b.hidden, focused: document.activeElement===b})) : [];
  return { has: !!el, hidden: el ? el.hidden : null, opts, active: document.activeElement && (document.activeElement.innerText||'').slice(0,40), shufBtn: !!document.querySelector('[data-shuffle]') };
});
if (!state.has || state.hidden) {
  // Force open by reusing app's openShufPick via synthetic button
  await page.evaluate(() => {
    window.FEFCNative = { playVideo(){}, openInVlc(){}, openInDrive(){} };
    let b = document.querySelector('[data-shuffle]');
    if (!b) {
      b = document.createElement('button');
      b.dataset.shuffle = 'all';
      b.style.position='fixed';b.style.top='10px';b.style.left='10px';b.style.zIndex=99999;
      b.textContent='Shuffle Play';
      document.body.appendChild(b);
    }
    b.click();
  });
  await page.waitForTimeout(500);
  state = await page.evaluate(() => {
    const el = document.getElementById('shufpick');
    const opts = el ? [...el.querySelectorAll('.shuf-opt')].map(b => ({t:b.textContent.trim(), hidden:!!b.hidden, focused: document.activeElement===b})) : [];
    return { has: !!el, hidden: el ? el.hidden : null, opts, active: document.activeElement && (document.activeElement.innerText||'').slice(0,40), shufBtn: !!document.querySelector('[data-shuffle]') };
  });
}
await page.screenshot({ path: out, fullPage: false });
console.log(JSON.stringify(state, null, 2));
await browser.close();
