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
