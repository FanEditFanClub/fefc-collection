package com.faneditfanclub.collection;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Minimal Android TV / Fire TV wrapper around the live FEFC Collection web app.
 * It always loads BuildConfig.START_URL, so site changes show up without a reinstall.
 */
public class MainActivity extends Activity {
    private static final String HOST = "collection.faneditfanclub.com";

    private WebView web;
    private FrameLayout root;
    private View customView;
    private WebChromeClient.CustomViewCallback customCb;
    private LinearLayout offline;
    private Button retry;
    private boolean failed;
    private long lastBack;
    private Chrome chrome;
    private Updater updater;
    private final Handler ui = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
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
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        buildOfflineView();
        setContentView(root);

        web.setWebViewClient(new Client());
        chrome = new Chrome();
        web.setWebChromeClient(chrome);
        if (b != null) web.restoreState(b); else load();
        web.requestFocus();
        updater = new Updater(this);
        if (b == null) {
            // Fetch version.json now, in parallel with the site intro. The dialog waits until the intro is gone.
            updater.prefetch();
            waitForIntroThenReveal(0);
        }
    }

    /**
     * True only once the page has actually finished (or skipped) its intro.
     * A missing #intro before the document has the intro-done / no-intro class is "still loading", not "intro over",
     * so the update dialog cannot pop up on a blank page and then sit through the intro.
     */
    private static final String INTRO_DONE_JS =
            "(function(){try{var b=document.body;if(!b||!b.classList)return false;"
            + "if(b.classList.contains('intro-done')||b.classList.contains('no-intro'))return true;"
            + "var i=document.getElementById('intro');"
            + "return !!(i&&(i.classList.contains('done')||i.hidden));}catch(e){return false}})()";

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

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (updater != null) updater.onActivityResult(req);
    }

    private void configure(WebView w) {
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // embedded Drive player can start without a prior tap
        s.setAllowContentAccess(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT); // honours the site's no-cache headers, so updates show
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setAllowFileAccess(false);
        // "Android TV" makes the web app switch on its TV layout and focus navigation.
        s.setUserAgentString(s.getUserAgentString() + " Android TV FEFCFireTV/" + BuildConfig.VERSION_NAME);
        w.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(w, true);
        w.addJavascriptInterface(new Bridge(), "FEFCNative");
    }

    private void load() {
        failed = false;
        offline.setVisibility(View.GONE);
        web.setVisibility(View.VISIBLE);
        web.loadUrl(BuildConfig.START_URL);
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
    }

    /** Small bridge for the web app (window.FEFCNative): tap inside the embedded Drive player, or play a Drive file natively. */
    private class Bridge {
        @JavascriptInterface
        /** App versionName for the web UI (e.g. home "v0.8.1 beta" badge). */
        public String version() { return BuildConfig.VERSION_NAME; }

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
            if (driveId == null || !driveId.matches("[A-Za-z0-9_-]{10,100}")) return;
            ui.post(() -> {
                Intent i = new Intent(MainActivity.this, PlayerActivity.class);
                i.putExtra("id", driveId);
                i.putExtra("title", title == null ? "" : title);
                startActivity(i);
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
        // Is the web app on its home screen? If so, Back twice quits; otherwise let the app go back.
        web.evaluateJavascript("(function(){var h=document.getElementById('home');return !!(h&&!h.hidden)})()", val -> {
            boolean atHome = "true".equals(val);
            if (atHome) {
                long now = System.currentTimeMillis();
                if (now - lastBack < 2500) { finish(); return; }
                lastBack = now;
                Toast.makeText(this, "Press Back again to exit", Toast.LENGTH_SHORT).show();
            } else {
                // The app's own back handler (closes player / details / folder), which uses history.back().
                sendKey("GoBack", 27);
            }
        });
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
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
                // Fire TV remote Menu (three lines) → DOM "Menu"; page toggles star/My List on the focused tile or detail. Not the letter R (also keyCode 82).
                if (down && e.getRepeatCount() == 0 && !failed) sendKey("Menu", 82);
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

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        // Coming back after a network drop: retry automatically.
        if (failed && online()) load();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle b) {
        super.onSaveInstanceState(b);
        web.saveState(b);
    }

    @Override
    protected void onDestroy() {
        if (updater != null) updater.dispose();
        root.removeAllViews();
        web.destroy();
        super.onDestroy();
    }
}
