(function(root) {
  var CLIENT_ID = "965770773324-i20msn4q01isddkunrcg4o30s5pju0bk.apps.googleusercontent.com";
  var SCOPES = "https://www.googleapis.com/auth/drive.appdata openid email profile";
  var FILE = "fefc-userdata.json";
  function core(o) {
    var fileId = null;
    return {
      sync: function() {
        var d = o.drive, st = o.store;
        return Promise.resolve(fileId || d.find()).then(function(id) {
          fileId = id || null;
          return fileId ? d.read(fileId) : null;
        }).then(function(remote) {
          if (remote) {
            var j = typeof remote === "string" ? JSON.parse(remote) : remote;
            if (j && j.v === 1) st.importJSON(j, false);
          }
          var body = st.exportJSON();
          return fileId ? d.update(fileId, body) : d.create(body).then(function(id) {
            fileId = id;
          });
        }).then(function() {
          return true;
        });
      },
      reset: function() {
        fileId = null;
      }
    };
  }
  function driveApi(tok) {
    var H = function() {
      return { Authorization: "Bearer " + tok() };
    };
    var B = "https://www.googleapis.com/";
    function ok(r) {
      if (!r.ok) {
        var e = new Error("drive " + r.status);
        e.status = r.status;
        throw e;
      }
      return r;
    }
    return {
      find: function() {
        return fetch(B + "drive/v3/files?spaces=appDataFolder&fields=files(id,modifiedTime)&q=" + encodeURIComponent("name='" + FILE + "'"), { headers: H() }).then(ok).then(function(r) {
          return r.json();
        }).then(function(j) {
          return j.files && j.files[0] ? j.files[0].id : null;
        });
      },
      read: function(id) {
        return fetch(B + "drive/v3/files/" + id + "?alt=media", { headers: H() }).then(ok).then(function(r) {
          return r.text();
        });
      },
      create: function(body) {
        var bd = "fefc" + Date.now(), meta = JSON.stringify({ name: FILE, parents: ["appDataFolder"], mimeType: "application/json" });
        return fetch(B + "upload/drive/v3/files?uploadType=multipart&fields=id", {
          method: "POST",
          headers: Object.assign(H(), { "Content-Type": "multipart/related; boundary=" + bd }),
          body: "--" + bd + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + meta + "\r\n--" + bd + "\r\nContent-Type: application/json\r\n\r\n" + body + "\r\n--" + bd + "--"
        }).then(ok).then(function(r) {
          return r.json();
        }).then(function(j) {
          return j.id;
        });
      },
      update: function(id, body) {
        return fetch(B + "upload/drive/v3/files/" + id + "?uploadType=media", { method: "PATCH", headers: Object.assign(H(), { "Content-Type": "application/json" }), body }).then(ok);
      }
    };
  }
  function browser() {
    var tok = null, exp = 0, tc = null, user = null, subs = [], C = null, timer = null, busy = false, again = false, lastErr = "";
    var K = "fefcSync";
    var S = { state: "out", user: null, error: "" };
    function emit() {
      S.user = user;
      S.error = lastErr;
      subs.forEach(function(f) {
        try {
          f(S);
        } catch (e) {
        }
      });
    }
    function gis() {
      return new Promise(function(res, rej) {
        if (window.google && google.accounts && google.accounts.oauth2) return res();
        var s = document.createElement("script");
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true;
        s.onload = function() {
          res();
        };
        s.onerror = function() {
          rej(new Error("gis"));
        };
        document.head.appendChild(s);
      });
    }
    function token(prompt) {
      return gis().then(function() {
        return new Promise(function(res, rej) {
          tc = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, callback: function(r) {
            if (r && r.access_token) {
              tok = r.access_token;
              exp = Date.now() + ((+r.expires_in || 3600) - 120) * 1e3;
              res(tok);
            } else rej(new Error(r && r.error || "denied"));
          }, error_callback: function(e) {
            rej(new Error(e && e.type || "popup"));
          } });
          var hint = localStorage.getItem(K) || "";
          tc.requestAccessToken({ prompt, hint: hint || void 0 });
        });
      });
    }
    function fresh() {
      if (tok && Date.now() < exp) return Promise.resolve(tok);
      return token("");
    }
    function me() {
      return fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + tok } }).then(function(r) {
        return r.ok ? r.json() : null;
      }).then(function(u) {
        if (u) {
          user = { email: u.email, name: u.name, picture: u.picture };
          localStorage.setItem(K, u.email || "1");
        }
      });
    }
    function run() {
      if (!tok || !window.UD) return Promise.resolve();
      if (busy) {
        again = true;
        return Promise.resolve();
      }
      busy = true;
      S.state = "syncing";
      emit();
      return fresh().then(function() {
        return C.sync();
      }).then(function() {
        S.state = "in";
        lastErr = "";
      }, function(e) {
        S.state = "in";
        lastErr = e && e.message || "sync failed";
        if (e && e.status === 401) {
          tok = null;
        }
      }).then(function() {
        busy = false;
        emit();
        if (again) {
          again = false;
          return run();
        }
      });
    }
    var deb;
    function soon() {
      clearTimeout(deb);
      deb = setTimeout(run, 2500);
    }
    function start() {
      C = core({ drive: driveApi(function() {
        return tok;
      }), store: window.UD });
      return me().then(run).then(function() {
        if (!S._wired) {
          S._wired = 1;
          window.UD.subscribe(function() {
            if (tok && !busy) soon();
          });
          addEventListener("focus", function() {
            if (tok) run();
          });
          document.addEventListener("visibilitychange", function() {
            if (!document.hidden && tok) run();
          });
        }
        clearInterval(timer);
        timer = setInterval(function() {
          if (tok) run();
        }, 4 * 60 * 1e3);
      });
    }
    var api = {
      get state() {
        return S;
      },
      subscribe: function(f) {
        subs.push(f);
        f(S);
      },
      signIn: function() {
        lastErr = "";
        return token(localStorage.getItem(K) ? "" : "consent").then(start).catch(function(e) {
          lastErr = e.message;
          S.state = "out";
          emit();
        });
      },
      signOut: function() {
        try {
          if (tok && window.google) google.accounts.oauth2.revoke(tok, function() {
          });
        } catch (e) {
        }
        tok = null;
        user = null;
        localStorage.removeItem(K);
        clearInterval(timer);
        if (C) C.reset();
        S.state = "out";
        emit();
      },
      syncNow: run,
      wasSignedIn: function() {
        return !!localStorage.getItem(K);
      }
    };
    if (api.wasSignedIn()) {
      S.state = "reconnect";
      setTimeout(function() {
        token("none").then(start).catch(function() {
          S.state = "reconnect";
          emit();
        });
      }, 2500);
    }
    return api;
  }
  root.FEFCSyncCore = core;
  if (typeof window !== "undefined" && window.document) window.FEFCSync = browser();
})(typeof window !== "undefined" ? window : globalThis);
