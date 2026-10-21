(function() {
  var art = {};
  fetch("data/genreart.json").then(function(r) {
    return r.json();
  }).then(function(j) {
    art = j;
    paint();
  }).catch(function() {
  });
  var css = document.createElement("style");
  css.textContent = '#grid.gnrs{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(30vw,340px),1fr));gap:1.4vmin;padding:2vmin 3vmin 6vmin;perspective:1400px}#grid.gnrs .gwrap{display:contents}#grid.gnrs .ol-tile.gnr{position:relative;aspect-ratio:1.55;border:2px solid #9fb6cf;border-radius:3px;overflow:hidden;background:#0b111a;color:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:.35em .4em .3em;gap:.1em;font:700 clamp(18px,5vmin,72px)/.98 "Source Sans 3","Segoe UI","PT Sans",sans-serif;letter-spacing:-.01em;text-shadow:0 1px 3px #000,0 0 12px #000;container-type:size;transform:rotateX(var(--tilt-x,11deg));transform-origin:50% 100%;box-shadow:inset 0 0 0 1px #000,0 6px 18px #000a;transition:box-shadow .15s,border-color .15s}#grid.gnrs .ol-tile.gnr:before{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(170deg,#ffffff26 0,#fff0 45%),linear-gradient(0deg,#000c,#0006 55%,#0003);pointer-events:none}#grid.gnrs .gimg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}#grid.gnrs .gimg.brand{object-fit:contain;padding:18%;background:radial-gradient(circle at 50% 40%,#1c2636,#05070b 75%);opacity:.55}#grid.gnrs .gnr span,#grid.gnrs .gnr small{position:relative;z-index:2;max-width:100%;overflow-wrap:break-word}#grid.gnrs .gnr small{font-size:.36em;font-weight:600;color:#ffb02e}@supports (font-size:1cqh){#grid.gnrs .gnr span{font-size:clamp(16px,min(30cqh,18.5cqw),130px)}#grid.gnrs .gnr small{font-size:clamp(10px,min(9cqh,5.5cqw),36px)}}#grid.gnrs .ol-tile.gnr:hover,#grid.gnrs .ol-tile.gnr:focus,#grid.gnrs .ol-tile.gnr:focus-visible{outline:0;transform:rotateX(var(--tilt-x,11deg));border-color:#ffb02e;box-shadow:inset 0 0 0 1px #000,inset 0 0 26px #ff9c0033,0 0 0 2px #ff9c00,0 0 24px #ff9c00cc;z-index:2}html.no3d #grid.gnrs .ol-tile.gnr{transform:none}';
  document.head.appendChild(css);
  function pl(n, w) {
    return n + " " + w + (n === 1 ? "" : "s");
  }
  function paint() {
    [].forEach.call(document.querySelectorAll("#grid.gnrs .gnr"), function(b) {
      var a = art[b.dataset.genre] || art.Uncategorized;
      var i = b.querySelector(".gimg");
      if (a && i && !i.getAttribute("src")) {
        i.className = "gimg" + (a.brand ? " brand" : "");
        i.src = a.img;
      }
    });
  }
  function files(set, items, isV) {
    var n = 0;
    items.forEach(function(f) {
      if (!isV(f)) return;
      var p = f.parent, g = 0;
      while (p && g++ < 30) {
        if (set[p]) {
          n++;
          return;
        }
        var x = items.get(p);
        p = x && x.parent;
      }
    });
    return n;
  }
  window.FEFCGenres = { render: function(o) {
    var by = {};
    Object.keys(o.genreMap).forEach(function(fid) {
      o.genreMap[fid].genres.forEach(function(g2) {
        (by[g2] = by[g2] || []).push(fid);
      });
    });
    var g = document.getElementById("grid");
    g.className = "gnrs";
    g.innerHTML = o.order.filter(function(x) {
      return by[x];
    }).map(function(x) {
      var st = {};
      by[x].forEach(function(i) {
        st[i] = 1;
      });
      var m = files(st, o.items, o.isVid);
      return '<button class="ol-tile gnr" data-genre="' + o.esc(x) + '"><img class="gimg" alt="" referrerpolicy="no-referrer"><span>' + o.esc(x) + "</span><small>" + pl(by[x].length, "Collection") + " \xB7 " + pl(m, "File") + "</small></button>";
    }).join("");
    paint();
  } };
})();
