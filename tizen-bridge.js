/* Runs only for the Tizen shell (?tizen=1 inside that iframe).
   Every other browser, including Fire TV, returns immediately. The intro video is not a #pvideo, so it is left alone. */
(function () {
  if (!/(?:[?&])tizen=1(?:&|$)/.test(location.search || '')) return;
  if (!window.parent || window.parent === window) return;

  var last = '';
  var using = false;
  var acked = false;

  function abs(url) {
    try { return new URL(url, location.href).href; } catch (e) { return url; }
  }
  function post(msg) {
    try { window.parent.postMessage(msg, '*'); } catch (e) {}
  }
  function player() { return document.getElementById('player'); }
  function video() { return document.getElementById('pvideo'); }

  window.addEventListener('message', function (ev) {
    var d = ev.data || {};
    if (!d.type) return;
    if (d.type === 'fefc-tizen-ack') {
      acked = true;
      using = true;
      var v = video();
      if (v) { try { v.pause(); } catch (e) {} v.muted = true; }
    } else if (d.type === 'fefc-tizen-nack') {
      acked = true;
      using = false;
    } else if (d.type === 'fefc-tizen-closed') {
      using = false;
      var b = document.getElementById('back');
      if (b) b.click();
    } else if (d.type === 'fefc-tizen-time' && d.id) {
      try {
        var p = +d.position || 0, dur = +d.duration || 0;
        if (p < 8 || (dur && p > dur - 15)) localStorage.removeItem('fefcPos:' + d.id);
        else localStorage.setItem('fefcPos:' + d.id, String(p));
      } catch (e) {}
    }
  });

  function announce(v, pl) {
    post({
      type: 'fefc-tizen-play',
      url: abs(v.dataset.stream),
      title: (document.getElementById('ptitle') || {}).textContent || '',
      id: (pl.dataset && pl.dataset.did) || ''
    });
  }

  function tick() {
    var pl = player();
    var v = video();
    if (!pl || pl.hidden || !v || !v.dataset || !v.dataset.stream) {
      if (using) { using = false; post({ type: 'fefc-tizen-stop' }); }
      last = '';
      return;
    }
    if (v.dataset.stream !== last) {
      last = v.dataset.stream;
      acked = false;
      using = false;
      announce(v, pl);
    }
  }

  function pokeReady() {
    var b = document.body;
    if (!b) return;
    if (b.classList.contains('intro-done') || b.classList.contains('no-intro')) post({ type: 'fefc-tizen-ready' });
  }

  setInterval(tick, 400);
  setInterval(pokeReady, 500);
})();
