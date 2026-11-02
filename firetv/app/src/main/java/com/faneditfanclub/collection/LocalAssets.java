package com.faneditfanclub.collection;

import android.content.Context;
import android.net.Uri;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceResponse;


import java.io.BufferedInputStream;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.GZIPInputStream;

/**
 * Serves the bundled www/ tree (and optional filesDir refresh cache) for
 * collection.faneditfanclub.com requests so Fire TV launches from local shell,
 * art, sfx, and tile-preview clips. Full fan-edit videos are never bundled —
 * Drive /api/stream URLs always hit the network.
 *
 * Catalog JSON (index/links/dates/added): newest remote wins. Bundled APK copy
 * is offline fallback only. Background refresh writes www_refresh overlay.
 */
final class LocalAssets {
    static final String HOST = "collection.faneditfanclub.com";
    private static final String ASSET_ROOT = "www";
    private static final String[] CATALOG_PATHS = {
            "data/index.json", "data/links.json", "data/dates.json", "data/added.json"
    };

    private final Context ctx;
    private final File cacheDir;
    private volatile Runnable onCatalogRefreshed;

    LocalAssets(Context ctx) {
        this.ctx = ctx.getApplicationContext();
        this.cacheDir = new File(ctx.getFilesDir(), "www_refresh");
    }

    /** Optional callback after a fresher index.json is saved (UI softRefresh). */
    void setOnCatalogRefreshed(Runnable r) { onCatalogRefreshed = r; }

    private static boolean isCatalog(String rel) {
        if (rel == null) return false;
        if ("data/index.json".equals(rel) || "data/index.json.gz".equals(rel)) return true;
        if ("data/links.json".equals(rel) || "data/dates.json".equals(rel) || "data/added.json".equals(rel)) return true;
        return false;
    }

    /** True for same-origin app GETs that may be answered from the APK bundle. */
    boolean canServe(Uri u) {
        if (u == null) return false;
        String host = u.getHost();
        if (host == null || !host.equalsIgnoreCase(HOST)) return false;
        String path = u.getPath();
        if (path == null) path = "/";
        // Never intercept streaming / API that must be live
        if (path.startsWith("/api/")) return false;
        if (path.startsWith("/firetv/")) return false; // version.json + APK download stay live
        return true;
    }

    WebResourceResponse open(Uri u) {
        if (!canServe(u)) return null;
        String path = u.getPath();
        if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";
        String rel = path.startsWith("/") ? path.substring(1) : path;
        try {
            if (isCatalog(rel)) {
                InputStream remote = tryFetchCatalog(rel);
                if (remote != null) return responseNoCache(mimeFor(rel), remote);
            }
            InputStream in = openRel(rel);
            if (in == null && "data/index.json".equals(rel)) {
                InputStream gz = openRel("data/index.json.gz");
                if (gz != null) {
                    in = new GZIPInputStream(new BufferedInputStream(gz));
                    return responseNoCache("application/json", in);
                }
            }
            if (in == null) return null;
            if (isCatalog(rel)) return responseNoCache(mimeFor(rel), in);
            return response(mimeFor(rel), in);
        } catch (IOException e) {
            return null;
        }
    }

    /**
     * Network-first for catalog: if remote generated >= local, use remote and cache it.
     * Returns null to fall back to www_refresh / bundled.
     */
    private InputStream tryFetchCatalog(String rel) {
        String fetchRel = "data/index.json.gz".equals(rel) ? "data/index.json" : rel;
        try {
            java.net.URL url = new java.net.URL("https://" + HOST + "/" + fetchRel);
            java.net.HttpURLConnection c = (java.net.HttpURLConnection) url.openConnection();
            c.setConnectTimeout(4000);
            c.setReadTimeout(20000);
            c.setRequestProperty("Cache-Control", "no-cache");
            c.setRequestProperty("User-Agent", "FEFC-FireTV/" + BuildConfig.VERSION_NAME);
            if (c.getResponseCode() != 200) { c.disconnect(); return null; }
            byte[] body;
            try (InputStream in = c.getInputStream()) {
                body = readAll(in);
            }
            c.disconnect();
            if (body == null || body.length < 2) return null;
            if ("data/index.json".equals(fetchRel) || "data/index.json.gz".equals(rel)) {
                String localGen = readGenerated(openRel("data/index.json"));
                if (localGen == null) {
                    try {
                        InputStream gz = openRel("data/index.json.gz");
                        if (gz != null) localGen = readGenerated(new GZIPInputStream(new BufferedInputStream(gz)));
                    } catch (Exception ignored) {}
                }
                String remoteGen = readGenerated(new ByteArrayInputStream(body));
                // Prefer remote whenever parseable; if both present, remote wins when >= local
                if (remoteGen != null && localGen != null && remoteGen.compareTo(localGen) < 0) {
                    // Stale remote (shouldn't happen) — keep local
                    return null;
                }
            }
            writeCache(fetchRel, body);
            return new ByteArrayInputStream(body);
        } catch (Exception e) {
            return null;
        }
    }

    private static String readGenerated(InputStream in) {
        if (in == null) return null;
        try {
            byte[] b = readAll(in);
            if (b == null) return null;
            String s = new String(b, 0, Math.min(b.length, 400), StandardCharsets.UTF_8);
            int i = s.indexOf("\"generated\"");
            if (i < 0) return null;
            int c = s.indexOf(':', i);
            int q1 = s.indexOf('"', c + 1);
            int q2 = s.indexOf('"', q1 + 1);
            if (q1 < 0 || q2 < 0) return null;
            return s.substring(q1 + 1, q2);
        } catch (Exception e) {
            return null;
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
        return bos.toByteArray();
    }

    private void writeCache(String rel, byte[] body) {
        try {
            File out = new File(cacheDir, rel);
            File parent = out.getParentFile();
            if (parent != null && !parent.exists()) parent.mkdirs();
            File tmp = new File(out.getPath() + ".tmp");
            try (java.io.FileOutputStream fos = new java.io.FileOutputStream(tmp)) {
                fos.write(body);
            }
            //noinspection ResultOfMethodCallIgnored
            tmp.renameTo(out);
        } catch (Exception ignored) {}
    }

    private InputStream openRel(String rel) throws IOException {
        File cached = new File(cacheDir, rel);
        if (cached.isFile() && cached.length() > 0) {
            return new BufferedInputStream(new FileInputStream(cached));
        }
        try {
            return new BufferedInputStream(ctx.getAssets().open(ASSET_ROOT + "/" + rel));
        } catch (IOException e) {
            return null;
        }
    }

    private static WebResourceResponse response(String mime, InputStream in) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Cache-Control", "public, max-age=86400");
        if (android.os.Build.VERSION.SDK_INT >= 21) {
            return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, in);
        }
        return new WebResourceResponse(mime, "UTF-8", in);
    }

    private static WebResourceResponse responseNoCache(String mime, InputStream in) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Cache-Control", "no-store, no-cache, must-revalidate");
        headers.put("Pragma", "no-cache");
        if (android.os.Build.VERSION.SDK_INT >= 21) {
            return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, in);
        }
        return new WebResourceResponse(mime, "UTF-8", in);
    }

    private static String mimeFor(String rel) {
        String lower = rel.toLowerCase();
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".js")) return "application/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json") || lower.endsWith(".json.gz")) return "application/json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".m4a")) return "audio/mp4";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".ogg")) return "audio/ogg";
        if (lower.endsWith(".mp4")) return "video/mp4";
        if (lower.endsWith(".webm")) return "video/webm";
        if (lower.endsWith(".ttf")) return "font/ttf";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".webmanifest") || lower.endsWith("manifest.json")) return "application/manifest+json";
        String ext = MimeTypeMap.getFileExtensionFromUrl(rel);
        String m = ext != null ? MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) : null;
        return m != null ? m : "application/octet-stream";
    }

    /** Best-effort background refresh of data JSON when online (non-blocking). */
    void refreshDataInBackground() {
        new Thread(() -> {
            String[] paths = {
                    "data/index.json", "data/links.json", "data/dates.json", "data/added.json",
                    "data/people.json", "data/folderthumbs.json", "data/posters.json",
                    "data/mosaic.json", "data/folder-sfx.json", "data/genres.json",
                    "data/genreart.json", "VERSION"
            };
            boolean indexUpdated = false;
            for (String path : paths) {
                try {
                    if (fetchOne(path)) {
                        if ("data/index.json".equals(path)) indexUpdated = true;
                    }
                } catch (Exception first) {
                    try { Thread.sleep(400); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
                    try { fetchOne(path); } catch (Exception ignored) {}
                }
            }
            if (indexUpdated) {
                Runnable cb = onCatalogRefreshed;
                if (cb != null) {
                    try { cb.run(); } catch (Exception ignored) {}
                }
            }
        }, "fefc-bundle-refresh").start();
    }

    private boolean fetchOne(String path) throws Exception {
        java.net.URL url = new java.net.URL("https://" + HOST + "/" + path);
        java.net.HttpURLConnection c = (java.net.HttpURLConnection) url.openConnection();
        c.setConnectTimeout(8000);
        // Index is multi-MB — allow longer read
        c.setReadTimeout(path.contains("index.json") ? 120000 : 20000);
        c.setRequestProperty("Cache-Control", "no-cache");
        c.setRequestProperty("User-Agent", "FEFC-FireTV/" + BuildConfig.VERSION_NAME);
        if (c.getResponseCode() != 200) { c.disconnect(); return false; }
        byte[] body;
        try (InputStream in = c.getInputStream()) {
            body = readAll(in);
        }
        c.disconnect();
        if (body == null || body.length < 2) return false;
        if ("data/index.json".equals(path)) {
            String localGen = null;
            try {
                File cached = new File(cacheDir, path);
                if (cached.isFile()) {
                    try (InputStream in = new FileInputStream(cached)) {
                        localGen = readGenerated(in);
                    }
                }
            } catch (Exception ignored) {}
            String remoteGen = readGenerated(new ByteArrayInputStream(body));
            if (remoteGen != null && localGen != null && remoteGen.compareTo(localGen) < 0) {
                return false; // keep newer local
            }
        }
        writeCache(path, body);
        return true;
    }
}
