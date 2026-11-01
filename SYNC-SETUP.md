# My List sync: one-time setup (Cloudflare + Google Cloud)

The code for these is in the repo. Nothing works until these dashboard items exist. Never put the secrets in git or chat.

## How it works
- **Where lists live:** Cloudflare KV namespace bound as `SYNC`. Endpoints are in `_worker.js` under `/api/sync/*`. A list is `{stars, history, playback}` merged last-write-wins per record (the same rule as the Google Drive sync), so devices converge.
- **Sessions:** each device gets a random 256-bit token (stored hashed in KV, valid 1 year, sent as a Bearer header). Lists are keyed by Google user ID (`g:<sub>`) or a random ID for sync-code users (`c:<random>`).
- **Existing web Google Drive sync still works unchanged.** After a web Google sign-in, the site also exchanges the Google token for a server session (the server verifies it with Google's `tokeninfo` and checks the client ID), so the Drive list and the server list of the same Google user merge.
- **1. Google TV code:** the TV asks the server to start Google's OAuth device flow (scopes `openid email profile`). The TV shows the code and google.com/device. The server polls Google with the client secret, gets the ID token, and creates a session for that Google user ID. (Google does allow `drive.appdata` in the device flow, but a different OAuth client may not see the same Drive appData file, so the TV uses the server list and merges with Drive when the same user signs in on the web.)
- **2. QR code:** the TV gets a one-time link valid 5 minutes (`https://collection.faneditfanclub.com/?link=<id>`), shown as a QR code with a 4-digit confirm code. The phone opens it, checks the confirm code matches the TV, and taps Approve (phone must have a sync session: Google, or "Link without Google"). The TV's poll then receives its own session. Single use.
- **3. 6-digit sync code:** "Create a code" gives a 6-digit code valid 10 minutes (max 8 devices). "Enter a code" redeems it for the device's own session on the same list. Wrong guesses are rate-limited (8 per IP per 10 minutes, 300 per minute overall).
- **UI:** no sign-in button in the top bar. "Sync My List" is a card on the My List page and an item in the profile-picture menu (the avatar appears once a device is linked). The panel works with arrow keys, Select and Back.

## Cloudflare (dashboard, account faneditfanclub@gmail.com)
1. Workers & Pages > KV > **Create a namespace**, name it `fefc-sync`.
2. Workers & Pages > `fefc-collection` > Settings > **Bindings** (Functions) > Add > **KV namespace**: variable name **`SYNC`**, namespace `fefc-sync`. Add it for Production (and Preview if used). Bindings persist across zip deployments.
3. Free-plan KV limits: 1,000 writes/day and 100,000 reads/day. Lists are only written when they actually change.

## Google Cloud (account that owns the existing web OAuth client, project 965770773324)
1. APIs & Services > Credentials > **Create credentials > OAuth client ID** > application type **TVs and Limited Input devices**, name it `FEFC Collection TV`.
2. Copy its **Client ID** and **Client secret**.
3. In Cloudflare Pages > `fefc-collection` > Settings > Variables and Secrets (Production), add as **encrypted secrets**: `GOOGLE_TV_CLIENT_ID` and `GOOGLE_TV_CLIENT_SECRET`.
4. OAuth consent screen: make sure publishing status is **In production** (scopes openid/email/profile need no verification), otherwise only listed test users can sign in.
5. Nothing to change on the existing web client. (Optional env `GOOGLE_WEB_CLIENT_ID` only if that client ID ever changes.)

Options 2 and 3 only need the KV binding. Option 1 also needs the two secrets. Until they exist the panel says the option isn't set up yet.
