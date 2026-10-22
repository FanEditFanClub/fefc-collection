window.SFX = (() => {
  let ctx, master, amb, muted = localStorage.fefcMute === "1", started = false;
  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ctx.destination);
  }
  function tone(f, t0, d, type = "sine", g = 0.15, f2) {
    const o = ctx.createOscillator(), v = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
    v.gain.setValueAtTime(0, t0);
    v.gain.linearRampToValueAtTime(g, t0 + 0.01);
    v.gain.exponentialRampToValueAtTime(1e-4, t0 + d);
    o.connect(v);
    v.connect(master);
    o.start(t0);
    o.stop(t0 + d + 0.05);
  }
  let ambWant = false, ambBuf = null;
  function getAmbBuf(ib) {
    if (ambBuf) return ambBuf;
    if (!ib || !ctx) return null;
    try {
      const sr = ib.sampleRate;
      const t0 = Math.floor(Math.max(0, 24.65 * sr));
      const t1 = Math.floor(Math.min(ib.duration - 0.03, 26.12) * sr);
      const len = t1 - t0;
      if (len <= sr * 0.4) return null;
      const b = ctx.createBuffer(ib.numberOfChannels, len, sr);
      const xf = Math.floor(Math.min(0.28 * sr, len * 0.25));
      for (let ch = 0; ch < ib.numberOfChannels; ch++) {
        const src = ib.getChannelData(ch), dst = b.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          let v = src[t0 + i];
          if (i < xf) {
            const t = i / xf;
            v = v * t + src[t1 - xf + i] * (1 - t);
          }
          dst[i] = v;
        }
      }
      return ambBuf = b;
    } catch (e) {
      return null;
    }
  }
  function ambStart() {
    if (!ctx || amb || ctx.state !== "running") return;
    const t = ctx.currentTime, g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.085, t + 3);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 850;
    lp.Q.value = 0.5;
    lp.connect(g);
    g.connect(master);
    const os = [];
    const ab = S._ib && getAmbBuf(S._ib);
    if (ab) {
      const src = ctx.createBufferSource();
      src.buffer = ab;
      src.loop = true;
      src.connect(lp);
      src.start(t);
      os.push(src);
    } else {
      S.loadIntro().then((b) => {
        if (b && ambWant && amb && !amb.hasBuf) {
          const ab2 = getAmbBuf(b);
          if (ab2) {
            const src = ctx.createBufferSource();
            src.buffer = ab2;
            src.loop = true;
            src.connect(lp);
            src.start();
            amb.os.push(src);
            amb.hasBuf = true;
          }
        }
      });
    }
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.04;
    lg.gain.value = 180;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    lfo.start();
    [[55, "sine", 0.4], [164.81, "triangle", 0.2], [329.63, "sine", 0.16], [415.3, "sine", 0.12], [493.88, "sine", 0.09], [659.25, "sine", 0.06], [987.77, "sine", 0.03]].forEach(([f, ty, v], i) => {
      [-4, 4].forEach((dt) => {
        const o = ctx.createOscillator();
        o.type = ty;
        o.frequency.value = f;
        o.detune.value = dt + (i % 2 ? 1.5 : -1.5);
        const vg = ctx.createGain();
        vg.gain.value = v / 2.5;
        o.connect(vg);
        vg.connect(lp);
        o.start();
        os.push(o);
      });
    });
    amb = { g, os: [...os, lfo], hasBuf: !!ab };
  }
  function ambStop() {
    if (!amb) return;
    const a = amb;
    amb = null;
    const t = ctx.currentTime;
    a.g.gain.cancelScheduledValues(t);
    a.g.gain.setValueAtTime(a.g.gain.value, t);
    a.g.gain.linearRampToValueAtTime(0, t + 0.8);
    setTimeout(() => a.os.forEach((o) => {
      try {
        o.stop();
      } catch (e) {
      }
    }), 900);
  }
  const INTRO_MP3 = "assets/intro.mp3?v=352e1617";
  const S = {
    INTRO_MP3,
    unlock() {
      init();
      if (ctx.state === "suspended") ctx.resume().then(() => {
        if (ambWant) ambStart();
      }, () => {
      });
      started = true;
      if (ambWant) ambStart();
    },
    get muted() {
      return muted;
    },
    toggle() {
      muted = !muted;
      localStorage.fefcMute = muted ? "1" : "0";
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.6, ctx.currentTime, 0.05);
      return muted;
    },
    ambience(on) {
      ambWant = !!on && document.body.classList.contains("intro-done");
      if (!ambWant) {
        ambStop();
        return;
      }
      init();
      ambStart();
    },
    move() {
      if (!started) return;
      tone(1400, ctx.currentTime, 0.06, "sine", 0.05);
    },
    click() {
      if (!started) return;
      const t = ctx.currentTime;
      tone(600, t, 0.08, "triangle", 0.12, 900);
      tone(1200, t + 0.03, 0.1, "sine", 0.06);
    },
    open() {
      if (!started) return;
      const t = ctx.currentTime;
      tone(300, t, 0.35, "sawtooth", 0.05, 1200);
      tone(880, t + 0.12, 0.25, "sine", 0.08);
    },
    chirp(n = 0) {
      if (!started) return;
      const t = ctx.currentTime, seq = [[1320, 1760], [988, 1480], [1760, 1175]][n % 3];
      tone(seq[0], t, 0.07, "square", 0.04);
      tone(seq[1], t + 0.08, 0.09, "square", 0.04);
    },
    /* one-shot sound effects (Carson-supplied files), decoded once and cached; ducks the ambient bed while playing */
    _fx: {},
    loadFx(list) {
      init();
      const k = list.join("|");
      if (S._fx[k]) return S._fx[k];
      const tryN = (i) => i >= list.length ? Promise.resolve(null) : fetch(list[i]).then((r) => {
        if (!r.ok) throw 0;
        const ct = r.headers.get("content-type") || "";
        if (ct.includes("text/html") || ct.includes("text/plain")) throw 0;
        return r.arrayBuffer();
      }).then((a) => new Promise((res, rej) => ctx.decodeAudioData(a, res, rej))).catch(() => tryN(i + 1));
      return S._fx[k] = tryN(0).then((b) => {
        if (!b) delete S._fx[k];
        return b;
      }, () => {
        delete S._fx[k];
        return null;
      });
    },
    fx(list) {
      if (muted || !list || !list.length) return;
      init();
      if (ctx && ctx.state === "suspended") ctx.resume();
      S.loadFx(list).then((b) => {
        if (!b) {
          try {
            const a = new Audio(list[0]);
            a.volume = muted ? 0 : 0.8;
            a.play().catch(() => {
            });
          } catch (_) {
          }
          return;
        }
        if (muted) return;
        const src = ctx.createBufferSource(), g = ctx.createGain();
        g.gain.value = 1;
        src.buffer = b;
        src.connect(g);
        g.connect(master);
        const t = ctx.currentTime;
        if (amb) {
          amb.g.gain.cancelScheduledValues(t);
          amb.g.gain.setValueAtTime(amb.g.gain.value, t);
          amb.g.gain.linearRampToValueAtTime(0.012, t + 0.25);
          amb.g.gain.setValueAtTime(0.012, t + b.duration);
          amb.g.gain.linearRampToValueAtTime(0.075, t + b.duration + 2.5);
        }
        src.start(t);
      }).catch(() => {
        try {
          const a = new Audio(list[0]);
          a.volume = muted ? 0 : 0.8;
          a.play().catch(() => {
          });
        } catch (_) {
        }
      });
    },
    BACK: ["assets/sfx/ui-back.m4a", "assets/sfx/ui-back.mp3", "assets/sfx/ui-back.wav"],
    back() {
      const n = Date.now();
      if (n - (S._bt || 0) < 350) return;
      S._bt = n;
      S.fx(S.BACK);
    },
    state() {
      init();
      return ctx.state;
    },
    // full intro score; times are seconds of the 26 s story (condensed: 4 s)
    loadIntro() {
      init();
      if (S._ip) return S._ip;
      S._ip = fetch(INTRO_MP3).then((r) => {
        if (!r.ok) throw 0;
        return r.arrayBuffer();
      }).then((a) => new Promise((res, rej) => ctx.decodeAudioData(a, res, rej))).then((b) => S._ib = b, () => null);
      return S._ip;
    },
    introSeq(short, from, el) {
      init();
      if (ctx.state !== "running") return;
      from = from || 0;
      const bus = ctx.createGain();
      bus.gain.value = 1;
      bus.connect(master);
      S._bus = bus;
      const play = () => {
        const off = el ? el() : from;
        if (!S._ib || off >= S._ib.duration - 0.05) return;
        const src = ctx.createBufferSource();
        src.buffer = S._ib;
        src.connect(bus);
        src.start(ctx.currentTime + 0.01, Math.max(0, off + 0.01));
      };
      if (S._ib) play();
      else S.loadIntro().then((b) => {
        if (b && S._bus === bus) play();
      });
    },
    introStop() {
      if (!S._bus) return;
      const b = S._bus;
      S._bus = null;
      b.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    },
    zoom(out) {
      if (!started) return;
      const t = ctx.currentTime, n = ctx.createBufferSource(), b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.7), ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      n.buffer = b;
      const f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = "bandpass";
      f.Q.value = 1.4;
      f.frequency.setValueAtTime(out ? 2600 : 500, t);
      f.frequency.exponentialRampToValueAtTime(out ? 320 : 2600, t + 0.5);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(out ? 0.12 : 0.16, t + (out ? 0.08 : 0.38));
      g.gain.linearRampToValueAtTime(0, t + 0.6);
      n.connect(f);
      f.connect(g);
      g.connect(master);
      n.start(t);
      n.stop(t + 0.7);
      tone(out ? 48 : 62, t, 0.5, "sine", 0.22, out ? 36 : 55);
      if (!out) [659.3, 987.8, 1318.5].forEach((fq, i) => {
        const s0 = t + 0.4 + i * 0.02, c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), v = ctx.createGain();
        c.frequency.value = fq;
        m.frequency.value = fq * 1.41;
        mg.gain.setValueAtTime(fq * 2, s0);
        mg.gain.exponentialRampToValueAtTime(fq * 0.05, s0 + 0.8);
        m.connect(mg);
        mg.connect(c.frequency);
        v.gain.setValueAtTime(0, s0);
        v.gain.linearRampToValueAtTime(0.045, s0 + 5e-3);
        v.gain.exponentialRampToValueAtTime(1e-4, s0 + 1.4);
        c.connect(v);
        v.connect(master);
        c.start(s0);
        m.start(s0);
        c.stop(s0 + 1.5);
        m.stop(s0 + 1.5);
      });
    }
  };
  return S;
})();
