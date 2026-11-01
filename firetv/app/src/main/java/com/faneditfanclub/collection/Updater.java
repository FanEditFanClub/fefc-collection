package com.faneditfanclub.collection;

import android.app.Activity;
import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * In-app updater. On launch it fetches /firetv/version.json (no cache); if versionCode is higher than the installed one it shows a
 * D-pad friendly Update / Later dialog, downloads the APK to the app's external files dir with a progress bar, verifies it
 * (package name, signing certificate, size/sha256) and hands it to the system installer through ApkProvider.
 * The APK must be signed with the same key as the installed app, otherwise Android refuses the update: that is also what keeps it safe.
 */
final class Updater {
    static final String VERSION_URL = "https://collection.faneditfanclub.com/firetv/version.json";
    static final int REQ_UNKNOWN_SOURCES = 4711;

    private final Activity act;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final float dp;
    private Dialog dlg;
    private UpdateLogic.Info pending;       // waiting for the "install unknown apps" permission
    private AtomicBoolean cancel = new AtomicBoolean(false);
    private volatile boolean busy;

    Updater(Activity a) {
        act = a;
        dp = a.getResources().getDisplayMetrics().density;
    }

    // ---------------------------------------------------------------- check

    /** @param manual true = the user asked (tell them when there is nothing new); false = silent check on launch. */
    void check(final boolean manual) {
        if (busy) return;
        busy = true;
        cleanOld();
        new Thread(() -> {
            UpdateLogic.Info i = null;
            try {
                i = UpdateLogic.parse(UpdateLogic.fetchText(VERSION_URL, 8000), VERSION_URL);
            } catch (Exception ignored) { /* offline / 404: stay silent */ }
            final UpdateLogic.Info found = i;
            ui.post(() -> {
                busy = false;
                if (act.isFinishing()) return;
                if (UpdateLogic.isNewer(found, BuildConfig.VERSION_CODE)) prompt(found);
                else if (manual) Toast.makeText(act, found == null ? "Couldn't check for updates" : "You have the latest version", Toast.LENGTH_LONG).show();
            });
        }, "fefc-update-check").start();
    }

    /** Delete downloaded APKs that are no longer newer than what is installed (after a successful update) and stale .part files. */
    private void cleanOld() {
        try {
            File[] fs = ApkProvider.dir(act).listFiles();
            if (fs == null) return;
            for (File f : fs) {
                String n = f.getName();
                if (n.endsWith(".part")) { f.delete(); continue; }
                java.util.regex.Matcher m = java.util.regex.Pattern.compile("FEFC-Collection-(\\d+)\\.apk").matcher(n);
                if (m.matches() && Integer.parseInt(m.group(1)) <= BuildConfig.VERSION_CODE) f.delete();
            }
        } catch (Exception ignored) { }
    }

    // ---------------------------------------------------------------- dialog

    private int px(int v) { return Math.round(v * dp); }

    private Dialog newDialog() {
        Dialog d = new Dialog(act);
        d.requestWindowFeature(Window.FEATURE_NO_TITLE);
        d.setCanceledOnTouchOutside(false);
        return d;
    }

    private LinearLayout box() {
        LinearLayout l = new LinearLayout(act);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(px(32), px(26), px(32), px(22));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xFF15151C);
        bg.setCornerRadius(px(14));
        bg.setStroke(px(2), 0xFFFF9900);
        l.setBackground(bg);
        return l;
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(act);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    /** A button with a clearly visible focus state for the D-pad (orange fill when focused). */
    private Button button(String label, View.OnClickListener l) {
        Button b = new Button(act);
        b.setText(label);
        b.setTextSize(20);
        b.setAllCaps(false);
        b.setFocusable(true);
        b.setFocusableInTouchMode(true);
        b.setPadding(px(26), px(10), px(26), px(10));
        StateListDrawable sl = new StateListDrawable();
        GradientDrawable f = new GradientDrawable();
        f.setColor(0xFFFF9900);
        f.setCornerRadius(px(8));
        f.setStroke(px(3), 0xFFFFFFFF);
        GradientDrawable n = new GradientDrawable();
        n.setColor(0xFF2A2A34);
        n.setCornerRadius(px(8));
        n.setStroke(px(2), 0xFF555566);
        sl.addState(new int[]{android.R.attr.state_focused}, f);
        sl.addState(new int[]{android.R.attr.state_pressed}, f);
        sl.addState(new int[]{}, n);
        b.setBackground(sl);
        b.setTextColor(new android.content.res.ColorStateList(
                new int[][]{{android.R.attr.state_focused}, {android.R.attr.state_pressed}, {}},
                new int[]{Color.BLACK, Color.BLACK, Color.WHITE}));
        b.setOnClickListener(l);
        return b;
    }

    private LinearLayout buttons(Button... bs) {
        LinearLayout r = new LinearLayout(act);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.END);
        r.setPadding(0, px(22), 0, 0);
        for (int i = 0; i < bs.length; i++) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
            if (i > 0) lp.leftMargin = px(16);
            r.addView(bs[i], lp);
        }
        return r;
    }

    private void show(Dialog d, LinearLayout content, Button focus) {
        if (dlg != null && dlg.isShowing()) { try { dlg.setOnDismissListener(null); dlg.dismiss(); } catch (Exception ignored) { } }
        dlg = d;
        d.setContentView(content);
        d.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
        d.getWindow().setLayout(Math.min(act.getResources().getDisplayMetrics().widthPixels - px(80), px(640)), WindowManager.LayoutParams.WRAP_CONTENT);
        d.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        d.show();
        if (focus != null) focus.requestFocus();
    }

    private void prompt(final UpdateLogic.Info i) {
        Dialog d = newDialog();
        LinearLayout c = box();
        c.addView(text("Update available", 26, 0xFFFF9900, true));
        String cur = BuildConfig.VERSION_NAME;
        TextView v = text("Version " + (i.versionName.isEmpty() ? String.valueOf(i.versionCode) : i.versionName) + "  (you have " + cur + ")", 18, 0xFFFFFFFF, true);
        v.setPadding(0, px(8), 0, 0);
        c.addView(v);
        if (!i.notes.isEmpty()) {
            TextView n = text(i.notes, 17, 0xFFCCCCCC, false);
            n.setPadding(0, px(14), 0, 0);
            n.setMaxLines(8);
            c.addView(n);
        }
        Button later = button("Later", x -> d.dismiss());
        Button update = button("Update", x -> onUpdate(i));
        c.addView(buttons(later, update));
        show(d, c, update);
    }

    private void progressDialog(final UpdateLogic.Info i, final ProgressBar[] pb, final TextView[] label) {
        Dialog d = newDialog();
        LinearLayout c = box();
        c.addView(text("Downloading update", 26, 0xFFFF9900, true));
        ProgressBar bar = new ProgressBar(act, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(1000);
        bar.setIndeterminate(true);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, px(14));
        lp.topMargin = px(22);
        c.addView(bar, lp);
        TextView l = text("Starting…", 17, 0xFFCCCCCC, false);
        l.setPadding(0, px(10), 0, 0);
        c.addView(l);
        Button cancelBtn = button("Cancel", x -> d.dismiss());
        c.addView(buttons(cancelBtn));
        d.setOnDismissListener(x -> cancel.set(true)); // Back or Cancel stops the download
        pb[0] = bar;
        label[0] = l;
        show(d, c, cancelBtn);
    }

    private void message(String title, String body, final Runnable retry) {
        Dialog d = newDialog();
        LinearLayout c = box();
        c.addView(text(title, 26, 0xFFFF9900, true));
        TextView t = text(body, 18, 0xFFCCCCCC, false);
        t.setPadding(0, px(12), 0, 0);
        c.addView(t);
        Button close = button("Close", x -> d.dismiss());
        Button first = close;
        if (retry != null) {
            Button r = button("Try again", x -> { d.dismiss(); retry.run(); });
            c.addView(buttons(close, r));
            first = r;
        } else c.addView(buttons(close));
        show(d, c, first);
    }

    // ---------------------------------------------------------------- permission

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || act.getPackageManager().canRequestPackageInstalls();
    }

    private void onUpdate(final UpdateLogic.Info i) {
        if (!canInstall()) {
            pending = i;
            if (dlg != null) { dlg.setOnDismissListener(null); dlg.dismiss(); }
            Toast.makeText(act, "Allow FEFC Collection to install apps, then press Back", Toast.LENGTH_LONG).show();
            try {
                act.startActivityForResult(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + act.getPackageName())), REQ_UNKNOWN_SOURCES);
            } catch (ActivityNotFoundException e) {
                try {
                    act.startActivityForResult(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + act.getPackageName())), REQ_UNKNOWN_SOURCES);
                } catch (ActivityNotFoundException e2) {
                    pending = null;
                    message("Allow installs", "Open Settings > Applications and allow \"Install unknown apps\" for FEFC Collection, then try again.", () -> onUpdate(i));
                }
            }
            return;
        }
        download(i);
    }

    /** Call from Activity.onActivityResult. Continues the update if the user granted the permission. */
    void onActivityResult(int req) {
        if (req != REQ_UNKNOWN_SOURCES) return;
        final UpdateLogic.Info i = pending;
        pending = null;
        if (i == null) return;
        if (canInstall()) ui.post(() -> download(i));
        else ui.post(() -> message("Permission needed", "The update can't be installed until \"Install unknown apps\" is allowed for FEFC Collection.", () -> onUpdate(i)));
    }

    // ---------------------------------------------------------------- download + install

    private void download(final UpdateLogic.Info i) {
        cancel = new AtomicBoolean(false);
        final AtomicBoolean myCancel = cancel;
        final ProgressBar[] pb = new ProgressBar[1];
        final TextView[] lb = new TextView[1];
        progressDialog(i, pb, lb);
        final File dir = ApkProvider.dir(act);
        new Thread(() -> {
            try {
                final File f = UpdateLogic.download(i.url, dir, "FEFC-Collection-" + i.versionCode + ".apk", i, (done, total) -> ui.post(() -> {
                    if (pb[0] == null) return;
                    if (total > 0) {
                        pb[0].setIndeterminate(false);
                        pb[0].setProgress((int) (done * 1000 / total));
                        lb[0].setText(UpdateLogic.mb(done) + " of " + UpdateLogic.mb(total) + "  (" + (done * 100 / total) + "%)");
                    } else lb[0].setText(UpdateLogic.mb(done));
                }), myCancel);
                final String bad = verify(f, i);
                ui.post(() -> {
                    if (bad != null) { f.delete(); message("Update failed", bad, () -> download(i)); }
                    else install(f);
                });
            } catch (UpdateLogic.Cancelled c) {
                // user cancelled: nothing to show
            } catch (final Exception e) {
                ui.post(() -> { if (!act.isFinishing()) message("Download failed", "Check your internet connection and try again.\n(" + e.getMessage() + ")", () -> download(i)); });
            }
        }, "fefc-update-download").start();
    }

    /** Returns null when the file looks like an update for this app signed with this app's key, else a reason. */
    @SuppressWarnings("deprecation")
    private String verify(File f, UpdateLogic.Info i) {
        try {
            PackageManager pm = act.getPackageManager();
            PackageInfo ap = pm.getPackageArchiveInfo(f.getAbsolutePath(), PackageManager.GET_SIGNATURES);
            if (ap == null) return "The downloaded file is not a valid app.";
            if (!act.getPackageName().equals(ap.packageName)) return "The downloaded file is not FEFC Collection.";
            if (ap.versionCode <= BuildConfig.VERSION_CODE) return "The downloaded file is not newer than the installed app.";
            PackageInfo me = pm.getPackageInfo(act.getPackageName(), PackageManager.GET_SIGNATURES);
            if (ap.signatures != null && ap.signatures.length > 0 && me.signatures != null && me.signatures.length > 0) {
                boolean same = false;
                for (Signature a : ap.signatures) for (Signature b : me.signatures) if (a.equals(b)) same = true;
                if (!same) return "The downloaded file is signed with a different key, so Android would not accept it as an update.";
            }
            return null;
        } catch (Exception e) {
            return null; // can't introspect on this OS: the installer enforces package + signature anyway
        }
    }

    private void install(File f) {
        if (dlg != null) { dlg.setOnDismissListener(null); dlg.dismiss(); }
        Uri uri = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N ? ApkProvider.uriFor(act, f) : Uri.fromFile(f);
        Intent view = new Intent(Intent.ACTION_VIEW);
        view.setDataAndType(uri, "application/vnd.android.package-archive");
        view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            act.startActivity(view);
            return;
        } catch (ActivityNotFoundException ignored) { /* try the dedicated action */ }
        try {
            Intent ip = new Intent(Intent.ACTION_INSTALL_PACKAGE);
            ip.setData(uri);
            ip.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            ip.putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true);
            act.startActivity(ip);
        } catch (Exception e) {
            message("Couldn't open the installer", "This device has no app installer. Download the APK from collection.faneditfanclub.com/firetv/FEFC-Collection.apk with the Downloader app.", null);
        }
    }

    void dispose() {
        cancel.set(true);
        if (dlg != null) { dlg.setOnDismissListener(null); try { dlg.dismiss(); } catch (Exception ignored) { } }
    }
}
