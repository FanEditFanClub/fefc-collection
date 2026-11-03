import { chromium } from 'playwright';
import fs from 'fs';
const swapPath = process.argv[2]; // local app.js to inject
const label = process.argv[3] || 'swap';
const url = 'https://collection.faneditfanclub.com/?tv=1&perf=1&nointro=1&probe=1';
const js = fs.readFileSync(swapPath, 'utf8');
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu','--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.route('**/app.js*', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/javascript', body: js });
});
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#hub .hb', { timeout: 90000 }).catch(()=>{});
await page.waitForTimeout(2500);
const stats = await page.evaluate(async () => {
  const frames = [];
  let longTasks = [];
  let po;
  try {
    po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longTasks.push(e.duration);
    });
    po.observe({ type: 'longtask', buffered: false });
  } catch (e) {}
  const stress = setInterval(() => {
    try { if (typeof softRefresh === 'function') softRefresh(); } catch (e) {}
    try { if (typeof placeHeader === 'function') placeHeader(); } catch (e) {}
  }, 350);
  // also nudge focus like remote
  try {
    const hb = document.querySelector('#hub .hb-logo') || document.querySelector('#hub .hb');
    if (hb) hb.focus({preventScroll:true});
  } catch (e) {}
  await new Promise((r) => {
    let n = 0, last = performance.now();
    function tick(t) {
      frames.push(t - last);
      last = t;
      n++;
      if (n < 300) requestAnimationFrame(tick);
      else r();
    }
    requestAnimationFrame(tick);
  });
  clearInterval(stress);
  try { po && po.disconnect(); } catch (e) {}
  frames.sort((a,b)=>a-b);
  const pct = (p) => frames[Math.min(frames.length-1, Math.floor(frames.length*p/100))] || 0;
  const mean = frames.reduce((a,b)=>a+b,0)/(frames.length||1);
  longTasks.sort((a,b)=>b-a);
  const hasRecover = typeof recoverFocus === 'function';
  const hasShuf = typeof openShufPick === 'function';
  return {
    frames: frames.length,
    mean: +mean.toFixed(2),
    p50: +pct(50).toFixed(2),
    p95: +pct(95).toFixed(2),
    p99: +pct(99).toFixed(2),
    max: +Math.max(...frames,0).toFixed(2),
    longTasks: longTasks.length,
    ltOver50: longTasks.filter(d=>d>=50).length,
    ltMax: +(longTasks[0]||0).toFixed(2),
    ltSum: +longTasks.reduce((a,b)=>a+b,0).toFixed(2),
    hasRecover, hasShuf,
    hubKids: document.querySelectorAll('#hub .hb').length
  };
});
console.log(JSON.stringify({ label, swap: swapPath, ...stats }, null, 2));
await browser.close();
