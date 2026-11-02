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
import java.util.HashMap;
import java.util.Map;
import java.util.zip.GZIPInputStream;

/**
 * Serves the bundled www/ tree (and optional filesDir refresh cache) for
 * collection.faneditfanclub.com requests so Fire TV launches from local shell,
 * art, sfx, and tile-preview clips. Full fan-edit videos are never bundled —
 * Drive /api/stream URLs always hit the network.
 */
final class LocalAssets {
    static final String HOST = "collection.faneditfanclub.com";
    private static final String ASSET_ROOT = "www";

    private final Context ctx;
    private final File cacheDir;

    LocalAssets(Context ctx) {
        this.ctx = ctx.getApplicationContext();
        this.cacheDir = new File(ctx.getFilesDir(), "www_refresh");
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
        // strip leading slash
        String rel = path.startsWith("/") ? path.substring(1) : path;
        // query-less; ignore ?v= cache busters
        try {
            InputStream in = openRel(rel);
            if (in == null && "data/index.json".equals(rel)) {
                // Bundled as gzip only
                InputStream gz = openRel("data/index.json.gz");
                if (gz != null) {
                    in = new GZIPInputStream(new BufferedInputStream(gz));
                    return response("application/json", in);
                }
            }
            if (in == null) return null;
            return response(mimeFor(rel), in);
        } catch (IOException e) {
            return null;
        }
    }

    private InputStream openRel(String rel) throws IOException {
        // Prefer refreshed cache overlay
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
                    "data/people.json", "data/folderthumbs.json", "data/posters.json",
                    "data/mosaic.json", "data/folder-sfx.json", "data/genres.json",
                    "data/genreart.json", "VERSION"
            };
            for (String path : paths) {
                try {
                    java.net.URL url = new java.net.URL("https://" + HOST + "/" + path);
                    java.net.HttpURLConnection c = (java.net.HttpURLConnection) url.openConnection();
                    c.setConnectTimeout(8000);
                    c.setReadTimeout(15000);
                    c.setRequestProperty("User-Agent", "FEFC-FireTV/" + BuildConfig.VERSION_NAME);
                    if (c.getResponseCode() != 200) { c.disconnect(); continue; }
                    File out = new File(cacheDir, path);
                    File parent = out.getParentFile();
                    if (parent != null && !parent.exists()) parent.mkdirs();
                    File tmp = new File(out.getPath() + ".tmp");
                    try (InputStream in = c.getInputStream();
                         java.io.FileOutputStream fos = new java.io.FileOutputStream(tmp)) {
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = in.read(buf)) > 0) fos.write(buf, 0, n);
                    }
                    //noinspection ResultOfMethodCallIgnored
                    tmp.renameTo(out);
                    c.disconnect();
                } catch (Exception first) {
                    // one backoff retry per path
                    try { Thread.sleep(400); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
                    try {
                        java.net.URL url2 = new java.net.URL("https://" + HOST + "/" + path);
                        java.net.HttpURLConnection c2 = (java.net.HttpURLConnection) url2.openConnection();
                        c2.setConnectTimeout(10000);
                        c2.setReadTimeout(20000);
                        c2.setRequestProperty("User-Agent", "FEFC-FireTV/" + BuildConfig.VERSION_NAME);
                        if (c2.getResponseCode() == 200) {
                            File out = new File(cacheDir, path);
                            File parent = out.getParentFile();
                            if (parent != null && !parent.exists()) parent.mkdirs();
                            File tmp = new File(out.getPath() + ".tmp");
                            try (InputStream in = c2.getInputStream();
                                 java.io.FileOutputStream fos = new java.io.FileOutputStream(tmp)) {
                                byte[] buf = new byte[8192];
                                int n;
                                while ((n = in.read(buf)) > 0) fos.write(buf, 0, n);
                            }
                            //noinspection ResultOfMethodCallIgnored
                            tmp.renameTo(out);
                        }
                        c2.disconnect();
                    } catch (Exception ignored) {}
                }
            }
        }, "fefc-bundle-refresh").start();
    }
}
