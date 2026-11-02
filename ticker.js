(function() {
  var $ = function(s) {
    return document.querySelector(s);
  };
  var IC = { "discord": "M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z", "x": "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z", "facebook": "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z", "reddit": "M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z" };
  var NAME = { discord: "Discord", x: "X", facebook: "Facebook", reddit: "Reddit" };
  var CTA = [{ src: "discord", join: 1, title: "Join our Discord server", url: "https://discord.gg/d8A9xHTey7" }, { src: "x", join: 1, title: "Follow @FanEditFanClub on X", url: "https://x.com/FanEditFanClub" }, { src: "facebook", join: 1, title: "Join our Facebook Group", url: "https://www.facebook.com/groups/faneditfanclub" }, { src: "reddit", join: 1, title: "Join r/FanEditFanClub on Reddit", url: "https://www.reddit.com/r/FanEditFanClub" }];
  var esc = function(t) {
    return String(t).replace(/[&<>"]/g, function(c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };
  function icon(s) {
    return '<i class="tk-ic tk-' + s + '" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="' + IC[s] + '"/></svg></i>';
  }
  function ago(ts) {
    var d = (Date.now() - ts) / 6e4;
    if (d < 60) return Math.max(1, Math.round(d)) + "m";
    if (d < 1440) return Math.round(d / 60) + "h";
    if (d < 43200) return Math.round(d / 1440) + "d";
    return Math.round(d / 43200) + "mo";
  }
  function merge(posts) {
    var c = CTA.slice(), out = [];
    posts.forEach(function(p, i) {
      out.push(p);
      if ((i + 1) % 3 === 0 && c.length) out.push(c.shift());
    });
    return out.concat(c);
  }
  function get(u, ms) {
    return new Promise(function(res, rej) {
      var x = new XMLHttpRequest();
      x.open("GET", u);
      x.timeout = ms;
      x.onload = function() {
        try {
          x.status < 300 ? res(JSON.parse(x.responseText)) : rej();
        } catch (e) {
          rej();
        }
      };
      x.onerror = x.ontimeout = function() {
        rej();
      };
      x.send();
    });
  }
  function load() {
    return get("/api/feed", 8e3).then(function(j) {
      if (!j || !j.items || !j.items.length) throw 0;
      return j.items;
    }).catch(function() {
      return get("data/community-feed.json", 8e3).then(function(j) {
        var p = (j.posts || []).filter(function(x) {
          return x.ts && Date.now() - x.ts < 180 * 864e5;
        }).sort(function(a, b) {
          return b.ts - a.ts;
        }).slice(0, 12);
        return merge(p);
      }).catch(function() {
        return CTA;
      });
    });
  }
  var bar, track, rm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches, pos = 0, last = 0, hold = 0, raf = 0, half = 0;
  function tvMode() {
    var b = document.body;
    if (!b) return false;
    var ua = navigator.userAgent || "";
    return !!(b.classList.contains("tv") || b.classList.contains("firetv") || window.FEFCNative || /\bFEFCFireTV\b|\bAFT\w|Android TV|Fire TV|Silk/i.test(ua) || /(?:[?&]tv=1(?:&|$))/.test(location.search || ""));
  }
  function html(items, dup) {
    var tv = tvMode();
    return items.map(function(p) {
      var meta = p.join ? "" : p.ts ? "<em>" + ago(p.ts) + "</em>" : "";
      var inert = dup || tv;
      return "<" + (tv ? "span" : "a") + ' class="tk-i' + (p.join ? " tk-join" : "") + (dup ? " tk-dup" : "") + '"' + (tv ? "" : ' href="' + esc(p.url) + '" target="_blank" rel="noopener"') + (inert ? ' tabindex="-1" aria-hidden="true"' : ' aria-label="' + esc(NAME[p.src] + ": " + p.title) + ' (opens in a new tab)"') + ">" + icon(p.src) + "<b>" + esc(p.title) + "</b>" + meta + (p.join ? "<u>JOIN</u>" : "") + "</" + (tv ? "span" : "a") + ">";
    }).join("");
  }
  function render(items) {
    track.innerHTML = html(items, 0) + (rm ? "" : html(items, 1));
    bar.classList.add("ready");
    pos = 0;
    bar.scrollLeft = 0;
    measure();
  }
  function measure() {
    half = rm ? 0 : track.scrollWidth / 2;
  }
  function step(t) {
    raf = requestAnimationFrame(step);
    var dt = Math.min(64, t - (last || t));
    last = t;
    if (rm || hold || !bar || !bar.classList.contains("on")) return;
    if (!half || !bar.getClientRects().length) {
      if (bar.classList.contains("on") && bar.offsetParent !== null) measure();
      if (!half) return;
    }
    pos += dt * 0.032 * Math.max(1, innerHeight / 720);
    if (pos >= half) pos -= half;
    bar.scrollLeft = pos;
  }
  function setHold(v) {
    hold = v;
    if (!v) {
      pos = bar.scrollLeft;
      last = 0;
    }
  }
  function mount() {
    if (bar) return;
    var home = $("#home");
    if (!home) return;
    bar = document.createElement("nav");
    bar.id = "ticker";
    bar.setAttribute("aria-label", "Latest from our communities");
    bar.innerHTML = '<div class="tk-track"></div>';
    track = bar.firstChild;
    ($("#app") || document.body).appendChild(bar);
    bar.addEventListener("mouseenter", function() {
      setHold(1);
    });
    bar.addEventListener("mouseleave", function() {
      if (!bar.contains(document.activeElement)) setHold(0);
    });
    bar.addEventListener("focusin", function() {
      setHold(1);
    });
    bar.addEventListener("focusout", function() {
      setTimeout(function() {
        if (!bar.contains(document.activeElement)) setHold(0);
      }, 50);
    });
    var tt;
    bar.addEventListener("touchstart", function() {
      clearTimeout(tt);
      setHold(1);
    }, { passive: true });
    bar.addEventListener("touchend", function() {
      clearTimeout(tt);
      tt = setTimeout(function() {
        setHold(0);
      }, 4e3);
    }, { passive: true });
    bar.addEventListener("wheel", function() {
      pos = bar.scrollLeft;
    }, { passive: true });
    bar.addEventListener("keydown", function(e) {
      if (tvMode()) return;
      var a = e.target;
      if (e.keyCode === 13 && a && a.classList && a.classList.contains("tk-i")) {
        e.preventDefault();
        e.stopPropagation();
        a.click();
      }
    }, true);
    track.innerHTML = html(CTA, 0);
    bar.classList.add("ready");
    load().then(render);
    setInterval(function() {
      if (bar.classList.contains("on") && !document.hidden && !bar.contains(document.activeElement)) load().then(function(it) {
        if (it && it.length > CTA.length - 1) render(it);
      });
    }, 10 * 6e4);
    addEventListener("resize", measure);
    raf = requestAnimationFrame(step);
  }
  function sync() {
    var det = $("#details"), pl = $("#player"), rf = $("#rfpanel");
    var on = !!document.body.classList.contains("intro-done");
    if (on && det && !det.hidden) on = false;
    if (on && pl && !pl.hidden) on = false;
    if (on && rf && !rf.hidden) on = false;
    mount();
    if (bar) bar.classList.toggle("on", on);
    document.body.classList.toggle("tk-on", on);
    if (on) {
      setHold(0);
      setTimeout(function() {
        measure();
        dispatchEvent(new Event("resize"));
      }, 60);
      setTimeout(measure, 400);
    }
  }
  function init() {
    var h = $("#home");
    if (!h) return;
    ["details", "player", "rfpanel"].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ["hidden", "class"] });
    });
    new MutationObserver(sync).observe(h, { attributes: true, attributeFilter: ["hidden"] });
    new MutationObserver(function() {
      if (document.body.classList.contains("intro-done")) {
        sync();
        measure();
      }
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    sync();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
