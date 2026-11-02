# Mosaic frame timings — 0.8.12 → 0.8.13 (hub-ring video + outer stills)

Emulator: FireTV28 headless, soft decode (not Cube silicon). Absolute ms inflated vs device.

## Decoder policy landed
**3** concurrent muted `<video>` tiles on Fire/TV with Performance mode ON (default).
Ring-1 (Chebyshev neighbors of the 3×3 hub) are the only video candidates; if ring-1 >
cap, rotate which subset holds the decoders every ~40–55s. Outer tiles (`data-ring ≥ 2`)
and overflow ring tiles run opacity-only still-frame slideshows (bundled WebP, preload next only).

## Before (0.8.12 handoff baseline — gfxinfo, first ~5s Home)
Source: `/tmp/fefc-shots/gfxinfo-before.txt` / `h-frame-timings.md`
- Total frames: 49
- Janky: 49 (100%)
- p50=350ms p90=1450ms p95=1750ms p99=4950ms
- Missed Vsync 49 · Slow UI 49 · Slow bitmap 25 · Deadline missed 49
- Mosaic policy then: up to 2 Fire TV hardware videos; remaining tiles often GIF/poster-heavy.

## After (0.8.13 mosaic APK vc22, post home_reveal)
### FEFC_FRAME_STATS (app rAF HUD sample, logcat 17:35:44 America/New_York→17:35:44 EST)
`{"n":3,"avg":3513.9,"p50":8613.8,"p95":36767.6,"max":36767.6,"over16":2,"over33":2,"over50":2}`
- Sample window is tiny (n=3) on soft-decode emu during settle; treat as qualitative.
- gfxinfo after settle often reports **0 frames** for WebView surfaces on API 28 ATV emu
  (see `gfxinfo-mosaic-after.txt`) — prefer FEFC_FRAME_STATS / FPS HUD on device.

### Qualitative
- home_reveal ready=true tries=4 → home_reveal_js=ok (same handoff path as 0.8.12).
- Screenshot: `/tmp/fefc-shots/home-mosaic-ring.png` (v0.8.13 beta hub + mosaic + ticker flush).
- Still frames: 164 clips × 5 WebP ≈ 820 files / ~4.6 MiB bundled under `assets/clips/frames/`.

## Cost of lag cuts (for ship report)
- Perf mode default ON (TV/Fire): fewer mosaic videos (3), longer still dwell, leaner CSS.
- Ring-only video + still slideshow replaces many concurrent decoders / GIFs.
- Staggered video starts (~320ms gap on Fire/perf) + low-bitrate 360p clips.
