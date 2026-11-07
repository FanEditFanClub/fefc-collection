"""Allow Notifications decision. Mirrors FefcNotifyActivity."""


def plan(sdk, granted, asked, rationale):
    try:
        sdk = int(sdk or 0)
    except (TypeError, ValueError):
        sdk = 0
    if sdk < 33:
        return 'not_required'
    if granted:
        return 'already_granted'
    if asked and not rationale:
        return 'open_settings'
    return 'request'


MESSAGES = {
    'not_required': "This Android version does not show an Allow notifications popup. This app's notification settings were opened.",
    'already_granted': "Notifications are already allowed. This app's notification settings were opened.",
    'granted': 'Notifications allowed.',
    'open_settings': "Android will not show the Allow popup again. This app's notification settings were opened.",
    'denied': "Notifications were not allowed. This app's notification settings were opened.",
    'denied_settings': "Notifications were not allowed. This app's notification settings were opened.",
    'prompt': 'Allow the system notification prompt if Android shows one.',
    'request': 'Allow the system notification prompt if Android shows one.',
}
