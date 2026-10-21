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
  function ambStart() {
    if (!ctx || amb) return;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 3);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    lp.connect(g);
    g.connect(master);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.07;
    lg.gain.value = 400;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    lfo.start();
    const os = [55, 82.4, 110, 164.8, 220.5].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? "triangle" : "sawtooth";
      o.frequency.value = f;
      o.detune.value = (i - 2) * 6;
      const v = ctx.createGain();
      v.gain.value = i > 2 ? 0.25 : 0.5;
      o.connect(v);
      v.connect(lp);
      o.start();
      return o;
    });
    amb = { g, os: [...os, lfo] };
  }
  function ambStop() {
    if (!amb) return;
    const a = amb;
    amb = null;
    a.g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
    setTimeout(() => a.os.forEach((o) => o.stop()), 700);
  }
  const S = {
    unlock() {
      init();
      if (ctx.state === "suspended") ctx.resume();
      started = true;
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
      if (!started) return;
      on ? ambStart() : ambStop();
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
    state() {
      init();
      return ctx.state;
    },
    // full intro score; times are seconds of the 26 s story (condensed: 4 s)
    loadIntro() {
      init();
      if (S._ip) return S._ip;
      S._ip = fetch("assets/intro.mp3").then((r) => {
        if (!r.ok) throw 0;
        return r.arrayBuffer();
      }).then((a) => new Promise((res, rej) => ctx.decodeAudioData(a, res, rej))).then((b) => S._ib = b, () => null);
      return S._ip;
    },
    introSeq(short, from, el) {
      init();
      if (ctx.state !== "running") return;
      from = from || 0;
      const t0 = ctx.currentTime + 0.05 - from, now0 = ctx.currentTime, bus = ctx.createGain();
      bus.gain.value = 1;
      bus.connect(master);
      S._bus = bus;
      if (!short) {
        const play = () => {
          const off = el ? el() : from;
          if (off >= S._ib.duration - 0.05) return;
          const src = ctx.createBufferSource();
          src.buffer = S._ib;
          src.connect(bus);
          src.start(ctx.currentTime + 0.01, Math.max(0, off + 0.01));
        };
        if (S._ib) play();
        else S.loadIntro().then((b) => {
          if (b && S._bus === bus) play();
        });
        return;
      }
      const noise = (d) => {
        const n = ctx.createBufferSource(), b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * d), ctx.sampleRate), x = b.getChannelData(0);
        for (let i = 0; i < x.length; i++) x[i] = Math.random() * 2 - 1;
        n.buffer = b;
        return n;
      };
      const env = (g, a, b, pk, at = 0.3, rl = 0.3) => {
        g.gain.setValueAtTime(0, a);
        g.gain.linearRampToValueAtTime(pk, a + Math.min(at, (b - a) / 2));
        g.gain.setValueAtTime(pk, Math.max(a + Math.min(at, (b - a) / 2), b - rl));
        g.gain.linearRampToValueAtTime(0, b);
      };
      const osc = (type, f, a, b, pk, f2, dst) => {
        if (b <= now0 + 0.05) return { detune: {} };
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f, a);
        if (f2) o.frequency.exponentialRampToValueAtTime(f2, b);
        env(g, a, b, pk);
        o.connect(g);
        g.connect(dst || bus);
        o.start(a);
        o.stop(b + 0.05);
        return o;
      };
      const nz = (a, b, pk, type, f1, f2, q) => {
        if (b <= now0 + 0.05) return;
        a = Math.max(a, now0);
        const n = noise(b - a + 0.1), fl = ctx.createBiquadFilter(), g = ctx.createGain();
        fl.type = type;
        fl.Q.value = q || 1;
        fl.frequency.setValueAtTime(f1, a);
        fl.frequency.exponentialRampToValueAtTime(f2, b);
        env(g, a, b, pk, (b - a) * 0.6, (b - a) * 0.35);
        n.connect(fl);
        fl.connect(g);
        g.connect(bus);
        n.start(a);
        n.stop(b + 0.1);
      };
      const bell = (a) => {
        a = Math.max(a, now0 + 0.05);
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain(), s = a + i * 0.03;
          c.frequency.value = f;
          m.frequency.value = f * 1.4;
          mg.gain.setValueAtTime(f * 2.2, s);
          mg.gain.exponentialRampToValueAtTime(f * 0.05, s + 3);
          m.connect(mg);
          mg.connect(c.frequency);
          g.gain.setValueAtTime(0, s);
          g.gain.linearRampToValueAtTime(0.09, s + 0.01);
          g.gain.exponentialRampToValueAtTime(1e-4, s + 4.5);
          c.connect(g);
          g.connect(master);
          c.start(s);
          m.start(s);
          c.stop(s + 4.6);
          m.stop(s + 4.6);
        });
      };
      const T = (x) => t0 + x;
      if (!short) {
        osc("sine", 32, T(0), T(2), 0.35, 58);
        osc("sine", 64, T(0.4), T(2), 0.08, 90);
        nz(T(2), T(5), 0.16, "bandpass", 4e3, 260, 1.2);
        osc("sine", 60, T(5.05), T(11), 0.025);
        osc("sine", 120, T(5.05), T(11), 0.01);
        [440, 554.4, 659.3, 880].forEach((f, i) => {
          const o = osc("triangle", f, T(8), T(11.2), 0.025);
          o.detune.value = (i - 1.5) * 9;
        });
        nz(T(8), T(11.2), 0.03, "highpass", 6e3, 9e3);
        nz(T(10.9), T(12), 0.2, "highpass", 300, 9e3, 0.7);
        nz(T(12), T(21.2), 0.07, "lowpass", 380, 520, 0.8);
        nz(T(12.5), T(21), 0.03, "bandpass", 900, 600, 3);
        osc("sine", 1800, T(21), T(24), 0.06, 180);
        for (let i = 0; i < 14; i++) osc("square", 2400 + i * 733 % 1600, T(21.2 + i * 0.19), T(21.2 + i * 0.19 + 0.025), 0.03);
        bell(T(24.05));
      } else {
        nz(T(0), T(0.9), 0.14, "bandpass", 4e3, 300, 1.2);
        nz(T(0.8), T(1.5), 0.16, "highpass", 300, 9e3, 0.7);
        nz(T(1.5), T(2.7), 0.05, "lowpass", 380, 520, 0.8);
        osc("sine", 1800, T(2.6), T(4), 0.05, 200);
        for (let i = 0; i < 6; i++) osc("square", 2600 + i * 170, T(2.7 + i * 0.2), T(2.725 + i * 0.2), 0.03);
        bell(T(4));
      }
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
    },
    bell() {
      init();
      if (ctx.state !== "running") return;
      const s = ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((f, i) => tone(f, s + i * 0.03, 2.5, "sine", 0.07));
    },
    intro(short) {
      if (!started) return;
      const t = ctx.currentTime;
      const n = ctx.createBufferSource(), b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      n.buffer = b;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 2;
      bp.frequency.setValueAtTime(200, t);
      bp.frequency.exponentialRampToValueAtTime(5e3, t + (short ? 0.6 : 1.6));
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(0.12, t + (short ? 0.4 : 1.2));
      ng.gain.linearRampToValueAtTime(0, t + (short ? 0.8 : 1.9));
      n.connect(bp);
      bp.connect(ng);
      ng.connect(master);
      n.start(t);
      n.stop(t + 2);
      const r = t + (short ? 0.6 : 1.7);
      [220, 277.2, 329.6, 440].forEach((f, i) => tone(f, t + 0.2, short ? 1 : 2.2, "triangle", 0.05));
      [880, 1318.5, 1760].forEach((f, i) => tone(f, r + i * 0.07, 1.4, "sine", 0.09));
    }
  };
  return S;
})();
