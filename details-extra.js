(function() {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let E = { edits: {}, films: {}, map: {}, conf: {} }, FI = {};
  const ld = (u) => fetch(u).then((r) => r.ok ? r.json() : {}).catch(() => ({}));
  const ready = Promise.all([ld("data/editinfo.json").then((x) => {
    if (x && x.edits) E = x;
  }), ld("data/fileinfo.json").then((x) => {
    FI = x || {};
  })]);
  const NAMES = { "faneditfanclub@gmail.com": "Fan Edit Fan Club" };
  const owner = (e) => e ? NAMES[e] || e.split("@")[0] : "";
  const hs = (b) => b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : b >= 1e6 ? (b / 1e6).toFixed(0) + " MB" : b ? (b / 1e3).toFixed(0) + " KB" : "";
  const css = ".fx-sec{margin:14px 0 4px}.fx-kv{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0 0 6px;font-size:15px}.fx-kv dt{color:var(--l);font-family:Antonio,sans-serif;letter-spacing:.12em;text-transform:uppercase;font-size:13px;padding-top:2px}.fx-kv dd{margin:0;overflow-wrap:anywhere}\n.fx-ch{margin:4px 0 6px;padding-left:20px;font-size:15px;line-height:1.4}.fx-ch li{margin:3px 0}.fx-ch li::marker{color:var(--o)}.fx-q{border-left:6px solid var(--p);padding:4px 10px;background:#111;border-radius:0 14px 14px 0;margin:4px 0 8px}\n.fx-more{background:none;border:0;color:var(--o);font:inherit;cursor:pointer;padding:2px 0}.fx-low{color:#f9a;font-size:12px}.cast span.crew{border-left-color:var(--o)}\nbody.tv .fx-kv,body.tv .fx-ch{font-size:1.9vh}body.tv .fx-kv dt{font-size:1.6vh}";
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);
  function film(fid, tid) {
    const q = E.map[fid] || E.map[tid];
    return q && E.films[q] ? Object.assign({ fx: 1, low: !!(E.conf[fid] || E.conf[tid]) }, E.films[q]) : null;
  }
  function loc(f, ctx) {
    const its = ctx.items, ids = [];
    let x = f, g = 0;
    while (x && x.parent && g++ < 40) {
      ids.push(x.parent);
      if (x.parent === ctx.root) break;
      x = its.get(x.parent);
    }
    const names = ids.filter((i) => i !== ctx.root).map((i) => (its.get(i) || {}).name).filter(Boolean);
    return { parent: names[0], top: names[names.length - 1] };
  }
  function fileInfo(f, ctx) {
    const t = ctx.target(f), T = ctx.items.get(t) || {}, r = FI[t] || {}, size = r.s || +T.size || +f.size || 0, o = r.o, sc = !!(f.targetId && f.targetId !== f.id), L = loc(f, ctx);
    const host = sc ? "Shortcut \u2192 hosted by ".concat(esc(owner(o) || "another account")) : "Hosted directly in ".concat(esc(L.top || "Fan Edit Fan Club Collection"));
    return '<h3 class="lc-h b fx-sec" id="lc-fileinfo">File Info</h3><dl class="fx-kv">'.concat(size ? "<dt>Size</dt><dd>".concat(hs(size), "</dd>") : "", "<dt>Hosting</dt><dd>").concat(host, "</dd>").concat(o ? "<dt>Owner</dt><dd>".concat(esc(owner(o))).concat(owner(o) !== o ? ' <span class="src">'.concat(esc(o), "</span>") : "", "</dd>") : "").concat(L.parent ? "<dt>Folder</dt><dd>".concat(esc(L.top && L.top !== L.parent ? L.top + " \u203A " : "")).concat(esc(L.parent), "</dd>") : "", "</dl>");
  }
  function editHTML(e, F) {
    if (!e) return "";
    const link = '<a href="'.concat(esc(e.url), '" target="_blank" rel="noopener">').concat(esc(e.src || "FanEdit.org"), "</a>");
    const rt = e.runtime ? esc(e.runtime) + (e.origRuntime ? ' <span class="src">vs '.concat(esc(e.origRuntime), " original</span>") : F && F.runtime ? ' <span class="src">vs '.concat(F.runtime, " minutes original</span>") : "") : "";
    const info = [["Editor", e.editor && esc(e.editor)], ["Edit type", e.type && esc(e.type)], ["Released", e.released && esc(e.released)], ["Runtime", rt], ["IFDB rating", e.rating ? "".concat(e.rating, '/10 <span class="src">').concat(e.reviews || 0, " review").concat(e.reviews === 1 ? "" : "s", "</span>") : ""]].filter((x) => x[1]);
    const ch = e.changes || [], n = 8;
    return '<h3 class="lc-h fx-sec">Edit Info</h3><dl class="fx-kv">'.concat(info.map((x) => "<dt>".concat(x[0], "</dt><dd>").concat(x[1], "</dd>")).join(""), '</dl><p class="src">Source: ').concat(link, "</p>") + (e.synopsis || e.intention || e.details || ch.length ? '<h3 class="lc-h p fx-sec" id="lc-changes">Edit Notes \xB7 What\'s Changed</h3>'.concat(e.synopsis ? "<p>".concat(esc(e.synopsis), "</p>") : "").concat(e.intention ? '<p class="fx-q">'.concat(esc(e.intention), "</p>") : "").concat(e.details ? "<p>".concat(esc(e.details), "</p>") : "", "\n ").concat(ch.length ? '<ul class="fx-ch">'.concat(ch.map((c, i) => "<li".concat(i >= n ? " hidden" : "", ">").concat(esc(c), "</li>")).join(""), "</ul>").concat(ch.length > n ? '<button class="fx-more pill" data-fxmore>Show all '.concat(ch.length, " changes</button>") : "") : "", '<p class="src">From the editor\'s notes on ').concat(link, "</p>") : "");
  }
  function enhance(f, ctx, F) {
    const D = document.getElementById("details");
    if (!D || D.dataset.id !== f.id) return;
    const t = ctx.target(f), e = E.edits[f.id] || E.edits[t];
    const cols = D.querySelectorAll(".lc-body > div:not(.lc-head)"), L = cols[0], R = cols[1];
    if (!L) return;
    const h = document.createElement("div");
    h.className = "fx";
    h.innerHTML = editHTML(e, F);
    L.insertBefore(h, L.firstChild);
    if (e && e.synopsis) {
      const hs0 = [...L.querySelectorAll(".lc-h")].find((x) => /^Fan edit$/i.test(x.textContent));
      if (hs0) {
        let n = hs0.nextElementSibling;
        hs0.remove();
        while (n && !n.classList.contains("lc-h") && n.tagName === "P") {
          const k = n.nextElementSibling;
          n.remove();
          n = k;
        }
      }
    }
    const srcH = [...L.querySelectorAll(".lc-h")].find((x) => /^Source /.test(x.textContent));
    if (srcH && F && F.game) srcH.textContent = "Source game";
    if (F && F.plot && srcH) {
      const p = [...L.querySelectorAll("p")].find((x) => x.textContent === F.plot);
      if (p) {
        const o = document.createElement("h3");
        o.className = "lc-h l fx-sec";
        o.textContent = "Overview";
        p.before(o);
      }
    }
    if (F && F.game && srcH) {
      const pp = srcH.nextElementSibling;
      const kv = [["Developer", (F.developer || []).join(", ")], ["Platforms", (F.platforms || []).join(", ")], ["Released", F.year], ["Genre", (F.genres || []).join(", ")]].filter((x) => x[1]);
      if (pp && kv.length) {
        pp.innerHTML = "<b>".concat(esc(F.title), "</b>");
        pp.insertAdjacentHTML("afterend", '<dl class="fx-kv">'.concat(kv.map((x) => "<dt>".concat(x[0], "</dt><dd>").concat(esc(x[1]), "</dd>")).join(""), "</dl>"));
      }
    }
    if (F && F.low && srcH) srcH.insertAdjacentHTML("beforeend", ' <small class="fx-low">low-confidence match</small>');
    const cH = [...L.querySelectorAll(".lc-h")].find((x) => /^Cast$/.test(x.textContent));
    const dirs = F && F.director || [];
    if (cH) {
      cH.textContent = "Cast & Crew";
      const box = cH.nextElementSibling;
      if (box && dirs.length) box.insertAdjacentHTML("afterbegin", dirs.map((d) => '<span class="crew">'.concat(esc(d), " \xB7 Director</span>")).join(""));
    } else if (dirs.length) {
      L.insertAdjacentHTML("beforeend", '<h3 class="lc-h p fx-sec">Cast & Crew</h3><div class="cast">'.concat(dirs.map((d) => '<span class="crew">'.concat(esc(d), " \xB7 Director</span>")).join(""), "</div>"));
    }
    const rr = [...D.querySelectorAll(".rt a")].find((a) => /FanEdit\.org/.test(a.textContent));
    if (e && e.rating) {
      const html = '<span class="rn"><span>FanEdit.org IFDB<small>'.concat(e.reviews || 0, " user review").concat(e.reviews === 1 ? "" : "s").concat(e.trusted ? " \xB7 Trusted " + e.trusted : "", "</small></span></span><b>").concat(e.rating, "/10</b>");
      if (rr) {
        rr.querySelector("b").textContent = e.rating + "/10";
        const s = rr.querySelector("small");
        if (s) s.textContent = (e.reviews || 0) + " user reviews";
      } else {
        const rt = D.querySelector(".rt");
        if (rt) {
          const p = rt.querySelector("p.src");
          if (p) p.remove();
          rt.insertAdjacentHTML("beforeend", '<a class="rr" href="'.concat(esc(e.url), '" target="_blank" rel="noopener">').concat(html, "</a>"));
        }
      }
    }
    (R || L).insertAdjacentHTML("beforeend", fileInfo(f, ctx));
    D.querySelectorAll("[data-fxmore]").forEach((b) => b.addEventListener("click", () => {
      b.previousElementSibling.querySelectorAll("li[hidden]").forEach((x) => x.hidden = false);
      b.remove();
    }));
  }
  window.FEX = { ready, film, enhance, poster: (fid, tid) => {
    const F = film(fid, tid);
    return F && F.poster;
  } };
})();
