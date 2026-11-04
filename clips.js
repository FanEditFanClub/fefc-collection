const DWELL = [3e3, 6e3], DWELL_PERF = [7e3, 12e3];
const STILL_MS = [3200, 5e3], STILL_MS_PERF = [4e3, 6500];
let clips = null, loading = false, timers = [], cells = [], pool = [], free = [], on = false, rot = 0;
let atlasV = null, atlasOn = false, atlasTried = false, atlasGen = 0, atlasStarting = null;
const home = () => document.getElementById("home");
const atHome = () => {
  const h = home(), b = document.body.classList;
  return h && !h.hidden && !document.hidden && !b.contains("cintro") && !b.contains("native-waiting");
};
const tv = () => document.body.classList.contains("tv");
const fire = () => !!(window.FEFCNative || document.body.classList.contains("firetv"));
const perf = () => document.body.classList.contains("perf");
const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
const lite = () => ios || document.body.classList.contains("lite") || document.body.classList.contains("tier-lite") || Math.min(innerWidth, innerHeight) < 600;
function tierInfo() {
  try {
    const q = new URLSearchParams(location.search).get("tier");
    if (q && /^(LOW|MID|HIGH)$/i.test(q)) {
      const T = q.toUpperCase();
      const vt = T === "HIGH" ? 4 : 1;
      return { tier: T, videoTiles: vt, reduceEffects: T !== "HIGH" };
    }
  } catch (e) {
  }
  try {
    if (window.__fefcTier && window.__fefcTier.tier) return window.__fefcTier;
  } catch (e) {
  }
  try {
    if (window.FEFCNative && FEFCNative.deviceTier) {
      const j = JSON.parse(FEFCNative.deviceTier());
      window.__fefcTier = j;
      return j;
    }
  } catch (e) {
  }
  const b = document.body.classList;
  if (b.contains("tier-high")) return { tier: "HIGH", videoTiles: 4 };
  if (b.contains("tier-mid")) return { tier: "MID", videoTiles: 1 };
  if (b.contains("tier-low")) return { tier: "LOW", videoTiles: 1 };
  return null;
}
const decoders = () => {
  if (atlasOn) return 0;
  const t = tierInfo();
  if (t && t.videoTiles > 0) {
    let n = +t.videoTiles;
    if (t.tier === "HIGH") n = Math.min(n, 4);
    else n = Math.min(n, 1);
    return Math.max(0, n);
  }
  if (fire() || tv()) return 1;
  return lite() ? 2 : (navigator.hardwareConcurrency || 8) <= 6 ? 4 : 8;
};
const dwell = () => {
  const d = perf() ? DWELL_PERF : DWELL;
  return d[0] + Math.random() * (d[1] - d[0]);
};
const stillDwell = () => {
  const d = perf() ? STILL_MS_PERF : STILL_MS;
  return d[0] + Math.random() * (d[1] - d[0]);
};
const ringOf = (el) => {
  const n = +(el && (el._ring != null ? el._ring : el.dataset && el.dataset.ring));
  return n > 0 ? n : 99;
};
window.__clipStats = () => ({ tiles: cells.length, ring1: cells.filter((c) => ringOf(c) === 1).length, outer: cells.filter((c) => ringOf(c) > 1).length, decoders: pool.length, playing: pool.filter((v) => !v.paused).length, cap: decoders(), tier: (tierInfo() || {}).tier || null, atlas: atlasOn });
window.__fefcAtlasActive = () => atlasOn;
function atlasSrc() {
  const t = (tierInfo() || {}).tier;
  if (t === "HIGH") return "assets/clips/mosaic-atlas-1080.mp4";
  if (t === "MID" || t === "LOW") return "assets/clips/mosaic-atlas-720.mp4";
  try {
    if (!lite() && Math.max(innerWidth || 0, screen && screen.width || 0) >= 1280) return "assets/clips/mosaic-atlas-1080.mp4";
  } catch (e) {
  }
  return "assets/clips/mosaic-atlas-720.mp4";
}
function stopAtlas() {
  atlasOn = false;
  atlasStarting = null;
  try {
    document.body.classList.remove("mosaic-atlas");
  } catch (e) {
  }
  if (atlasV) {
    try {
      atlasV.pause();
    } catch (e) {
    }
    try {
      if (atlasV._blobUrl) URL.revokeObjectURL(atlasV._blobUrl);
    } catch (e) {
    }
    try {
      atlasV.removeAttribute("src");
      atlasV.load();
    } catch (e) {
    }
    try {
      atlasV.remove();
    } catch (e) {
    }
    atlasV = null;
  }
}
function wantAtlas() {
  try {
    const ua = navigator.userAgent || "";
    if (window.FEFCNative || document.body.classList.contains("firetv") || document.body.classList.contains("tv") || /Silk|AFT\w|Fire TV|Android TV|GoogleTV|FEFCFireTV/i.test(ua)) return true;
  } catch (e) {
  }
  try {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  } catch (e) {
  }
  return true;
}
function startAtlas() {
  if (!wantAtlas()) return Promise.resolve(false);
  if (atlasOn && atlasV && !atlasV.error) return Promise.resolve(true);
  if (atlasStarting) return atlasStarting;
  const my = ++atlasGen;
  stopAtlas();
  const h = home();
  if (!h) return Promise.resolve(false);
  const src = atlasSrc();
  const v = document.createElement("video");
  v.id = "mosaic-atlas";
  v.muted = true;
  v.defaultMuted = true;
  v.loop = true;
  v.playsInline = true;
  v.setAttribute("muted", "");
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.preload = "auto";
  v.setAttribute("aria-hidden", "true");
  v.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:fill;z-index:0;pointer-events:none;opacity:0;transition:opacity .5s ease;background:#05070b";
  const plane = document.getElementById("home-plane") || h;
  const hub = document.getElementById("hub");
  if (hub && hub.parentNode === plane) plane.insertBefore(v, hub);
  else plane.insertBefore(v, plane.firstChild);
  atlasV = v;
  atlasStarting = new Promise((res) => {
    let done = 0;
    const finish = (ok, why) => {
      if (done || my !== atlasGen) return;
      done = 1;
      atlasStarting = null;
      if (!ok) {
        try {
          const err = v.error;
          const line = "FEFC_CLIPS atlas=fail why=" + (why || "?") + " code=" + (err && err.code || 0) + " src=" + src + " rs=" + v.readyState;
          console.warn(line);
          if (window.FEFCNative && FEFCNative.log) FEFCNative.log(line);
        } catch (e) {
        }
        if (atlasV === v) stopAtlas();
        res(false);
        return;
      }
      atlasOn = true;
      try {
        document.body.classList.add("mosaic-atlas");
      } catch (e) {
      }
      v.style.opacity = "1";
      try {
        const line = "FEFC_CLIPS atlas=1 src=" + src + " tier=" + ((tierInfo() || {}).tier || "?");
        console.log(line);
        if (window.FEFCNative && FEFCNative.log) FEFCNative.log(line);
      } catch (e) {
      }
      res(true);
    };
    v.addEventListener("error", () => finish(false, "error"), { once: true });
    v.addEventListener("playing", () => finish(true, "playing"), { once: true });
    v.addEventListener("canplay", () => {
      if (my !== atlasGen || atlasOn) return;
      const p = v.play();
      if (p && p.catch) p.catch(() => {
      });
    }, { once: true });
    setTimeout(() => {
      if (!atlasOn && my === atlasGen) finish(v.readyState >= 2, "timeout-rs" + v.readyState);
    }, 9e3);
    const boot = () => {
      const play = () => {
        const p = v.play();
        if (p && p.catch) p.catch((e) => {
          if (!e || e.name === "AbortError" || e.name === "NotAllowedError") return;
          finish(false, "play:" + (e && e.name || e));
        });
      };
      v.addEventListener("loadeddata", () => {
        if (my === atlasGen && !atlasOn) finish(true, "frame");
      }, { once: true });
      const useBlob = (b) => {
        if (!b || my !== atlasGen) return;
        try {
          if (v._blobUrl) URL.revokeObjectURL(v._blobUrl);
        } catch (e) {
        }
        v._blobUrl = URL.createObjectURL(b);
        try {
          const line = "FEFC_CLIPS atlas=blob bytes=" + b.size;
          console.log(line);
          if (window.FEFCNative && FEFCNative.log) FEFCNative.log(line);
        } catch (e) {
        }
        v.src = v._blobUrl;
        play();
      };
      const fetchBlob = () => {
        try {
          const line = "FEFC_CLIPS atlas=fetch-start " + src;
          console.log(line);
          if (window.FEFCNative && FEFCNative.log) FEFCNative.log(line);
        } catch (e) {
        }
        let ctrl = null, to = null;
        try {
          ctrl = new AbortController();
          to = setTimeout(() => {
            try {
              ctrl.abort();
            } catch (e) {
            }
          }, 5500);
        } catch (e) {
        }
        const opts = { credentials: "same-origin" };
        if (ctrl) opts.signal = ctrl.signal;
        fetch(src, opts).then((r) => {
          if (my !== atlasGen) return null;
          if (!r.ok) throw new Error("http" + r.status);
          return r.blob();
        }).then((b) => {
          if (to) clearTimeout(to);
          useBlob(b);
        }).catch((e) => {
          if (to) clearTimeout(to);
          try {
            const line = "FEFC_CLIPS atlas=fetch-fail " + e;
            console.warn(line);
            if (window.FEFCNative && FEFCNative.log) FEFCNative.log(line);
          } catch (err) {
          }
          if (my !== atlasGen) return;
          if (!v.src) {
            v.src = src;
            play();
          }
        });
      };
      const onFire = !!(window.FEFCNative || document.body.classList.contains("firetv"));
      if (onFire) {
        try {
          const line = "FEFC_CLIPS atlas=direct-src " + src;
          console.log(line);
          if (window.FEFCNative && FEFCNative.log) FEFCNative.log(line);
        } catch (e) {
        }
        v.src = src;
        play();
        setTimeout(() => {
          if (my !== atlasGen || atlasOn) return;
          if (v.readyState >= 2) return;
          try {
            v.removeAttribute("src");
            v.load();
          } catch (e) {
          }
          fetchBlob();
        }, 2500);
      } else {
        fetchBlob();
      }
    };
    boot();
  });
  return atlasStarting;
}
function load() {
  if (clips || loading) return;
  loading = true;
  fetch("data/clips.json").then((r) => r.json()).then((j) => {
    clips = j;
    j.slice(0, 12).forEach((c) => {
      const i = new Image();
      i.src = c.frames && c.frames[0] || c.poster;
    });
    schedule();
  }).catch(() => {
    clips = [];
    schedule();
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
function framesOf(c) {
  return c && c.frames && c.frames.length ? c.frames : c && c.poster ? [c.poster] : [];
}
const FILL = "position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;pointer-events:none;border-radius:inherit;";
function stills(cell) {
  if (cell._s) return;
  cell._s = [0, 1].map(() => {
    const p = document.createElement("img");
    p.alt = "";
    p.className = "mcp";
    p.decoding = "async";
    p.style.cssText = FILL + "z-index:2;opacity:0;transition:opacity .7s ease;will-change:opacity";
    cell.appendChild(p);
    return p;
  });
  cell._si = 0;
}
function showFrame(cell, url, cb) {
  if (!url) {
    cb && cb();
    return;
  }
  stills(cell);
  const nx = cell._s[cell._si ^ 1], cur = cell._s[cell._si];
  const im = new Image();
  im.src = url;
  const fin = () => {
    if (!on) return;
    nx.src = url;
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
function stillLoop(cell) {
  if (!on || !atHome() || atlasOn) return;
  if (!cell._clip || !cell._fi && cell._fi !== 0) {
    cell._clip = pick(cell);
    cell._fi = 0;
    if (cell._clip.id) cell.dataset.id = cell._clip.id;
  }
  const fr = framesOf(cell._clip);
  if (!fr.length) {
    timers.push(setTimeout(() => stillLoop(cell), stillDwell()));
    return;
  }
  const url = fr[cell._fi % fr.length];
  const nextUrl = fr[(cell._fi + 1) % fr.length];
  if (nextUrl) {
    const pre = new Image();
    pre.src = nextUrl;
    cell._pre = pre;
  }
  showFrame(cell, url, () => {
    cell._fi = (cell._fi + 1) % Math.max(1, fr.length);
    if (cell._fi === 0) {
      cell._clip = pick(cell);
      if (cell._clip.id) cell.dataset.id = cell._clip.id;
      cell._fi = 0;
    }
    timers.push(setTimeout(() => stillLoop(cell), stillDwell()));
  });
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
  v.style.cssText = FILL + "z-index:4;opacity:0;transition:opacity .45s ease;will-change:opacity;";
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
function videoStep(cell) {
  if (!on || !atHome() || atlasOn) return;
  const c = pick(cell);
  cell._clip = c;
  if (c.id) cell.dataset.id = c.id;
  const had = !!cell._v;
  if (had) {
    cell._v.style.opacity = 0;
    const v = cell._v;
    showFrame(cell, c.frames && c.frames[0] || c.poster, () => {
      if (!on || v._cell !== cell || atlasOn) return;
      setTimeout(() => {
        if (v._cell !== cell || atlasOn) return;
        v.src = c.src;
        const r = v.play();
        if (r && r.catch) r.catch(() => {
        });
      }, 450);
    });
  } else showFrame(cell, c.frames && c.frames[0] || c.poster, () => {
    if (!on || atlasOn) return;
    attach(cell, c);
  });
}
function visible(el) {
  const r = el.getBoundingClientRect(), m = 120;
  return r.width > 0 && r.right > -m && r.bottom > -m && r.left < innerWidth + m && r.top < innerHeight + m && el.style.visibility !== "hidden";
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
function stopAll() {
  stop();
  stopAtlas();
}
function scheduleStillsAndTiles() {
  cells = [].slice.call(document.querySelectorAll("#home-plane .mc, #hub .mc")).filter(visible);
  if (atlasOn) return;
  const ring1 = cells.filter((c) => ringOf(c) === 1).sort((a, b) => (a._ring || 0) - (b._ring || 0));
  const outer = cells.filter((c) => ringOf(c) > 1);
  const n = Math.min(decoders(), Math.max(0, ring1.length));
  while (pool.length < n) pool.push(mkVideo());
  free = pool.slice(0, n);
  const start = rot % Math.max(1, ring1.length || 1);
  const videoTiles = [];
  for (let i = 0; i < n && ring1.length; i++) videoTiles.push(ring1[(start + i) % ring1.length]);
  const videoSet = new Set(videoTiles);
  const stillTiles = outer.concat(ring1.filter((c) => !videoSet.has(c)));
  stillTiles.forEach((c, i) => timers.push(setTimeout(() => {
    if (on && atHome() && !atlasOn) stillLoop(c);
  }, i * 110 + Math.random() * 180)));
  const gap = fire() || perf() ? 320 : Math.min(140, 2400 / Math.max(1, videoTiles.length || 1));
  videoTiles.forEach((c, i) => {
    const loop = () => {
      if (!on || !atHome() || atlasOn) return;
      videoStep(c);
      timers.push(setTimeout(loop, dwell()));
    };
    timers.push(setTimeout(loop, i * gap + (fire() || perf() ? Math.random() * 80 : Math.random() * 250)));
  });
  if (ring1.length > n && n > 0) {
    timers.push(setTimeout(function hop() {
      if (!on || !atHome() || atlasOn) return;
      rot = (rot + n) % ring1.length;
      schedule();
    }, 4e4 + Math.random() * 15e3));
  }
  try {
    const ti = tierInfo() || {};
    const line = "FEFC_CLIPS atlas=0 tier=" + (ti.tier || "?") + " ring1=" + ring1.length + " video=" + videoTiles.length + " outerStill=" + stillTiles.length + " cap=" + n + " stats=" + JSON.stringify(__clipStats());
    console.log(line);
    try {
      if (window.FEFCNative && FEFCNative.log) FEFCNative.log(line);
    } catch (e2) {
    }
  } catch (e) {
  }
}
function schedule() {
  if (atlasStarting) return;
  stop();
  if (!atHome()) return;
  on = true;
  const go = () => {
    if (!on || !atHome()) return;
    if (!clips) clips = [];
    scheduleStillsAndTiles();
  };
  if (wantAtlas() && !atlasTried) {
    atlasTried = true;
    startAtlas().then((ok) => {
      if (!ok) {
        try {
          const line = "FEFC_CLIPS atlas=give-up \u2192 stills";
          console.warn(line);
          if (window.FEFCNative && FEFCNative.log) FEFCNative.log(line);
        } catch (e) {
        }
      }
      go();
    });
    return;
  }
  go();
}
let deb, arm;
function kick() {
  if (!atHome()) {
    clearTimeout(deb);
    arm = false;
    stopAll();
    atlasTried = false;
    return;
  }
  if (arm) return;
  arm = true;
  deb = setTimeout(() => {
    arm = false;
    if (atHome()) {
      load();
      schedule();
    } else stopAll();
  }, 450);
}
let _ic = document.body.classList.contains("cintro");
new MutationObserver(() => {
  const c = document.body.classList.contains("cintro");
  if (_ic && !c) kick();
  _ic = c;
}).observe(document.body, { attributes: true, attributeFilter: ["class"] });
addEventListener("fefc-home-revealed", () => {
  atlasTried = false;
  kick();
});
function init() {
  const h = home(), hub = document.getElementById("hub");
  if (!h || !hub) return setTimeout(init, 500);
  const watch = document.getElementById("mosaic") || document.getElementById("home-plane") || hub;
  new MutationObserver((ms) => {
    if (ms.some((m) => [].some.call(m.addedNodes, (x) => x.classList && x.classList.contains("mc")) || [].some.call(m.removedNodes, (x) => x.classList && x.classList.contains("mc")))) kick();
  }).observe(watch, { childList: true });
  new MutationObserver(kick).observe(h, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("visibilitychange", kick);
  addEventListener("fefc-background", () => stopAll());
  addEventListener("fefc-foreground", () => {
    atlasTried = false;
    kick();
  });
  addEventListener("pagehide", () => stopAll());
  addEventListener("hashchange", kick);
  addEventListener("resize", kick);
  addEventListener("scroll", kick, { passive: true, capture: true });
  addEventListener("fefc-perf", kick);
  addEventListener("fefc-tier", () => {
    atlasTried = false;
    stopAtlas();
    kick();
  });
  const start = () => {
    if (document.body.classList.contains("native-waiting")) return;
    kick();
  };
  window.requestIdleCallback ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 1500);
  setTimeout(start, 400);
  setTimeout(start, 1600);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
