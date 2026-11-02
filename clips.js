const DWELL = [3e3, 6e3];
let clips = null, loading = false, timers = [], cells = [], pool = [], free = [], on = false;
const home = () => document.getElementById("home");
const atHome = () => {
  const h = home();
  return h && !h.hidden && !document.hidden && !document.body.classList.contains("cintro");
};
const tv = () => document.body.classList.contains("tv");
const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
const lite = () => ios || document.body.classList.contains("lite") || Math.min(innerWidth, innerHeight) < 600;
const decoders = () => tv() ? 6 : lite() ? 6 : (navigator.hardwareConcurrency || 8) <= 6 ? 12 : 40;
window.__clipStats = () => ({ tiles: cells.length, decoders: pool.length, playing: pool.filter((v) => !v.paused).length });
function load() {
  if (clips || loading) return;
  loading = true;
  fetch("data/clips.json").then((r) => r.json()).then((j) => {
    clips = j;
    j.forEach((c) => {
      const i = new Image();
      i.src = c.poster;
    });
    schedule();
  }).catch(() => {
    clips = [];
  });
}
function pick(cell) {
  const used = cells.map((c2) => c2._clip && c2._clip.src);
  let c, i = 0;
  do {
    c = clips[Math.random() * clips.length | 0];
  } while (++i < 12 && (used.indexOf(c.src) >= 0 || c === cell._clip));
  return c;
}
const FILL = "position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;pointer-events:none;border-radius:inherit;will-change:opacity;";
function stills(cell) {
  if (cell._s) return;
  cell._s = [0, 1].map(() => {
    const p = document.createElement("img");
    p.alt = "";
    p.className = "mcp";
    p.decoding = "async";
    p.style.cssText = FILL + "z-index:2;opacity:0;transition:opacity .7s ease";
    cell.appendChild(p);
    return p;
  });
  cell._si = 0;
}
function showStill(cell, c, cb) {
  stills(cell);
  const nx = cell._s[cell._si ^ 1], cur = cell._s[cell._si];
  const im = new Image();
  im.src = c.poster;
  const fin = () => {
    if (!on) return;
    nx.src = c.poster;
    nx.style.zIndex = 3;
    cur.style.zIndex = 2;
    requestAnimationFrame(() => {
      nx.style.opacity = 1;
      setTimeout(() => {
        if (cell._s[cell._si] !== nx) cur.style.opacity = 0;
      }, 750);
    });
    cell._si ^= 1;
    cb && cb();
  };
  (im.decode ? im.decode() : Promise.resolve()).then(fin, fin);
}
function mkVideo() {
  const v = document.createElement("video");
  v.muted = true;
  v.defaultMuted = true;
  v.loop = true;
  v.playsInline = true;
  v.setAttribute("muted", "");
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.preload = "auto";
  v.className = "mcv";
  v.style.cssText = FILL + "z-index:4;opacity:0;transition:opacity .45s ease";
  v.addEventListener("playing", () => {
    if (v._cell) v.style.opacity = 1;
  });
  v.addEventListener("error", () => {
    v.style.opacity = 0;
    release(v._cell);
  });
  return v;
}
function release(cell) {
  if (!cell || !cell._v) return;
  const v = cell._v;
  cell._v = null;
  v._cell = null;
  v.style.opacity = 0;
  setTimeout(() => {
    if (v._cell) return;
    try {
      v.pause();
    } catch (e) {
    }
    free.indexOf(v) < 0 && free.push(v);
  }, 460);
}
function attach(cell, c) {
  const v = free.shift();
  if (!v) return false;
  cell._v = v;
  v._cell = cell;
  v.style.opacity = 0;
  if (v.parentNode !== cell) cell.appendChild(v);
  v.src = c.src;
  try {
    v.currentTime = 0;
  } catch (e) {
  }
  const r = v.play();
  if (r && r.catch) r.catch(() => {
    release(cell);
  });
  return true;
}
function step(cell) {
  if (!on || !atHome()) return;
  const c = pick(cell);
  cell._clip = c;
  if (c.id) cell.dataset.id = c.id;
  const had = !!cell._v, keep = had && pool.length >= cells.length;
  if (keep) {
    cell._v.style.opacity = 0;
  } else if (had) release(cell);
  showStill(cell, c, () => {
    if (!on) return;
    if (keep && cell._v) {
      const v = cell._v;
      setTimeout(() => {
        if (v._cell !== cell) return;
        v.src = c.src;
        const r = v.play();
        if (r && r.catch) r.catch(() => {
        });
      }, 450);
    } else if (!had) attach(cell, c);
  });
}
function visible(el) {
  const r = el.getBoundingClientRect(), m = 120;
  return r.width > 0 && r.right > -m && r.bottom > -m && r.left < innerWidth + m && r.top < innerHeight + m;
}
function stop() {
  on = false;
  timers.forEach(clearTimeout);
  timers = [];
  pool.forEach((v) => {
    try {
      v.pause();
    } catch (e) {
    }
    v._cell = null;
    v.style.opacity = 0;
  });
  cells.forEach((c) => {
    c._v = null;
  });
  free = pool.slice();
  cells = [];
}
function schedule() {
  stop();
  if (!clips || !clips.length || !atHome()) return;
  on = true;
  cells = [].slice.call(document.querySelectorAll("#hub .mc")).filter(visible).filter((c) => c.style.visibility !== "hidden");
  const n = Math.min(decoders(), cells.length);
  while (pool.length < n) pool.push(mkVideo());
  free = pool.slice(0, n);
  const order = cells.slice().sort(() => Math.random() - 0.5);
  order.forEach((c, i) => {
    const loop = () => {
      if (!on || !atHome()) return;
      step(c);
      timers.push(setTimeout(loop, DWELL[0] + Math.random() * (DWELL[1] - DWELL[0])));
    };
    timers.push(setTimeout(loop, i * Math.min(140, 2400 / Math.max(1, order.length)) + Math.random() * 250));
  });
}
let deb;
function kick() {
  clearTimeout(deb);
  if (!atHome()) {
    stop();
    return;
  }
  deb = setTimeout(() => {
    if (atHome()) {
      load();
      schedule();
    } else stop();
  }, 400);
}
let _ic = document.body.classList.contains("cintro");
new MutationObserver(() => {
  const c = document.body.classList.contains("cintro");
  if (_ic && !c) kick();
  _ic = c;
}).observe(document.body, { attributes: true, attributeFilter: ["class"] });
function init() {
  const h = home(), hub = document.getElementById("hub");
  if (!h || !hub) return setTimeout(init, 500);
  new MutationObserver((ms) => {
    if (ms.some((m) => [].some.call(m.addedNodes, (x) => x.classList && x.classList.contains("mc")) || [].some.call(m.removedNodes, (x) => x.classList && x.classList.contains("mc")))) kick();
  }).observe(hub, { childList: true });
  new MutationObserver(kick).observe(h, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("visibilitychange", kick);
  addEventListener("hashchange", kick);
  addEventListener("resize", kick);
  addEventListener("scroll", kick, { passive: true, capture: true });
  const start = () => kick();
  window.requestIdleCallback ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 1500);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
