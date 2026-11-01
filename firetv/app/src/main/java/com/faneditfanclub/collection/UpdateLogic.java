package com.faneditfanclub.collection;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * Pure-Java (no Android classes except org.json, which is also on the plain JVM test classpath) update logic:
 * parse version.json, compare versions, validate the download URL, download with progress, verify size and sha256.
 * Kept separate from Updater so it can be exercised on a build box without a device (see firetv/tests/UpdateLogicTest.java).
 */
final class UpdateLogic {
    private UpdateLogic() {}

    static String[] ALLOWED_HOSTS = {"collection.faneditfanclub.com"};

    static final class Info {
        int versionCode;
        String versionName = "";
        String url = "";
        String notes = "";
        long size;        // optional, 0 = unknown
        String sha256 = ""; // optional, hex
    }

    interface Progress { void onProgress(long done, long total); }

    /** Parses {versionCode, versionName, url, notes[, size, sha256]}; url may be relative to base. Returns null if unusable. */
    static Info parse(String json, String baseUrl) {
        try {
            JSONObject o = new JSONObject(json);
            Info i = new Info();
            i.versionCode = o.getInt("versionCode");
            i.versionName = o.optString("versionName", "");
            i.notes = o.optString("notes", "");
            i.size = o.optLong("size", 0);
            i.sha256 = o.optString("sha256", "").toLowerCase(Locale.US);
            String u = o.getString("url");
            i.url = baseUrl == null ? u : URI.create(baseUrl).resolve(u).toString();
            if (i.versionCode <= 0 || !urlAllowed(i.url)) return null;
            return i;
        } catch (Exception e) {
            return null;
        }
    }

    static boolean isNewer(Info i, int installedVersionCode) {
        return i != null && i.versionCode > installedVersionCode;
    }

    /** https only, and only our own host: a hijacked/edited version.json can't point the updater at someone else's server. */
    static boolean urlAllowed(String url) {
        try {
            URI u = URI.create(url);
            if (!"https".equalsIgnoreCase(u.getScheme()) || u.getHost() == null) return false;
            for (String h : ALLOWED_HOSTS) if (h.equalsIgnoreCase(u.getHost())) return true;
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    static HttpURLConnection open(String url, int timeoutMs) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setUseCaches(false);
        c.setConnectTimeout(timeoutMs);
        c.setReadTimeout(timeoutMs);
        c.setRequestProperty("Cache-Control", "no-cache, no-store");
        c.setRequestProperty("Pragma", "no-cache");
        c.setRequestProperty("User-Agent", "FEFCFireTV-Updater");
        return c;
    }

    /** GET a small text file, bypassing every cache (cache-busting query + no-cache headers). */
    static String fetchText(String url, int timeoutMs) throws IOException {
        String u = url + (url.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis();
        HttpURLConnection c = open(u, timeoutMs);
        try {
            if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode());
            InputStream in = c.getInputStream();
            java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0 && b.size() < 262144) b.write(buf, 0, n);
            return b.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }

    static final class Cancelled extends IOException { Cancelled() { super("cancelled"); } }

    /**
     * Downloads to dir/name via a .part file, then renames. Throws on HTTP error, short read, size/sha256 mismatch or cancel.
     * cancelled.get() is polled every chunk.
     */
    static File download(String url, File dir, String name, Info expect, Progress p,
                         java.util.concurrent.atomic.AtomicBoolean cancelled) throws Exception {
        if (!urlAllowed(url)) throw new IOException("blocked url");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("no dir");
        File part = new File(dir, name + ".part"), out = new File(dir, name);
        part.delete();
        HttpURLConnection c = open(url, 20000);
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try {
            if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode());
            long total = c.getContentLength();
            if (total <= 0 && expect != null) total = expect.size;
            long done = 0, lastTick = 0;
            try (InputStream in = c.getInputStream(); FileOutputStream fo = new FileOutputStream(part)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) {
                    if (cancelled != null && cancelled.get()) throw new Cancelled();
                    fo.write(buf, 0, n);
                    md.update(buf, 0, n);
                    done += n;
                    long now = System.currentTimeMillis();
                    if (p != null && now - lastTick > 100) { lastTick = now; p.onProgress(done, total); }
                }
                fo.getFD().sync();
            }
            if (cancelled != null && cancelled.get()) throw new Cancelled();
            if (total > 0 && done != total) throw new IOException("short download " + done + "/" + total);
            if (expect != null && expect.size > 0 && done != expect.size) throw new IOException("size mismatch");
            if (expect != null && expect.sha256.length() > 0 && !hex(md.digest()).equals(expect.sha256))
                throw new IOException("checksum mismatch");
            if (p != null) p.onProgress(done, total > 0 ? total : done);
            out.delete();
            if (!part.renameTo(out)) throw new IOException("rename failed");
            return out;
        } catch (Exception e) {
            part.delete();
            throw e;
        } finally {
            c.disconnect();
        }
    }

    static String hex(byte[] b) {
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x));
        return s.toString();
    }

    static String mb(long b) {
        return String.format(Locale.US, "%.1f MB", b / 1048576.0);
    }
}
