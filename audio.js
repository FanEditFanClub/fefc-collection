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
