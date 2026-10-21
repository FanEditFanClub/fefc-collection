(function() {
  var from = null, RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function tileEl() {
    return document.querySelector('[data-hub="readfirst"]');
  }
  document.addEventListener("click", function(e) {
    var t = e.target.closest && e.target.closest('[data-hub="readfirst"]');
    from = t ? t.getBoundingClientRect() : null;
  }, true);
  function sfx(out) {
    try {
      if (window.SFX && SFX.zoom) {
        SFX.zoom(!!out);
        return;
      }
    } catch (_) {
    }
    try {
      var C = window._rfx || (window._rfx = new (window.AudioContext || window.webkitAudioContext)());
      if (C.state === "suspended") C.resume();
      if (localStorage.fefcMute === "1") return;
      var t = C.currentTime, n = C.createBufferSource(), b = C.createBuffer(1, C.sampleRate * 0.7, C.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / d.length);
      n.buffer = b;
      var f = C.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 1.2;
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(3200, t + 0.55);
      var g = C.createGain();
      g.gain.value = 0.18;
      n.connect(f);
      f.connect(g);
      g.connect(C.destination);
      n.start(t);
      [[1046.5, 0.5], [1568, 0.62], [2093, 0.74]].forEach(function(p) {
        var o = C.createOscillator(), m = C.createOscillator(), mg = C.createGain(), v = C.createGain();
        o.frequency.value = p[0];
        m.frequency.value = p[0] * 3.5;
        mg.gain.value = p[0] * 0.6;
        m.connect(mg);
        mg.connect(o.frequency);
        v.gain.setValueAtTime(0, t + p[1]);
        v.gain.linearRampToValueAtTime(0.07, t + p[1] + 0.01);
        v.gain.exponentialRampToValueAtTime(1e-4, t + p[1] + 1.1);
        o.connect(v);
        v.connect(C.destination);
        o.start(t + p[1]);
        m.start(t + p[1]);
        o.stop(t + p[1] + 1.2);
        m.stop(t + p[1] + 1.2);
      });
    } catch (_) {
    }
  }
  function box() {
    var z = document.getElementById("rfzoom");
    if (!z) {
      z = document.createElement("div");
      z.id = "rfzoom";
      z.innerHTML = "<span>Read First</span><i></i>";
      document.getElementById("rfpanel").appendChild(z);
    }
    return z;
  }
  function map(z, r) {
    var p = z.getBoundingClientRect();
    z.style.transform = "translate(" + (r.left + r.width / 2 - (p.left + p.width / 2)) + "px," + (r.top + r.height / 2 - (p.top + p.height / 2)) + "px) scale(" + r.width / p.width + "," + r.height / p.height + ") perspective(800px) rotateX(11deg)";
  }
  window.RFX = {
    open: function(p) {
      var r = from;
      from = null;
      p.classList.remove("zoom", "closing");
      if (!r || RM) {
        p.classList.add("fade");
        void p.offsetWidth;
        p.classList.add("open");
        return;
      }
      sfx();
      var z = box();
      p.classList.add("zoom");
      z.style.transition = "none";
      z.style.opacity = 1;
      map(z, r);
      void z.offsetWidth;
      z.style.transition = "transform .55s cubic-bezier(.55,0,.2,1)";
      z.style.transform = "none";
      p.classList.add("open");
      setTimeout(function() {
        p.classList.add("flash");
      }, 430);
      setTimeout(function() {
        p.classList.add("docin");
        z.style.transition = "opacity .3s";
        z.style.opacity = 0;
      }, 560);
      setTimeout(function() {
        p.classList.remove("flash");
      }, 900);
    },
    close: function(p, done) {
      var t = tileEl(), r = t && t.getBoundingClientRect(), z = document.getElementById("rfzoom");
      if (!r || !r.width || RM || !p.classList.contains("zoom")) {
        p.classList.remove("open", "docin");
        setTimeout(done, 250);
        return;
      }
      sfx(1);
      p.classList.remove("docin");
      z.style.transition = "opacity .2s";
      z.style.opacity = 1;
      setTimeout(function() {
        z.style.transition = "transform .45s cubic-bezier(.4,0,.6,1),opacity .45s";
        map(z, r);
        z.style.opacity = 0.2;
        p.classList.remove("open");
      }, 200);
      setTimeout(function() {
        p.classList.remove("zoom", "fade");
        done();
      }, 680);
    }
  };
})();
