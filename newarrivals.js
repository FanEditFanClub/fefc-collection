(function() {
  var NA = window.NA = {
    dates: {},
    d: function(f) {
      var x = NA.dates[f.id] || NA.dates[f.targetId];
      return x && (x.c || x.m) || f.modified || "";
    },
    fmt: function(s) {
      if (!s) return "";
      var t = new Date(s.length <= 10 ? s + "T12:00:00" : s);
      return isNaN(t) ? "" : "Added " + t.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    },
    CAP: 500,
    _tk: null,
    _top: null,
    top: function(list) {
      var k = list.length + ":" + Object.keys(NA.dates).length;
      if (NA._tk === k) return NA._top;
      var seen = {}, out = [];
      NA.sort(list).forEach(function(f) {
        var t = f.targetId || f.id;
        if (out.length >= NA.CAP || seen[t] || !NA.d(f)) return;
        seen[t] = 1;
        out.push(f);
      });
      NA._tk = k;
      NA._top = out;
      NA._set = {};
      out.forEach(function(f) {
        NA._set[f.id] = 1;
        NA._set[f.targetId || f.id] = 1;
      });
      return out;
    },
    isNew: function(f) {
      return !!(NA._set && (NA._set[f.id] || NA._set[f.targetId || f.id]));
    },
    newCount: function(list) {
      return NA.top(list).length;
    },
    sort: function(list) {
      return list.slice().sort(function(a, b) {
        var x = NA.d(a), y = NA.d(b);
        return x < y ? 1 : x > y ? -1 : a.name.localeCompare(b.name);
      });
    },
    MENU: function(F) {
      return [["#/", "Home"], ["#/supportus", "Support Us"], ["#/all", "Main Collection"], ["#/folder/" + F.collections, "Fan Edit Collections"], ["#/newarrivals", "New Arrivals"], ["#/folder/" + F.tbc, "To Be Catalogued"], ["#/people", "Actors & Directors"], ["#/genres", "Genres"], ["#/mylist", "My List"]];
    },
    menuHTML: function(F, back) {
      var h = location.hash || "#/";
      if (h === "#/arena") h = "#/newarrivals";
      if (h === "#/support") h = "#/supportus";
      if (/^#\/genre\//.test(h)) h = "#/genres";
      return (back ? '<button class="mi" data-nav="up">\u25C0 Back</button>' : "") + NA.MENU(F).map(function(m) {
        var on = h === m[0] || m[0] === "#/" && h === "#" || m[0] !== "#/" && h.indexOf(m[0] + "/") === 0;
        return '<button class="mi' + (on ? " on" : "") + '" data-href="' + m[0] + '"' + (on ? ' aria-current="page"' : "") + ">" + m[1] + "</button>";
      }).join("");
    },
    PAGE: 60,
    plural: function(n, w) {
      return n ? n + " " + w + (n === 1 ? "" : "s") : "";
    },
    deep: function(id, kids, isF) {
      var n = 0, seen = {}, st = [id];
      while (st.length) {
        var c = st.pop();
        if (seen[c]) continue;
        seen[c] = 1;
        (kids.get(c) || []).forEach(function(f) {
          if (isF(f)) st.push(f.targetId || f.id);
          else n++;
        });
      }
      return n;
    },
    render: function(all, tile, art, get) {
      var list = NA.top(all), shown = 0, g = document.getElementById("grid");
      g.className = "sectioned";
      g.innerHTML = '<div class="sgrid vids" id="na-list"></div><div style="text-align:center;padding:24px"><button class="mi" id="na-more" style="font-size:18px">More</button></div>';
      var box = document.getElementById("na-list"), more = document.getElementById("na-more");
      function page() {
        var chunk = list.slice(shown, shown + NA.PAGE);
        shown += chunk.length;
        var t = document.createElement("div");
        t.innerHTML = chunk.map(function(f) {
          return tile(f).replace("</button>", '<div class="na-date">' + NA.fmt(NA.d(f)) + "</div></button>");
        }).join("");
        [].slice.call(t.children).forEach(function(el) {
          box.appendChild(el);
          art(el, get(el.dataset.id));
        });
        more.hidden = shown >= list.length;
        more.textContent = "More (" + (list.length - shown) + " left)";
      }
      more.onclick = function() {
        page();
        var n = box.children[shown - NA.PAGE];
        n && n.focus && n.focus();
      };
      page();
      var main = document.getElementById("main");
      if (main) {
        main.onscroll = function() {
          if (!more.hidden && document.getElementById("na-more") === more && main.scrollTop + main.clientHeight > main.scrollHeight - 600) page();
        };
      }
      return list.length;
    }
  };
  document.addEventListener("click", function(e) {
    var b = e.target.closest && e.target.closest("[data-href]");
    if (b) {
      e.preventDefault();
      if (window.S && S.click) try {
        S.click();
      } catch (_) {
      }
      location.hash = b.dataset.href;
    }
  });
})();
