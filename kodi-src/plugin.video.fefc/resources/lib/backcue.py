"""When the Back navigation sound should play.

The packaged sound skin (resource.uisounds.fefc sounds.xml) maps back / previousmenu / parentdir
to back.wav, but Kodi's default GUI-sound mode is "only when playback is stopped". The home-wall
video is playing during browsing, so those cues stay silent until the mode is "always".

Python plays the same wav for the plugin ".." row (Kodi does not fire parentdir for that) and
when the sound skin will not. A short debounce stops a second cue when the skin and Python both
run for one Back. Playback of the wall is never stopped to make room for the cue.

now/last throughout this module are time.monotonic() seconds, never wall
clock: a clock jump must not suppress or disable the 0.4 s debounce.
FEFC.BackAt stores the same monotonic value. A leftover wall-clock BackAt from
before the monotonic switch is far larger than any monotonic reading, so
now - last is negative, and should_play() treats a negative gap as "stale, do
not suppress": it self-heals on the first Back after the switch.
"""
DEBOUNCE_S = 0.4
# parentdir, previousmenu, nav back
BACK_ACTION_IDS = (9, 10, 92)

WAV_CANDIDATES = (
    'special://xbmc/addons/resource.uisounds.fefc/resources/back.wav',
    'special://home/addons/resource.uisounds.fefc/resources/back.wav',
    'special://xbmc/addons/plugin.video.fefc/resources/ui-back.wav',
    'special://home/addons/plugin.video.fefc/resources/ui-back.wav',
)


def sound_allowed(sound_on, volume):
    if not sound_on:
        return False
    # volume is None (unknown) or a number from Application.GetProperties.
    # A non-numeric volume must not raise: treat it as unknown (allowed).
    if volume is not None and isinstance(volume, (int, float)) and volume <= 0:
        return False
    return True


def gui_sound_mode(sound_on):
    """2 = always (audible during the wall). 0 = off, matching an explicit Sound Off."""
    return 2 if sound_on else 0


def should_play(sound_on, volume, now, last, debounce=DEBOUNCE_S):
    """True when a cue may play now. now/last are time.monotonic() seconds.

    Only a gap in [0, debounce) suppresses. A negative gap (last is newer
    than now, or a stale wall-clock BackAt left over from before the
    monotonic switch) means the stored time cannot be trusted, so it does
    not suppress — the cue plays and BackAt is re-stamped in monotonic time.
    """
    if not sound_allowed(sound_on, volume):
        return False
    if last and 0 <= (now - last) < debounce:
        return False
    return True


def plugin_back_should_play(sound_on, volume, now, last, skip_marked):
    """Plugin history back. Skip when a keymap just let the sound skin play this same press."""
    if skip_marked:
        return False
    return should_play(sound_on, volume, now, last)


def arm_back(sound_on, volume, now, last, skin_always):
    """Keymap hook that runs before Back. Returns (play_now, mark_skip).
    now/last are time.monotonic() seconds (see should_play)."""
    if not sound_allowed(sound_on, volume):
        return False, False
    if skin_always:
        return False, True
    return should_play(sound_on, volume, now, last), True
