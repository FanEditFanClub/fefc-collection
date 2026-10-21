const MAX = 10, SWAP = [5e3, 9e3];
let clips = null, loading = false, timers = [], active = [];
const home = () => document.getElementById("home");
const atHome = () => {
  const h = home();
  return h && !h.hidden && !document.hidden;
};
const lowPower = () => document.body.classList.contains("tv") || navigator.connection && navigator.connection.saveData;
function load() {
  if (clips || loading) return;
  loading = true;
  fetch("data/clips.json").then((r) => r.json()).then((j) => {
    clips = j;
    schedule();
  }).catch(() => {
    clips = [];
  });
}
function pick(not) {
  if (!clips.length) return null;
  let c, i = 0;
  do {
    c = clips[Math.random() * clips.length | 0];
  } while (++i < 6 && not.indexOf(c.src) >= 0);
  return c;
}
function mkVid() {
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
  v.style.cssText = "position:absolute;inset:0;left:0;top:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .8s ease;pointer-events:none;z-index:2;border-radius:inherit";
  return v;
}
function play(cell) {
  const using = active.map((c2) => c2._clip && c2._clip.src);
  const c = pick(using);
  if (!c) return;
  const vs = cell._vids || (cell._vids = [mkVid(), mkVid()]);
  vs.forEach((v2) => {
    if (!v2.parentNode) cell.appendChild(v2);
  });
  const on = cell._von ? 0 : 1;
  cell._von = !cell._von;
  const v = vs[on], old = vs[1 - on];
  v.onerror = () => {
    v.style.opacity = 0;
    cell._fail = (cell._fail || 0) + 1;
  };
  v.oncanplay = () => {
    v.oncanplay = null;
    const p = v.play();
    const go = () => {
      v.style.opacity = 1;
      old.style.opacity = 0;
      setTimeout(() => {
        if (old.style.opacity === "0") {
          try {
            old.pause();
          } catch (e) {
          }
        }
      }, 900);
    };
    if (p && p.then) p.then(go, () => {
      v.style.opacity = 0;
    });
    else go();
  };
  v.poster = c.poster;
  v.src = c.src;
  cell._clip = c;
  if (c.id) cell.dataset.id = c.id;
}
function visible(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
}
function stop() {
  timers.forEach(clearTimeout);
  timers = [];
  active.forEach((c) => (c._vids || []).forEach((v) => {
    try {
      v.pause();
    } catch (e) {
    }
  }));
  active = [];
}
function schedule() {
  stop();
  if (!clips || !clips.length || !atHome() || lowPower()) return;
  const cells = [].slice.call(document.querySelectorAll("#hub .mc")).filter((c) => visible(c) && !(c._fail > 2));
  cells.sort(() => Math.random() - 0.5);
  active = cells.slice(0, MAX);
  active.forEach((c, i) => {
    const loop = () => {
      if (!atHome()) return;
      play(c);
      timers.push(setTimeout(loop, SWAP[0] + Math.random() * (SWAP[1] - SWAP[0])));
    };
    timers.push(setTimeout(loop, 150 * i + Math.random() * 400));
  });
}
let deb;
function kick() {
  clearTimeout(deb);
  deb = setTimeout(() => {
    if (atHome()) {
      load();
      schedule();
    } else stop();
  }, 400);
}
function init() {
  const h = home(), hub = document.getElementById("hub");
  if (!h || !hub) return setTimeout(init, 500);
  new MutationObserver(kick).observe(hub, { childList: true });
  new MutationObserver(kick).observe(h, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("visibilitychange", kick);
  addEventListener("hashchange", kick);
  const start = () => kick();
  window.requestIdleCallback ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 1500);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
