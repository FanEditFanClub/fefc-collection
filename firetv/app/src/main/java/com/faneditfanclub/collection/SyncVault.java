package com.faneditfanclub.collection;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.util.UUID;

/**
 * Sync pairing kept outside the WebView. An APK update used to call
 * WebStorage.deleteAllData(), which wiped localStorage (fefcSrvTok and My List).
 * This prefs file is included in Android backup. The device id is created once
 * and never replaced, so a later restore call can ask the server for the same list.
 */
final class SyncVault {
    static final String PREF = "fefc_sync";
    private static final String LEGACY = "fefc";

    private SyncVault() {}

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREF, Context.MODE_PRIVATE);
    }

    /** Stable secret for this install. Never regenerated once written. */
    static String deviceId(Context c) {
        SharedPreferences p = prefs(c);
        String id = p.getString("deviceId", "");
        if (id == null || id.length() < 20) {
            SharedPreferences old = c.getApplicationContext().getSharedPreferences(LEGACY, Context.MODE_PRIVATE);
            id = old.getString("deviceId", "");
            if (id == null || id.length() < 20) {
                id = UUID.randomUUID().toString().replace("-", "")
                        + UUID.randomUUID().toString().replace("-", "");
            }
            p.edit().putString("deviceId", id).apply();
        }
        return id;
    }

    /** Copy any token that an older build stored under the legacy prefs name. */
    static void migrateLegacy(Context c) {
        SharedPreferences cur = prefs(c);
        if (cur.getString("tok", "").length() > 0) return;
        SharedPreferences old = c.getApplicationContext().getSharedPreferences(LEGACY, Context.MODE_PRIVATE);
        String tok = first(old, "tok", "fefcSrvTok", "syncTok");
        if (tok.isEmpty()) return;
        cur.edit()
                .putString("tok", tok)
                .putString("kind", first(old, "kind", "fefcSrvKind", "syncKind"))
                .putString("user", first(old, "user", "fefcSrvUser", "syncUser"))
                .putString("data", first(old, "data", "fefcUserData", "syncData"))
                .apply();
    }

    private static String first(SharedPreferences p, String... keys) {
        for (String k : keys) {
            String v = p.getString(k, "");
            if (v != null && !v.isEmpty()) return v;
        }
        return "";
    }

    static String stateJson(Context c) {
        migrateLegacy(c);
        SharedPreferences p = prefs(c);
        try {
            JSONObject o = new JSONObject();
            o.put("deviceId", deviceId(c));
            o.put("tok", p.getString("tok", ""));
            o.put("kind", p.getString("kind", ""));
            o.put("user", p.getString("user", ""));
            o.put("data", p.getString("data", ""));
            return o.toString();
        } catch (Exception e) {
            return "{\"deviceId\":\"" + deviceId(c) + "\"}";
        }
    }

    /** Remember a pairing. A blank tok does not erase deviceId. */
    static void persist(Context c, String json) {
        if (json == null || json.isEmpty()) return;
        try {
            JSONObject o = new JSONObject(json);
            SharedPreferences.Editor ed = prefs(c).edit();
            String dev = o.optString("deviceId", "");
            if (dev.length() >= 20 && prefs(c).getString("deviceId", "").isEmpty()) ed.putString("deviceId", dev);
            deviceId(c);
            if (o.has("tok")) ed.putString("tok", o.optString("tok", ""));
            if (o.has("kind")) ed.putString("kind", o.optString("kind", ""));
            if (o.has("user")) ed.putString("user", o.optString("user", ""));
            if (o.has("data")) ed.putString("data", o.optString("data", ""));
            ed.apply();
        } catch (Exception ignored) {}
    }
}
