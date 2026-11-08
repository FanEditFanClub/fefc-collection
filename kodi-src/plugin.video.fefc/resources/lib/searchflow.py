"""Search submit and result messages. The catalogue search itself stays in catalog.search."""


def submit(edit_text):
    q = (edit_text or '').strip()
    if not q:
        return {'ok': False, 'query': '', 'status': 'Type a title, then press Search.'}
    return {'ok': True, 'query': q, 'status': ''}


def result_message(query, count, failed):
    if failed:
        return 'The catalogue could not be loaded. Try again in a moment.'
    if not (query or '').strip():
        return 'Type a title, then press Search.'
    if not count:
        return 'No results for "%s"' % (query or '').strip()
    return ''
