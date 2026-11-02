package com.faneditfanclub.collection;

import android.app.ActivityManager;
import android.content.Context;
import android.media.MediaCodecInfo;
import android.media.MediaCodecList;
import android.os.Build;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.WindowManager;

import org.json.JSONObject;

/**
 * Classifies Fire TV / Android TV hardware into LOW / MID / HIGH so the mosaic
 * and WebView can scale video-tile count and paint cost for every device, not
 * only the Cube. Toshiba/Insignia panels and Stick Lite sit at LOW; Stick 4K /
 * 4K Max at MID; Cube at HIGH.
 */
public final class DeviceTier {
    public static final String LOW = "LOW";
    public static final String MID = "MID";
    public static final String HIGH = "HIGH";

    private static final String TAG = "FEFC-Tier";

    public final String tier;
    public final String model;
    public final String manufacturer;
    public final long ramMb;
    public final int cpuCores;
    public final int maxHwDecoderInstances;
    public final int hwVideoDecoders;
    public final int screenW;
    public final int screenH;
    public final int videoTiles;       // simultaneous mosaic <video> cap
    public final int webViewTargetH;   // CSS layout target height (720 or 1080)
    public final boolean reduceEffects; // no blur/glow
    public final String reason;

    private DeviceTier(String tier, String model, String manufacturer, long ramMb, int cpuCores,
                      int maxHwDecoderInstances, int hwVideoDecoders, int screenW, int screenH,
                      int videoTiles, int webViewTargetH, boolean reduceEffects, String reason) {
        this.tier = tier;
        this.model = model;
        this.manufacturer = manufacturer;
        this.ramMb = ramMb;
        this.cpuCores = cpuCores;
        this.maxHwDecoderInstances = maxHwDecoderInstances;
        this.hwVideoDecoders = hwVideoDecoders;
        this.screenW = screenW;
        this.screenH = screenH;
        this.videoTiles = videoTiles;
        this.webViewTargetH = webViewTargetH;
        this.reduceEffects = reduceEffects;
        this.reason = reason;
    }

    public static DeviceTier detect(Context ctx) {
        String model = Build.MODEL != null ? Build.MODEL : "";
        String mfr = Build.MANUFACTURER != null ? Build.MANUFACTURER : "";
        String device = Build.DEVICE != null ? Build.DEVICE : "";
        String product = Build.PRODUCT != null ? Build.PRODUCT : "";
        String fingerprint = (model + " " + device + " " + product).toUpperCase();

        long ramMb = ramMb(ctx);
        int cores = Math.max(1, Runtime.getRuntime().availableProcessors());
        int[] codec = hwDecoderStats();
        int maxInst = codec[0];
        int hwDec = codec[1];
        int[] scr = screenPx(ctx);
        int sw = scr[0], sh = scr[1];

        // --- MODEL family hints (Amazon Fire TV AFT* + OEM smart-TV sticks) ---
        String modelHint = null; // LOW/MID/HIGH or null
        if (matches(fingerprint,
                "AFTGA", "AFTGA001", "AFTR", "AFTA", "CUBE", "TIFFANY")) {
            // Fire TV Cube family (1st AFTA, 2nd AFTR, 3rd AFTGA*)
            modelHint = HIGH;
        } else if (matches(fingerprint,
                "AFTKA", "AFTKM", "AFTMM", "AFTKRT", "4K MAX", "4KMAX", "STICK4K")) {
            // Stick 4K / 4K Max
            modelHint = MID;
        } else if (matches(fingerprint,
                "AFTSSS", "AFTSS", "AFTN", "AFTT", "AFTBAMBOO", "AFTANNA",
                "AFTEAM", "AFTDCT", "AFTJMSTICK", "AFTMD001", "LITE",
                "TOSHIBA", "INSIGNIA", "ONN", "BASICSEDGE", "AFTABY", "AFTPR")) {
            // Stick Lite / older Sticks / Toshiba / Insignia / onn smart TVs
            modelHint = LOW;
        } else if (model.startsWith("AFT") || model.startsWith("aft")) {
            // Unknown AFT*: treat conservatively by RAM below
            modelHint = null;
        }

        // --- Score from RAM / cores / decoder instances / resolution ---
        int score = 0;
        if (ramMb >= 2800) score += 3;
        else if (ramMb >= 1800) score += 2;
        else if (ramMb >= 1100) score += 1;
        // else 0 for ~1GB Stick Lite / weak TVs

        if (cores >= 6) score += 2;
        else if (cores >= 4) score += 1;

        if (maxInst >= 8) score += 2;
        else if (maxInst >= 4) score += 1;
        else if (maxInst <= 2 && maxInst > 0) score -= 1;

        int minDim = Math.min(sw, sh);
        if (minDim >= 1400) score += 1; // 1440p/4K panel
        else if (minDim > 0 && minDim < 800) score -= 1;

        String tier;
        String reason;
        if (modelHint != null) {
            tier = modelHint;
            reason = "model:" + model + "+score=" + score;
            // Soft override: very weak RAM can demote MID→LOW; strong RAM can promote LOW→MID only if score high
            if (HIGH.equals(tier) && ramMb > 0 && ramMb < 1400) {
                tier = MID;
                reason += ";demote-ram";
            } else if (MID.equals(tier) && ramMb > 0 && ramMb < 1100) {
                tier = LOW;
                reason += ";demote-ram";
            } else if (LOW.equals(tier) && ramMb >= 2800 && score >= 5) {
                tier = MID;
                reason += ";promote-ram";
            }
        } else {
            // Emulator / unknown: score buckets
            if (score >= 6) tier = HIGH;
            else if (score >= 3) tier = MID;
            else tier = LOW;
            reason = "score=" + score + ";model=" + model;
        }

        int videoTiles;
        int webH;
        boolean reduce;
        if (HIGH.equals(tier)) {
            // Full hub ring — enough for typical Chebyshev ring-1 (~10–16)
            videoTiles = 12;
            webH = 1080;
            reduce = false;
        } else if (MID.equals(tier)) {
            videoTiles = 4; // Stick 4K / 4K Max; JS may drop to 3 under perf
            webH = 1080;
            reduce = false;
        } else {
            // LOW: 1–2 near hub. Prefer 1 on ≤1GB / ≤2 cores; else 2.
            videoTiles = (ramMb > 0 && ramMb < 1100) || cores <= 2 ? 1 : 2;
            webH = minDim > 0 && minDim <= 800 ? 720 : 720; // weak SoC: always 720p layout
            reduce = true;
        }

        DeviceTier t = new DeviceTier(tier, model, mfr, ramMb, cores, maxInst, hwDec,
                sw, sh, videoTiles, webH, reduce, reason);
        Log.i(TAG, t.toJson());
        return t;
    }

    /** Override tier for emulator profile tests (?tier= / FEFC_TIER_FORCE). */
    public DeviceTier withOverride(String forceTier) {
        if (forceTier == null) return this;
        String f = forceTier.trim().toUpperCase();
        if (!LOW.equals(f) && !MID.equals(f) && !HIGH.equals(f)) return this;
        int vt = HIGH.equals(f) ? 12 : MID.equals(f) ? 4 : ((ramMb > 0 && ramMb < 1100) || cpuCores <= 2 ? 1 : 2);
        int wh = LOW.equals(f) ? 720 : 1080;
        boolean red = LOW.equals(f);
        return new DeviceTier(f, model, manufacturer, ramMb, cpuCores, maxHwDecoderInstances,
                hwVideoDecoders, screenW, screenH, vt, wh, red, reason + ";force=" + f);
    }

    public String toJson() {
        try {
            JSONObject o = new JSONObject();
            o.put("tier", tier);
            o.put("model", model);
            o.put("manufacturer", manufacturer);
            o.put("ramMb", ramMb);
            o.put("cpuCores", cpuCores);
            o.put("maxHwDecoderInstances", maxHwDecoderInstances);
            o.put("hwVideoDecoders", hwVideoDecoders);
            o.put("screenW", screenW);
            o.put("screenH", screenH);
            o.put("videoTiles", videoTiles);
            o.put("webViewTargetH", webViewTargetH);
            o.put("reduceEffects", reduceEffects);
            o.put("reason", reason);
            return o.toString();
        } catch (Exception e) {
            return "{\"tier\":\"" + tier + "\",\"videoTiles\":" + videoTiles + "}";
        }
    }

    private static boolean matches(String hay, String... needles) {
        for (String n : needles) {
            if (hay.contains(n.toUpperCase())) return true;
        }
        return false;
    }

    private static long ramMb(Context ctx) {
        try {
            ActivityManager am = (ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE);
            ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
            am.getMemoryInfo(mi);
            return Math.max(0L, mi.totalMem / (1024L * 1024L));
        } catch (Throwable t) {
            return 0L;
        }
    }

    /** Returns [maxSupportedInstances across HW video decoders, count of HW video decoders]. */
    private static int[] hwDecoderStats() {
        int maxInst = 0;
        int count = 0;
        try {
            MediaCodecList list = new MediaCodecList(MediaCodecList.ALL_CODECS);
            for (MediaCodecInfo info : list.getCodecInfos()) {
                if (info.isEncoder()) continue;
                String name = info.getName();
                if (name != null && (name.startsWith("OMX.google.") || name.startsWith("c2.android."))) {
                    continue; // software
                }
                boolean video = false;
                int localMax = 0;
                for (String type : info.getSupportedTypes()) {
                    if (type == null || !type.startsWith("video/")) continue;
                    video = true;
                    try {
                        MediaCodecInfo.CodecCapabilities caps = info.getCapabilitiesForType(type);
                        if (Build.VERSION.SDK_INT >= 23) {
                            int m = caps.getMaxSupportedInstances();
                            if (m > localMax) localMax = m;
                        }
                    } catch (Throwable ignored) {}
                }
                if (video) {
                    count++;
                    if (localMax > maxInst) maxInst = localMax;
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "codec probe failed", t);
        }
        return new int[]{maxInst, count};
    }

    private static int[] screenPx(Context ctx) {
        try {
            WindowManager wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);
            DisplayMetrics dm = new DisplayMetrics();
            wm.getDefaultDisplay().getRealMetrics(dm);
            return new int[]{dm.widthPixels, dm.heightPixels};
        } catch (Throwable t) {
            try {
                DisplayMetrics dm = ctx.getResources().getDisplayMetrics();
                return new int[]{dm.widthPixels, dm.heightPixels};
            } catch (Throwable t2) {
                return new int[]{0, 0};
            }
        }
    }
}
