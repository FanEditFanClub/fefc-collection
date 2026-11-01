package com.faneditfanclub.collection;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.VideoView;

/**
 * Full-screen native player for Drive files (fallback when the embedded Drive preview can't be driven with a remote).
 * Streams https://drive.usercontent.google.com/download?id=ID&export=download&confirm=t (works for "anyone with the link" files).
 * OK / Play-Pause toggles, Left/Right seek 10 s (hold = 30 s), Back closes.
 */
public class PlayerActivity extends Activity {
    private VideoView video;
    private TextView info, bar;
    private ProgressBar spin;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private boolean prepared, triedDirect;
    private String vid;
    private static final String PROXY = "https://collection.faneditfanclub.com/api/stream/";
    private static final String DIRECT_PREFIX = "https://drive.usercontent.google.com/download?id=";
    private static final String DIRECT = DIRECT_PREFIX;
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (prepared && video.getDuration() > 0) {
                bar.setText((video.isPlaying() ? "\u25B6  " : "\u23F8  ") + fmt(video.getCurrentPosition()) + " / " + fmt(video.getDuration()));
            }
            ui.postDelayed(this, 500);
        }
    };
    private final Runnable hideInfo = () -> { info.setVisibility(View.GONE); bar.setVisibility(View.GONE); };

    private static String fmt(int ms) {
        int s = ms / 1000;
        return s >= 3600 ? String.format("%d:%02d:%02d", s / 3600, (s / 60) % 60, s % 60) : String.format("%d:%02d", s / 60, s % 60);
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        video = new VideoView(this);
        FrameLayout.LayoutParams vp = new FrameLayout.LayoutParams(-1, -1);
        vp.gravity = Gravity.CENTER;
        root.addView(video, vp);
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
        setContentView(root);

        String id = getIntent().getStringExtra("id"), title = getIntent().getStringExtra("title");
        info.setText((title == null || title.isEmpty() ? "FEFC Collection" : title) + "\nOK = pause/play   \u25C0 \u25B6 = seek   Back = close");
        ui.postDelayed(hideInfo, 6000);
        video.setOnPreparedListener(mp -> {
            prepared = true;
            spin.setVisibility(View.GONE);
            mp.setOnInfoListener((m, what, extra) -> {
                if (what == MediaPlayer.MEDIA_INFO_BUFFERING_START) spin.setVisibility(View.VISIBLE);
                else if (what == MediaPlayer.MEDIA_INFO_BUFFERING_END || what == MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START) spin.setVisibility(View.GONE);
                return false;
            });
            video.start();
        });
        video.setOnCompletionListener(mp -> finish());
        video.setOnErrorListener((mp, what, extra) -> {
            if (!triedDirect && !prepared) {   // /api/stream proxy unavailable (not configured, quota, 403): fall back to the direct Drive URL
                triedDirect = true;
                video.setVideoURI(Uri.parse(DIRECT_PREFIX + vid + "&export=download&confirm=t"));
                return true;
            }
            spin.setVisibility(View.GONE);
            info.setVisibility(View.VISIBLE);
            info.setText("This file can't be streamed directly (it may not be shared publicly, may be over Google's download quota, or uses a format this TV can't decode).\nPress Back and use the web player or OPEN IN DRIVE.");
            return true;
        });
        vid = id;
        // 1st choice: the site's Range-aware streaming proxy (no virus-scan page, works for big files); falls back to the direct URL on error.
        video.setVideoURI(Uri.parse(PROXY + id));
        ui.post(tick);
    }

    private void flash() {
        bar.setVisibility(View.VISIBLE);
        ui.removeCallbacks(hideInfo);
        ui.postDelayed(hideInfo, 3500);
    }

    @Override
    public boolean onKeyDown(int k, KeyEvent e) {
        if (!prepared) return super.onKeyDown(k, e);
        switch (k) {
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_SPACE:
                if (e.getRepeatCount() == 0) { if (video.isPlaying()) video.pause(); else video.start(); flash(); }
                return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY: video.start(); flash(); return true;
            case KeyEvent.KEYCODE_MEDIA_PAUSE: video.pause(); flash(); return true;
            case KeyEvent.KEYCODE_DPAD_RIGHT:
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
            case KeyEvent.KEYCODE_MEDIA_STEP_FORWARD:
                video.seekTo(Math.min(video.getDuration() - 500, video.getCurrentPosition() + (e.getRepeatCount() > 3 ? 30000 : 10000))); flash(); return true;
            case KeyEvent.KEYCODE_DPAD_LEFT:
            case KeyEvent.KEYCODE_MEDIA_REWIND:
            case KeyEvent.KEYCODE_MEDIA_STEP_BACKWARD:
                video.seekTo(Math.max(0, video.getCurrentPosition() - (e.getRepeatCount() > 3 ? 30000 : 10000))); flash(); return true;
            default: return super.onKeyDown(k, e);
        }
    }

    @Override
    protected void onPause() { if (video != null) video.pause(); super.onPause(); }

    @Override
    protected void onDestroy() { ui.removeCallbacksAndMessages(null); if (video != null) video.stopPlayback(); super.onDestroy(); }
}
