# Open in VLC (Fire TV) — 0.8.14 evidence

## Bridge
`FEFCNative.openInVlc(driveId, title[, fileName])` → ACTION_VIEW, `setPackage(org.videolan.vlc)`,
data = `https://collection.faneditfanclub.com/api/stream/{id}/{asciiFileName}` (Range proxy),
fallback Drive confirm=t; missing VLC → amzn:// Appstore.

## Exact URIs under test
- **MP4 (>1GB):** `https://collection.faneditfanclub.com/api/stream/1pnJ2frgwOXXd9e4xdZ9tbp-FFRyGYK2q/YoungIndianaJones-PhantomTrain.mp4`
  - Size from Content-Range: **1005254882** bytes (~958 MiB reported earlier as ~1.005GB)
- **MKV (>1GB):** `https://collection.faneditfanclub.com/api/stream/1rXGixOdx1DDw3-gpZt0AIEHkmH4ytgbQ/FreddysNightmares-S02E18.mkv`
  - Target size ~**1004857188** bytes

## curl Range (host)
### MP4 (2026-11-02 14:36 ET)
```
HTTP/2 206 
date: Mon, 02 Nov 2026 19:36:37 GMT
content-type: video/mp4
content-length: 1048576
report-to: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=m3IgYKyBRCBb8lckjFg5gmhrrI92%2FwE7pQ%2FMSfqrP6qH7YN%2F82ZQFD5nAJRYFFOgg2VfecT5yVU65MxnBBa5EnPJSw9BIfPnV7ANWqx5onsHQzVOZd8R1Ko3XwGw2PgbQBDIBhgr1bCMpk6klams1YlKA04kvAaD7LFf5w%3D%3D"}]}
content-range: bytes 0-1048575/1005254882
nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
accept-ranges: bytes
access-control-allow-origin: *
cache-control: private, max-age=14400
content-disposition: inline; filename="YoungIndianaJones-PhantomTrain.mp4"
last-modified: Tue, 21 Jul 2026 01:46:16 GMT
access-control-expose-headers: content-range,accept-ranges,content-length,content-type,content-disposition
server: cloudflare
cf-cache-status: BYPASS
cf-ray: a54596c8a9837fed-IAD
alt-svc: h3=":443"; ma=86400

```
### MKV
Rate-limited (HTTP 429) on repeated Range probes; retest during play verification.

## On-device VLC
Pending this session's play-past-30s runs (logcat: first picture + PlaybackState state=3).
