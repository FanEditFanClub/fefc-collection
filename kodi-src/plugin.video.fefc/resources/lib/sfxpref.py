"""Folder-clip default. Unset means ON. An explicit false stays off."""

_ON = ('1', 'yes', 'on', 'true')
_OFF = ('0', 'no', 'off', 'false')


def sfx_enabled(raw):
    """Is sound audible for this raw setting value?

    Unset means ON: None, '' (blank), 'none' and 'default' all return True.
    '1', 'yes', 'on' and 'true' (any case, surrounding whitespace ignored)
    are ON; '0', 'no', 'off' and 'false' are OFF. Any other value is OFF
    (it is not a recognised "on" value). A bool or int input is handled
    through the same strings ('True' -> 'true', 1 -> '1', 0 -> '0').
    All real callers pass Kodi bool settings 'true'/'false', so the new
    spellings are latent robustness, not a behaviour change on live data.
    """
    if raw is None:
        return True
    if isinstance(raw, bool):
        return raw
    s = str(raw).strip().lower()
    if s in ('', 'none', 'default'):
        return True
    if s in _ON:
        return True
    if s in _OFF:
        return False
    return False


def should_persist_on(raw):
    """Has a sound choice ever been written to settings?

    This answers a different question from sfx_enabled(), and that is why
    the two disagree on 'none'/'default': sfx_enabled() asks "is sound
    audible now?" ('none'/'default' mean unset, so ON), while this asks
    "is there no stored choice yet?" — only None or a blank string count
    as never-stored. 'none'/'default' are stored placeholder values, so
    they return False here: a toggle must not overwrite them as if no
    choice had ever been persisted.
    """
    return raw is None or str(raw).strip() == ''


def toggle_plan(sound_off):
    """What a Sound press does, in order.

    sound_off is the live FEFC.SoundOff property ('1' means muted). The window
    property and the player change before the settings file is written. Fire TV
    was waiting on that write, so the label and the ambience stayed up for
    more than ten seconds.

    The 'on' key is the TARGET state after this press (True = sound will be
    on), not the current state: when sound_off is '1' (currently muted),
    'on' is True and 'property' is '' (unmute); when sound_off is not '1',
    'on' is False and 'property' is '1' (mute). The key name is kept as-is
    because callers read it; do not rename it.
    """
    on = sound_off == '1'
    return {
        'on': on,
        'property': '' if on else '1',
        'setting': 'true' if on else 'false',
        'steps': ('property', 'audio', 'persist'),
    }
