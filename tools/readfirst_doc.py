#!/usr/bin/env python3
"""Fetch the public Read First Google Doc (export?format=html) and write a clean, themable
HTML fragment to data/readfirst.html. Run before `npm run build` whenever the doc changes."""
import re, html, urllib.request, urllib.parse, pathlib
DOC='1KWjoQ-wDzkj1f97lHoe1H_o41V-IYCwXj48pamczPVk'
src=urllib.request.urlopen(f'https://docs.google.com/document/d/{DOC}/export?format=html',timeout=30).read().decode('utf8')
css=re.search(r'<style[^>]*>(.*?)</style>',src,re.S).group(1)
cls={}
for names,body in re.findall(r'((?:\.[\w-]+,?)+)\{([^}]*)\}',css):
    for n in names.split(','):
        cls.setdefault(n.strip('.'),'');cls[n.strip('.')]+=body+';'
body=re.search(r'<body[^>]*>(.*)</body>',src,re.S).group(1)
def span(m):
    st=' '.join(cls.get(c,'') for c in (re.search(r'class="([^"]*)"',m.group(1)) or [0,''])[1].split())
    st+=(re.search(r'style="([^"]*)"',m.group(1)) or [0,''])[1]
    inner=m.group(2)
    if 'font-weight:700' in st.replace(' ',''): inner=f'<b>{inner}</b>'
    if 'font-style:italic' in st.replace(' ',''): inner=f'<i>{inner}</i>'
    return inner
prev=None
while prev!=body:
    prev=body; body=re.sub(r'<span([^>]*)>((?:(?!<span).)*?)</span>',span,body,flags=re.S)
def link(m):
    u=html.unescape(m.group(1))
    if 'google.com/url' in u: u=urllib.parse.parse_qs(urllib.parse.urlparse(u).query).get('q',[u])[0]
    return f'<a href="{html.escape(u)}" target="_blank" rel="noopener">'
body=re.sub(r'<a [^>]*href="([^"]*)"[^>]*>',link,body)
body=re.sub(r'<a (?![^>]*href)[^>]*>(.*?)</a>',r'\1',body,flags=re.S)
body=re.sub(r'<p[^>]*>',r'<p>',body)
body=re.sub(r'(<p>\s*</p>\s*)+','',body)
pathlib.Path(__file__).resolve().parent.parent.joinpath('data/readfirst.html').write_text(body.strip()+'\n')
print('ok',len(body))
