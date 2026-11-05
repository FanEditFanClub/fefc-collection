package com.fefc.kodi;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Transparent bridge: service.py starts fefcnotify://notify?... to post a shade
 * notification; tapping one re-opens this activity with fefcnotify://open?... which
 * writes a pending-nav file and launches the main Splash so the Python service can
 * route to New Arrivals or the updater. fefcnotify://perm asks for POST_NOTIFICATIONS
 * once on first launch (Android 13+).
 */
public class FefcNotifyActivity extends Activity {
    private static final String CH_ID = "fefc";
    private static final String CH_NAME = "FEFC";
    private boolean waitingPerm;
    private String pendingKind;
    private String pendingTitle;
    private String pendingText;
    private String pendingNid;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            handle(getIntent());
        } catch (Throwable t) {
            // never crash the host app over a notification
        }
        if (!waitingPerm) finish();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        waitingPerm = false;
        try {
            handle(intent);
        } catch (Throwable t) {
        }
        if (!waitingPerm) finish();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        try {
            if (pendingKind != null) {
                post(pendingKind, pendingTitle, pendingText, pendingNid);
            }
        } catch (Throwable t) {
        }
        finish();
    }

    private void handle(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data == null) return;
        String host = data.getHost();
        if (host == null) host = "";
        if ("perm".equals(host)) {
            ensurePerm(true);
            return;
        }
        if ("notify".equals(host)) {
            String kind = q(data, "kind", "files");
            String title = q(data, "title", "FEFC");
            String text = q(data, "text", "");
            String nid = q(data, "nid", kind);
            if (ensurePerm(false)) {
                pendingKind = kind;
                pendingTitle = title;
                pendingText = text;
                pendingNid = nid;
                return;
            }
            post(kind, title, text, nid);
        } else if ("open".equals(host)) {
            String kind = q(data, "kind", "files");
            writePending(kind);
            launchMain();
        }
    }

    private static String q(Uri data, String key, String def) {
        String v = data.getQueryParameter(key);
        return v == null || v.length() == 0 ? def : v;
    }

    /** @return true if a permission dialog was shown (caller must wait). */
    private boolean ensurePerm(boolean finishIfGranted) {
        if (Build.VERSION.SDK_INT < 33) return false;
        if (checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                == PackageManager.PERMISSION_GRANTED) return false;
        waitingPerm = true;
        requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 1);
        return true;
    }

    private void post(String kind, String title, String text, String nid) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CH_ID, CH_NAME, NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Fan Edit Fan Club Collection");
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(this, FefcNotifyActivity.class);
        open.setData(Uri.parse("fefcnotify://open?kind=" + Uri.encode(kind)));
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        int idHash = nid.hashCode();
        PendingIntent pi = PendingIntent.getActivity(this, idHash, open, flags);

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            b = new Notification.Builder(this, CH_ID);
        } else {
            b = new Notification.Builder(this);
        }
        b.setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setAutoCancel(true)
                .setContentIntent(pi);
        if (Build.VERSION.SDK_INT < 26) {
            b.setPriority(Notification.PRIORITY_DEFAULT);
        }
        nm.notify(idHash, b.build());
    }

    private void writePending(String kind) {
        File dir = getExternalFilesDir(null);
        if (dir == null) dir = getFilesDir();
        if (dir == null) return;
        File f = new File(dir, "fefc-pending-nav.txt");
        try {
            FileOutputStream out = new FileOutputStream(f);
            out.write(kind.getBytes(StandardCharsets.UTF_8));
            out.close();
        } catch (Exception e) {
        }
    }

    private void launchMain() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch == null) {
            launch = new Intent(Intent.ACTION_MAIN);
            launch.setPackage(getPackageName());
            launch.addCategory(Intent.CATEGORY_LAUNCHER);
        }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        startActivity(launch);
    }
}
