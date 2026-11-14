"""Search submit and result messages. The catalogue search itself stays in catalog.search."""


def submit(edit_text):
    if not isinstance(edit_text, str):
        return {'ok': False, 'query': '', 'status': 'Type a title, then press Search.'}
    q = edit_text.strip()
    if not q:
        return {'ok': False, 'query': '', 'status': 'Type a title, then press Search.'}
    return {'ok': True, 'query': q, 'status': ''}


def result_message(query, count, failed):
    if failed:
        return 'The catalogue could not be loaded. Try again in a moment.'
    q = query if isinstance(query, str) else ('' if query is None else str(query))
    q = q.strip()
    if not q:
        return 'Type a title, then press Search.'
    shown = q if len(q) <= 60 else q[:57] + '...'
    if count is None:
        # Unknown, not zero: do not claim there are no results.
        return 'Results for "%s" could not be counted. Try again.' % shown
    if not count:
        return 'No results for "%s"' % shown
    return ''
