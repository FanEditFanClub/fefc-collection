package com.faneditfanclub.collection;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

/**
 * Full-screen native player (Media3 / ExoPlayer) for Drive files.
 * Prefer /api/stream/ (Range-aware proxy); fall back to drive.usercontent confirm=t.
 * VideoView could not decode many HEVC / 10-bit / MKV fan edits and failed mid-stream on Drive.
 */
public class PlayerActivity extends Activity {
    private ExoPlayer player;
    private PlayerView playerView;
    private TextView info, bar;
    private ProgressBar spin;
    private LinearLayout failBox;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private boolean prepared, triedDirect, fatal;
    private String vid, title, mimeHint;
    private static final String PROXY = "https://collection.faneditfanclub.com/api/stream/";
    private static final String DIRECT_PREFIX = "https://drive.usercontent.google.com/download?id=";
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (player != null && prepared && player.getDuration() > 0) {
                bar.setText((player.isPlaying() ? "\u25B6  " : "\u23F8  ")
                        + fmt((int) player.getCurrentPosition()) + " / " + fmt((int) player.getDuration()));
            }
            ui.postDelayed(this, 500);
        }
    };
    private final Runnable hideInfo = () -> {
        if (!fatal) {
            info.setVisibility(View.GONE);
            bar.setVisibility(View.GONE);
        }
    };

    private static String fmt(int ms) {
        int s = Math.max(0, ms) / 1000;
        return s >= 3600 ? String.format("%d:%02d:%02d", s / 3600, (s / 60) % 60, s % 60)
                : String.format("%d:%02d", s / 60, s % 60);
    }

    private static String mimeOf(String hint, String nameOrId) {
        if (hint != null && !hint.isEmpty() && hint.contains("/")) return hint;
        String n = (nameOrId == null ? "" : nameOrId).toLowerCase();
        if (n.endsWith(".mkv") || n.contains("matroska")) return MimeTypes.VIDEO_MATROSKA;
        if (n.endsWith(".webm")) return MimeTypes.VIDEO_WEBM;
        if (n.endsWith(".avi")) return "video/x-msvideo";
        if (n.endsWith(".mov")) return "video/quicktime";
        if (n.endsWith(".m4v")) return MimeTypes.VIDEO_MP4;
        return MimeTypes.VIDEO_MP4;
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        playerView = new PlayerView(this);
        playerView.setUseController(false);
        playerView.setBackgroundColor(Color.BLACK);
        root.addView(playerView, new FrameLayout.LayoutParams(-1, -1));

        spin = new ProgressBar(this);
        root.addView(spin, new FrameLayout.LayoutParams(120, 120, Gravity.CENTER));

        info = new TextView(this);
        info.setTextColor(Color.WHITE);
        info.setTextSize(22);
        info.setTypeface(Typeface.DEFAULT_BOLD);
        info.setBackgroundColor(0xB0000000);
        info.setPadding(40, 24, 40, 24);
        info.setGravity(Gravity.CENTER);
        root.addView(info, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        bar = new TextView(this);
        bar.setTextColor(Color.WHITE);
        bar.setTextSize(24);
        bar.setBackgroundColor(0xB0000000);
        bar.setPadding(40, 20, 40, 20);
        bar.setVisibility(View.GONE);
        root.addView(bar, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));

        failBox = new LinearLayout(this);
        failBox.setOrientation(LinearLayout.VERTICAL);
        failBox.setGravity(Gravity.CENTER);
        failBox.setPadding(48, 48, 48, 48);
        failBox.setVisibility(View.GONE);
        Button openDrive = new Button(this);
        openDrive.setText("Open in Drive");
        openDrive.setOnClickListener(v -> openDrive());
        openDrive.setFocusable(true);
        openDrive.setFocusableInTouchMode(true);
        failBox.addView(openDrive, new LinearLayout.LayoutParams(-2, -2));
        FrameLayout.LayoutParams flp = new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER);
        flp.topMargin = 180;
        root.addView(failBox, flp);

        setContentView(root);

        vid = getIntent().getStringExtra("id");
        title = getIntent().getStringExtra("title");
        mimeHint = getIntent().getStringExtra("mime");
        info.setText((title == null || title.isEmpty() ? "FEFC Collection" : title)
                + "\nOK = pause/play   \u25C0 \u25B6 = seek   Back = close");
        ui.postDelayed(hideInfo, 6000);

        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setUserAgent("FEFC-Collection-FireTV/" + BuildConfig.VERSION_NAME)
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(20_000)
                .setReadTimeoutMs(30_000);

        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(this).setDataSourceFactory(http))
                .setLoadControl(new DefaultLoadControl.Builder()
                        .setBufferDurationsMs(5_000, 50_000, 2_000, 4_000)
                        .build())
                .build();
        playerView.setPlayer(player);
        player.addListener(new Player.Listener() {
            @Override public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_BUFFERING) spin.setVisibility(View.VISIBLE);
                else if (state == Player.STATE_READY) {
                    prepared = true;
                    spin.setVisibility(View.GONE);
                    bar.setVisibility(View.GONE);
                    if (!triedDirect) {
                        getSharedPreferences("player", MODE_PRIVATE).edit().remove("proxyBad").apply();
                    }
                } else if (state == Player.STATE_ENDED) finish();
            }
            @Override public void onPlayerError(PlaybackException error) {
                if (!triedDirect && !prepared) {
                    triedDirect = true;
                    getSharedPreferences("player", MODE_PRIVATE).edit()
                            .putLong("proxyBad", System.currentTimeMillis()).apply();
                    playUri(directUri());
                    return;
                }
                showFatal("This file can't be streamed directly (share/quota, or a codec this TV can't decode).\n"
                        + "Press Back for the web player, or Open in Drive.");
            }
            @Override public void onIsPlayingChanged(boolean isPlaying) { flash(); }
        });

        SharedPreferences sp = getSharedPreferences("player", MODE_PRIVATE);
        boolean proxyBad = System.currentTimeMillis() - sp.getLong("proxyBad", 0) < 30 * 60 * 1000L;
        bar.setText("Loading\u2026");
        bar.setVisibility(View.VISIBLE);
        if (proxyBad) {
            triedDirect = true;
            playUri(directUri());
        } else {
            playUri(Uri.parse(PROXY + vid));
        }
        ui.post(tick);
    }

    private Uri directUri() {
        return Uri.parse(DIRECT_PREFIX + vid + "&export=download&confirm=t");
    }

    private void playUri(Uri uri) {
        String mime = mimeOf(mimeHint, title);
        MediaItem item = new MediaItem.Builder().setUri(uri).setMimeType(mime).build();
        player.setMediaItem(item);
        player.prepare();
        player.play();
    }

    private void showFatal(String msg) {
        fatal = true;
        spin.setVisibility(View.GONE);
        info.setVisibility(View.VISIBLE);
        info.setText(msg);
        failBox.setVisibility(View.VISIBLE);
        failBox.getChildAt(0).requestFocus();
        try { if (player != null) player.stop(); } catch (Exception ignored) {}
    }

    private void openDrive() {
        if (vid == null) return;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://drive.google.com/file/d/" + vid + "/view"));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            info.setText("Could not open Drive. Press Back.");
        }
    }

    private void flash() {
        if (fatal) return;
        bar.setVisibility(View.VISIBLE);
        ui.removeCallbacks(hideInfo);
        ui.postDelayed(hideInfo, 3500);
    }

    @Override
    public boolean onKeyDown(int k, KeyEvent e) {
        if (fatal) {
            if (k == KeyEvent.KEYCODE_DPAD_CENTER || k == KeyEvent.KEYCODE_ENTER) {
                openDrive();
                return true;
            }
            return super.onKeyDown(k, e);
        }
        if (player == null || (!prepared && k != KeyEvent.KEYCODE_BACK)) return super.onKeyDown(k, e);
        switch (k) {
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_SPACE:
                if (e.getRepeatCount() == 0) {
                    if (player.isPlaying()) player.pause(); else player.play();
                    flash();
                }
                return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY: player.play(); flash(); return true;
            case KeyEvent.KEYCODE_MEDIA_PAUSE: player.pause(); flash(); return true;
            case KeyEvent.KEYCODE_DPAD_RIGHT:
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
            case KeyEvent.KEYCODE_MEDIA_STEP_FORWARD: {
                long d = player.getDuration();
                long step = e.getRepeatCount() > 3 ? 30000 : 10000;
                player.seekTo(Math.min(d > 0 ? d - 500 : player.getCurrentPosition() + step,
                        player.getCurrentPosition() + step));
                flash(); return true;
            }
            case KeyEvent.KEYCODE_DPAD_LEFT:
            case KeyEvent.KEYCODE_MEDIA_REWIND:
            case KeyEvent.KEYCODE_MEDIA_STEP_BACKWARD: {
                long step = e.getRepeatCount() > 3 ? 30000 : 10000;
                player.seekTo(Math.max(0, player.getCurrentPosition() - step));
                flash(); return true;
            }
            default: return super.onKeyDown(k, e);
        }
    }

    @Override
    protected void onPause() {
        if (player != null) player.pause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        if (playerView != null) playerView.setPlayer(null);
        if (player != null) { player.release(); player = null; }
        super.onDestroy();
    }
}
