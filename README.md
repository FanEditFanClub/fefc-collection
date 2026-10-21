# The Fan Edit Fan Club Collection — web app
Static site (no server, no paid services). Open index.html via any static host.
- Saved index: data/index.json (read-only snapshot, currently top-level folders + root files).
- Live mode: set GOOGLE_CLIENT_ID in config.js → "SIGN IN" reads Drive with drive.readonly, resolves shortcuts, shows Drive thumbnails, plays via https://drive.google.com/file/d/<id>/preview.
- Optional TMDB_API_KEY (free) for poster art; otherwise generated Metro title cards.
## Getting a free OAuth client id
console.cloud.google.com → new project → enable "Google Drive API" → OAuth consent screen (External, Testing, add your Gmail as test user, scope drive.readonly) → Credentials → OAuth client ID → Web application → Authorized JavaScript origins: the site URL (e.g. https://fefc-collection.onrender.com, http://localhost:8080).

## v2
- Dashboard (home/collections/search/new arrivals): OnLive-style glossy menu bar + tile arena. Details page: TNG LCARS.
- data/metadata.json: prebuilt per-edit details keyed by Drive file id (description, cast, ratings with source links, trailer). Never invented; missing = "No data".
- Optional live fills via config.js: OMDB_API_KEY (IMDb/RT), TMDB_API_KEY (art), YOUTUBE_API_KEY (trailer search, labelled as unofficial).
- audio.js: all sounds synthesized with Web Audio (no files). Mute button persists. Ambience pauses during details/video.
- Intro: original CSS animation (tile "sun" + bloom + flare, FEFC logo), skippable by tap, 1.4s on repeat visits.
- Debug URL params: ?nointro=1, ?introframe=<sec>, ?edit=<fileId>, ?play=<fileId>.
