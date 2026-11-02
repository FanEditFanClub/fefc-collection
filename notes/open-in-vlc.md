# Open in VLC (Fire TV)

- Bridge: `FEFCNative.openInVlc(driveId, title)` → ACTION_VIEW setPackage(org.videolan.vlc),
  data = `https://collection.faneditfanclub.com/api/stream/{id}` (same as PlayerActivity),
  type `video/*`, extra `title`. Fallback direct Drive confirm=t. Missing VLC → amzn:// Appstore.
- Details order Fire TV: Play (default) → Open in VLC → Open in Drive.
- Web: Play → Open in Drive (no VLC; button gated on FEFCNative.openInVlc).
- Do not change Drive sharing.
