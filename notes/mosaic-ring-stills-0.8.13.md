# Mosaic 0.8.13 — hub-ring video + outer still slideshows

## Behavior
- **No GIFs.**
- Tiles in Chebyshev **ring 1** (immediately surrounding the 3×3 hub) play live muted `<video>` from bundled low-bitrate ~360p clips (`assets/clips/*.mp4`, 384×216, ~100 kbps H.264).
- **Outer** tiles (`data-ring >= 2`, including headline band) cycle **4–5 still frames** extracted per clip (`assets/clips/frames/{n}_{i}.webp`, ~320px wide). Opacity-only CSS crossfade every ~3–5s (perf: ~4–6.5s), staggered; **preload next frame only**.
- Simultaneous hardware decoders on Cube/Fire TV: **3 with Performance mode ON (default), 4 when OFF**.
- If ring-1 count exceeds the cap, rotate which ring tiles hold the decoders every ~40–55s.

## Decoder count landed on
**3** concurrent video tiles on Cube (perf default). Ring-1 often has ~10–16 cells; the rest of the ring joins the still slideshow until rotation.

## Frame extract
`tools` one-shot: ffmpeg `-vf scale=320:-2` libwebp quality 68, 5 samples across each ~4s clip. 164 clips → 820 frames, ~4.6 MiB under `assets/clips/frames/`.
