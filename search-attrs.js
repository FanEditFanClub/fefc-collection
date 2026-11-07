/* Attribute search. A clause is required only when the query states it.
   "black & white Mel Brooks" matches an edit only when the black-and-white
   wording is in that edit's title/path/notes AND Mel Brooks is in its
   title or recorded director/cast/editor. No genre expansion. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FEFCAttrs = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var STOP = { the: 1, a: 1, an: 1, of: 1, and: 1, or: 1, for: 1, to: 1, in: 1, on: 1, edit: 1, fan: 1, cuts: 1, cut: 1 };
  var ATTRS = [
    { label: 'black & white', re: /\b(?:black\s*(?:and|&)\s*white|b\s*&\s*w|monochrome)\b/i, hit: /black\s*(?:and|&)?\s*white|\bb\s*&\s*w\b|monochrome/i }
  ];
  function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function search(q, records) {
    var raw = clean(q);
    var rest = raw;
    var attrs = [];
    ATTRS.forEach(function (a) {
      if (a.re.test(raw)) { attrs.push(a); rest = rest.replace(a.re, ' '); }
    });
    var words = clean(rest).toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length > 2 && !STOP[w]; });
    if (!attrs.length && words.length < 2) return { handled: false, results: [] };
    var results = [];
    var seen = {};
    (records || []).forEach(function (rec) {
      var blob = clean(rec.blob).toLowerCase();
      var people = clean(rec.people).toLowerCase();
      var i;
      for (i = 0; i < attrs.length; i++) if (!attrs[i].hit.test(blob)) return;
      for (i = 0; i < words.length; i++) {
        var w = words[i];
        if (people.indexOf(w) < 0 && blob.indexOf(w) < 0) return;
      }
      if (seen[rec.id]) return;
      seen[rec.id] = 1;
      var why = [];
      attrs.forEach(function (a) { why.push(a.label + ' is in the edit text'); });
      if (words.length) why.push(words.join(' ') + ' is in the title or recorded people');
      results.push({ id: rec.id, why: why.join('; ') });
    });
    return { handled: true, results: results };
  }
  return { search: search };
});
