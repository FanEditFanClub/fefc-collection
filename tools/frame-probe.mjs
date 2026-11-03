import { chromium } from 'playwright';
const url = process.argv[2] || 'https://collection.faneditfanclub.com/?tv=1&perf=1&nointro=1&apk=24';
const label = process.argv[3] || 'baseline';
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu','--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
// wait for hub
await page.waitForSelector('#hub .hb', { timeout: 60000 }).catch(()=>{});
await page.waitForTimeout(2500);
const stats = await page.evaluate(async () => {
  const frames = [];
  let longTasks = [];
  let po;
  try {
    po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longTasks.push({ d: e.duration, n: e.name });
    });
    po.observe({ type: 'longtask', buffered: true });
  } catch (e) {}
  await new Promise((r) => {
    let n = 0, last = performance.now();
    function tick(t) {
      frames.push(t - last);
      last = t;
      n++;
      if (n < 240) requestAnimationFrame(tick);
      else r();
    }
    requestAnimationFrame(tick);
  });
  try { po && po.disconnect(); } catch (e) {}
  // also capture any buffered longtasks from start
  try {
    const buf = performance.getEntriesByType('longtask');
    for (const e of buf) longTasks.push({ d: e.duration, n: e.name });
  } catch (e) {}
  frames.sort((a,b)=>a-b);
  const pct = (p) => frames[Math.min(frames.length-1, Math.floor(frames.length*p/100))] || 0;
  const mean = frames.reduce((a,b)=>a+b,0)/(frames.length||1);
  longTasks.sort((a,b)=>b.d-a.d);
  // drop duplicate buffered if any
  const ltMax = longTasks[0]?.d || 0;
  const ltSum = longTasks.reduce((a,b)=>a+b.d,0);
  const ltOver50 = longTasks.filter(x=>x.d>=50).length;
  return {
    frames: frames.length,
    mean: +mean.toFixed(2),
    p50: +pct(50).toFixed(2),
    p95: +pct(95).toFixed(2),
    p99: +pct(99).toFixed(2),
    max: +Math.max(...frames,0).toFixed(2),
    longTasks: longTasks.length,
    ltOver50,
    ltMax: +ltMax.toFixed(2),
    ltSum: +ltSum.toFixed(2),
    bodyClass: document.body.className,
    hubKids: document.querySelectorAll('#hub .hb').length
  };
});
console.log(JSON.stringify({ label, url, ...stats }, null, 2));
await browser.close();
