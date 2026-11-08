"""When the Back navigation sound should play.

The packaged sound skin (resource.uisounds.fefc sounds.xml) maps back / previousmenu / parentdir
to back.wav, but Kodi's default GUI-sound mode is "only when playback is stopped". The home-wall
video is playing during browsing, so those cues stay silent until the mode is "always".

Python plays the same wav for the plugin ".." row (Kodi does not fire parentdir for that) and
when the sound skin will not. A short debounce stops a second cue when the skin and Python both
run for one Back. Playback of the wall is never stopped to make room for the cue.
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
    if volume is not None and volume <= 0:
        return False
    return True


def gui_sound_mode(sound_on):
    """2 = always (audible during the wall). 0 = off, matching an explicit Sound Off."""
    return 2 if sound_on else 0


def should_play(sound_on, volume, now, last, debounce=DEBOUNCE_S):
    if not sound_allowed(sound_on, volume):
        return False
    if last and (now - last) < debounce:
        return False
    return True


def plugin_back_should_play(sound_on, volume, now, last, skip_marked):
    """Plugin history back. Skip when a keymap just let the sound skin play this same press."""
    if skip_marked:
        return False
    return should_play(sound_on, volume, now, last)


def arm_back(sound_on, volume, now, last, skin_always):
    """Keymap hook that runs before Back. Returns (play_now, mark_skip)."""
    if not sound_allowed(sound_on, volume):
        return False, False
    if skin_always:
        return False, True
    return should_play(sound_on, volume, now, last), True
