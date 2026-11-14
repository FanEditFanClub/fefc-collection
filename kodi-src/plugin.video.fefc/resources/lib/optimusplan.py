"""Copy shown on the Kodi search dialog. The web spotlight still uses CUE.

Kodi-used: TITLE and FRAME_MS (router OptimusWindow), FRAME_DIR and
IMAGE_NAME (optimusframes). CUE is web-only. SEARCH_LABEL, STILL_URL and
BOT_URL have no Kodi caller today and are KEPT deliberately as web-parity
constants — the canonical copy/URLs shared with the web spotlight — not
dead code to delete. Do not remove them in a dead-code sweep.
"""
CUE = 'Optimus is watching a fan edit. Type to interrupt him.'
TITLE = 'Search with Fan Edit Optimus'
SEARCH_LABEL = 'Search'
IMAGE_NAME = 'optimus-watch.webp'
# Silent JPEG frames from the reviewed clip. Not played through Kodi's video player,
# so the home-wall ambience keeps the only player. The still is the fallback.
FRAME_DIR = 'optimus-search'
# 125 ms = 8 fps, intentionally slower than SupportWindow's 24 fps pump:
# the search loop is 48 stills of gentle ambient motion (~6 s loop), while
# the Support Us loop is a 265-frame clip that needs 24 fps for smooth
# motion. Do not "fix" this to 24 fps.
FRAME_MS = 125
STILL_URL = 'https://fefc-collection.pages.dev/assets/optimus-watch.webp'
BOT_URL = 'https://x.ai/bot/DR18SV4AEeeNRcKT1U-0P'
