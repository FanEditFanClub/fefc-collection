(function() {
  var $ = function(s) {
    return document.querySelector(s);
  }, N = function() {
    return window.FEFCNative;
  };
  var tap, nat, note, noteT;
  function id() {
    var p = $("#player");
    return p && p.dataset.pid;
  }
  function driveId() {
    var pl = $("#player");
    if (pl && pl.dataset.did) return pl.dataset.did;
    var f = $("#pframe"), m = f && (f.getAttribute("src") || "").match(/\/file\/d\/([\w-]+)/);
    return m && m[1];
  }
  function toast(t) {
    if (!note) {
      note = document.createElement("div");
      note.id = "ptapnote";
      $("#player").appendChild(note);
    }
    note.textContent = t;
    note.classList.add("on");
    clearTimeout(noteT);
    noteT = setTimeout(function() {
      note.classList.remove("on");
    }, 4200);
  }
  function doTap() {
    var v = $("#pvideo");
    if (v) {
      if (v.paused) v.play();
      else v.pause();
      return;
    }
    var n = N();
    if (n && n.tap) {
      var f = $("#pframe"), r = f.getBoundingClientRect();
      try {
        n.tap(r.left + r.width / 2, r.top + r.height / 2, innerWidth, innerHeight);
      } catch (e) {
      }
      setTimeout(function() {
        if (tap && !$("#player").hidden) tap.focus({ preventScroll: true });
      }, 180);
      return;
    }
    var fr = $("#pframe");
    try {
      fr.focus({ preventScroll: true });
    } catch (e) {
    }
    toast("Update the Fire TV app (v1.0.3) for one-press Play, or press Back and use OPEN IN DRIVE");
  }
  function native() {
    var n = N(), d = driveId();
    if (n && n.playVideo && d) {
      try {
        n.playVideo(d, ($("#ptitle") || {}).textContent || "");
      } catch (e) {
      }
    }
  }
  function build() {
    if (tap) return;
    var pw = $("#player .pwrap"), top = $("#player .ptop");
    if (!pw || !top) return;
    tap = document.createElement("div");
    tap.id = "ptap";
    tap.tabIndex = 0;
    tap.setAttribute("role", "button");
    tap.setAttribute("aria-label", "Play or pause the video");
    tap.innerHTML = "<span>OK = Play / Pause</span>";
    pw.appendChild(tap);
    nat = document.createElement("button");
    nat.id = "pnative";
    nat.type = "button";
    nat.className = "pill p3";
    nat.textContent = "\u25B6 TV PLAYER";
    nat.title = "Play in the full-screen TV player";
    top.insertBefore(nat, $("#popen"));
    nat.onclick = native;
    tap.addEventListener("click", doTap);
  }
  function sync() {
    build();
    if (!tap) return;
    var open = !$("#player").hidden, n = N();
    nat.hidden = !(n && n.playVideo);
    if (open && document.body.classList.contains("tv")) setTimeout(function() {
      if (!$("#player").hidden && tap && !(document.activeElement && document.activeElement.closest && document.activeElement.closest("#player .ptop"))) tap.focus({ preventScroll: true });
    }, 60);
  }
  addEventListener("keydown", function(e) {
    var k = e.keyCode, pl = $("#player");
    if (!pl || pl.hidden) return;
    var a = document.activeElement;
    var ok = k === 23 || k === 13 || e.key === "Enter" || e.key === "Select" || e.key === "Center";
    if (ok && a && a.id === "ptap") {
      e.preventDefault();
      e.stopImmediatePropagation();
      doTap();
      return;
    }
    if (a && a.id === "ptap" && $("#pvideo") && (k === 37 || k === 39 || k === 21 || k === 22 || k === 89 || k === 90 || k === 272 || k === 273)) {
      var v = $("#pvideo");
      e.preventDefault();
      e.stopImmediatePropagation();
      v.currentTime = Math.max(0, v.currentTime + (k === 37 || k === 21 || k === 89 || k === 272 ? -10 : 10));
      return;
    }
    if ((k === 179 || k === 85 || e.key === "MediaPlayPause") && !(a && a.closest && a.closest(".ptop"))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      doTap();
      return;
    }
    if (k === 23 && a && a !== document.body && a.matches && a.matches("button,a[href],[data-act],[data-nav]")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      a.click();
    }
  }, true);
  function init() {
    var p = $("#player");
    if (!p) return;
    new MutationObserver(sync).observe(p, { attributes: true, attributeFilter: ["hidden"] });
    sync();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
