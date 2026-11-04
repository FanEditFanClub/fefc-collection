(function() {
  var $ = function(s) {
    return document.querySelector(s);
  }, N = function() {
    return window.FEFCNative;
  };
  var SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
  var tap, nat, chrome, big, menu, hideT, holdN = 0;
  function pl() {
    return $("#player");
  }
  function vid() {
    return $("#pvideo");
  }
  function open() {
    var p = pl();
    return p && !p.hidden;
  }
  function fmt(t) {
    t = Math.max(0, t | 0);
    var h = t / 3600 | 0, m = (t / 60 | 0) % 60, s = t % 60;
    return h ? h + ":" + ("0" + m).slice(-2) + ":" + ("0" + s).slice(-2) : m + ":" + ("0" + s).slice(-2);
  }
  function toast(t) {
    var n = $("#ptapnote");
    if (!n) {
      n = document.createElement("div");
      n.id = "ptapnote";
      pl().appendChild(n);
    }
    n.textContent = t;
    n.classList.add("on");
    clearTimeout(toast._t);
    toast._t = setTimeout(function() {
      n.classList.remove("on");
    }, 2200);
  }
  function show(ms) {
    if (!chrome) return;
    chrome.classList.add("on");
    big && big.classList.add("on");
    clearTimeout(hideT);
    hideT = setTimeout(hide, ms || 4e3);
  }
  function hide() {
    if (menu && !menu.hidden) return;
    if (chrome) chrome.classList.remove("on");
    if (big) big.classList.remove("on");
  }
  function shown() {
    return chrome && chrome.classList.contains("on");
  }
  function paint() {
    var v = vid();
    if (!v || !chrome) return;
    var d = v.duration || 0, p = v.currentTime || 0, left = Math.max(0, d - p);
    chrome.querySelector(".pc-title").textContent = ($("#ptitle") || {}).textContent || "";
    chrome.querySelector(".pc-el").textContent = fmt(p);
    chrome.querySelector(".pc-rem").textContent = "-" + fmt(left);
    var bar = chrome.querySelector(".pc-bar i");
    if (bar) bar.style.width = (d ? Math.min(100, p / d * 100) : 0) + "%";
    var b = chrome.querySelector(".pc-pp");
    if (b) b.textContent = v.paused ? "\u25B6" : "\u23F8";
    if (big) big.textContent = v.paused ? "\u25B6" : "\u23F8";
    var sp = SPEEDS.indexOf(v.playbackRate);
    chrome.querySelector('[data-pc="speed"]').textContent = "Speed " + (sp < 0 ? v.playbackRate : SPEEDS[sp]) + "\xD7";
  }
  function seekBy(sec) {
    var v = vid();
    if (!v || !isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration - 0.2, v.currentTime + sec));
    paint();
    show();
  }
  function toggle() {
    var v = vid();
    if (!v) return;
    if (v.paused) {
      var p = v.play();
      if (p && p.catch) p.catch(function() {
      });
    } else v.pause();
    paint();
    show();
  }
  function cycleSpeed() {
    var v = vid();
    if (!v) return;
    var i = SPEEDS.indexOf(v.playbackRate);
    i = i < 0 ? 2 : (i + 1) % SPEEDS.length;
    v.playbackRate = SPEEDS[i];
    try {
      localStorage.fefcRate = String(SPEEDS[i]);
    } catch (e) {
    }
    paint();
    show();
    toast("Speed " + SPEEDS[i] + "\xD7");
  }
  function cycleAudio() {
    var v = vid(), list = v && v.audioTracks;
    if (!list || !list.length) {
      toast("One audio track");
      return;
    }
    var i = 0;
    for (var x = 0; x < list.length; x++) if (list[x].enabled) i = x;
    var n = (i + 1) % list.length;
    for (x = 0; x < list.length; x++) list[x].enabled = x === n;
    toast("Audio " + (n + 1) + "/" + list.length);
    show();
  }
  function cycleSub() {
    var v = vid();
    if (!v || !v.textTracks) {
      toast("No subtitles");
      return;
    }
    var tracks = v.textTracks, i = -1, n = tracks.length;
    for (var x = 0; x < n; x++) if (tracks[x].mode === "showing") i = x;
    var next = i + 1;
    if (next >= n) {
      for (x = 0; x < n; x++) tracks[x].mode = "disabled";
      toast("Subtitles off");
    } else {
      for (x = 0; x < n; x++) tracks[x].mode = x === next ? "showing" : "disabled";
      toast(tracks[next].label || "Subtitles " + (next + 1));
    }
    show();
  }
  function openMenu() {
    if (!menu) return;
    var v = vid();
    var speeds = SPEEDS.map(function(s) {
      return '<button type="button" data-sp="' + s + '">' + s + "\xD7" + (v && v.playbackRate === s ? " \u25CF" : "") + "</button>";
    }).join("");
    var subs = '<button type="button" data-sub="off">Off</button>';
    if (v && v.textTracks) for (var i = 0; i < v.textTracks.length; i++) subs += '<button type="button" data-sub="' + i + '">' + (v.textTracks[i].label || "Track " + (i + 1)) + (v.textTracks[i].mode === "showing" ? " \u25CF" : "") + "</button>";
    var aud = "";
    if (v && v.audioTracks && v.audioTracks.length) {
      for (i = 0; i < v.audioTracks.length; i++) aud += '<button type="button" data-aud="' + i + '">' + (v.audioTracks[i].label || v.audioTracks[i].language || "Track " + (i + 1)) + (v.audioTracks[i].enabled ? " \u25CF" : "") + "</button>";
    } else aud = '<button type="button" disabled>One audio track</button>';
    menu.innerHTML = '<p>Player</p><div class="pcm-h">Speed</div>' + speeds + '<div class="pcm-h">Audio</div>' + aud + '<div class="pcm-h">Subtitles</div>' + subs + '<div class="pcm-h">Picture</div><button type="button" data-asp="contain">Fit</button><button type="button" data-asp="cover">Fill</button><button type="button" data-asp="ratio">16:9</button><button type="button" data-asp="fill">Stretch</button><button type="button" data-close="1">Close</button>';
    menu.hidden = false;
    show(2e4);
    var f = menu.querySelector("button:not([disabled])");
    if (f) try {
      f.focus();
    } catch (e) {
    }
  }
  function closeMenu() {
    if (menu) menu.hidden = true;
    show();
  }
  function onMenuClick(e) {
    var b = e.target.closest("button");
    if (!b || !menu.contains(b)) return;
    var v = vid();
    if (b.dataset.close) {
      closeMenu();
      return;
    }
    if (b.dataset.sp && v) {
      v.playbackRate = +b.dataset.sp;
      try {
        localStorage.fefcRate = b.dataset.sp;
      } catch (err) {
      }
    }
    if (b.dataset.aud && v && v.audioTracks) {
      var n = +b.dataset.aud;
      for (var i = 0; i < v.audioTracks.length; i++) v.audioTracks[i].enabled = i === n;
    }
    if (b.dataset.sub && v && v.textTracks) {
      if (b.dataset.sub === "off") {
        for (i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = "disabled";
      } else {
        n = +b.dataset.sub;
        for (i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = i === n ? "showing" : "disabled";
      }
    }
    if (b.dataset.asp && window.setPlayerScale) window.setPlayerScale(b.dataset.asp);
    closeMenu();
    paint();
  }
  function build() {
    var pw = $("#player .pwrap"), top = $("#player .ptop");
    if (!pw || !top || tap) return;
    tap = document.createElement("div");
    tap.id = "ptap";
    tap.tabIndex = 0;
    tap.setAttribute("role", "button");
    tap.setAttribute("aria-label", "Play or pause");
    pw.appendChild(tap);
    nat = document.createElement("button");
    nat.id = "pnative";
    nat.type = "button";
    nat.className = "pill p3";
    nat.textContent = "\u25B6 TV PLAYER";
    nat.title = "Play in the full-screen TV player";
    top.insertBefore(nat, $("#popen"));
    nat.onclick = function() {
      var n = N(), d = pl() && pl().dataset.did;
      if (!n || !d) return;
      var title = ($("#ptitle") || {}).textContent || "", file = pl().dataset.file || title || "video.mp4", subId = pl().dataset.sub, sub = subId ? "/api/stream/" + encodeURIComponent(subId) : "";
      try {
        if (n.playVideoWithFile) n.playVideoWithFile(d, title, file, sub);
        else if (n.playVideoWithOptions) n.playVideoWithOptions(d, title, "", sub);
        else n.playVideo(d, title);
      } catch (e) {
      }
    };
    big = document.createElement("button");
    big.id = "pbig";
    big.type = "button";
    big.className = "pbig";
    big.textContent = "\u25B6";
    big.setAttribute("aria-label", "Play or pause");
    pw.appendChild(big);
    big.onclick = function(e) {
      e.stopPropagation();
      toggle();
    };
    chrome = document.createElement("div");
    chrome.id = "pchrome";
    chrome.innerHTML = '<div class="pc-title"></div><div class="pc-seek" tabindex="0" role="slider" aria-label="Seek"><b class="pc-bar"><i></i></b></div><div class="pc-row"><span class="pc-el">0:00</span><button type="button" class="pc-pp" data-pc="pp">\u25B6</button><span class="pc-rem">-0:00</span></div><div class="pc-acts"><button type="button" data-pc="audio">Audio</button><button type="button" data-pc="sub">Subtitles</button><button type="button" data-pc="speed">Speed 1\xD7</button><button type="button" data-pc="aspect">Aspect</button><button type="button" data-pc="menu">Menu</button></div>';
    pw.appendChild(chrome);
    menu = document.createElement("div");
    menu.id = "pmenu";
    menu.hidden = true;
    pw.appendChild(menu);
    menu.addEventListener("click", onMenuClick);
    chrome.addEventListener("click", function(e) {
      var b = e.target.closest("[data-pc]");
      if (!b) return;
      e.stopPropagation();
      var k = b.dataset.pc;
      if (k === "pp") toggle();
      else if (k === "audio") cycleAudio();
      else if (k === "sub") cycleSub();
      else if (k === "speed") cycleSpeed();
      else if (k === "aspect") {
        if (window.setPlayerScale) window.setPlayerScale();
      } else if (k === "menu") openMenu();
      show();
    });
    var seek = chrome.querySelector(".pc-seek");
    seek.addEventListener("click", function(e) {
      var v = vid();
      if (!v || !v.duration) return;
      var r = seek.getBoundingClientRect();
      v.currentTime = Math.max(0, Math.min(v.duration - 0.2, (e.clientX - r.left) / r.width * v.duration));
      paint();
      show();
    });
    pw.addEventListener("mousemove", function() {
      if (open()) show();
    });
    pw.addEventListener("click", function(e) {
      if (e.target.id === "ptap" || e.target === pw || e.target.id === "pvideo") toggle();
    });
  }
  function sync() {
    build();
    if (!tap) return;
    var n = N();
    nat.hidden = !(n && n.playVideo);
    if (open()) {
      show();
      paint();
      var v = vid();
      if (v && !v._pc) {
        v._pc = 1;
        v.addEventListener("timeupdate", paint);
        v.addEventListener("play", paint);
        v.addEventListener("pause", paint);
        try {
          var r = +localStorage.fefcRate;
          if (r) v.playbackRate = r;
        } catch (e) {
        }
      }
      if (document.body.classList.contains("tv")) setTimeout(function() {
        if (open() && tap) try {
          tap.focus({ preventScroll: true });
        } catch (e) {
        }
      }, 80);
    }
  }
  function inPlayerUi(el) {
    return el && el.closest && el.closest("#pchrome,#pmenu,#player .ptop");
  }
  addEventListener("keydown", function(e) {
    if (!open()) return;
    var k = e.keyCode, a = document.activeElement, v = vid();
    var back = k === 10009 || k === 461 || k === 27 || k === 8 || e.key === "GoBack" || e.key === "BrowserBack";
    if (menu && !menu.hidden) {
      if (back) {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeMenu();
        return;
      }
      return;
    }
    if (back) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (shown()) {
        hide();
        if (tap) try {
          tap.focus();
        } catch (err) {
        }
      } else {
        var b = $("#back");
        if (b) b.click();
      }
      return;
    }
    if (inPlayerUi(a) && a.id !== "ptap" && a.id !== "pbig") {
      if (k === 38 || k === 40 || k === 37 || k === 39) show();
      return;
    }
    var left = k === 37 || k === 21 || k === 89 || k === 272, right = k === 39 || k === 22 || k === 90 || k === 273;
    if (left || right) {
      e.preventDefault();
      e.stopImmediatePropagation();
      holdN = e.repeat ? holdN + 1 : 0;
      var step = (holdN > 6 ? 60 : holdN > 2 ? 30 : 10) * (left ? -1 : 1);
      seekBy(step);
      return;
    }
    if (k === 38 || k === 40) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!shown()) {
        show();
        if (big) try {
          big.focus();
        } catch (err) {
        }
      } else if (k === 40) openMenu();
      else show();
      return;
    }
    var ok = k === 23 || k === 13 || k === 179 || k === 85 || e.key === "Enter" || e.key === "Select" || e.key === "MediaPlayPause";
    if (ok && !(a && a.closest && a.closest(".ptop button,.ptop a"))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      toggle();
    }
  }, true);
  function init() {
    var p = pl();
    if (!p) return;
    new MutationObserver(sync).observe(p, { attributes: true, attributeFilter: ["hidden"] });
    setInterval(function() {
      if (open() && shown()) paint();
    }, 500);
    sync();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
