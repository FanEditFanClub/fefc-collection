# Stream proxy: server-side Drive OAuth (read-only)

Some fan edits are shared with `faneditfanclub@gmail.com` (or owned by it) rather than **Anyone with the link**. The public `GOOGLE_API_KEY` path then returns 403 / a Google sign-in interstitial. The Worker `/api/stream/:id` proxy can authenticate as that account so TV and web play without any viewer sign-in.

## Secrets (Cloudflare Pages → fefc-collection → Settings → Variables and Secrets)

| Secret | Purpose |
|--------|---------|
| `GOOGLE_DRIVE_CLIENT_ID` | OAuth client ID (Web or Desktop) in project `965770773324` |
| `GOOGLE_DRIVE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | Refresh token for **faneditfanclub@gmail.com** with scope `https://www.googleapis.com/auth/drive.readonly` |

Optional still useful: `GOOGLE_API_KEY` (public/"anyone with the link" fallback).

## One-time consent (offline access)

1. In Google Cloud Console (same project as the Collection), create an OAuth client (Desktop app is fine) named e.g. `FEFC Stream Proxy`. Enable the **Google Drive API**.
2. OAuth consent screen: add scope `drive.readonly` only. Publishing **In production** avoids test-user limits.
3. Run a one-time auth code exchange with `access_type=offline` and `prompt=consent` as **faneditfanclub@gmail.com**. Save only the refresh token into Pages secrets (never commit it).
4. Redeploy Pages so the Worker sees the new secrets.

## Guarantees

- Read-only (`drive.readonly`). No Drive sharing or content changes.
- Tokens are never logged. Access tokens are cached in-isolate briefly.
- Clients (in-app player, Fire TV native player, **Open in VLC**) already use `/api/stream/…`; no client secret needed.
