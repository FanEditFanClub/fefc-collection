package com.faneditfanclub.collection;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

/**
 * Fullscreen native Media3 intro played BEFORE the WebView is shown.
 * Hide only on STATE_ENDED or remote Select / Back (skip). WebView preloads underneath with ?nointro=1.
 */
final class NativeIntro {
    static final String TAG = "FEFCIntro";

    interface Listener {
        void onIntroFinished(boolean skipped);
    }

    private final Activity act;
    private final FrameLayout root;
    private final Listener listener;
    private ExoPlayer player;
    private PlayerView view;
    private boolean finished;
    private boolean started;
    private long lastPosLogMs;

    NativeIntro(Activity act, FrameLayout root, Listener listener) {
        this.act = act;
        this.root = root;
        this.listener = listener;
    }

    boolean isShowing() {
        return started && !finished;
    }

    void start() {
        if (started) return;
        started = true;
        Log.i(TAG, "start: attach PlayerView + ExoPlayer from res/raw/intro");

        view = new PlayerView(act);
        view.setUseController(false);
        view.setBackgroundColor(Color.BLACK);
        view.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_ZOOM);
        view.setFocusable(true);
        view.setFocusableInTouchMode(true);
        root.addView(view, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        view.bringToFront();
        view.requestFocus();

        player = new ExoPlayer.Builder(act).build();
        view.setPlayer(player);

        Uri uri = Uri.parse("android.resource://" + act.getPackageName() + "/" + R.raw.intro);
        player.setMediaItem(MediaItem.fromUri(uri));
        player.setPlayWhenReady(true);
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                String name = stateName(state);
                long pos = player != null ? player.getCurrentPosition() : -1;
                long dur = player != null ? player.getDuration() : -1;
                Log.i(TAG, "state=" + name + " posMs=" + pos + " durMs=" + dur);
                if (state == Player.STATE_ENDED) {
                    finish(false);
                }
            }

            @Override
            public void onIsPlayingChanged(boolean playing) {
                Log.i(TAG, "isPlaying=" + playing
                        + " posMs=" + (player != null ? player.getCurrentPosition() : -1));
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                Log.e(TAG, "playback error — finishing so home is still reachable", error);
                finish(true);
            }

            @Override
            public void onPositionDiscontinuity(
                    Player.PositionInfo oldPos, Player.PositionInfo newPos, int reason) {
                // no-op; periodic log below
            }
        });
        player.prepare();
        // Periodic progress so emulator logcat proves start→middle→end without freezes.
        view.post(progressTick);
    }

    private final Runnable progressTick = new Runnable() {
        @Override public void run() {
            if (finished || player == null || view == null) return;
            long pos = player.getCurrentPosition();
            if (pos - lastPosLogMs >= 2000 || lastPosLogMs == 0) {
                lastPosLogMs = pos;
                Log.i(TAG, "progress posMs=" + pos
                        + " durMs=" + player.getDuration()
                        + " playing=" + player.isPlaying()
                        + " state=" + stateName(player.getPlaybackState()));
            }
            view.postDelayed(this, 500);
        }
    };

    /** Consume Select / Center / Enter / Back to skip. Returns true if consumed. */
    boolean onKey(KeyEvent e) {
        if (!isShowing()) return false;
        if (e.getAction() != KeyEvent.ACTION_DOWN || e.getRepeatCount() != 0) return true;
        int k = e.getKeyCode();
        if (k == KeyEvent.KEYCODE_DPAD_CENTER
                || k == KeyEvent.KEYCODE_ENTER
                || k == KeyEvent.KEYCODE_BUTTON_A
                || k == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
                || k == KeyEvent.KEYCODE_BACK) {
            Log.i(TAG, "skip via key=" + KeyEvent.keyCodeToString(k));
            finish(true);
            return true;
        }
        // Swallow other keys so WebView does not get them under the intro.
        return true;
    }

    /** Pause intro playback when the activity backgrounds (do not finish). */
    void pause() {
        if (player != null) {
            try { player.pause(); } catch (Exception ignored) {}
            Log.i(TAG, "paused (background)");
        }
    }

    /** Resume intro only if it was still showing when we backgrounded. */
    void resumeIfShowing() {
        if (!isShowing() || player == null) return;
        try {
            player.play();
            Log.i(TAG, "resumed after foreground");
        } catch (Exception ignored) {}
    }

    void releaseQuietly() {
        if (finished) return;
        finished = true;
        tearDown();
    }

    private void finish(boolean skipped) {
        if (finished) return;
        finished = true;
        Log.i(TAG, "finish skipped=" + skipped
                + " lastPosMs=" + (player != null ? player.getCurrentPosition() : -1));
        tearDown();
        if (listener != null) listener.onIntroFinished(skipped);
    }

    private void tearDown() {
        if (view != null) {
            view.removeCallbacks(progressTick);
            try { view.setPlayer(null); } catch (Exception ignored) {}
            try { root.removeView(view); } catch (Exception ignored) {}
            view = null;
        }
        if (player != null) {
            try { player.release(); } catch (Exception ignored) {}
            player = null;
        }
    }

    private static String stateName(int state) {
        switch (state) {
            case Player.STATE_IDLE: return "IDLE";
            case Player.STATE_BUFFERING: return "BUFFERING";
            case Player.STATE_READY: return "READY";
            case Player.STATE_ENDED: return "ENDED";
            default: return "UNKNOWN(" + state + ")";
        }
    }
}
