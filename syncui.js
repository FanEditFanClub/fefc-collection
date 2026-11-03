(function() {
  if (!window.FEFCSync) return;
  var G = window.FEFCSync, V = window.FEFCSrv, FIRETV = /FEFCFireTV/.test(navigator.userAgent);
  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, function(c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function $(s, r) {
    return (r || document).querySelector(s);
  }
  function agg() {
    var g = G.state, s = V ? V.state : { state: "out" }, gOn = g.state !== "out", sOn = s.state !== "out";
    return {
      on: gOn || sOn,
      gOn,
      sOn,
      g,
      s,
      user: gOn && g.user || sOn && s.user || null,
      syncing: g.state === "syncing" || s.state === "syncing",
      reconnect: g.state === "reconnect" && !sOn,
      error: g.error || s.error || "",
      via: gOn ? "Google Drive" : s.kind === "google" ? "Google account" : "sync code"
    };
  }
  function chip() {
    var bar = document.getElementById("bar");
    if (!bar) return null;
    var c = document.getElementById("acct");
    if (!c) {
      c = document.createElement("div");
      c.id = "acct";
      bar.appendChild(c);
    }
    return c;
  }
  function paintChip() {
    var c = chip();
    if (!c) return;
    var A = agg();
    if (!A.on) {
      c.hidden = true;
      c.innerHTML = "";
      return;
    }
    c.hidden = false;
    var u = A.user || {}, ini = (u.name || u.email || "S").trim().charAt(0).toUpperCase();
    c.innerHTML = '<button class="acct-btn" aria-haspopup="true" title="' + esc(u.email || "Sync My List") + '">' + (u.picture ? '<img src="' + esc(u.picture) + '" alt="" referrerpolicy="no-referrer">' : "<span>" + esc(ini) + "</span>") + (A.syncing ? '<i class="acct-sp"></i>' : "") + '</button><div class="acct-menu" hidden><div class="acct-who">' + esc(u.name || (A.sOn && !u.email ? "Sync code" : "")) + "<small>" + esc(u.email || (A.reconnect ? "Reconnect to resume sync" : "Syncing via " + A.via)) + '</small></div><button class="mi" data-sync="panel">Sync My List</button>' + (A.reconnect ? '<button class="mi" data-sync="in">Reconnect</button>' : '<button class="mi" data-sync="now">Sync now</button>') + '<button class="mi" data-sync="out">Sign out</button></div>';
  }
  function paintCard() {
    var el2 = document.getElementById("ml-sync");
    if (!el2) return;
    var A = agg();
    el2.innerHTML = !A.on ? '<div class="sync-card"><div><b>Sync My List</b><span>Keep your stars and watch history on every device: Google sign-in, or a 6-digit sync code.</span></div><button class="mi sync-go" tabindex="0" data-sync="panel">Sync My List</button></div>' : A.reconnect ? '<div class="sync-card"><div><b>Sync paused</b><span>Reconnect your Google account to resume syncing.</span></div><button class="mi sync-go" tabindex="0" data-sync="in">Reconnect</button><button class="mi" data-sync="panel">Sync My List</button></div>' : '<div class="sync-card on"><div><b>' + (A.syncing ? "Syncing\u2026" : "Synced") + "</b><span>" + esc(A.user && A.user.email || "Linked with a " + A.via) + (A.error ? " \xB7 " + esc(A.error) : "") + '</span></div><button class="mi" data-sync="panel">Sync My List</button><button class="mi" data-sync="out">Sign out</button></div>';
  }
  function repaint() {
    paintChip();
    paintCard();
    if (P && P.view === "menu") render();
  }
  G.subscribe(repaint);
  if (V) V.subscribe(repaint);
  new MutationObserver(function() {
    var m = document.getElementById("ml-sync");
    if (m && !m.childElementCount) paintCard();
  }).observe(document.getElementById("grid") || document.body, { childList: true, subtree: false });
  var P = null, gen = 0, timers = [], cfg = null;
  function stop() {
    gen++;
    timers.forEach(clearTimeout);
    timers = [];
  }
  function later(fn, ms, g) {
    timers.push(setTimeout(function() {
      if (g === gen) fn();
    }, ms));
  }
  function el() {
    var e = document.getElementById("syncpanel");
    if (!e) {
      e = document.createElement("div");
      e.id = "syncpanel";
      e.setAttribute("role", "dialog");
      e.setAttribute("aria-modal", "true");
      e.hidden = true;
      document.body.appendChild(e);
    }
    return e;
  }
  function open(view, opt2) {
    P = { view: view || "menu", opt: opt2 || {}, prev: null };
    el().hidden = false;
    document.body.classList.add("sp-open");
    if (V) V.status().then(function(c) {
      cfg = c;
      if (P && P.view === "menu") render();
    });
    go(view || "menu", opt2);
  }
  function close() {
    stop();
    P = null;
    el().hidden = true;
    document.body.classList.remove("sp-open");
    var b = $("#ml-sync .mi") || $(".acct-btn");
    if (b) try {
      b.focus({ preventScroll: true });
    } catch (e) {
    }
  }
  function go(view, opt2) {
    stop();
    P.view = view;
    P.opt = opt2 || {};
    render();
    var f = VIEWS[view] && VIEWS[view].enter;
    if (f) f(gen);
  }
  function frame(title, body, btns) {
    return '<div class="sp-card"><h2>' + esc(title) + "</h2>" + body + '<div class="sp-btns">' + btns + "</div></div>";
  }
  function btn(act, label, cls, extra) {
    return '<button class="mi sp-b ' + (cls || "") + '" data-sp="' + act + '"' + (extra || "") + ">" + label + "</button>";
  }
  function opt(act, t, d, def) {
    return '<button class="mi sp-opt" data-sp="' + act + '"' + (def ? " data-default" : "") + "><b>" + esc(t) + "</b><span>" + esc(d) + "</span></button>";
  }
  function render() {
    if (!P) return;
    var v = VIEWS[P.view], e = el(), ak = document.activeElement, key = P.shown === P.view && ak && e.contains(ak) && ak.dataset ? ak.dataset.pad ? '[data-pad="' + ak.dataset.pad + '"]' : ak.dataset.sp ? '[data-sp="' + ak.dataset.sp + '"]' : null : null;
    e.innerHTML = v.html();
    P.shown = P.view;
    var f = key && $(key, e) || $("[data-default]", e) || $("button", e);
    if (f) try {
      f.focus({ preventScroll: true });
    } catch (x) {
    }
  }
  function done(msg) {
    go("done", { msg });
  }
  function fail(msg, retry) {
    go("error", { msg, retry });
  }
  function srvOff() {
    return !cfg || !cfg.configured;
  }
  var VIEWS = {
    menu: { html: function() {
      var A = agg(), cloud = cfg && cfg.configured, tvOk = cfg && cfg.tv;
      var srvNote = !cloud ? FIRETV ? "" : '<p class="sp-note">Cloud sync is warming up. You can still export or import your list below.</p>' : "";
      var opts = "";
      if (cloud) {
        if (FIRETV) {
          if (tvOk) opts += opt("device", "Sign in with Google", "Show a short code \u2014 enter it at google.com/device on your phone.", 1);
          else opts += opt("google-qr", "Sign in with Google", "Scan a QR on your phone, sign in with Google, then Approve.", 1);
          opts += opt("pair", "6-digit sync code", "No Google account needed. Create a code and enter it on another device.");
          opts += opt("qr", "Scan a QR code with your phone", "Your phone (already syncing) approves this device.");
        } else {
          opts += opt("drive", "Sign in with Google", "Sign in here so stars and history sync across devices.", 1);
          opts += opt("pair", "6-digit sync code", "No Google account needed. Create a code and enter it on another device.");
          opts += opt("qr", "Scan a QR code with your phone", "Approve another device from this browser.");
          if (tvOk) opts += opt("device", "Google TV code", "Show a short code for google.com/device (good for a second TV).");
        }
      } else if (FIRETV) {
        opts += '<p class="sp-note">Cloud sync is still connecting. Try again in a moment.</p>';
      }
      if (!FIRETV) {
        opts += opt("export", "Export My List", "Save a backup file of your stars and watch history.");
        opts += opt("import", "Import My List", "Restore stars and history from a backup file.");
      }
      return frame(
        "Sync My List",
        (A.on ? '<p class="sp-sub">' + (A.user && A.user.email ? "Signed in as " + esc(A.user.email) : "Linked with a " + esc(A.via)) + (A.syncing ? " \xB7 syncing\u2026" : " \xB7 synced") + "</p>" : '<p class="sp-sub">Choose how to keep your stars and watch history on all your devices.</p>') + srvNote + '<div class="sp-opts">' + opts + "</div>",
        (A.on ? btn("out", "Sign out") : "") + btn("close", "Close")
      );
    } },
    device: {
      enter: function(g) {
        if (srvOff()) return fail("Cloud sync is not switched on yet.");
        if (!cfg.tv) {
          go("qr", { google: 1 });
          return;
        }
        V.deviceStart().then(function(d) {
          if (g !== gen) return;
          P.d = d;
          P.left = d.expires_in;
          render();
          tick(g);
          poll(g, d.id, (d.interval || 5) * 1e3);
        }, function(e) {
          if (g !== gen) return;
          go("qr", { google: 1 });
        });
      },
      html: function() {
        var d = P.d;
        return frame("Sign in with Google", d ? '<p class="sp-sub">On your phone or computer, go to</p><div class="sp-url">' + esc((d.verification_url || "").replace(/^https?:\/\//, "")) + '</div><p class="sp-sub">and enter this code</p><div class="sp-code">' + esc(d.user_code) + '</div><p class="sp-note" id="sp-left">Waiting for you to approve\u2026 ' + mmss(P.left) + "</p>" : '<p class="sp-sub">Getting a code\u2026</p>', btn("menu", "Cancel", "", " data-default"));
      }
    },
    qr: {
      enter: function(g) {
        if (srvOff()) return fail("Cloud sync is not switched on yet.");
        loadQR().then(function() {
          return V.qrStart();
        }).then(function(q) {
          if (g !== gen) return;
          P.q = q;
          P.left = q.expires_in;
          render();
          tick(g);
          pollQR(g, q);
        }, function() {
          if (g === gen) fail("Could not make a QR code. Try again.", 1);
        });
      },
      html: function() {
        var q = P.q, svg = "", gog = !!(P.opt && P.opt.google);
        if (q && window.qrcode) {
          var c = window.qrcode(0, "M");
          c.addData(q.url);
          c.make();
          svg = c.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
        }
        return frame(gog ? "Sign in with Google" : "Scan with your phone", q ? '<div class="sp-qr">' + svg + '</div><p class="sp-sub">' + (gog ? "Open your phone camera, scan, then <b>Sign in with Google</b> and Approve." : "Open your phone camera, scan, then tap Approve.") + '<br>Confirm code on your phone: <b class="sp-ver">' + esc(q.verify) + '</b></p><p class="sp-note" id="sp-left">Waiting\u2026 ' + mmss(P.left) + "</p>" : '<p class="sp-sub">Making a QR code\u2026</p>', btn("menu", "Cancel", "", " data-default"));
      }
    },
    pair: { html: function() {
      return frame("6-digit sync code", '<p class="sp-sub">No Google account needed.</p><div class="sp-opts">' + opt("pair-new", "Create a code", "Show a code to enter on your other device.") + opt("pair-enter", "Enter a code", "Type the code shown on another device.") + "</div>", btn("menu", "Back", "", " data-default"));
    } },
    "pair-new": {
      enter: function(g) {
        if (srvOff()) return fail("Cloud sync is not switched on yet.");
        V.pairCreate().then(function(r) {
          if (g !== gen) return;
          P.code = r.code;
          P.left = r.expires_in;
          var p = r.token ? V.adopt(r) : Promise.resolve();
          return p.then(function() {
            if (g !== gen) return;
            render();
            tick(g);
          });
        }, function(e) {
          if (g === gen) fail("Could not create a code. Try again.", 1);
        });
      },
      html: function() {
        var c = P.code;
        return frame("Your sync code", c ? '<div class="sp-code">' + esc(c.slice(0, 3) + " " + c.slice(3)) + '</div><p class="sp-sub">On your other device: open My List, choose Sync My List, then 6-digit sync code, then Enter a code.</p><p class="sp-note" id="sp-left">Code works for ' + mmss(P.left) + "</p>" : '<p class="sp-sub">Creating a code\u2026</p>', btn("close", "Done", "", " data-default"));
      }
    },
    "pair-enter": { html: function() {
      var d = P.digits || "", slots = "";
      for (var i = 0; i < 6; i++) slots += '<i class="' + (i < d.length ? "f" : "") + '">' + (d[i] || "") + "</i>";
      var keys = "";
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "go"].forEach(function(k) {
        keys += '<button class="mi sp-k' + (k === "go" ? " sp-go" : "") + '" data-pad="' + k + '"' + (k === "5" ? " data-default" : "") + ">" + (k === "del" ? "\u232B" : k === "go" ? "OK" : k) + "</button>";
      });
      return frame("Enter your sync code", '<div class="sp-slots' + (P.bad ? " bad" : "") + '">' + slots + "</div>" + (P.bad ? '<p class="sp-note bad">' + esc(P.bad) + "</p>" : '<p class="sp-sub">Use the number buttons, or type on a keyboard.</p>') + '<div class="sp-pad">' + keys + "</div>", btn("pair", "Back"));
    } },
    done: { html: function() {
      var A = agg();
      return frame("You\u2019re synced", ' <p class="sp-sub">' + esc(P.opt.msg || "") + (A.user && A.user.email ? " Signed in as " + esc(A.user.email) + "." : "") + "</p>", btn("close", "Done", "", " data-default"));
    } },
    error: { html: function() {
      return frame("Sync My List", '<p class="sp-sub">' + esc(P.opt.msg || "Something went wrong.") + "</p>", (P.opt.retry ? btn("retry", "Try again") : "") + btn("menu", "Back", "", " data-default"));
    } },
    approve: {
      enter: function(g) {
        P.id = P.opt.id;
        V && V.status().then(function(c) {
          cfg = c;
          if (g !== gen) return;
          if (!c.configured) return fail("Cloud sync is not switched on yet.");
          return V.qrInfo(P.id).then(function(i) {
            if (g !== gen) return;
            P.verify = i.verify;
            render();
          }, function() {
            if (g === gen) fail("This link has expired. Make a new QR code on your TV.");
          });
        });
      },
      html: function() {
        var c = V && V.connected();
        return frame(
          "Link a TV to My List?",
          P.verify ? '<p class="sp-sub">Your TV should be showing the confirm code</p><div class="sp-code">' + esc(P.verify) + '</div><p class="sp-note">Only approve if that matches. Approving shares your stars and watch history with that TV.</p>' : '<p class="sp-sub">Checking the link\u2026</p>',
          (P.verify ? c ? btn("approve-go", "Approve", "sp-go", " data-default") : btn("approve-google", "Sign in with Google", "sp-go", " data-default") + btn("approve-anon", "Link without Google") : "") + btn("close", "Cancel")
        );
      }
    }
  };
  function mmss(s) {
    s = Math.max(0, s | 0);
    return Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2);
  }
  function tick(g) {
    later(function() {
      if (!P) return;
      P.left--;
      var l = $("#sp-left");
      if (l) l.textContent = l.textContent.replace(/\d+:\d\d/, mmss(P.left));
      if (P.left <= 0 && (P.view === "device" || P.view === "qr")) fail("That code expired.", 1);
      else tick(g);
    }, 1e3, g);
  }
  function poll(g, id, ms) {
    later(function() {
      V.devicePoll(id).then(function(r) {
        if (g !== gen) return;
        if (r.status === "ok") V.adopt(r).then(function() {
          done("Google sign-in worked.");
        });
        else if (r.status === "denied") fail("Sign-in was cancelled.", 1);
        else if (r.status === "expired") fail("That code expired.", 1);
        else poll(g, id, ms);
      }, function() {
        if (g === gen) poll(g, id, ms * 2);
      });
    }, ms, g);
  }
  function pollQR(g, q) {
    later(function() {
      V.qrPoll(q.id, q.secret).then(function(r) {
        if (g !== gen) return;
        if (r.status === "ok") V.adopt(r).then(function() {
          done(P.opt && P.opt.google ? "Google sign-in worked. Your list is syncing." : "Linked with your phone.");
        });
        else if (r.status === "expired") fail("That QR code expired.", 1);
        else pollQR(g, q);
      }, function() {
        if (g === gen) pollQR(g, q);
      });
    }, 2500, g);
  }
  var qrLoading = null;
  function loadQR() {
    if (window.qrcode) return Promise.resolve();
    return qrLoading || (qrLoading = new Promise(function(res, rej) {
      var s = document.createElement("script");
      s.src = "qrgen.js";
      s.onload = res;
      s.onerror = function() {
        qrLoading = null;
        rej();
      };
      document.head.appendChild(s);
    }));
  }
  function enterDigit(d) {
    if (!P || P.view !== "pair-enter") return;
    P.digits = P.digits || "";
    P.bad = "";
    if (d === "del") P.digits = P.digits.slice(0, -1);
    else if (d === "go") {
      if (P.digits.length === 6) return redeem();
    } else if (P.digits.length < 6) P.digits += d;
    render();
    if (P.digits.length === 6 && d !== "del" && d !== "go") redeem();
  }
  function redeem() {
    var g = gen, code = P.digits;
    V.pairRedeem(code).then(function(r) {
      if (g !== gen) return;
      return V.adopt(r).then(function() {
        done("This device is now linked.");
      });
    }, function(e) {
      if (g !== gen) return;
      P.digits = "";
      P.bad = e.status === 429 ? "Too many tries. Wait a few minutes." : "That code didn\u2019t work. Check it and try again.";
      render();
    });
  }
  document.addEventListener("click", function(e) {
    var a = e.target.closest(".acct-btn");
    if (a) {
      var m = a.parentNode.querySelector(".acct-menu");
      m.hidden = !m.hidden;
      return;
    }
    var sp = e.target.closest("#syncpanel");
    if (sp) {
      var pad = e.target.closest("[data-pad]");
      if (pad) {
        enterDigit(pad.dataset.pad);
        return;
      }
      var b = e.target.closest("[data-sp]");
      if (!b) {
        if (e.target.id === "syncpanel") close();
        return;
      }
      var k = b.dataset.sp;
      if (k === "close") close();
      else if (k === "menu") {
        go("menu");
        V && V.status().then(function(c) {
          cfg = c;
          if (P && P.view === "menu") render();
        });
      } else if (k === "out") {
        G.state.state !== "out" && G.signOut();
        if (V && V.connected()) V.signOut();
        close();
      } else if (k === "drive") {
        close();
        G.signIn();
      } else if (k === "export") {
        try {
          var j = window.UD && UD.exportJSON && UD.exportJSON();
          if (!j) throw 0;
          var blob = new Blob([j], { type: "application/json" });
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "fefc-mylist-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + ".json";
          document.body.appendChild(a);
          a.click();
          setTimeout(function() {
            URL.revokeObjectURL(a.href);
            a.remove();
          }, 500);
          done("My List backup saved. Keep the file to import on another device.");
        } catch (err) {
          fail("Could not export My List.", 1);
        }
      } else if (k === "import") {
        var inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "application/json,.json";
        inp.style.position = "fixed";
        inp.style.left = "-9999px";
        document.body.appendChild(inp);
        inp.onchange = function() {
          var f = inp.files && inp.files[0];
          inp.remove();
          if (!f) return;
          var r = new FileReader();
          r.onload = function() {
            try {
              UD.importJSON(String(r.result || ""), false);
              done("My List imported. Stars and history are updated.");
              if (window.__fefcPaintSync) __fefcPaintSync();
              try {
                if (location.hash.indexOf("mylist") >= 0 && typeof myListPage === "function") myListPage();
              } catch (e2) {
              }
            } catch (err) {
              fail("That file is not a valid My List backup.", 1);
            }
          };
          r.onerror = function() {
            fail("Could not read that file.", 1);
          };
          r.readAsText(f);
        };
        inp.click();
      } else if (k === "retry") go(P.prevView || "menu");
      else if (k === "approve-go") {
        V.qrApprove(P.id).then(function() {
          go("done", { msg: "Your TV is linked." });
        }, function() {
          fail("Could not approve. The link may have expired.");
        });
      } else if (k === "approve-google") {
        var g0 = gen;
        G.signIn();
        var iv = setInterval(function() {
          if (!P || g0 !== gen) {
            clearInterval(iv);
            return;
          }
          if (V.connected()) {
            clearInterval(iv);
            render();
          }
        }, 800);
        timers.push(iv);
      } else if (k === "approve-anon") {
        V.pairCreate().then(function(r) {
          return r.token ? V.adopt(r) : 0;
        }).then(function() {
          render();
        }, function() {
          fail("Could not link without Google.");
        });
      } else if (k === "google-qr") {
        P.prevView = "google-qr";
        go("qr", { google: 1 });
      } else if (VIEWS[k]) {
        P.prevView = k;
        go(k);
      }
      return;
    }
    var b2 = e.target.closest("[data-sync]");
    if (b2) {
      var k2 = b2.dataset.sync;
      if (k2 === "panel") open("menu");
      else if (k2 === "in") G.signIn();
      else if (k2 === "out") {
        G.state.state !== "out" && G.signOut();
        if (V && V.connected()) V.signOut();
      } else {
        G.syncNow();
        V && V.syncNow();
      }
      var mm = $(".acct-menu");
      if (mm) mm.hidden = true;
      return;
    }
    var m2 = $(".acct-menu");
    if (m2 && !m2.hidden && !e.target.closest("#acct")) m2.hidden = true;
  });
  function nav(dir) {
    var L = [].slice.call(document.querySelectorAll("#syncpanel button")).filter(function(b) {
      var r2 = b.getBoundingClientRect();
      return r2.width > 0 && r2.height > 0;
    }), a = document.activeElement;
    if (!a || !el().contains(a)) {
      if (L[0]) L[0].focus();
      return;
    }
    var r = a.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, best = null, bd = 1e9;
    L.forEach(function(b) {
      if (b === a) return;
      var q = b.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2, dx = x - cx, dy = y - cy;
      var ok = dir === "left" ? q.right <= r.left + 4 : dir === "right" ? q.left >= r.right - 4 : dir === "up" ? q.bottom <= r.top + 4 : q.top >= r.bottom - 4;
      if (!ok) return;
      var main = dir === "left" || dir === "right" ? Math.abs(dx) : Math.abs(dy), off = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx), d = main + off * 2.5;
      if (d < bd) {
        bd = d;
        best = b;
      }
    });
    if (best) best.focus({ preventScroll: true });
  }
  window.__fefcModal = function(e) {
    if (!P || e.ctrlKey || e.metaKey || e.altKey) return false;
    var k = e.keyCode, key = e.key;
    if (e.type !== "keydown") return true;
    var digit = k >= 48 && k <= 57 ? String(k - 48) : k >= 96 && k <= 105 ? String(k - 96) : null;
    if (P.view === "pair-enter") {
      if (digit !== null) {
        enterDigit(digit);
        return true;
      }
      if (k === 8) {
        enterDigit("del");
        return true;
      }
    }
    if (k === 27 || k === 10009 || k === 461 || key === "GoBack" || key === "BrowserBack" || k === 8) {
      if (P.view === "menu" || P.view === "done" || P.view === "error" || P.view === "approve") close();
      else go(P.view === "pair-enter" ? "pair" : "menu");
      return true;
    }
    if (k === 37 || k === 38 || k === 39 || k === 40) {
      nav({ 37: "left", 38: "up", 39: "right", 40: "down" }[k]);
      return true;
    }
    if (k === 13 || k === 23) {
      var a = document.activeElement;
      if (a && el().contains(a) && a.tagName === "BUTTON") a.click();
      return true;
    }
    return true;
  };
  function checkLink() {
    try {
      var id = new URLSearchParams(location.search).get("link");
      if (!id || !/^[\w-]{20,30}$/.test(id)) return;
      history.replaceState(null, "", location.pathname + location.hash);
      setTimeout(function() {
        open("approve", { id });
      }, 400);
    } catch (e) {
    }
  }
  window.__fefcPaintSync = paintCard;
  window.__fefcCloseSync = close;
  paintChip();
  paintCard();
  checkLink();
})();
document.addEventListener("keydown", function(e) {
  var k = e.keyCode;
  if (k !== 13 && k !== 23) return;
  var a = document.activeElement;
  if (!a || !a.closest) return;
  var b = a.closest("[data-sync]");
  if (!b) return;
  e.preventDefault();
  b.click();
});
