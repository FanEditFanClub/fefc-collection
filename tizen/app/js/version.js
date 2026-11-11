/* Same comparison as resources/lib/updateflow.py release_is_newer / version_key.
   '0.6 Beta' and '0.6.0' are one release. A higher build counts only when the labels match. */
(function (root) {
  function versionKey(label) {
    var text = String(label || '').replace(/\s*beta\s*$/i, '').trim();
    var nums = (text.match(/\d+/g) || []).map(function (n) { return parseInt(n, 10); });
    if (!nums.length) return [0, 0, 0];
    while (nums.length < 3) nums.push(0);
    return nums;
  }
  function releaseIsNewer(newVersion, newBuild, curVersion, curBuild) {
    var a = versionKey(newVersion), b = versionKey(curVersion);
    var n = Math.max(a.length, b.length), i, x, y;
    for (i = 0; i < n; i++) {
      x = a[i] || 0;
      y = b[i] || 0;
      if (x !== y) return x > y;
    }
    var nb = parseInt(newBuild, 10), cb = parseInt(curBuild, 10);
    if (isNaN(nb)) nb = 0;
    if (isNaN(cb)) cb = 0;
    return nb > cb;
  }
  var api = { versionKey: versionKey, releaseIsNewer: releaseIsNewer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FEFCVersion = api;
})(typeof window !== 'undefined' ? window : globalThis);
