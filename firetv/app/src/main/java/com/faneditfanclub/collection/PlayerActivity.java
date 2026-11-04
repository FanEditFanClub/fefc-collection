package com.faneditfanclub.collection;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Metadata;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackGroup;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.Tracks;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.extractor.metadata.id3.ChapterFrame;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Full-screen native player (Media3 / ExoPlayer) for Drive files.
 * Plays only /api/stream/{id}/{file} (server OAuth). Never Drive usercontent or a viewer Google token.
 * Menu / Info / Down: Scale (Fit→Fill→Stretch), CC, Audio tracks, Chapters.
 */
public class PlayerActivity extends Activity {
    private static final String TAG = "FEFCPlayer";
    private ExoPlayer player;
    private PlayerView playerView;
    private TextView info, bar;
    private ProgressBar spin;
    private LinearLayout failBox;
    private FrameLayout root;
    private ScrollView menuScroll;
    private LinearLayout menuBox;
    private boolean menuOpen;
    private boolean resumeAfterMenu;
    private int menuIndex;
    private final List<MenuRow> menuRows = new ArrayList<>();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private boolean prepared, fatal, resumed;
    private String vid, title, fileName, mimeHint, subtitleUrl, subtitleMime;
    private int scaleMode; // 0 Fit, 1 Fill, 2 16:9, 3 Stretch
    private int speedIndex = 2;
    private boolean ccOn = true;
    private final List<Chapter> chapters = new ArrayList<>();
    private static final String PROXY = "https://collection.faneditfanclub.com/api/stream/";
    private static final String[] SCALE_LABELS = { "Fit", "Fill", "16:9", "Stretch" };
    private static final int[] SCALE_MODES = {
            AspectRatioFrameLayout.RESIZE_MODE_FIT,
            AspectRatioFrameLayout.RESIZE_MODE_ZOOM,
            AspectRatioFrameLayout.RESIZE_MODE_FIXED_WIDTH,
            AspectRatioFrameLayout.RESIZE_MODE_FILL
    };
    private static final float[] SPEEDS = { 0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f };

    private static final class Chapter {
        final long startMs;
        final String title;
        Chapter(long startMs, String title) { this.startMs = startMs; this.title = title; }
    }
    private static final class MenuRow {
        final String label;
        final Runnable action;
        MenuRow(String label, Runnable action) { this.label = label; this.action = action; }
    }

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (player != null && prepared && player.getDuration() > 0 && !menuOpen) {
                long pos = player.getCurrentPosition();
                long dur = player.getDuration();
                long left = Math.max(0, dur - pos);
                int pct = dur > 0 ? (int) Math.min(100, pos * 100 / dur) : 0;
                StringBuilder ticks = new StringBuilder();
                for (int i = 0; i < 20; i++) ticks.append(i * 5 < pct ? '\u2588' : '\u2591');
                bar.setText(titleLine()
                        + "\n" + (player.isPlaying() ? "\u25B6" : "\u23F8") + "  " + ticks
                        + "\n" + fmt((int) pos) + "   ·   -" + fmt((int) left)
                        + "   ·  " + SCALE_LABELS[scaleMode] + "  " + speedLabel()
                        + (ccOn ? "  CC" : ""));
            }
            ui.postDelayed(this, 500);
        }
    };
    private final Runnable hideInfo = () -> {
        if (!fatal && !menuOpen) {
            info.setVisibility(View.GONE);
            bar.setVisibility(View.GONE);
        }
    };

    private static String fmt(int ms) {
        int s = Math.max(0, ms) / 1000;
        return s >= 3600 ? String.format(Locale.US, "%d:%02d:%02d", s / 3600, (s / 60) % 60, s % 60)
                : String.format(Locale.US, "%d:%02d", s / 60, s % 60);
    }

    private static String mimeOf(String hint, String nameOrId) {
        if (hint != null && !hint.isEmpty() && hint.contains("/")) return hint;
        String n = (nameOrId == null ? "" : nameOrId).toLowerCase(Locale.US);
        if (n.endsWith(".mkv") || n.contains("matroska")) return MimeTypes.VIDEO_MATROSKA;
        if (n.endsWith(".webm")) return MimeTypes.VIDEO_WEBM;
        if (n.endsWith(".avi")) return "video/x-msvideo";
        if (n.endsWith(".mov")) return "video/quicktime";
        if (n.endsWith(".m4v")) return MimeTypes.VIDEO_MP4;
        return MimeTypes.VIDEO_MP4;
    }

    private static String subMimeOf(String url, String hint) {
        if (hint != null && !hint.isEmpty()) return hint;
        String n = (url == null ? "" : url).toLowerCase(Locale.US);
        if (n.endsWith(".vtt") || n.contains("vtt")) return MimeTypes.TEXT_VTT;
        return MimeTypes.APPLICATION_SUBRIP;
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        playerView = new PlayerView(this);
        playerView.setUseController(false);
        playerView.setBackgroundColor(Color.BLACK);
        root.addView(playerView, new FrameLayout.LayoutParams(-1, -1));

        spin = new ProgressBar(this);
        root.addView(spin, new FrameLayout.LayoutParams(120, 120, Gravity.CENTER));

        info = new TextView(this);
        info.setTextColor(Color.WHITE);
        info.setTextSize(20);
        info.setTypeface(Typeface.DEFAULT_BOLD);
        info.setBackgroundColor(0xB0000000);
        info.setPadding(40, 24, 40, 24);
        info.setGravity(Gravity.CENTER);
        root.addView(info, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        bar = new TextView(this);
        bar.setTextColor(Color.WHITE);
        bar.setTextSize(22);
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

        menuScroll = new ScrollView(this);
        menuScroll.setVisibility(View.GONE);
        menuScroll.setFillViewport(true);
        menuScroll.setBackgroundColor(0xE0080A10);
        menuBox = new LinearLayout(this);
        menuBox.setOrientation(LinearLayout.VERTICAL);
        menuBox.setPadding(48, 36, 48, 36);
        menuScroll.addView(menuBox, new ViewGroup.LayoutParams(-1, -2));
        FrameLayout.LayoutParams mlp = new FrameLayout.LayoutParams(
                (int) (getResources().getDisplayMetrics().widthPixels * 0.55f), -1, Gravity.END);
        root.addView(menuScroll, mlp);

        setContentView(root);

        vid = getIntent().getStringExtra("id");
        title = getIntent().getStringExtra("title");
        fileName = getIntent().getStringExtra("fileName");
        mimeHint = getIntent().getStringExtra("mime");
        subtitleUrl = getIntent().getStringExtra("subtitleUrl");
        subtitleMime = getIntent().getStringExtra("subtitleMime");

        SharedPreferences sp = getSharedPreferences("player", MODE_PRIVATE);
        scaleMode = Math.max(0, Math.min(SCALE_LABELS.length - 1, sp.getInt("scaleMode", 0)));
        speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, sp.getInt("speed", 2)));
        ccOn = sp.getBoolean("ccOn", true);
        applyScale();

        info.setText((title == null || title.isEmpty() ? "FEFC Collection" : title)
                + "\nOK = pause/play   \u25C0 \u25B6 = seek   Menu/Down = tracks   Up = scale   Back = close");
        ui.postDelayed(hideInfo, 7000);

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
        applyPreferredAudioLang(sp.getString("audioLang", null));
        applyCcPreference();

        player.addListener(new Player.Listener() {
            @Override public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_BUFFERING) spin.setVisibility(View.VISIBLE);
                else if (state == Player.STATE_READY) {
                    prepared = true;
                    spin.setVisibility(View.GONE);
                    if (!menuOpen) bar.setVisibility(View.GONE);
                    if (!resumed) { resumed = true; maybeResume(); }
                    if (player != null) player.setPlaybackSpeed(SPEEDS[speedIndex]);
                    applyCcPreference();
                    maybeLoadChapters();
                } else if (state == Player.STATE_ENDED) { clearPos(); finish(); }
            }
            @Override public void onPlayerError(PlaybackException error) {
                Log.e(TAG, "stream error " + error.getErrorCodeName());
                showFatal("This file didn't start from /api/stream (codec, or the stream was interrupted).\n"
                        + "No Google sign-in is used. Press Back, or Open in Drive.");
            }
            @Override public void onIsPlayingChanged(boolean isPlaying) { flash(); }
            @Override public void onTracksChanged(Tracks tracks) {
                applyCcPreference();
            }
            @Override public void onMetadata(Metadata metadata) {
                ingestId3Chapters(metadata);
            }
        });

        bar.setText(titleLine() + "\nLoading\u2026");
        bar.setVisibility(View.VISIBLE);
        playUri(streamUri());
        ui.post(tick);
    }

    private String titleLine() {
        return title == null || title.isEmpty() ? "FEFC Collection" : title;
    }

    private Uri streamUri() {
        String raw = fileName != null && !fileName.isEmpty() ? fileName : (title != null ? title : "video.mp4");
        raw = raw.replaceAll("[\\\\/]+", "_").trim();
        if (!raw.matches("(?i).+\\.(mp4|m4v|mkv|webm|mov|avi|mpg|mpeg|m2ts|ts)$")) {
            String hint = mimeHint == null ? "" : mimeHint.toLowerCase();
            String ext = hint.contains("matroska") ? ".mkv" : hint.contains("webm") ? ".webm" : ".mp4";
            raw = raw.replaceAll("\\.[^.]+$", "");
            if (raw.isEmpty()) raw = "video";
            raw = raw + ext;
        }
        raw = raw.replaceAll("[^A-Za-z0-9._\\-]+", "_");
        if (raw.length() > 120) {
            int dot = raw.lastIndexOf('.');
            String ext = dot > 0 ? raw.substring(dot) : ".mp4";
            raw = raw.substring(0, Math.min(100, raw.length())) + ext;
        }
        return Uri.parse(PROXY + vid + "/" + Uri.encode(raw, "._-"));
    }

    private void maybeResume() {
        if (player == null || vid == null) return;
        long p = getSharedPreferences("player", MODE_PRIVATE).getLong("pos_" + vid, 0);
        long d = player.getDuration();
        if (p > 8000 && (d <= 0 || p < d - 15000)) player.seekTo(p);
    }

    private void savePos() {
        if (player == null || vid == null || !prepared) return;
        long p = player.getCurrentPosition();
        long d = player.getDuration();
        SharedPreferences.Editor ed = getSharedPreferences("player", MODE_PRIVATE).edit();
        if (p < 8000 || (d > 0 && p > d - 15000)) ed.remove("pos_" + vid);
        else ed.putLong("pos_" + vid, p);
        ed.apply();
    }

    private void clearPos() {
        if (vid == null) return;
        getSharedPreferences("player", MODE_PRIVATE).edit().remove("pos_" + vid).apply();
    }

    private void applyScale() {
        playerView.setResizeMode(SCALE_MODES[scaleMode]);
        getSharedPreferences("player", MODE_PRIVATE).edit().putInt("scaleMode", scaleMode).apply();
    }

    private String speedLabel() {
        float s = SPEEDS[speedIndex];
        return (s == (int) s ? String.valueOf((int) s) : String.valueOf(s)) + "\u00d7";
    }

    private void cycleSpeed() {
        speedIndex = (speedIndex + 1) % SPEEDS.length;
        getSharedPreferences("player", MODE_PRIVATE).edit().putInt("speed", speedIndex).apply();
        if (player != null) player.setPlaybackSpeed(SPEEDS[speedIndex]);
        flash();
        info.setVisibility(View.VISIBLE);
        info.setText("Speed: " + speedLabel());
        ui.removeCallbacks(hideInfo);
        ui.postDelayed(hideInfo, 2500);
    }

    private void cycleScale() {
        scaleMode = (scaleMode + 1) % SCALE_LABELS.length;
        applyScale();
        flash();
        info.setVisibility(View.VISIBLE);
        info.setText("Scale: " + SCALE_LABELS[scaleMode]
                + (scaleMode == 0 ? " (letterbox)" : scaleMode == 1 ? " (zoom)" : scaleMode == 2 ? " (16:9 width)" : " (stretch)"));
        ui.removeCallbacks(hideInfo);
        ui.postDelayed(hideInfo, 2500);
        Log.i(TAG, "scale=" + SCALE_LABELS[scaleMode]);
    }

    private void applyPreferredAudioLang(String lang) {
        if (player == null) return;
        player.setTrackSelectionParameters(
                player.getTrackSelectionParameters().buildUpon()
                        .setPreferredAudioLanguage(lang)
                        .build());
    }

    private void applyCcPreference() {
        if (player == null) return;
        player.setTrackSelectionParameters(
                player.getTrackSelectionParameters().buildUpon()
                        .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, !ccOn)
                        .build());
        getSharedPreferences("player", MODE_PRIVATE).edit().putBoolean("ccOn", ccOn).apply();
    }

    private void toggleCc() {
        ccOn = !ccOn;
        applyCcPreference();
        flash();
        info.setVisibility(View.VISIBLE);
        info.setText(ccOn ? "Closed captions ON" : "Closed captions OFF");
        ui.removeCallbacks(hideInfo);
        ui.postDelayed(hideInfo, 2500);
    }

    private void playUri(Uri uri) {
        String mime = mimeOf(mimeHint, fileName != null && !fileName.isEmpty() ? fileName : title);
        MediaItem.Builder b = new MediaItem.Builder().setUri(uri).setMimeType(mime);
        if (subtitleUrl != null && !subtitleUrl.isEmpty()) {
            b.setSubtitleConfigurations(java.util.Collections.singletonList(
                    new MediaItem.SubtitleConfiguration.Builder(Uri.parse(subtitleUrl))
                            .setMimeType(subMimeOf(subtitleUrl, subtitleMime))
                            .setLanguage("en")
                            .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                            .build()));
        }
        try {
            player.setMediaItem(b.build());
            player.prepare();
        } catch (Exception prepErr) {
            android.util.Log.e("FEFCPlayer", "prepare failed", prepErr);
            try { finish(); } catch (Exception ignored) {}
            return;
        }
        player.play();
        // Probe chapters from the same URI (best-effort; many Drive streams omit chapter atoms).
        final String probe = uri.toString();
        new Thread(() -> probeChapters(probe), "fefc-chapters").start();
    }

    private void ingestId3Chapters(Metadata metadata) {
        if (metadata == null) return;
        boolean added = false;
        for (int i = 0; i < metadata.length(); i++) {
            Metadata.Entry e = metadata.get(i);
            if (e instanceof ChapterFrame) {
                ChapterFrame ch = (ChapterFrame) e;
                long start = ch.startTimeMs;
                String t = ch.id != null && !ch.id.isEmpty() ? ch.id : ("Chapter " + (chapters.size() + 1));
                if (!hasChapterNear(start)) {
                    chapters.add(new Chapter(start, t));
                    added = true;
                }
            }
        }
        if (added) Log.i(TAG, "chapters_id3=" + chapters.size());
    }

    private boolean hasChapterNear(long startMs) {
        for (Chapter c : chapters) if (Math.abs(c.startMs - startMs) < 400) return true;
        return false;
    }

    private void probeChapters(String url) {
        // API 34 android.jar has no METADATA_KEY_CHAPTER_COUNT. Chapters come from
        // ID3 CHAP frames via onMetadata when the stream exposes them.
        Log.i(TAG, "chapter_probe_skip_mmr uri_len=" + (url == null ? 0 : url.length()));
    }

    private void maybeLoadChapters() {
        // no-op placeholder; chapters accumulate from metadata + probe
    }

    private void showFatal(String msg) {
        fatal = true;
        spin.setVisibility(View.GONE);
        closeMenu();
        info.setVisibility(View.VISIBLE);
        info.setText(msg);
        failBox.setVisibility(View.VISIBLE);
        failBox.getChildAt(0).requestFocus();
        try { if (player != null) player.stop(); } catch (Exception ignored) {}
    }

    private void openVlc() {
        if (vid == null) return;
        Uri uri = streamUri();
        android.content.ComponentName video = new android.content.ComponentName(
                "org.videolan.vlc", "org.videolan.vlc.gui.video.VideoPlayerActivity");
        Intent explicit = new Intent(Intent.ACTION_VIEW);
        explicit.setComponent(video);
        explicit.setDataAndType(uri, "video/*");
        explicit.putExtra("title", titleLine());
        explicit.putExtra("from_start", false);
        explicit.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        try {
            startActivity(explicit);
            return;
        } catch (Exception e) { /* VLC (or its video activity) is not installed */ }
        /* VLC absent: close the menu so the message is visible, then point at the Amazon Appstore listing. */
        closeMenu();
        info.setVisibility(View.VISIBLE);
        info.setText("VLC is not installed. Opening its Appstore page.");
        ui.removeCallbacks(hideInfo);
        ui.postDelayed(hideInfo, 4000);
        try {
            Intent store = new Intent(Intent.ACTION_VIEW, Uri.parse("amzn://apps/android?p=org.videolan.vlc"));
            store.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(store);
        } catch (Exception e2) {
            info.setText("Install VLC to use Open in VLC.");
        }
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
        if (fatal || menuOpen) return;
        bar.setVisibility(View.VISIBLE);
        ui.removeCallbacks(hideInfo);
        ui.postDelayed(hideInfo, 3500);
    }

    private void openMenu() {
        if (fatal || player == null) return;
        menuRows.clear();
        menuRows.add(new MenuRow("Aspect: " + SCALE_LABELS[scaleMode] + "  (cycle)", this::cycleScale));
        menuRows.add(new MenuRow("Speed: " + speedLabel() + "  (cycle)", this::cycleSpeed));
        menuRows.add(new MenuRow("Closed captions: " + (ccOn ? "ON" : "OFF"), this::toggleCc));

        Tracks tracks = player.getCurrentTracks();
        List<MenuRow> audioRows = new ArrayList<>();
        List<MenuRow> textRows = new ArrayList<>();
        for (Tracks.Group g : tracks.getGroups()) {
            if (!g.isSupported()) continue;
            TrackGroup tg = g.getMediaTrackGroup();
            if (g.getType() == C.TRACK_TYPE_AUDIO) {
                for (int i = 0; i < g.length; i++) {
                    if (!g.isTrackSupported(i)) continue;
                    Format f = tg.getFormat(i);
                    final int idx = i;
                    final Tracks.Group grp = g;
                    String label = audioLabel(f, audioRows.size() + 1);
                    boolean sel = g.isTrackSelected(i);
                    audioRows.add(new MenuRow((sel ? "\u25CF " : "\u25CB ") + "Audio: " + label, () -> selectTrack(grp, idx, C.TRACK_TYPE_AUDIO, f.language)));
                }
            } else if (g.getType() == C.TRACK_TYPE_TEXT) {
                for (int i = 0; i < g.length; i++) {
                    if (!g.isTrackSupported(i)) continue;
                    Format f = tg.getFormat(i);
                    final int idx = i;
                    final Tracks.Group grp = g;
                    String label = textLabel(f, textRows.size() + 1);
                    boolean sel = g.isTrackSelected(i);
                    textRows.add(new MenuRow((sel ? "\u25CF " : "\u25CB ") + "CC: " + label, () -> {
                        ccOn = true;
                        selectTrack(grp, idx, C.TRACK_TYPE_TEXT, f.language);
                        applyCcPreference();
                    }));
                }
            }
        }
        if (audioRows.isEmpty()) menuRows.add(new MenuRow("Audio: (only one / none listed)", () -> {}));
        else menuRows.addAll(audioRows);
        if (textRows.isEmpty()) menuRows.add(new MenuRow("CC tracks: (none embedded" + (subtitleUrl != null ? "; sidecar attached" : "") + ")", () -> {}));
        else menuRows.addAll(textRows);

        if (chapters.isEmpty()) {
            menuRows.add(new MenuRow("Chapters: (none detected for this stream)", () -> {}));
        } else {
            for (Chapter c : chapters) {
                final long ms = c.startMs;
                menuRows.add(new MenuRow("Chapter: " + c.title + "  (" + fmt((int) ms) + ")", () -> {
                    player.seekTo(ms);
                    closeMenu();
                    flash();
                }));
            }
        }
        menuRows.add(new MenuRow("Open in VLC", this::openVlc));
        menuRows.add(new MenuRow("Open in Drive", this::openDrive));
        menuRows.add(new MenuRow("Close menu", this::closeMenu));

        menuBox.removeAllViews();
        TextView head = new TextView(this);
        head.setText("Player options");
        head.setTextColor(0xFFFF9900);
        head.setTextSize(24);
        head.setTypeface(Typeface.DEFAULT_BOLD);
        head.setPadding(0, 0, 0, 24);
        menuBox.addView(head);
        for (int i = 0; i < menuRows.size(); i++) {
            TextView row = new TextView(this);
            row.setText(menuRows.get(i).label);
            row.setTextSize(20);
            row.setPadding(20, 18, 20, 18);
            row.setTag(i);
            menuBox.addView(row);
        }
        menuIndex = 0;
        paintMenu();
        menuOpen = true;
        menuScroll.setVisibility(View.VISIBLE);
        info.setVisibility(View.GONE);
        bar.setVisibility(View.GONE);
        resumeAfterMenu = false;
        try { resumeAfterMenu = player.isPlaying() || player.getPlayWhenReady(); player.pause(); } catch (Exception ignored) {}
    }

    private static String audioLabel(Format f, int n) {
        StringBuilder sb = new StringBuilder();
        if (f.label != null && !f.label.isEmpty()) sb.append(f.label);
        else if (f.language != null && !f.language.isEmpty()) sb.append(f.language);
        else sb.append("Track ").append(n);
        if (f.channelCount > 0) sb.append(" · ").append(f.channelCount).append("ch");
        if (f.bitrate > 0) sb.append(" · ").append(f.bitrate / 1000).append("kbps");
        return sb.toString();
    }

    private static String textLabel(Format f, int n) {
        if (f.label != null && !f.label.isEmpty()) return f.label;
        if (f.language != null && !f.language.isEmpty()) return f.language;
        return "Track " + n;
    }

    private void selectTrack(Tracks.Group grp, int index, int type, String lang) {
        TrackGroup tg = grp.getMediaTrackGroup();
        player.setTrackSelectionParameters(
                player.getTrackSelectionParameters().buildUpon()
                        .setOverrideForType(new TrackSelectionOverride(tg, index))
                        .setTrackTypeDisabled(type, false)
                        .build());
        if (type == C.TRACK_TYPE_AUDIO && lang != null && !lang.isEmpty()) {
            getSharedPreferences("player", MODE_PRIVATE).edit().putString("audioLang", lang).apply();
        }
        flash();
        closeMenu();
        info.setVisibility(View.VISIBLE);
        info.setText(type == C.TRACK_TYPE_AUDIO ? "Audio: " + audioLabel(tg.getFormat(index), index + 1)
                : "CC: " + textLabel(tg.getFormat(index), index + 1));
        ui.removeCallbacks(hideInfo);
        ui.postDelayed(hideInfo, 2500);
    }

    private void paintMenu() {
        for (int i = 0; i < menuBox.getChildCount(); i++) {
            View v = menuBox.getChildAt(i);
            if (!(v instanceof TextView) || v.getTag() == null) continue;
            int idx = (Integer) v.getTag();
            TextView tv = (TextView) v;
            boolean on = idx == menuIndex;
            tv.setBackgroundColor(on ? 0xFFFF9900 : Color.TRANSPARENT);
            tv.setTextColor(on ? Color.BLACK : Color.WHITE);
            if (on) {
                menuScroll.post(() -> {
                    int y = tv.getTop() - menuScroll.getHeight() / 3;
                    menuScroll.smoothScrollTo(0, Math.max(0, y));
                });
            }
        }
    }

    private void closeMenu() {
        boolean wasOpen = menuOpen;
        menuOpen = false;
        menuScroll.setVisibility(View.GONE);
        /* The menu pauses playback; resume on close (track pick, chapter, Close menu, Back) only if it was playing. */
        if (wasOpen && resumeAfterMenu && player != null) { try { player.play(); } catch (Exception ignored) {} }
        resumeAfterMenu = false;
        flash();
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
        if (menuOpen) {
            switch (k) {
                case KeyEvent.KEYCODE_BACK:
                case KeyEvent.KEYCODE_ESCAPE:
                    closeMenu();
                    return true;
                case KeyEvent.KEYCODE_DPAD_UP:
                    menuIndex = (menuIndex - 1 + menuRows.size()) % menuRows.size();
                    paintMenu();
                    return true;
                case KeyEvent.KEYCODE_DPAD_DOWN:
                    menuIndex = (menuIndex + 1) % menuRows.size();
                    paintMenu();
                    return true;
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                    if (e.getRepeatCount() == 0 && menuIndex >= 0 && menuIndex < menuRows.size()) {
                        menuRows.get(menuIndex).action.run();
                        if (menuOpen) paintMenu(); // rebuild may have closed
                    }
                    return true;
                default:
                    return true;
            }
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
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE:
                if (bar.getVisibility() == View.VISIBLE || info.getVisibility() == View.VISIBLE) {
                    bar.setVisibility(View.GONE);
                    info.setVisibility(View.GONE);
                    return true;
                }
                savePos();
                finish();
                return true;
            case KeyEvent.KEYCODE_DPAD_UP:
            case KeyEvent.KEYCODE_ZOOM_IN:
                if (e.getRepeatCount() == 0) flash();
                return true;
            case KeyEvent.KEYCODE_DPAD_DOWN:
            case KeyEvent.KEYCODE_MENU:
            case KeyEvent.KEYCODE_INFO:
            case KeyEvent.KEYCODE_MEDIA_AUDIO_TRACK:
            case KeyEvent.KEYCODE_CAPTIONS:
                if (e.getRepeatCount() == 0) openMenu();
                return true;
            case KeyEvent.KEYCODE_MEDIA_NEXT:
                if (!chapters.isEmpty()) {
                    long pos = player.getCurrentPosition();
                    for (Chapter c : chapters) {
                        if (c.startMs > pos + 800) { player.seekTo(c.startMs); flash(); return true; }
                    }
                }
                return true;
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                if (!chapters.isEmpty()) {
                    long pos = player.getCurrentPosition();
                    Chapter prev = null;
                    for (Chapter c : chapters) {
                        if (c.startMs < pos - 1200) prev = c;
                        else break;
                    }
                    player.seekTo(prev != null ? prev.startMs : 0);
                    flash(); return true;
                }
                return true;
            default: return super.onKeyDown(k, e);
        }
    }

    @Override
    protected void onPause() {
        savePos();
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
