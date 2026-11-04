(function(root) {
  var KT = "fefcSrvTok", KU = "fefcSrvUser", KK = "fefcSrvKind", KD = "fefcUserData.v1", KDEV = "fefcDeviceId";
  function read(ls, k) {
    try {
      return ls.getItem(k);
    } catch (e) {
      return null;
    }
  }
  function write(ls, k, v) {
    if (v == null || v === "") {
      try {
        ls.removeItem(k);
      } catch (e) {
      }
      return;
    }
    ls.setItem(k, String(v));
  }
  function snapshot(ls) {
    return {
      tok: read(ls, KT) || "",
      kind: read(ls, KK) || "",
      user: read(ls, KU) || "",
      data: read(ls, KD) || "",
      deviceId: read(ls, KDEV) || ""
    };
  }
  function applyVault(ls, vault) {
    vault = vault || {};
    var had = !!read(ls, KT);
    if (!had && vault.tok) {
      write(ls, KT, vault.tok);
      if (vault.kind) write(ls, KK, vault.kind);
      if (vault.user) write(ls, KU, typeof vault.user === "string" ? vault.user : JSON.stringify(vault.user));
    }
    if (!read(ls, KD) && vault.data) write(ls, KD, typeof vault.data === "string" ? vault.data : JSON.stringify(vault.data));
    if (!read(ls, KDEV) && vault.deviceId) write(ls, KDEV, vault.deviceId);
    return { restored: !had && !!read(ls, KT), tok: read(ls, KT) || "", data: read(ls, KD) || "", deviceId: read(ls, KDEV) || "" };
  }
  var api = { applyVault, snapshot, KT, KU, KK, KD, KDEV };
  root.FEFCSyncKeep = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  try {
    if (root.FEFCNative && typeof root.FEFCNative.syncState === "function" && root.localStorage) {
      applyVault(root.localStorage, JSON.parse(root.FEFCNative.syncState() || "{}"));
    }
  } catch (e) {
  }
})(typeof window !== "undefined" ? window : globalThis);
