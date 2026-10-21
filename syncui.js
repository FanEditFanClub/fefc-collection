(function() {
  if (!window.FEFCSync) return;
  var F = window.FEFCSync;
  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, function(c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
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
  function paintChip(S) {
    var c = chip();
    if (!c) return;
    if (S.state === "out") {
      c.hidden = true;
      c.innerHTML = "";
      return;
    }
    c.hidden = false;
    var u = S.user || {}, ini = (u.name || u.email || "?").trim().charAt(0).toUpperCase();
    c.innerHTML = '<button class="acct-btn" aria-haspopup="true" title="' + esc(u.email || "Sync") + '">' + (u.picture ? '<img src="' + esc(u.picture) + '" alt="" referrerpolicy="no-referrer">' : "<span>" + esc(ini) + "</span>") + (S.state === "syncing" ? '<i class="acct-sp"></i>' : "") + '</button><div class="acct-menu" hidden><div class="acct-who">' + esc(u.name || "") + "<small>" + esc(u.email || (S.state === "reconnect" ? "Reconnect to resume sync" : "")) + "</small></div>" + (S.state === "reconnect" ? '<button class="mi" data-sync="in">Reconnect</button>' : '<button class="mi" data-sync="now">Sync now</button>') + '<button class="mi" data-sync="out">Sign out</button></div>';
  }
  function paintCard(S) {
    var el = document.getElementById("ml-sync");
    if (!el) return;
    var u = S.user || {};
    el.innerHTML = S.state === "out" ? '<div class="sync-card"><div><b>Sync your list</b><span>Keep stars and watch history in your own Google Drive, on every device.</span></div><button class="mi sync-go" data-sync="in">Sign in to sync</button></div>' : S.state === "reconnect" ? '<div class="sync-card"><div><b>Sync paused</b><span>Reconnect your Google account to resume syncing.</span></div><button class="mi sync-go" data-sync="in">Reconnect</button></div>' : '<div class="sync-card on"><div><b>' + (S.state === "syncing" ? "Syncing\u2026" : "Synced") + "</b><span>" + esc(u.email || "") + (S.error ? " \xB7 " + esc(S.error) : "") + '</span></div><button class="mi" data-sync="out">Sign out</button></div>';
  }
  F.subscribe(function(S) {
    paintChip(S);
    paintCard(S);
  });
  new MutationObserver(function() {
    if (document.getElementById("ml-sync") && !document.getElementById("ml-sync").childElementCount) paintCard(F.state);
  }).observe(document.getElementById("grid") || document.body, { childList: true, subtree: false });
  document.addEventListener("click", function(e) {
    var a = e.target.closest(".acct-btn");
    if (a) {
      var m = a.parentNode.querySelector(".acct-menu");
      m.hidden = !m.hidden;
      return;
    }
    var b = e.target.closest("[data-sync]");
    if (b) {
      var k = b.dataset.sync;
      if (k === "in") F.signIn();
      else if (k === "out") F.signOut();
      else F.syncNow();
      var mm = document.querySelector(".acct-menu");
      if (mm) mm.hidden = true;
      return;
    }
    var m2 = document.querySelector(".acct-menu");
    if (m2 && !m2.hidden && !e.target.closest("#acct")) m2.hidden = true;
  });
})();
