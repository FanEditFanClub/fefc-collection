package com.faneditfanclub.collection;

import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsServer;

import javax.net.ssl.*;
import java.io.File;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/** Device-free tests for UpdateLogic: run with firetv/tests/run-update-tests.sh (needs keytool, org.json jar). */
public class UpdateLogicTest {
    static int fail = 0, pass = 0;
    static void ok(boolean c, String name) { if (c) { pass++; System.out.println("PASS " + name); } else { fail++; System.out.println("FAIL " + name); } }

    public static void main(String[] a) throws Exception {
        String base = "https://collection.faneditfanclub.com/firetv/version.json";
        String good = "{\"versionCode\":7,\"versionName\":\"1.0.6\",\"url\":\"https://collection.faneditfanclub.com/firetv/FEFC-Collection.apk\",\"notes\":\"n\"}";
        UpdateLogic.Info i = UpdateLogic.parse(good, base);
        ok(i != null && i.versionCode == 7 && i.versionName.equals("1.0.6") && i.notes.equals("n"), "parse good");
        ok(UpdateLogic.isNewer(i, 6), "7 > 6 is newer");
        ok(!UpdateLogic.isNewer(i, 7), "7 == 7 not newer");
        ok(!UpdateLogic.isNewer(i, 8), "7 < 8 not newer");
        ok(!UpdateLogic.isNewer(null, 1), "null not newer");
        ok(UpdateLogic.parse("{\"versionCode\":7,\"url\":\"/firetv/FEFC-Collection.apk\"}", base).url.equals("https://collection.faneditfanclub.com/firetv/FEFC-Collection.apk"), "relative url resolved");
        ok(UpdateLogic.parse("{\"versionCode\":7,\"url\":\"http://collection.faneditfanclub.com/x.apk\"}", base) == null, "http rejected");
        ok(UpdateLogic.parse("{\"versionCode\":7,\"url\":\"https://evil.example.com/x.apk\"}", base) == null, "foreign host rejected");
        ok(UpdateLogic.parse("{\"versionCode\":7,\"url\":\"https://collection.faneditfanclub.com.evil.com/x.apk\"}", base) == null, "lookalike host rejected");
        ok(UpdateLogic.parse("{\"versionCode\":0,\"url\":\"https://collection.faneditfanclub.com/x.apk\"}", base) == null, "versionCode 0 rejected");
        ok(UpdateLogic.parse("not json", base) == null, "garbage rejected");
        ok(UpdateLogic.parse("{\"versionName\":\"x\"}", base) == null, "missing fields rejected");
        ok(UpdateLogic.parse("{\"versionCode\":9,\"url\":\"https://collection.faneditfanclub.com/x.apk\",\"sha256\":\"ABC\",\"size\":5}", base).sha256.equals("abc"), "sha256 lowercased");

        // The published firetv/version.json, if present, must parse and be consistent with the apk next to it.
        File vj = new File("version.json");
        if (vj.exists()) {
            UpdateLogic.Info p = UpdateLogic.parse(new String(Files.readAllBytes(vj.toPath()), "UTF-8"), base);
            ok(p != null, "published version.json parses");
            File apk = new File("FEFC-Collection.apk");
            if (p != null && apk.exists()) {
                // size 0 and an empty sha256 mean "fill these after assembleRelease signs the APK". Don't compare them to the previous binary.
                if (p.size <= 0 || p.sha256 == null || p.sha256.isEmpty()) {
                    ok(true, "version.json size/sha256 pending until the signed APK is published");
                } else {
                    ok(p.size == apk.length(), "version.json size == apk size");
                    ok(UpdateLogic.hex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(apk.toPath()))).equals(p.sha256), "version.json sha256 == apk sha256");
                }
            }
        }

        // ---- local HTTPS server (self-signed) standing in for the site
        String ks = a[0];
        KeyStore k = KeyStore.getInstance("PKCS12");
        try (java.io.FileInputStream fi = new java.io.FileInputStream(ks)) { k.load(fi, "testpass".toCharArray()); }
        KeyManagerFactory kmf = KeyManagerFactory.getInstance("SunX509");
        kmf.init(k, "testpass".toCharArray());
        SSLContext sc = SSLContext.getInstance("TLS");
        sc.init(kmf.getKeyManagers(), null, null);
        HttpsServer srv = HttpsServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        srv.setHttpsConfigurator(new HttpsConfigurator(sc));
        final byte[] apkBytes = new byte[3 * 1024 * 1024 + 123];
        new java.util.Random(1).nextBytes(apkBytes);
        final String[] seenHeaders = new String[2];
        final int[] versionCalls = {0};
        srv.createContext("/firetv/version.json", ex -> {
            versionCalls[0]++;
            seenHeaders[0] = ex.getRequestHeaders().getFirst("Cache-Control");
            seenHeaders[1] = ex.getRequestURI().getQuery();
            byte[] b = good.getBytes("UTF-8");
            ex.sendResponseHeaders(200, b.length); ex.getResponseBody().write(b); ex.close();
        });
        srv.createContext("/firetv/FEFC-Collection.apk", ex -> {
            ex.sendResponseHeaders(200, apkBytes.length);
            OutputStream o = ex.getResponseBody();
            for (int off = 0; off < apkBytes.length; off += 100000) { o.write(apkBytes, off, Math.min(100000, apkBytes.length - off)); o.flush(); try { Thread.sleep(2); } catch (Exception e) {} }
            ex.close();
        });
        srv.createContext("/firetv/short.apk", ex -> { ex.sendResponseHeaders(200, apkBytes.length); ex.getResponseBody().write(apkBytes, 0, 1000); ex.close(); }); // truncated
        srv.createContext("/firetv/missing.apk", ex -> { ex.sendResponseHeaders(404, -1); ex.close(); });
        srv.start();
        int port = srv.getAddress().getPort();
        // trust the self-signed cert + hostname for this test JVM only
        TrustManager[] all = {new X509TrustManager() { public void checkClientTrusted(X509Certificate[] c, String s) {} public void checkServerTrusted(X509Certificate[] c, String s) {} public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; } }};
        SSLContext cs = SSLContext.getInstance("TLS"); cs.init(null, all, null);
        HttpsURLConnection.setDefaultSSLSocketFactory(cs.getSocketFactory());
        HttpsURLConnection.setDefaultHostnameVerifier((h, s) -> true);
        UpdateLogic.ALLOWED_HOSTS = new String[]{"127.0.0.1"};
        String root = "https://127.0.0.1:" + port;

        String txt = UpdateLogic.fetchText(root + "/firetv/version.json", 3000);
        ok(txt.equals(good), "fetchText returns version.json");
        ok("no-cache, no-store".equals(seenHeaders[0]), "version.json fetched with Cache-Control no-cache");
        ok(seenHeaders[1] != null && seenHeaders[1].startsWith("t="), "version.json fetched with cache-busting query");
        try { UpdateLogic.fetchText(root + "/firetv/nope.json", 3000); ok(false, "404 throws"); } catch (java.io.IOException e) { ok(true, "404 throws"); }

        File dir = Files.createTempDirectory("upd").toFile();
        UpdateLogic.Info exp = new UpdateLogic.Info();
        exp.size = apkBytes.length; exp.sha256 = UpdateLogic.hex(MessageDigest.getInstance("SHA-256").digest(apkBytes));
        List<Integer> pcts = new ArrayList<>();
        File f = UpdateLogic.download(root + "/firetv/FEFC-Collection.apk", dir, "FEFC-Collection-7.apk", exp, (d, t) -> pcts.add((int) (d * 100 / t)), null);
        ok(f.exists() && f.length() == apkBytes.length && java.util.Arrays.equals(Files.readAllBytes(f.toPath()), apkBytes), "download complete + byte-identical");
        ok(!new File(dir, "FEFC-Collection-7.apk.part").exists(), ".part removed after success");
        ok(pcts.size() >= 2 && pcts.get(pcts.size() - 1) == 100, "progress callbacks reach 100% (" + pcts.size() + " ticks)");
        boolean mono = true; for (int x = 1; x < pcts.size(); x++) if (pcts.get(x) < pcts.get(x - 1)) mono = false;
        ok(mono, "progress monotonic");

        UpdateLogic.Info bad = new UpdateLogic.Info(); bad.sha256 = "00";
        try { UpdateLogic.download(root + "/firetv/FEFC-Collection.apk", dir, "bad.apk", bad, null, null); ok(false, "checksum mismatch throws"); }
        catch (java.io.IOException e) { ok(e.getMessage().contains("checksum") && !new File(dir, "bad.apk").exists() && !new File(dir, "bad.apk.part").exists(), "checksum mismatch throws, nothing left behind"); }
        try { UpdateLogic.download(root + "/firetv/short.apk", dir, "short.apk", null, null, null); ok(false, "truncated throws"); }
        catch (Exception e) { ok(!new File(dir, "short.apk").exists() && !new File(dir, "short.apk.part").exists(), "truncated download rejected, nothing left behind"); }
        try { UpdateLogic.download(root + "/firetv/missing.apk", dir, "m.apk", null, null, null); ok(false, "404 download throws"); }
        catch (Exception e) { ok(!new File(dir, "m.apk").exists(), "404 download rejected"); }
        AtomicBoolean cancel = new AtomicBoolean(false);
        try { UpdateLogic.download(root + "/firetv/FEFC-Collection.apk", dir, "c.apk", null, (d, t) -> { if (d > 500000) cancel.set(true); }, cancel); ok(false, "cancel throws"); }
        catch (UpdateLogic.Cancelled e) { ok(!new File(dir, "c.apk").exists() && !new File(dir, "c.apk.part").exists(), "cancel stops download, cleans up"); }
        UpdateLogic.ALLOWED_HOSTS = new String[]{"collection.faneditfanclub.com"};
        try { UpdateLogic.download(root + "/firetv/FEFC-Collection.apk", dir, "x.apk", null, null, null); ok(false, "foreign host blocked"); }
        catch (java.io.IOException e) { ok(e.getMessage().contains("blocked"), "download refuses non-allowed host"); }

        srv.stop(0);
        System.out.println(pass + " passed, " + fail + " failed");
        System.exit(fail == 0 ? 0 : 1);
    }
}
