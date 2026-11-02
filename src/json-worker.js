/* Off-main-thread JSON parse for large catalog files (Fire TV Cube main-thread budget). */
self.onmessage = function (e) {
  var d = e.data || {};
  var id = d.id;
  function ok(v) { self.postMessage({ id: id, ok: true, value: v }); }
  function fail(err) { self.postMessage({ id: id, ok: false, error: String(err && err.message || err) }); }
  try {
    if (d.text != null) {
      ok(JSON.parse(d.text));
      return;
    }
    if (!d.url) { fail('no url'); return; }
    fetch(d.url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.text();
    }).then(function (t) {
      ok(JSON.parse(t));
    }).catch(fail);
  } catch (err) { fail(err); }
};
