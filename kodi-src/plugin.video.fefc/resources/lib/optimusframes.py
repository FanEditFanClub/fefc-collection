"""Silent search-card frames. JPEGs only — the source clip's audio is never packaged."""
import os

try:
    from . import optimusplan
except ImportError as e:
    # Only fall back when the failure names optimusplan itself. An
    # ImportError from inside optimusplan is a real bug — re-raise it
    # instead of masking it with the plain import.
    if getattr(e, 'name', None) is not None and 'optimusplan' not in str(e.name):
        raise
    import optimusplan

SUPPORT_DIR = 'optimus-support'


def _frame_paths(media_dir, subdir):
    """Sorted JPEG paths in media_dir/subdir. Empty when the pack is missing."""
    if not media_dir:
        return []
    d = os.path.join(media_dir, subdir)
    if not os.path.isdir(d):
        return []
    try:
        names = os.listdir(d)
    except OSError:
        return []
    names = [n for n in names
             if n.lower().startswith('f') and n.lower().endswith('.jpg')
             and os.path.isfile(os.path.join(d, n))]
    names.sort()
    return [os.path.join(d, n) for n in names]


def frame_list(media_dir):
    """Sorted JPEG paths. Empty when the pack is missing, so the still is used."""
    return _frame_paths(media_dir, optimusplan.FRAME_DIR)


# Support frames are extended below the original 480x640 crop so the shoes fit.
SUPPORT_W = 480
SUPPORT_H = 933


def support_frames(media_dir):
    """Silent Support Us loop. JPEGs only, same idea as the search frames."""
    return _frame_paths(media_dir, SUPPORT_DIR)
