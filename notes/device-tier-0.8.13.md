# Device tier (0.8.13) — all Fire TVs

## Detection (native `DeviceTier.java`)
Inputs: `Build.MODEL` / DEVICE / PRODUCT (AFT* families), `ActivityManager.MemoryInfo.totalMem`,
`Runtime.availableProcessors()`, `MediaCodecList` HW video decoder `getMaxSupportedInstances()`,
real screen px.

## Tiers → mosaic video-tile count
| Tier | Devices | Video tiles (hub ring) | WebView target | Effects |
|------|---------|------------------------|----------------|---------|
| LOW  | Toshiba/Insignia/onn TVs, Stick Lite, older Sticks | **1–2** (1 if RAM&lt;1.1GB or ≤2 cores) | **720p** | no blur/glow (`tier-lite`) |
| MID  | Stick 4K, 4K Max | **4** (JS perf → **3**) | 1080p | normal |
| HIGH | Fire TV Cube (1st/2nd/3rd) | **full ring** (cap **12**) | 1080p | normal |

Outer tiles (`data-ring ≥ 2`) and ring overflow always use still-frame slideshows.

## JS bridge
`FEFCNative.deviceTier()` / `.tier()` / `.videoTiles()` / `.log()`; injected `window.__fefcTier` + body classes
`tier-low|tier-mid|tier-high` (+ `tier-lite` on LOW). Override: Intent `--es tier LOW|MID|HIGH` and `?tier=` for emu tests.
QA: `--ez skip_native_intro true`.

## Emulator profile results (sdk_google_atv_x86, ~1494 MB RAM, 4 cores, maxHwDecoderInstances=0)

Native auto-detect on this AVD: **LOW** (score=2; no AFT model hint).

Forced via `am start --es tier … --ez skip_native_intro true` (America/New_York, 2026-11-02):

| Force | `videoTiles` (native) | `webViewTargetH` | `reduceEffects` | Log line |
|-------|----------------------:|-----------------:|-----------------|----------|
| LOW   | **2** | 720 | true | `FEFC_CLIPS_DUMP tier=LOW nativeVT=2` |
| MID   | **4** | 1080 | false | `FEFC_CLIPS_DUMP tier=MID nativeVT=4` |
| HIGH  | **12** | 1080 | false | `FEFC_CLIPS_DUMP tier=HIGH nativeVT=12` |

JS `decoders()` with TV **perf ON** (default): LOW→**1**, MID→**3**, HIGH→**12** (when `?tier=` override is present). Without query override, JS uses native `videoTiles` (2 / 4 / 12) and only clamps MID to 3 under perf.

Mosaic `__clipStats` was still `null` at the 2.5s post-reveal dump on this slow emu (hub tiles not scheduled yet); decoder **cap** is the nativeVT / JS decoders() value above.
