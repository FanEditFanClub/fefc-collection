(function() {
  var KEY = "fefcUserData.v1", subs = [], db = load();
  function now() {
    return Date.now();
  }
  function load() {
    try {
      var j = JSON.parse(localStorage.getItem(KEY) || "null");
      if (j && j.v === 1) {
        j.playback = j.playback || {};
        return j;
      }
    } catch (e) {
    }
    return { v: 1, stars: {}, history: {}, playback: {}, updatedAt: 0 };
  }
  function save() {
    db.updatedAt = now();
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
    }
    subs.forEach(function(f) {
      try {
        f(db);
      } catch (e) {
      }
    });
  }
  function live(c) {
    var o = [];
    Object.keys(c).forEach(function(k) {
      if (!c[k].deleted) o.push(c[k]);
    });
    return o;
  }
  var UD = {
    get: function(col, id) {
      var r = (db[col] || {})[id];
      return r && !r.deleted ? r : null;
    },
    set: function(col, id, rec) {
      db[col] = db[col] || {};
      var r = Object.assign({ id }, rec || {}, { updatedAt: now() });
      db[col][id] = r;
      save();
      return r;
    },
    remove: function(col, id) {
      db[col] = db[col] || {};
      db[col][id] = { id, deleted: true, updatedAt: now() };
      save();
    },
    all: function(col) {
      return live(db[col] || {});
    },
    subscribe: function(f) {
      subs.push(f);
      return function() {
        subs = subs.filter(function(x) {
          return x !== f;
        });
      };
    },
    // stars
    isStarred: function(id) {
      return !!UD.get("stars", id);
    },
    toggleStar: function(id, name) {
      if (UD.isStarred(id)) {
        UD.remove("stars", id);
        return false;
      }
      UD.set("stars", id, { starredAt: now(), name: name || "" });
      return true;
    },
    stars: function() {
      return UD.all("stars");
    },
    // history & playback timing
    opened: function(id, name) {
      var r = UD.get("history", id);
      UD.set("history", id, { lastOpened: now(), count: (r && r.count || 0) + 1, name: name || "" });
    },
    history: function(n) {
      return UD.all("history").sort(function(a, b) {
        return b.lastOpened - a.lastOpened;
      }).slice(0, n || 50);
    },
    clearHistory: function() {
      Object.keys(db.history || {}).forEach(function(k) {
        db.history[k] = { id: k, deleted: true, updatedAt: now() };
      });
      save();
    },
    // playback precision time tracking & session logs
    formatTime: function(sec) {
      var s = Math.max(0, Math.floor(sec || 0));
      var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), rem = s % 60;
      var p2 = function(n) {
        return (n < 10 ? "0" : "") + n;
      };
      return (h > 0 ? p2(h) + ":" : "") + p2(m) + ":" + p2(rem);
    },
    parseTime: function(str) {
      if (!str) return 0;
      var parts = String(str).trim().split(":").map(Number);
      if (parts.some(isNaN)) return 0;
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 1) return parts[0];
      return 0;
    },
    getPlayback: function(id) {
      return UD.get("playback", id);
    },
    setPlayback: function(id, sec, name, opt) {
      db.playback = db.playback || {};
      var prev = db.playback[id] || {};
      var s = Math.max(0, Math.floor(sec || 0));
      var log = Array.isArray(prev.log) ? prev.log.slice() : [];
      if (opt && opt.log && s > 10) {
        var last = log[0];
        if (!last || Math.abs(last.sec - s) > 15 || now() - last.at > 6e4) {
          log.unshift({ at: now(), sec: s, formatted: UD.formatTime(s) });
          if (log.length > 10) log = log.slice(0, 10);
        }
      }
      return UD.set("playback", id, { sec: s, formatted: UD.formatTime(s), name: name || prev.name || "", log });
    },
    clearPlayback: function(id) {
      UD.remove("playback", id);
    },
    // export / import (+ merge for sync)
    exportJSON: function() {
      return JSON.stringify(db);
    },
    importJSON: function(s, replace) {
      var j = typeof s === "string" ? JSON.parse(s) : s;
      if (!j || j.v !== 1) throw new Error("bad format");
      if (replace) {
        db = j;
      } else UD.merge(j);
      save();
    },
    merge: function(o) {
      ["stars", "history", "playback"].forEach(function(c) {
        var a = db[c] = db[c] || {}, b = o[c] || {};
        Object.keys(b).forEach(function(k) {
          if (!a[k] || (b[k].updatedAt || 0) > (a[k].updatedAt || 0)) a[k] = b[k];
        });
      });
    }
  };
  addEventListener("storage", function(e) {
    if (e.key === KEY) {
      db = load();
      subs.forEach(function(f) {
        try {
          f(db);
        } catch (_) {
        }
      });
    }
  });
  window.UD = UD;
})();
