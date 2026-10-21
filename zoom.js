(function() {
  var RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var tv = function() {
    return document.body.classList.contains("tv");
  };
  var SEL = "[data-hub],.ol-tile,.mc,.tb-btn,[data-act]";
  var pending = null, stack = {}, depth = 0;
  document.addEventListener("click", function(e) {
    var t = e.target.closest && e.target.closest(SEL);
    if (!t) return;
    var r = t.getBoundingClientRect();
    if (r.width > 40 && r.height > 30) pending = { l: r.left, t: r.top, w: r.width, h: r.height, id: t.dataset.id || t.dataset.hub || "" };
  }, true);
  function view() {
    var ids = ["player", "details", "main", "home"];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el && !el.hidden && el.offsetWidth) return el;
    }
    return null;
  }
  var fl;
  function flash(a) {
    if (!fl) {
      fl = document.createElement("div");
      fl.id = "zflash";
      document.body.appendChild(fl);
    }
    fl.style.transition = "none";
    fl.style.opacity = a;
    void fl.offsetWidth;
    fl.style.transition = "opacity .42s ease-out";
    fl.style.opacity = 0;
  }
  var gh;
  function ghost() {
    if (!gh) {
      gh = document.createElement("div");
      gh.id = "zghost";
      document.body.appendChild(gh);
    }
    return gh;
  }
  function sfx(out) {
    try {
      window.SFX && SFX.zoom(out);
    } catch (e) {
    }
  }
  function zin(r) {
    var v = view();
    if (!v) return;
    sfx(false);
    if (RM) {
      flash(0.25);
      return;
    }
    var W = innerWidth, H = innerHeight, sx = r.w / W, sy = r.h / H, dx = r.l + r.w / 2 - W / 2, dy = r.t + r.h / 2 - H / 2, d = tv() ? 450 : 600;
    v.style.transition = "none";
    v.style.transformOrigin = "50% 50%";
    v.style.transform = "translate(" + dx + "px," + dy + "px) scale(" + sx + "," + sy + ")";
    v.style.opacity = 0.3;
    void v.offsetWidth;
    v.style.transition = "transform " + d + "ms cubic-bezier(.55,0,.15,1),opacity " + (d * 0.6 | 0) + "ms";
    v.style.transform = "none";
    v.style.opacity = 1;
    setTimeout(function() {
      flash(tv() ? 0.35 : 0.6);
    }, d * 0.72);
    setTimeout(function() {
      v.style.transition = "";
      v.style.transform = "";
      v.style.opacity = "";
    }, d + 30);
  }
  function zout(r) {
    var v = view();
    if (!v) return;
    sfx(true);
    if (RM) return;
    var d = tv() ? 450 : 560;
    v.style.transition = "none";
    v.style.transform = "scale(1.12)";
    v.style.opacity = 0;
    void v.offsetWidth;
    v.style.transition = "transform " + d + "ms cubic-bezier(.3,0,.2,1),opacity " + (d * 0.7 | 0) + "ms";
    v.style.transform = "none";
    v.style.opacity = 1;
    setTimeout(function() {
      v.style.transition = "";
      v.style.transform = "";
      v.style.opacity = "";
    }, d + 30);
    if (r && !tv()) {
      var g = ghost(), W = innerWidth, H = innerHeight;
      g.style.transition = "none";
      g.style.opacity = 0.9;
      g.style.transform = "none";
      void g.offsetWidth;
      g.style.transition = "transform " + d + "ms cubic-bezier(.3,0,.2,1),opacity " + d + "ms";
      g.style.transform = "translate(" + (r.l + r.w / 2 - W / 2) + "px," + (r.t + r.h / 2 - H / 2) + "px) scale(" + r.w / W + "," + r.h / H + ")";
      g.style.opacity = 0;
    }
  }
  function onIn() {
    var h = location.hash, r = pending;
    pending = null;
    if (/readfirst/.test(h)) return;
    depth++;
    if (r) {
      stack[h] = r;
      requestAnimationFrame(function() {
        zin(r);
      });
    } else requestAnimationFrame(function() {
      zin({ l: innerWidth * 0.3, t: innerHeight * 0.3, w: innerWidth * 0.4, h: innerHeight * 0.4 });
    });
  }
  var last = location.hash;
  var ps = history.pushState;
  history.pushState = function() {
    var o = location.hash, res = ps.apply(this, arguments);
    if (location.hash !== o) {
      stack.__from = o;
      last = location.hash;
      setTimeout(onIn, 0);
    }
    return res;
  };
  addEventListener("popstate", function() {
    var from = last;
    last = location.hash;
    if (/readfirst/.test(from + last)) return;
    pending = null;
    var r = stack[from];
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        var t = null;
        if (r && r.id) {
          var el = document.querySelector('[data-id="' + r.id + '"],[data-hub="' + r.id + '"]');
          if (el) {
            var b = el.getBoundingClientRect();
            if (b.width && b.bottom > 0 && b.top < innerHeight) t = { l: b.left, t: b.top, w: b.width, h: b.height };
          }
        }
        zout(t);
      });
    });
  });
})();
