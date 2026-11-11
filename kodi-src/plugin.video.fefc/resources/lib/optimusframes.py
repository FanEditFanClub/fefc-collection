"""Silent search-card frames. JPEGs only — the source clip's audio is never packaged."""
import os

try:
    from . import optimusplan
except ImportError:
    import optimusplan


def frame_list(media_dir):
    """Sorted JPEG paths. Empty when the pack is missing, so the still is used."""
    d = os.path.join(media_dir, optimusplan.FRAME_DIR)
    if not os.path.isdir(d):
        return []
    names = [n for n in os.listdir(d) if n.startswith('f') and n.lower().endswith('.jpg')]
    names.sort()
    return [os.path.join(d, n) for n in names]


def still_path(media_dir):
    return os.path.join(media_dir, optimusplan.IMAGE_NAME)


# Support frames are extended below the original 480x640 crop so the shoes fit.
SUPPORT_W = 480
SUPPORT_H = 933


def support_frames(media_dir):
    """Silent Support Us loop. JPEGs only, same idea as the search frames."""
    d = os.path.join(media_dir, 'optimus-support')
    if not os.path.isdir(d):
        return []
    names = [n for n in os.listdir(d) if n.startswith('f') and n.lower().endswith('.jpg')]
    names.sort()
    return [os.path.join(d, n) for n in names]
