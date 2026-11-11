"""Folder-clip default. Unset means ON. An explicit false stays off."""


def sfx_enabled(raw):
    if raw is None:
        return True
    s = str(raw).strip().lower()
    if s in ('', 'none', 'default'):
        return True
    return s == 'true'


def should_persist_on(raw):
    return raw is None or str(raw).strip() == ''


def toggle_plan(sound_off):
    """What a Sound press does, in order.

    sound_off is the live FEFC.SoundOff property ('1' means muted). The window
    property and the player change before the settings file is written. Fire TV
    was waiting on that write, so the label and the ambience stayed up for
    more than ten seconds.
    """
    on = sound_off == '1'
    return {
        'on': on,
        'property': '' if on else '1',
        'setting': 'true' if on else 'false',
        'steps': ('property', 'audio', 'persist'),
    }
