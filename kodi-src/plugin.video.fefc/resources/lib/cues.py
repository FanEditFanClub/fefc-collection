"""Single source of truth for FEFC UI cues and title/genre clip triggers.

Why this keeps breaking: UI clicks are Kodi sound-skin actions, and title clips
are a separate Python path. The skin only plays while audiooutput.guisoundmode
is 2, because the home-wall video is always running. That default is patched
into android.xml at build time and set again over JSON-RPC at startup. A Kodi
settings layout change makes the APK string-replace miss, and the JSON-RPC set
often runs before guisettings is loaded, so the mode falls back to "only when
playback is stopped" and every cue goes silent. 0.6.3 also made video tiles
open the details page (select action Show information). That key is the "info"
action, which was not in sounds.xml, so a file tile played nothing while a
folder tile still played "select". The same release baked one clip URL onto the
list item and details_sfx latched the item id before that property was ready,
so the title clip was skipped for the rest of the open.

This module is the list both the sound-skin XML and the Python player use.
Sound off returns no file for every event.
"""

UI = {
    'select': 'click.wav',
    'back': 'back.wav',
    'home': 'back.wav',
    'search': 'click.wav',
    'pause': 'pause.wav',
    'resume': 'resume.wav',
    'forward': 'forward.wav',
    'rewind': 'rewind.wav',
}

# Kodi action name -> wav. Video tiles fire "info" (show information), not "select".
SKIN_ACTIONS = (
    ('left', 'move.wav'),
    ('right', 'move.wav'),
    ('up', 'move.wav'),
    ('down', 'move.wav'),
    ('pageup', 'move.wav'),
    ('pagedown', 'move.wav'),
    ('select', 'click.wav'),
    ('info', 'click.wav'),
    ('back', 'back.wav'),
    ('previousmenu', 'back.wav'),
    ('parentdir', 'back.wav'),
    # Playback. The service plays these from player state (OSD buttons call
    # PlayerControl and never hit this map). The names are here so a remote
    # that still sends the action gets the same file.
    ('pause', 'pause.wav'),
    ('play', 'resume.wav'),
    ('playpause', 'resume.wav'),
    ('fastforward', 'forward.wav'),
    ('rewind', 'rewind.wav'),
    ('stepforward', 'forward.wav'),
    ('stepback', 'rewind.wav'),
    ('bigstepforward', 'forward.wav'),
    ('bigstepback', 'rewind.wav'),
    ('smallstepback', 'rewind.wav'),
    ('skipplus', 'forward.wav'),
    ('skipminus', 'rewind.wav'),
)

REQUIRED_WAVS = ('click.wav', 'back.wav', 'move.wav', 'open.wav',
                 'pause.wav', 'resume.wav', 'forward.wav', 'rewind.wav')
SOUND_SKIN = 'resource.uisounds.fefc'
GUI_SOUND_ALWAYS = 2
# Re-apply the Kodi setting this often. Startup JSON-RPC is often too early.
REAPPLY_SECONDS = 45

SOUNDS_XML_HEAD = '''<?xml version="1.0" encoding="UTF-8"?>
<sounds>
	<actions>
'''
SOUNDS_XML_TAIL = '''	</actions>
	<windows>
		<window><name>movieinformation</name><activate>open.wav</activate></window>
		<window><name>videos</name><activate>open.wav</activate></window>
	</windows>
</sounds>
'''


def sounds_xml():
    lines = [SOUNDS_XML_HEAD]
    for name, filename in SKIN_ACTIONS:
        lines.append('\t\t<action><name>%s</name><file>%s</file></action>\n' % (name, filename))
    lines.append(SOUNDS_XML_TAIL)
    return ''.join(lines)


def ui_file(event, sound_off):
    """Wav to play for one UI event, or '' when Sound off or the event is unknown."""
    if sound_off:
        return ''
    return UI.get(event) or ''


def opening_plan(kind, sound_off, clips):
    """What an open should play.

    kind is select, file, folder, genre, search, home, or back.
    clips is the title or genre set (a list of asset paths) or a single path.
    Sound off plays nothing. A file, folder, or genre with clips plays the UI
    click and one clip. Search plays the click. Home and Back play the back cue.
    """
    empty = {'click': '', 'clip': ''}
    if sound_off:
        return empty
    click = ''
    if kind in ('select', 'file', 'folder', 'genre', 'search', 'action'):
        click = UI['select']
    elif kind in ('back', 'home'):
        click = UI['back']
    clip = ''
    if kind in ('file', 'folder', 'genre'):
        if isinstance(clips, str) and clips:
            clip = clips
        elif isinstance(clips, (list, tuple)) and clips:
            clip = next((c for c in clips if isinstance(c, str) and c), '')
    return {'click': click, 'clip': clip}


def details_ready(item_id, clip_url, sound_off, latched_id):
    """Whether the details page should play now, and the id to remember.

    An empty clip or a missing id does not latch: the info dialog often becomes
    active a poll before the list item property is visible. Sound off does not
    latch either, so turning sound back on while the page is open still plays.
    """
    if sound_off or not item_id or item_id == latched_id or not clip_url:
        return False, latched_id
    return True, item_id


def transport_event(prev, now, sound_off):
    """Cue for a change in playback, or '' when nothing new should play.

    prev and now are dicts with playing, paused, forwarding, rewinding, wall.
    Sound off is silent. The home-wall loop and the intro are not a title,
    so they never get a transport cue. Fast-forward and rewind win over a
    pause change in the same poll, because starting a scan also leaves pause.
    """
    if sound_off or now.get('wall') or not (now.get('playing') or now.get('paused')):
        return ''
    if now.get('forwarding') and not prev.get('forwarding'):
        return 'forward'
    if now.get('rewinding') and not prev.get('rewinding'):
        return 'rewind'
    if now.get('paused') and not prev.get('paused'):
        return 'pause'
    if prev.get('paused') and not now.get('paused') and now.get('playing'):
        return 'resume'
    return ''


def apk_asset_paths():
    """Paths inside a built FEFC APK that must exist for cues to be audible."""
    root = 'assets/addons/resource.uisounds.fefc/resources/'
    return [root + name for name in REQUIRED_WAVS] + [root + 'sounds.xml']
