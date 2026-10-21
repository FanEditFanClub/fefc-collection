window.FEFCIntro = /* @__PURE__ */ (() => {
  const cl = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x, sm = (a, b, x) => {
    x = cl((x - a) / (b - a));
    return x * x * (3 - 2 * x);
  }, lerp = (a, b, t) => a + (b - a) * t, eo = (t) => 1 - Math.pow(1 - cl(t), 3);
  const SEG = [[0, 0.9, 2, 5], [0.9, 1.5, 10.2, 12.2], [1.5, 2.6, 13, 20], [2.6, 4, 21, 24.2]];
  const mapC = (r) => {
    for (const s of SEG) if (r <= s[1]) return lerp(s[2], s[3], (r - s[0]) / (s[1] - s[0]));
    return 24.2;
  };
  function create(opt) {
    const tv = opt.tv, cv = document.createElement("canvas"), c = cv.getContext("2d"), dpr = Math.min(window.devicePixelRatio || 1, tv ? 1 : 1.5);
    let W = 0, H = 0;
    const size = () => {
      W = innerWidth;
      H = innerHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      cv.style.width = W + "px";
      cv.style.height = H + "px";
    };
    size();
    addEventListener("resize", size);
    const buf = document.createElement("canvas"), bc = buf.getContext("2d");
    const logo = new Image();
    logo.src = "assets/fefc-logo.png";
    let tint = null;
    logo.onload = () => {
      const t = document.createElement("canvas");
      t.width = t.height = 512;
      const x = t.getContext("2d");
      x.drawImage(logo, 0, 0, 512, 512);
      x.globalCompositeOperation = "source-in";
      const g = x.createLinearGradient(0, 0, 512, 512);
      g.addColorStop(0, "#ffb347");
      g.addColorStop(0.45, "#ff8a1a");
      g.addColorStop(1, "#c24d00");
      x.fillStyle = g;
      x.fillRect(0, 0, 512, 512);
      tint = t;
    };
    let seed = 7;
    const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    const stars = [];
    for (let i = 0; i < (tv ? 160 : 420); i++) stars.push([rnd(), rnd(), rnd()]);
    const imgs = [];
    const setTiles = (ids) => {
      imgs.length = 0;
      (ids || []).slice(0, tv ? 16 : 48).forEach((id) => {
        const im = new Image();
        im.referrerPolicy = "no-referrer";
        im.onload = () => {
          im.ok = 1;
        };
        im.src = "https://drive.google.com/thumbnail?sz=w160&id=" + id;
        imgs.push(im);
      });
    };
    const hues = [];
    for (let i = 0; i < 64; i++) hues.push("hsl(".concat(rnd() * 360 | 0, ",").concat(20 + rnd() * 30 | 0, "%,").concat(18 + rnd() * 28 | 0, "%)"));
    const tile = (i, x, y, w, h) => {
      const im = imgs.length ? imgs[(i % imgs.length + imgs.length) % imgs.length] : null;
      if (im && im.ok) c.drawImage(im, x, y, w, h);
      else {
        c.fillStyle = hues[(i % 64 + 64) % 64];
        c.fillRect(x, y, w, h);
      }
    };
    const hash = (a, b) => {
      let h = a * 374761393 + b * 668265263;
      h = (h ^ h >> 13) * 1274126177;
      return (h ^ h >> 16) & 2147483647;
    };
    function sky(a) {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#000");
      g.addColorStop(1, "#141a24");
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      c.fillStyle = "#fff";
      for (const s of stars) {
        c.globalAlpha = a * (0.25 + 0.75 * s[2]);
        const r = s[2] > 0.9 ? 1.6 : 0.9;
        c.fillRect(s[0] * W, s[1] * H, r, r);
      }
      c.globalAlpha = 1;
    }
    function drawLogo(s, a, sc, rot, dx, dy, tinted) {
      if (!logo.complete) return;
      const L = H * 0.46 * sc;
      c.save();
      c.globalAlpha = a;
      c.translate(W / 2 + dx, H / 2 + dy);
      c.rotate(rot);
      if (!tv) {
        c.shadowColor = "rgba(255,140,30,.55)";
        c.shadowBlur = 40 * sc;
      }
      c.drawImage(tinted && tint ? tint : logo, -L / 2, -L / 2, L, L);
      c.restore();
    }
    function ribbon(s) {
      const p = s / 2, z = s < 2 ? 1 : lerp(1, 0.18, eo((s - 2) / 1.6)), fade = sm(0, 0.5, s) * (1 - sm(2.5, 3.3, s));
      if (fade <= 0) return;
      c.save();
      c.translate(W / 2, H / 2);
      c.scale(z, z);
      c.rotate(s < 2 ? 0 : -(s - 2) * 0.5);
      c.globalCompositeOperation = "lighter";
      for (let k = 0; k < 2; k++) {
        const cx = lerp(W * 1.1, -W * 0.35, cl(p)) + k * W * 0.25 - W / 2, cy = k ? H * 0.55 : -H * 0.2, R = H * (k ? 1.1 : 0.85);
        const g = c.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
        g.addColorStop(0, "#3a1500");
        g.addColorStop(0.5, "#ff8c1a");
        g.addColorStop(0.7, "#ffc070");
        g.addColorStop(1, "#401800");
        c.strokeStyle = g;
        c.lineWidth = H * (k ? 0.34 : 0.48);
        if (!tv && "filter" in c) c.filter = "blur(" + Math.round(H * 0.018) + "px)";
        c.globalAlpha = fade * (k ? 0.55 : 0.9);
        if (!tv) {
          c.shadowColor = "#ff7a00";
          c.shadowBlur = 70;
        }
        c.beginPath();
        c.arc(cx, cy, R, Math.PI * (0.9 + k * 0.3 + p * 0.25), Math.PI * (1.7 + k * 0.3 + p * 0.25));
        c.stroke();
      }
      c.filter = "none";
      c.restore();
    }
    function sheen(s) {
      const t = (s - 3.8) / 1;
      if (t < 0 || t > 1 || !logo.complete) return;
      const L = H * 0.46;
      c.save();
      c.beginPath();
      c.rect(W / 2 - L / 2, H / 2 - L / 2, L, L);
      c.clip();
      c.globalCompositeOperation = "lighter";
      const x = W / 2 - L + t * 2 * L, g = c.createLinearGradient(x - L * 0.15, 0, x + L * 0.15, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, "rgba(255,240,210,.55)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.globalCompositeOperation = "source-atop";
      c.restore();
      buf.width = L | 0;
      buf.height = L | 0;
      bc.clearRect(0, 0, L, L);
      bc.drawImage(logo, 0, 0, L, L);
      bc.globalCompositeOperation = "source-in";
      const g2 = bc.createLinearGradient(t * 2 * L - L * 0.65, 0, t * 2 * L - L * 0.35, 0);
      g2.addColorStop(0, "rgba(255,255,255,0)");
      g2.addColorStop(0.5, "rgba(255,245,220,.9)");
      g2.addColorStop(1, "rgba(255,255,255,0)");
      bc.fillStyle = g2;
      bc.fillRect(0, 0, L, L);
      bc.globalCompositeOperation = "source-over";
      c.save();
      c.globalCompositeOperation = "lighter";
      c.drawImage(buf, W / 2 - L / 2, H / 2 - L / 2);
      c.restore();
    }
    const AT = tv ? 32 : 64, AN = 16, atlas = document.createElement("canvas");
    atlas.width = atlas.height = AT * AN;
    const ax = atlas.getContext("2d");
    let pat = null, dirty = 1, lastB = 0;
    function buildAtlas() {
      ax.fillStyle = "#0c0e12";
      ax.fillRect(0, 0, AT * AN, AT * AN);
      const gp = Math.max(2, AT * 0.09);
      for (let j = 0; j < AN; j++) for (let i = 0; i < AN; i++) {
        const k = hash(i, j), im = imgs.length ? imgs[k % imgs.length] : null, x = i * AT + gp / 2, y = j * AT + gp / 2, w = AT - gp;
        if (im && im.ok) ax.drawImage(im, x, y, w, w * 0.82), ax.fillStyle = "rgba(0,0,0,.15)", ax.fillRect(x, y + w * 0.82, w, w * 0.18);
        else {
          ax.fillStyle = hues[k % 64];
          ax.fillRect(x, y, w, w * 0.82);
        }
      }
      pat = c.createPattern(atlas, "repeat");
      dirty = 0;
    }
    const ensure = () => {
      const n = imgs.filter((i) => i.ok).length, now = Date.now();
      if (!pat || n !== lastB && now - (ensure.t || 0) > 400) {
        lastB = n;
        ensure.t = now;
        buildAtlas();
      }
    };
    const gcv = document.createElement("canvas"), gx = gcv.getContext("2d");
    function ground(hy, cam, camX) {
      ensure();
      if (gcv.width !== cv.width || gcv.height !== cv.height) {
        gcv.width = cv.width;
        gcv.height = cv.height;
      }
      const f = H * 0.9, h = 10, band = tv ? 4 : 2, P = gx.createPattern(atlas, "repeat");
      gx.setTransform(1, 0, 0, 1, 0, 0);
      gx.clearRect(0, 0, gcv.width, gcv.height);
      gx.fillStyle = P;
      for (let y = Math.max(Math.floor(hy) + 1, -H); y < H * 1.3; y += band) {
        const d = y - hy;
        if (d <= 0) continue;
        const z = f * h / d, k = f / (z * AT), ky = f * h / (z * z * AT), tx = W / 2 - camX * AT * k, ty = y - (z + cam) * AT * ky;
        gx.setTransform(k * dpr, 0, 0, ky * dpr, tx * dpr, ty * dpr);
        gx.fillRect(-tx / k, (y - ty) / ky, W / k, band / ky * 1.5);
      }
      gx.setTransform(1, 0, 0, 1, 0, 0);
    }
    function planet(s) {
      const u = cl((s - 12) / 9), hy0 = H * lerp(0.5, 0.2, eo(u)) - H * 1.2 * sm(21, 22.8, s), R = W * lerp(0.9, 9, u * u), rot = lerp(-0.3, 0, eo(cl((s - 12) / 7)));
      const D = Math.hypot(W, H), hy = hy0;
      sky(1);
      ground(H / 2 + (hy - H / 2) / 1.35, (s - 12) * 7, Math.sin(s * 0.3) * 3);
      c.save();
      c.translate(W / 2, H / 2);
      c.rotate(rot);
      c.translate(-W / 2, -H / 2);
      const cx = W / 2, cy = hy + R;
      c.beginPath();
      c.arc(cx, cy, R + H * 0.07, 0, Math.PI * 2);
      const ag = c.createRadialGradient(cx, cy, R, cx, cy, R + H * 0.07);
      ag.addColorStop(0, "rgba(120,190,255,.6)");
      ag.addColorStop(1, "rgba(40,90,200,0)");
      c.fillStyle = ag;
      c.fill();
      c.save();
      c.beginPath();
      c.arc(cx, cy, R, 0, Math.PI * 2);
      c.clip();
      c.fillStyle = "#7f8e9e";
      c.fillRect(-D, hy - 2, W + 2 * D, H + 2 * D);
      c.save();
      c.translate(W / 2, H / 2);
      c.scale(1.35, 1.35);
      c.translate(-W / 2, -H / 2);
      c.drawImage(gcv, 0, 0, W, H);
      c.restore();
      const fog = c.createLinearGradient(0, hy, 0, hy + H * 0.24);
      fog.addColorStop(0, "rgba(175,195,215,.95)");
      fog.addColorStop(0.35, "rgba(130,145,160,.45)");
      fog.addColorStop(1, "rgba(90,100,110,0)");
      c.fillStyle = fog;
      c.fillRect(-D, hy - 2, W + 2 * D, H * 0.24);
      c.restore();
      c.beginPath();
      c.arc(cx, cy, R, 0, Math.PI * 2);
      c.strokeStyle = "rgba(170,220,255,.95)";
      c.lineWidth = Math.max(2, H * 6e-3);
      if (!tv) {
        c.shadowColor = "#4aa8ff";
        c.shadowBlur = 30;
      }
      c.stroke();
      c.restore();
    }
    function topdown(s) {
      const a = sm(22.1, 22.9, s);
      if (a <= 0) return;
      ensure();
      const e = cl((s - 22.1) / 2), k = Math.exp(Math.log(48) * e * e * e), ts = H / 42 * k, sc = ts / AT, rot = lerp(0.35, 0, eo(e));
      c.save();
      c.globalAlpha = a;
      c.fillStyle = "#0a0c10";
      c.fillRect(0, 0, W, H);
      c.translate(W / 2, H / 2);
      c.rotate(rot);
      c.scale(sc, sc);
      c.translate(-AT / 2 - AT * AN * 4, -AT / 2 - AT * AN * 4);
      c.fillStyle = pat;
      const big = Math.hypot(W, H) / sc;
      c.fillRect(AT * AN * 4 - big, AT * AN * 4 - big, big * 2, big * 2);
      c.restore();
      c.save();
      c.globalAlpha = a;
      c.translate(W / 2, H / 2);
      c.rotate(rot);
      const g = ts * 0.09;
      c.fillStyle = "#ff8a1a";
      if (!tv) {
        c.shadowColor = "#ff8a1a";
        c.shadowBlur = 30;
      }
      c.fillRect(-ts / 2 - g * 0.3, -ts / 2 - g * 0.3, ts + g * 0.6, ts + g * 0.6);
      c.shadowBlur = 0;
      c.fillStyle = "#14171d";
      c.fillRect(-ts / 2 + g * 0.4, -ts / 2 + g * 0.4, ts - g * 0.8, ts - g * 0.8);
      if (logo.complete) c.drawImage(logo, -ts * 0.3, -ts * 0.34, ts * 0.6, ts * 0.6);
      c.restore();
      if (!tv && s > 22.6) {
        const b = sm(22.6, 23.6, s) * 0.3;
        buf.width = cv.width;
        buf.height = cv.height;
        bc.drawImage(cv, 0, 0);
        c.save();
        c.setTransform(1, 0, 0, 1, 0, 0);
        for (const q of [1.04, 1.09, 1.15]) {
          c.globalAlpha = b;
          const w = cv.width * q, h = cv.height * q;
          c.drawImage(buf, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
        }
        c.restore();
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }
    function frame(s) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = "source-over";
      c.shadowBlur = 0;
      c.fillStyle = "#000";
      c.fillRect(0, 0, W, H);
      if (s < 12.2) {
        ribbon(s);
        const la = sm(2.5, 3.6, s) * (1 - sm(8.2, 10, s) * 0.62), sc = s < 5 ? lerp(2.4, 1, eo((s - 2.4) / 2.2)) : 1, rot = s < 5 ? lerp(0.4, 0, eo((s - 2.4) / 2.4)) : 0, dy = -H * 0.09 * sm(5, 5.7, s) * (1 - sm(8, 9, s));
        const dive = s > 11 ? Math.exp((s - 11) * 4.2) : 1;
        if (s > 8.3) {
          const pr = H * lerp(0, 0.16, eo((s - 8.3) / 2.4)) * dive;
          c.save();
          c.beginPath();
          c.arc(W / 2, H / 2 + dy * 0.5, pr, 0, Math.PI * 2);
          c.clip();
          sky(sm(8.3, 9.5, s));
          const ly = H / 2 + pr * 0.55;
          c.beginPath();
          c.arc(W / 2, ly + pr * 3, pr * 3, 0, Math.PI * 2);
          c.fillStyle = "#2b3542";
          c.fill();
          c.strokeStyle = "rgba(150,210,255,.9)";
          c.lineWidth = Math.max(1.5, pr * 0.03);
          if (!tv) {
            c.shadowColor = "#4aa8ff";
            c.shadowBlur = 24;
          }
          c.stroke();
          c.restore();
        }
        if (la > 0) drawLogo(s, la * (s > 11 ? 1 - sm(11.3, 11.8, s) : 1), sc * dive, rot, 0, dy * dive, true);
        if (s > 3.7 && s < 5) sheen(s);
        const wa = sm(5.6, 6.6, s) * (1 - sm(8, 8.6, s));
        if (wa > 0) {
          c.save();
          c.globalAlpha = wa;
          c.fillStyle = "#f2f2f2";
          c.font = "600 ".concat(Math.round(H * 0.065), "px 'Source Sans 3',sans-serif");
          c.textAlign = "center";
          c.textBaseline = "middle";
          if (c.letterSpacing !== void 0) c.letterSpacing = Math.round(H * 6e-3) + "px";
          c.fillText("The Fan Edit Fan Club", W / 2, H / 2 + H * 0.24);
          c.restore();
        }
        if (s > 11.4) {
          const st = sm(11.4, 11.8, s) * (1 - sm(11.9, 12.2, s));
          c.save();
          c.globalCompositeOperation = "lighter";
          const g = c.createLinearGradient(0, 0, W, 0);
          g.addColorStop(0, "rgba(60,140,255,0)");
          g.addColorStop(0.5, "rgba(190,230,255,1)");
          g.addColorStop(1, "rgba(60,140,255,0)");
          c.fillStyle = g;
          c.globalAlpha = st;
          const hh = H * lerp(4e-3, 0.05, st);
          c.fillRect(0, H * 0.56 - hh / 2, W, hh);
          c.restore();
        }
      }
      if (s >= 11.95) planet(s);
      if (s > 22.1) topdown(s);
      const fl = s < 12.6 ? sm(11.7, 11.95, s) * (1 - sm(11.95, 12.6, s)) : 0;
      if (fl > 0) {
        c.globalAlpha = fl;
        c.fillStyle = "#fff";
        c.fillRect(0, 0, W, H);
        c.globalAlpha = 1;
      }
      const sn = sm(23.7, 24.05, s);
      if (sn > 0) {
        c.globalAlpha = sn * (1 - sm(24.05, 24.2, s));
        c.fillStyle = "#ffd9a8";
        c.fillRect(0, 0, W, H);
        c.globalAlpha = 1;
      }
      const tg = opt.tagline;
      if (tg) {
        const a = sm(17.4, 18.6, s);
        tg.style.visibility = "visible";
        tg.style.opacity = a;
        tg.style.clipPath = "inset(0 ".concat((100 - 100 * eo(cl((s - 17.4) / 1.4))).toFixed(1), "% 0 0)");
      }
    }
    return { canvas: cv, frame, mapC, setTiles };
  }
  return { create, mapC };
})();
