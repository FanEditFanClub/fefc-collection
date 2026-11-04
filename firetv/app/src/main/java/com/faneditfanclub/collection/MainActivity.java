package com.faneditfanclub.collection;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.media.AudioManager;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.webkit.JavascriptInterface;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Fire TV wrapper: loads START_URL (same origin) while shouldInterceptRequest serves
 * bundled www/ assets (shell, art, sfx, tile clips, intro) locally. Full fan edits stream.
 */
public class MainActivity extends Activity {
    private static final String HOST = "collection.faneditfanclub.com";
    private DeviceTier deviceTier;

    private WebView web;
    private int upgradedFrom = 0;
    private FrameLayout root;
    private View customView;
    private WebChromeClient.CustomViewCallback customCb;
    private LinearLayout offline;
    private Button retry;
    private boolean failed;
    private long lastBack;
    private Chrome chrome;
    private Updater updater;
    private LocalAssets localAssets;
    private final Handler ui = new Handler(Looper.getMainLooper());
    /** Native Media3 intro overlay; null when not playing / already finished. */
    private NativeIntro nativeIntro;
    private boolean nativeIntroUsed;
    private AudioManager audioManager;
    private final AudioManager.OnAudioFocusChangeListener audioFocusListener =
            this::onAudioFocusChange;
    private boolean holdingAudioFocus;
    /** True after we have suspended web/native audio for background; cleared on resume. */
    private boolean audioSuspended;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        deviceTier = DeviceTier.detect(this);
        try {
            String force = getIntent() != null ? getIntent().getStringExtra("tier") : null;
            if (force != null && force.matches("(?i)LOW|MID|HIGH")) {
                deviceTier = deviceTier.withOverride(force);
                Log.i("FEFC", "device_tier_force_early " + deviceTier.toJson());
            }
        } catch (Throwable ignored) {}
        Log.i("FEFC", "device_tier " + deviceTier.toJson());
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);
        hideSystemUi();

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        configure(web);
        /* HTTP cache only. localStorage / IndexedDB hold the sync token and My List.
           deleteAllData() on a versionCode bump is what unpaired TVs after 0.8.19 → 0.8.21. */
        SyncVault.migrateLegacy(this);
        SyncVault.deviceId(this);
        SharedPreferences prefs = getSharedPreferences("fefc", MODE_PRIVATE);
        int lastCleared = prefs.getInt("clearedForVersion", 0);
        upgradedFrom = lastCleared;
        if (lastCleared != BuildConfig.VERSION_CODE) {
            try { web.clearCache(true); } catch (Exception ignored) {}
            try { web.clearFormData(); } catch (Exception ignored) {}
            prefs.edit().putInt("clearedForVersion", BuildConfig.VERSION_CODE).apply();
        }
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        buildOfflineView();
        setContentView(root);

        web.setWebViewClient(new Client());
        chrome = new Chrome();
        web.setWebChromeClient(chrome);
        localAssets = new LocalAssets(this);
        localAssets.setOnCatalogRefreshed(() -> ui.post(() -> {
            if (web == null) return;
            web.evaluateJavascript(
                    "try{if(typeof softRefresh==='function')softRefresh();else if(typeof loadIndex==='function')loadIndex(true)}catch(e){}",
                    null);
        }));
        updater = new Updater(this);
        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
        requestAudioFocus();

        // Cold start: native Media3 intro fullscreen FIRST; WebView preloads underneath with ?nointro=1.
        // Process restore (b != null): skip native intro — user already saw it this session.
        // QA: am start --ez skip_native_intro true (emulator tier tests).
        boolean skipNative = false;
        try {
            skipNative = getIntent() != null && getIntent().getBooleanExtra("skip_native_intro", false);
        } catch (Throwable ignored) {}
        if (b == null && !skipNative) {
            nativeIntroUsed = true;
            nativeIntro = new NativeIntro(this, root, skipped -> {
                // NativeIntro.finish already released ExoPlayer before this callback.
                nativeIntro = null;
                Log.i("FEFC", "native_intro_done skipped=" + skipped + " — waiting for WebView Home first paint");
                waitHomeThenReveal(0);
            });
            nativeIntro.start();
            load(true); // nointro=1 so the CSS/WebView intro never runs
            updater.prefetch();
            localAssets.refreshDataInBackground();
            // Do NOT poll web INTRO_DONE_JS — native finish drives revealAfterIntro.
        } else if (b == null) {
            Log.i("FEFC", "skip_native_intro=true — load WebView home directly");
            load(true);
            updater.prefetch();
            localAssets.refreshDataInBackground();
            waitHomeThenReveal(0);
        } else {
            web.restoreState(b);
            web.requestFocus();
        }
    }

    /**
     * True only once the page has actually finished (or skipped) its intro.
     * A missing #intro before the document has the intro-done / no-intro class is "still loading", not "intro over",
     * so the update dialog cannot pop up on a blank page and then sit through the intro.
     */
    /** Drop any leftover service worker so LocalAssets (bundled www) always wins over a stale SW cache. */
    private static final String KILL_SW_JS =
            "(function(){try{if(!('serviceWorker' in navigator))return 'nosw';"
            + "navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister()});});"
            + "if(window.caches){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k)})});}"
            + "return 'ok'}catch(e){return 'err'}})()";

        private static final String INTRO_DONE_JS =
            "(function(){try{var b=document.body;if(!b||!b.classList)return false;"
            + "if(b.classList.contains('intro-done')||b.classList.contains('no-intro'))return true;"
            + "var i=document.getElementById('intro');"
            + "return !!(i&&(i.classList.contains('done')||i.hidden));}catch(e){return false}})()";

    /** True once Hub/mosaic first tiles have decoded behind the native intro. */
    private static final String HOME_READY_JS =
            "(function(){try{return!!window.__fefcHomePaintReady}catch(e){return false}})()";

    /** Fade Home in only after first paint is ready; starts 5s frame probe. */
    private static final String REVEAL_HOME_JS =
            "(function(){try{if(window.__fefcRevealHome)return window.__fefcRevealHome();"
            + "document.body.classList.remove('native-waiting');document.body.classList.add('home-revealed');"
            + "return 'fallback'}catch(e){return String(e)}})()";

    /** Poll until the intro has handed off (or ~60 s, for a page that never loads), then show a pending update. The check itself is already running. */
    private void waitForIntroThenReveal(final int tries) {
        ui.postDelayed(() -> {
            if (isFinishing() || web == null) return;
            web.evaluateJavascript(INTRO_DONE_JS, val -> {
                if ("true".equals(val) || tries >= 90) updater.revealAfterIntro();
                else waitForIntroThenReveal(tries + 1);
            });
        }, tries == 0 ? 200 : 700);
    }

    /**
     * After native ExoPlayer intro tears down: wait until WebView Home (index + first mosaic tiles)
     * is paint-ready, then fade it in. Cap ~8s so a slow parse still reveals. Media3 prewarm is
     * delayed so it does not fight mosaic tile decoders on the Cube.
     */
    private void waitHomeThenReveal(final int tries) {
        ui.postDelayed(() -> {
            if (isFinishing() || web == null) return;
            web.evaluateJavascript(HOME_READY_JS, val -> {
                boolean ready = "true".equals(val);
                if (ready || tries >= 40) {
                    Log.i("FEFC", "home_reveal ready=" + ready + " tries=" + tries);
                    web.evaluateJavascript(REVEAL_HOME_JS, r ->
                            Log.i("FEFC", "home_reveal_js=" + r));
                    web.requestFocus();
                    if (updater != null) updater.revealAfterIntro();
                    // Tier QA: kick mosaic + dump decoder budget to logcat (Bridge.log).
                    ui.postDelayed(() -> {
                        if (web == null) return;
                        web.evaluateJavascript(
                                "(function(){try{"
                                        + "document.body.classList.remove('native-waiting');"
                                        + "try{window.dispatchEvent(new Event('fefc-home-revealed'))}catch(e){}"
                                        + "try{window.dispatchEvent(new Event('fefc-tier'))}catch(e){}"
                                        + "var t=window.__fefcTier||null;"
                                        + "var vt=(window.FEFCNative&&FEFCNative.videoTiles)?FEFCNative.videoTiles():(t&&t.videoTiles);"
                                        + "var s=(typeof __clipStats==='function')?__clipStats():null;"
                                        + "var line='FEFC_CLIPS_DUMP tier='+(t&&t.tier||'?')+' nativeVT='+vt+' stats='+JSON.stringify(s);"
                                        + "console.log(line);"
                                        + "try{if(window.FEFCNative&&FEFCNative.log)FEFCNative.log(line)}catch(e){}"
                                        + "return line;"
                                        + "}catch(e){return 'err:'+e}})()",
                                r -> Log.i("FEFC", "clips_dump_cb " + r));
                    }, 2500);
                    // Release path already dropped intro ExoPlayer; delay prewarm past first mosaic wave.
                    ui.postDelayed(this::prewarmPlayer, 5000);
                } else {
                    waitHomeThenReveal(tries + 1);
                }
            });
        }, tries == 0 ? 80 : 200);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (updater != null) updater.onActivityResult(req);
    }


    /** Build+release a tiny ExoPlayer so Media3 codecs/JNI are warm before the first Play. */
    private void prewarmPlayer() {
        new Thread(() -> {
            try {
                final androidx.media3.exoplayer.ExoPlayer p = new androidx.media3.exoplayer.ExoPlayer.Builder(MainActivity.this).build();
                ui.post(() -> {
                    try { p.release(); } catch (Exception ignored) {}
                });
                Log.i("FEFC", "media3_prewarm_ok");
            } catch (Throwable t) {
                Log.i("FEFC", "media3_prewarm_skip: " + t.getMessage());
            }
        }, "fefc-prewarm").start();
    }

    private void configure(WebView w) {
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // embedded Drive player can start without a prior tap
        s.setAllowContentAccess(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT); // site Cache-Control; also clearCache on VERSION_CODE change
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setAllowFileAccess(false);
        // Cap layout viewport by device tier: LOW→720p (Toshiba/Stick Lite), MID/HIGH→1080p.
        try {
            if (deviceTier == null) deviceTier = DeviceTier.detect(this);
            float dens = getResources().getDisplayMetrics().density;
            int hPx = getResources().getDisplayMetrics().heightPixels;
            int targetH = deviceTier != null ? deviceTier.webViewTargetH : 1080;
            if (hPx > targetH + 40 && dens > 0f) {
                int scale = Math.max(40, Math.min(100, Math.round(targetH * dens * 100f / hPx)));
                w.setInitialScale(scale);
                Log.i("FEFC", "webview_scale targetH=" + targetH + " scale=" + scale + " tier=" + deviceTier.tier);
            }
        } catch (Throwable ignored) {}
        // "Android TV" makes the web app switch on its TV layout and focus navigation.
        s.setUserAgentString(s.getUserAgentString() + " Android TV FEFCFireTV/" + BuildConfig.VERSION_NAME);
        w.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        // 0.8.18: keep Chromium renderer at high priority while visible (Android 8+).
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                w.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
            }
        } catch (Throwable ignored) {}
        try {
            java.lang.reflect.Method m = WebView.class.getMethod("setOffscreenPreRaster", boolean.class);
            m.invoke(w, true);
        } catch (Throwable ignored) {}
        w.setBackgroundColor(0xFF000000);
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(w, true);
        w.addJavascriptInterface(new Bridge(), "FEFCNative");
    }

    private void load() { load(nativeIntroUsed); }

    private void load(boolean skipWebIntro) {
        failed = false;
        offline.setVisibility(View.GONE);
        web.setVisibility(View.VISIBLE);
        // apk=versionCode so the first document request bypasses any edge/WebView cache keyed only on ?tv=1
        String url = BuildConfig.START_URL;
        url += (url.contains("?") ? "&" : "?") + "apk=" + BuildConfig.VERSION_CODE;
        if (skipWebIntro) url += "&nointro=1";
        // Emulator / QA: am start --es tier LOW|MID|HIGH forces mosaic decoder budget.
        try {
            String force = getIntent() != null ? getIntent().getStringExtra("tier") : null;
            if (force != null && force.matches("(?i)LOW|MID|HIGH")) {
                deviceTier = DeviceTier.detect(this).withOverride(force);
                url += "&tier=" + deviceTier.tier;
                Log.i("FEFC", "device_tier_force " + deviceTier.toJson());
            }
            if (getIntent() != null && getIntent().getBooleanExtra("perfhud", false)) {
                url += "&perfhud=1";
            }
            // QA: am start --es route people|/f/<id>|#/people appends hash after load params
            String route = getIntent() != null ? getIntent().getStringExtra("route") : null;
            if (route != null && !route.isEmpty()) {
                if (route.startsWith("#")) url += route;
                else if (route.startsWith("/")) url += "#" + route;
                else url += "#/" + route;
            }
        } catch (Throwable ignored) {}
        web.loadUrl(url);
    }

    private boolean online() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            return cm.getActiveNetworkInfo() != null && cm.getActiveNetworkInfo().isConnected();
        } catch (Exception e) {
            return true;
        }
    }

    private void buildOfflineView() {
        offline = new LinearLayout(this);
        offline.setOrientation(LinearLayout.VERTICAL);
        offline.setGravity(Gravity.CENTER);
        offline.setBackgroundColor(Color.BLACK);
        TextView t = new TextView(this);
        t.setText("Can't reach FEFC Collection");
        t.setTextColor(0xFFFF9900);
        t.setTextSize(34);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setGravity(Gravity.CENTER);
        TextView m = new TextView(this);
        m.setText("Check that your Fire TV is connected to the internet, then try again.");
        m.setTextColor(0xFFCCCCCC);
        m.setTextSize(20);
        m.setGravity(Gravity.CENTER);
        m.setPadding(0, 24, 0, 40);
        retry = new Button(this);
        retry.setText("Retry");
        retry.setTextSize(22);
        retry.setFocusable(true);
        retry.setOnClickListener(v -> load());
        offline.addView(t);
        offline.addView(m);
        offline.addView(retry, new LinearLayout.LayoutParams(360, ViewGroup.LayoutParams.WRAP_CONTENT));
        offline.setVisibility(View.GONE);
        root.addView(offline, new FrameLayout.LayoutParams(-1, -1));
    }

    private void showOffline() {
        failed = true;
        web.setVisibility(View.INVISIBLE);
        offline.setVisibility(View.VISIBLE);
        retry.requestFocus();
    }

    private static boolean isGoogleAuth(Uri u) {
        String h = u.getHost() == null ? "" : u.getHost();
        return h.equals("accounts.google.com") || h.endsWith(".accounts.google.com");
    }

    private boolean isAppHost(Uri u) {
        return HOST.equalsIgnoreCase(u.getHost());
    }

    private void googleBlocked() {
        new AlertDialog.Builder(this)
                .setTitle("Use Sync My List on this TV")
                .setMessage("Google doesn't allow sign-in inside an app's built-in browser. To sync your list, "
                        + "open My List > Sync My List and use a Google TV code, a QR code, or a 6-digit sync code instead.")
                .setPositiveButton("OK", null)
                .show();
    }

    /** Opens a link outside the app (Silk or any browser). Falls back to the in-app WebView. */
    private void openExternal(Uri u) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, u);
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            web.loadUrl(u.toString());
        }
    }

    private boolean handleUrl(Uri u) {
        String scheme = u.getScheme() == null ? "" : u.getScheme();
        if (!scheme.equals("http") && !scheme.equals("https")) {
            return true; // ignore intent:, market: etc.
        }
        if (isGoogleAuth(u)) {
            googleBlocked();
            return true;
        }
        return false;
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            return handleUrl(r.getUrl());
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
            if (r == null || localAssets == null) return super.shouldInterceptRequest(v, r);
            if (!"GET".equalsIgnoreCase(r.getMethod())) return super.shouldInterceptRequest(v, r);
            try {
                WebResourceResponse local = localAssets.open(r.getUrl(), r.getRequestHeaders());
                if (local != null) return local;
            } catch (Exception ignored) {}
            return super.shouldInterceptRequest(v, r);
        }

        @Override
        public boolean onRenderProcessGone(WebView v, android.webkit.RenderProcessGoneDetail d) {
            // The WebView renderer died (memory pressure on the TV): rebuild instead of crashing the app.
            ui.post(() -> recreate());
            return true;
        }

        @Override
        public void onPageStarted(WebView v, String url, Bitmap f) {
            if (isAppHost(Uri.parse(url))) failed = false;
        }

        @Override
        public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
            if (r.isForMainFrame() && isAppHost(r.getUrl())) showOffline();
        }

        @Override
        public void onPageFinished(WebView v, String url) {
                try { v.evaluateJavascript(KILL_SW_JS, null); } catch (Exception ignored) {}
                try { injectDeviceTier(v); } catch (Exception ignored) {}

            if (!failed && isAppHost(Uri.parse(url))) {
                offline.setVisibility(View.GONE);
                web.setVisibility(View.VISIBLE);
            }
        }
    }

    private class Chrome extends WebChromeClient {
        /** target=_blank links and window.open (Open in Drive, doc links, sign-in popups). */
        @Override
        public boolean onCreateWindow(WebView v, boolean dialog, boolean gesture, android.os.Message msg) {
            WebView tmp = new WebView(MainActivity.this);
            tmp.setWebViewClient(new WebViewClient() {
                private boolean done;
                @Override
                public boolean shouldOverrideUrlLoading(WebView x, WebResourceRequest r) {
                    return route(x, r.getUrl());
                }
                @Override
                public void onPageStarted(WebView x, String url, Bitmap f) {
                    route(x, Uri.parse(url));
                }
                private boolean route(WebView x, Uri u) {
                    if (done || u == null || "about:blank".equals(u.toString())) return true;
                    done = true;
                    x.stopLoading();
                    ui.post(() -> {
                        x.destroy();
                        String s = u.getScheme() == null ? "" : u.getScheme();
                        if (!s.equals("http") && !s.equals("https")) return;
                        if (isGoogleAuth(u)) { googleBlocked(); return; }
                        if (isAppHost(u)) { web.loadUrl(u.toString()); return; }
                        openExternal(u); // Drive / Docs / etc: Silk if present, otherwise in this WebView
                    });
                    return true;
                }
            });
            ((WebView.WebViewTransport) msg.obj).setWebView(tmp);
            msg.sendToTarget();
            return true;
        }

        @Override
        public void onPermissionRequest(PermissionRequest r) {
            r.deny();
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback cb) {
            if (customView != null) { cb.onCustomViewHidden(); return; }
            customView = view;
            customCb = cb;
            root.addView(view, new FrameLayout.LayoutParams(-1, -1));
            web.setVisibility(View.INVISIBLE);
        }

        @Override
        public void onHideCustomView() {
            if (customView == null) return;
            root.removeView(customView);
            customView = null;
            if (customCb != null) customCb.onCustomViewHidden();
            web.setVisibility(View.VISIBLE);
            web.requestFocus();
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage m) {
            if (m == null) return true;
            String msg = m.message();
            if (msg != null && (msg.startsWith("FEFC_") || msg.startsWith("FEFC "))) {
                Log.i("FEFC", "console " + msg);
            }
            return true;
        }
    }

    private void injectDeviceTier(WebView v) {
        if (v == null) return;
        if (deviceTier == null) deviceTier = DeviceTier.detect(this);
        // deviceTier.toJson() is a JSON object literal — safe to embed (values are numbers/short strings).
        String js = "(function(){try{var t=" + deviceTier.toJson() + ";"
                + "window.__fefcTier=t;"
                + "var b=document.body;if(!b)return;"
                + "b.classList.remove('tier-low','tier-mid','tier-high','tier-lite');"
                + "b.classList.add('tier-'+(t.tier||'MID').toLowerCase());"
                + "if(t.reduceEffects)b.classList.add('tier-lite');"
                + "try{document.documentElement.dataset.tier=t.tier}catch(e){}"
                + "try{window.dispatchEvent(new CustomEvent('fefc-tier',{detail:t}))}catch(e){}"
                + "}catch(e){}})();";
        v.evaluateJavascript(js, null);
    }

    /** Small bridge for the web app (window.FEFCNative): tap inside the embedded Drive player, or play a Drive file natively. */
    private class Bridge {
        @JavascriptInterface
        /** App versionName for the web UI (e.g. home "v0.8.1 beta" badge). */
        public String version() { return BuildConfig.VERSION_NAME; }

        /** App versionCode for the web UI (Check for updates row). */
        @JavascriptInterface
        public int versionCode() { return BuildConfig.VERSION_CODE; }

        /** versionCode this install was upgraded from (0 = fresh install). Lets the web app offer a one-time sync re-pair after an upgrade. */
        @JavascriptInterface
        public int upgradedFrom() { return upgradedFrom; }

        /** Sync token, My List JSON, and the stable device id. Mirrored into localStorage before sync.js reads it. */
        @JavascriptInterface
        public String syncState() { return SyncVault.stateJson(MainActivity.this); }

        /** Write the WebView snapshot back. A blank tok clears the pairing and leaves deviceId in place. */
        @JavascriptInterface
        public void persistSync(String json) { SyncVault.persist(MainActivity.this, json); }

        /** Device tier JSON: {tier,videoTiles,ramMb,...}. Used by mosaic decoder caps. */
        @JavascriptInterface
        public String deviceTier() {
            if (deviceTier == null) deviceTier = DeviceTier.detect(MainActivity.this);
            return deviceTier.toJson();
        }

        /** Convenience: "LOW" | "MID" | "HIGH". */
        @JavascriptInterface
        public String tier() {
            if (deviceTier == null) deviceTier = DeviceTier.detect(MainActivity.this);
            return deviceTier.tier;
        }

        /** Simultaneous mosaic video-tile budget for this SoC. */
        @JavascriptInterface
        public int videoTiles() {
            if (deviceTier == null) deviceTier = DeviceTier.detect(MainActivity.this);
            return deviceTier.videoTiles;
        }

        @JavascriptInterface
        public void log(String msg) {
            Log.i("FEFC", msg == null ? "" : msg);
        }

        /** Show the soft keyboard for the WebView search field. SHOW_FORCED — Fire TV hides it otherwise. */
        @JavascriptInterface
        public void showSoftInput() {
            ui.post(() -> {
                if (web == null) return;
                web.requestFocus();
                final android.view.inputmethod.InputMethodManager imm =
                        (android.view.inputmethod.InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                if (imm == null) return;
                imm.showSoftInput(web, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT);
                // The WebView builds its input connection a beat after JS focuses the field; retry as FORCED (Fire TV hides it otherwise).
                ui.postDelayed(() -> {
                    if (web == null) return;
                    web.requestFocus();
                    imm.showSoftInput(web, android.view.inputmethod.InputMethodManager.SHOW_FORCED);
                }, 120);
            });
        }

        /** Lets the web app offer a manual "Check for app update" action. */
        @JavascriptInterface
        public void checkUpdate() { ui.post(() -> { if (updater != null) updater.check(true); }); }

        /** Taps the WebView at CSS-pixel (x, y); vw/vh are the page's innerWidth/innerHeight, used to scale to screen pixels. */
        @JavascriptInterface
        public void tap(final double x, final double y, final double vw, final double vh) {
            ui.post(() -> {
                if (customView != null || web == null || vw <= 0) return;
                float sc = (float) (web.getWidth() / vw);
                tapAt((float) (x * sc), (float) (y * sc));
            });
        }

        @JavascriptInterface
        public void playVideo(final String driveId, final String title) {
            playVideoWithOptions(driveId, title, null, null);
        }

        /** Native player with optional mime + sidecar subtitle URL (same-origin /api/stream/... .srt/.vtt). */
        @JavascriptInterface
        public void playVideoWithOptions(final String driveId, final String title, final String mime, final String subtitleUrl) {
            launchPlayer(driveId, title, null, mime, subtitleUrl);
        }

        /** Full-screen ExoPlayer. fileName supplies the extension so /api/stream serves video/x-matroska for .mkv. No user Google token. */
        @JavascriptInterface
        public void playVideoWithFile(final String driveId, final String title, final String fileName, final String subtitleUrl) {
            launchPlayer(driveId, title, fileName, mimeForName(fileName != null && !fileName.isEmpty() ? fileName : title), subtitleUrl);
        }

        private void launchPlayer(final String driveId, final String title, final String fileName, final String mime, final String subtitleUrl) {
            if (driveId == null || !driveId.matches("[A-Za-z0-9_-]{10,100}")) return;
            ui.post(() -> {
                Intent i = new Intent(MainActivity.this, PlayerActivity.class);
                i.putExtra("id", driveId);
                i.putExtra("title", title == null ? "" : title);
                if (fileName != null && !fileName.isEmpty()) i.putExtra("fileName", fileName);
                if (mime != null && !mime.isEmpty()) i.putExtra("mime", mime);
                if (subtitleUrl != null && !subtitleUrl.isEmpty()) {
                    i.putExtra("subtitleUrl", subtitleUrl);
                    String low = subtitleUrl.toLowerCase();
                    i.putExtra("subtitleMime", low.contains("vtt") ? "text/vtt" : "application/x-subrip");
                }
                startActivity(i);
            });
        }

        private static String mimeForName(String name) {
            String n = name == null ? "" : name.toLowerCase();
            if (n.endsWith(".mkv")) return "video/x-matroska";
            if (n.endsWith(".webm")) return "video/webm";
            if (n.endsWith(".mov")) return "video/quicktime";
            if (n.endsWith(".avi")) return "video/x-msvideo";
            if (n.endsWith(".mpg") || n.endsWith(".mpeg")) return "video/mpeg";
            if (n.endsWith(".m2ts") || n.endsWith(".ts")) return "video/mp2t";
            return "video/mp4";
        }

        /**
         * Open a Drive stream in VLC (Fire TV). Uses the same URLs as PlayerActivity:
         * prefer /api/stream/:id (Range proxy with server auth); setPackage VLC.
         * If VLC is missing, open its Amazon Appstore page. Does not change Drive sharing.
         */
        /** Derive a safe filename with video extension for VLC demuxer sniffing. */
        private static String vlcFileName(String driveId, String title, String fileName) {
            String raw = fileName != null && !fileName.isEmpty() ? fileName : (title != null ? title : "video.mp4");
            raw = raw.replaceAll("[\\/]+", "_").trim();
            if (!raw.matches("(?i).+\\.(mp4|m4v|mkv|webm|mov|avi|mpg|mpeg|m2ts|ts)$")) {
                raw = raw.replaceAll("\\.[^.]+$", "");
                if (raw.isEmpty()) raw = "video";
                raw = raw + ".mp4";
            }
            // ASCII-only path segment: spaces/parens break some VLC builds and over-encoding (%28) 502'd the worker.
            raw = raw.replaceAll("[^A-Za-z0-9._\\-]+", "_");
            if (raw.length() > 120) {
                int dot = raw.lastIndexOf('.');
                String ext = dot > 0 ? raw.substring(dot) : ".mp4";
                raw = raw.substring(0, Math.min(100, raw.length())) + ext;
            }
            return raw;
        }
        private static String vlcMime(String fileName) {
            String n = fileName == null ? "" : fileName.toLowerCase();
            if (n.endsWith(".mkv")) return "video/x-matroska";
            if (n.endsWith(".webm")) return "video/webm";
            if (n.endsWith(".mov")) return "video/quicktime";
            if (n.endsWith(".avi")) return "video/x-msvideo";
            if (n.endsWith(".mpg") || n.endsWith(".mpeg")) return "video/mpeg";
            if (n.endsWith(".m2ts") || n.endsWith(".ts")) return "video/mp2t";
            return "video/mp4";
        }
        @JavascriptInterface
        public void openInVlc(final String driveId, final String title) {
            openInVlc(driveId, title, null);
        }
        @JavascriptInterface
        public void openInVlc(final String driveId, final String title, final String fileName) {
            if (driveId == null || !driveId.matches("[A-Za-z0-9_-]{10,100}")) return;
            ui.post(() -> {
                final String PROXY = "https://collection.faneditfanclub.com/api/stream/";
                final String fname = vlcFileName(driveId, title, fileName);
                final String mime = vlcMime(fname);
                // Absolute https URL with a real file extension so VLC streams bytes (Range/206), not a playlist/HTML page.
                // fname already ASCII-safe; encode only residual unsafe bytes, leave . _ -
                final Uri uri = Uri.parse(PROXY + driveId + "/" + Uri.encode(fname, "._-"));
                final String uriStr = uri.toString();
                android.util.Log.i("FEFC-VLC", "openInVlc uri=" + uriStr + " mime=" + mime + " id=" + driveId);
                Toast.makeText(MainActivity.this, "VLC → " + uriStr, Toast.LENGTH_LONG).show();
                // Release WebView/ambience/atlas audio BEFORE VLC starts, then bring VLC's video activity forward.
                // setPackage-only let VLC's audio service play in the background on Fire TV Cube.
                quietThen(() -> startVlc(uri, title != null ? title : fname));
            });
        }


        /** Open a Drive file/folder view in the system browser (or Drive app if present). */
        @JavascriptInterface
        public void openInDrive(final String driveId, final String title) {
            if (driveId == null || !driveId.matches("[A-Za-z0-9_-]{10,100}")) return;
            ui.post(() -> {
                final Uri uri = Uri.parse("https://drive.google.com/file/d/" + driveId + "/view");
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW, uri);
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(i);
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(MainActivity.this, "No browser to open Drive", Toast.LENGTH_SHORT).show();
                }
            });
        }


    }

    private void tapAt(float x, float y) {
        long t = SystemClock.uptimeMillis();
        MotionEvent d = MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, x, y, 0);
        d.setSource(android.view.InputDevice.SOURCE_TOUCHSCREEN);
        web.dispatchTouchEvent(d);
        d.recycle();
        ui.postDelayed(() -> {
            long t2 = SystemClock.uptimeMillis();
            MotionEvent u = MotionEvent.obtain(t, t2, MotionEvent.ACTION_UP, x, y, 0);
            u.setSource(android.view.InputDevice.SOURCE_TOUCHSCREEN);
            web.dispatchTouchEvent(u);
            u.recycle();
        }, 70);
    }

    // ---- remote control mapping ----

    /** Dispatches a DOM keydown/keyup (with legacy keyCode) into the page. */
        private void sendKeyPhase(String key, int code, String phase) {
        String js = "(function(){var e=new KeyboardEvent('" + phase + "',{key:'" + key + "',bubbles:true,cancelable:true});"
                + "Object.defineProperty(e,'keyCode',{get:function(){return " + code + "}});"
                + "Object.defineProperty(e,'which',{get:function(){return " + code + "}});"
                + "(document.activeElement||document.body).dispatchEvent(e);})();";
        web.evaluateJavascript(js, null);
    }

    private void sendKey(String key, int code) {
        String js = "(function(){function f(t){var e=new KeyboardEvent(t,{key:'" + key + "',bubbles:true,cancelable:true});"
                + "Object.defineProperty(e,'keyCode',{get:function(){return " + code + "}});"
                + "Object.defineProperty(e,'which',{get:function(){return " + code + "}});"
                + "(document.activeElement||document.body).dispatchEvent(e);}f('keydown');f('keyup');})();";
        web.evaluateJavascript(js, null);

    }

    private void mediaToggle() {
        // keydown for the page's own handlers, plus play/pause on any <video>/<audio> in the top document.
        web.evaluateJavascript("(function(){document.querySelectorAll('video,audio').forEach(function(m){"
                + "if(m.paused){m.play&&m.play().catch(function(){})}else{m.pause()}})})();", null);
    }

    private void handleBack() {
        if (failed) { finish(); return; }
        // Close any modal/menu first (sync panel, TV menu, account menu, spot search, Read First).
        // Only when nothing was consumed: Home → double-Back exit toast; else send GoBack for in-app nav.
        web.evaluateJavascript("(function(){"
                + "try{if(typeof window.__fefcConsumeBack==='function'&&window.__fefcConsumeBack())return 'modal'}catch(e){}"
                + "var h=document.getElementById('home'),d=document.getElementById('details'),"
                + "p=document.getElementById('player'),rf=document.getElementById('rfpanel'),"
                + "b=document.body.classList,hash=(location.hash||'').replace(/^#\\/?/,'');"
                + "if(b.contains('sp-open')||b.contains('tvmenu-open')||b.contains('sp-lock'))return 'modal';"
                + "var sp=document.getElementById('syncpanel');if(sp&&!sp.hidden)return 'modal';"
                + "var tm=document.getElementById('tvmenu');if(tm&&!tm.hidden)return 'modal';"
                + "var am=document.querySelector('.acct-menu');if(am&&!am.hidden){am.hidden=true;return 'modal'}"
                + "if(!h||h.hidden)return 'nav';"
                + "if(b.contains('genres-mode'))return 'nav';"
                + "if(d&&!d.hidden)return 'nav';"
                + "if(p&&!p.hidden)return 'nav';"
                + "if(rf&&!rf.hidden)return 'nav';"
                + "if(hash&&hash!=='/')return 'nav';"
                + "return 'home'})()", val -> {
            // evaluateJavascript quotes string results: "\"modal\"" / "\"home\"" / "\"nav\""
            String r = val == null ? "" : val;
            if ("\"modal\"".equals(r) || "modal".equals(r)) {
                return; // overlay closed — Back consumed, never show exit toast
            }
            boolean atHome = "\"home\"".equals(r) || "home".equals(r);
            if (atHome) {
                long now = System.currentTimeMillis();
                if (now - lastBack < 2500) { finish(); return; }
                lastBack = now;
                Toast.makeText(this, "Press Back again to exit", Toast.LENGTH_SHORT).show();
            } else {
                sendKey("GoBack", 27);
            }
        });
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (nativeIntro != null && nativeIntro.isShowing()) {
            return nativeIntro.onKey(e);
        }
        int k = e.getKeyCode();
        if (customView != null) {
            // Fullscreen video from the embedded player: Back leaves fullscreen instead of quitting the app.
            if (k == KeyEvent.KEYCODE_BACK) {
                if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) chrome.onHideCustomView();
                return true;
            }
            return super.dispatchKeyEvent(e);
        }
        boolean down = e.getAction() == KeyEvent.ACTION_DOWN;
        switch (k) {
            case KeyEvent.KEYCODE_BACK:
                if (down && e.getRepeatCount() == 0) handleBack();
                return true;
            case KeyEvent.KEYCODE_MENU:
                // Fire TV Menu: forward keydown + keyup separately so JS can detect Menu-hold (≥3s → FPS HUD).
                // Short press still opens TV menu / stars via keyup path in app.js.
                if (!failed) {
                    if (down && e.getRepeatCount() == 0) sendKeyPhase("Menu", 82, "keydown");
                    else if (!down) sendKeyPhase("Menu", 82, "keyup");
                }
                return true;
            case KeyEvent.KEYCODE_BUTTON_Y:
                if (down && e.getRepeatCount() == 0 && !failed) sendKey("y", 89); // gamepad Y, also search
                return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                if (down && e.getRepeatCount() == 0 && !failed) { sendKey("MediaPlayPause", 179); mediaToggle(); }
                return true;
            case KeyEvent.KEYCODE_MEDIA_NEXT:
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                if (down && !failed) sendKey("MediaTrackNext", 176);
                return true;
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
            case KeyEvent.KEYCODE_MEDIA_REWIND:
                if (down && !failed) sendKey("MediaTrackPrevious", 177);
                return true;
            default:
                // D-pad and Select/Enter go straight to the WebView, which turns them into
                // ArrowUp/Down/Left/Right and Enter key events for the page's focus navigation.
                return super.dispatchKeyEvent(e);
        }
    }

    // ---- lifecycle ----

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    // ---- audio focus / background silence ----

    private static final String SUSPEND_AUDIO_JS =
            "(function(){try{"
            + "window.dispatchEvent(new Event('fefc-background'));"
            + "if(window.SFX&&typeof SFX.suspendAll==='function')SFX.suspendAll();"
            + "document.querySelectorAll('audio,video').forEach(function(el){try{el.pause()}catch(e){}});"
            + "if(window._rfx&&_rfx.state==='running')_rfx.suspend();"
            + "return 'ok'}catch(e){return String(e)}})()";

    /** Resume Web Audio / ambience only — never auto-start fan-edit PlayerActivity playback. */
    private static final String RESUME_AUDIO_JS =
            "(function(){try{"
            + "window.dispatchEvent(new Event('fefc-foreground'));"
            + "if(window.SFX&&typeof SFX.resumeAfterBackground==='function')SFX.resumeAfterBackground();"
            + "return 'ok'}catch(e){return String(e)}})()";

    private void onAudioFocusChange(int change) {
        Log.i("FEFC", "audiofocus change=" + change);
        if (change == AudioManager.AUDIOFOCUS_LOSS
                || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT
                || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
            ui.post(() -> suspendAppAudio("AUDIOFOCUS_" + change));
        }
    }

    private void requestAudioFocus() {
        if (audioManager == null) return;
        int r = audioManager.requestAudioFocus(
                audioFocusListener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN);
        holdingAudioFocus = (r == AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
        Log.i("FEFC", "audiofocus request granted=" + holdingAudioFocus);
    }

    private void abandonAudioFocus() {
        if (audioManager == null) return;
        try {
            audioManager.abandonAudioFocus(audioFocusListener);
        } catch (Exception ignored) {}
        holdingAudioFocus = false;
        Log.i("FEFC", "audiofocus abandoned");
    }

    /** Run JS pause first (it is async), then drop WebView audio focus, then launch. */
    private void quietThen(Runnable launch) {
        if (web == null) { launch.run(); return; }
        try {
            web.evaluateJavascript(SUSPEND_AUDIO_JS, v -> ui.post(() -> {
                try { web.onPause(); } catch (Exception ignored) {}
                try { web.pauseTimers(); } catch (Exception ignored) {}
                if (nativeIntro != null) { try { nativeIntro.pause(); } catch (Exception ignored) {} }
                abandonAudioFocus();
                audioSuspended = true;
                launch.run();
            }));
        } catch (Exception e) {
            abandonAudioFocus();
            launch.run();
        }
    }

    /**
     * Explicit VLC video activity so the player comes to the foreground (video+audio).
     * Chooser only when that component is not installed. Appstore if nothing can view the stream.
     */
    private void startVlc(Uri uri, String title) {
        final ComponentName video = new ComponentName(
                "org.videolan.vlc", "org.videolan.vlc.gui.video.VideoPlayerActivity");
        Intent explicit = new Intent(Intent.ACTION_VIEW);
        explicit.setComponent(video);
        explicit.setDataAndType(uri, "video/*");
        explicit.putExtra("title", title);
        explicit.putExtra("from_start", true);
        explicit.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        boolean componentKnown = false;
        try {
            getPackageManager().getActivityInfo(video, PackageManager.MATCH_DEFAULT_ONLY);
            componentKnown = true;
        } catch (PackageManager.NameNotFoundException ignored) { /* try start anyway; visibility can hide it */ }
        if (componentKnown) {
            try {
                startActivity(explicit);
                return;
            } catch (ActivityNotFoundException e) {
                Log.i("FEFC-VLC", "explicit VideoPlayerActivity missing at start");
            }
        } else {
            try {
                startActivity(explicit);
                return;
            } catch (ActivityNotFoundException e) {
                Log.i("FEFC-VLC", "explicit VideoPlayerActivity not present");
            }
        }
        Intent view = new Intent(Intent.ACTION_VIEW);
        view.setDataAndType(uri, "video/*");
        view.putExtra("title", title);
        view.putExtra("from_start", true);
        view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(Intent.createChooser(view, "Open with").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            return;
        } catch (ActivityNotFoundException e) { /* no handler */ }
        try {
            Intent store = new Intent(Intent.ACTION_VIEW, Uri.parse("amzn://apps/android?p=org.videolan.vlc"));
            store.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(store);
        } catch (ActivityNotFoundException e3) {
            try {
                Intent webStore = new Intent(Intent.ACTION_VIEW,
                        Uri.parse("https://www.amazon.com/gp/mas/dl/android?p=org.videolan.vlc"));
                webStore.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(webStore);
            } catch (Exception e4) {
                Toast.makeText(MainActivity.this, "Install VLC to use Open in VLC", Toast.LENGTH_LONG).show();
                resumeAppAudio();
            }
        }
    }

    /** Pause WebView media timers, native intro, and ask JS to suspend AudioContext + media elements. */
    private void suspendAppAudio(String reason) {
        Log.i("FEFC", "audio_suspend reason=" + reason);
        audioSuspended = true;
        if (nativeIntro != null) {
            try { nativeIntro.pause(); } catch (Exception ignored) {}
        }
        if (web != null) {
            try { web.onPause(); } catch (Exception ignored) {}
            try { web.pauseTimers(); } catch (Exception ignored) {}
            try { web.evaluateJavascript(SUSPEND_AUDIO_JS, null); } catch (Exception ignored) {}
        }
        abandonAudioFocus();
    }

    /** Foreground again: resume WebView; restore ambience via JS; do not launch fan-edit playback. */
    private void resumeAppAudio() {
        Log.i("FEFC", "audio_resume");
        requestAudioFocus();
        if (web != null) {
            try { web.resumeTimers(); } catch (Exception ignored) {}
            try { web.onResume(); } catch (Exception ignored) {}
        }
        if (nativeIntro != null && nativeIntro.isShowing()) {
            try { nativeIntro.resumeIfShowing(); } catch (Exception ignored) {}
        }
        if (web != null && audioSuspended) {
            try { web.evaluateJavascript(RESUME_AUDIO_JS, null); } catch (Exception ignored) {}
        }
        audioSuspended = false;
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumeAppAudio();
        // Coming back after a network drop: retry automatically (not during native intro).
        if (failed && online() && (nativeIntro == null || !nativeIntro.isShowing())) load();
    }

    @Override
    protected void onPause() {
        suspendAppAudio("onPause");
        super.onPause();
    }

    @Override
    protected void onStop() {
        // Belt-and-suspenders: Home / other apps may skip a clean onPause path on some Fire OS builds.
        suspendAppAudio("onStop");
        super.onStop();
    }

    @Override
    protected void onSaveInstanceState(Bundle b) {
        super.onSaveInstanceState(b);
        web.saveState(b);
    }

    @Override
    protected void onDestroy() {
        abandonAudioFocus();
        if (nativeIntro != null) {
            nativeIntro.releaseQuietly();
            nativeIntro = null;
        }
        if (updater != null) updater.dispose();
        root.removeAllViews();
        web.destroy();
        super.onDestroy();
    }
}
