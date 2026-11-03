import { chromium } from 'playwright';
const url = process.argv[2];
const label = process.argv[3] || 'stress';
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu','--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#hub .hb', { timeout: 60000 }).catch(()=>{});
await page.waitForTimeout(2000);
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
  // Stress: softRefresh + hub + mosaic churn like the live TV path
  const stress = setInterval(() => {
    try { if (typeof softRefresh === 'function') softRefresh(); } catch (e) {}
    try { if (typeof placeHeader === 'function') placeHeader(); } catch (e) {}
  }, 400);
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
    ltSum: +longTasks.reduce((a,b)=>a+b,0).toFixed(2)
  };
});
console.log(JSON.stringify({ label, url, ...stats }, null, 2));
await browser.close();
