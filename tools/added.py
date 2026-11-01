#!/usr/bin/env python3
"""New Arrivals ordering data. Run in the nightly AFTER tools/dates.py (which rewrites data/dates.json from the folder listings = last-modified day).
 data/added.json   {id:'first seen'}  first time the resync saw this entry in the crawl. Never rewritten, only appended - so even when a shortcut is
                   later renamed/modified (which bumps its listing date) it keeps the date it really joined the collection.
 data/created.json {id:'Drive createdTime (ISO, UTC)'} exact createdTime of the entry itself (for a shortcut: the shortcut's own createdTime, not its
                   target's). The public listing the nightly crawler uses has no createdTime, so exact values are pinned here from Drive metadata
                   (get_file_metadata / search_files createdTime) for the recent items; edit/extend this file whenever you verify more.
 Result merged into data/dates.json as {m:listing day, a:first-seen, c:createdTime}; the client ranks c > a > m (src/newarrivals.js).
 First run seeds added.json with the previous listing day of every known entry (SEED_FROM=<old index.json>), so only truly new files get 'today'."""
import json,os,sys,datetime
D=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','data')
ld=lambda n,dflt:json.load(open(f'{D}/{n}')) if os.path.exists(f'{D}/{n}') else dflt
idx=ld('index.json',{'items':[]});dates=ld('dates.json',{});added=ld('added.json',None);created=ld('created.json',{})
now=datetime.datetime.now().strftime('%Y-%m-%dT%H:%M')
ids=[i['id'] for i in idx['items'] if i['mimeType'].startswith('video')];idset=set(ids)
seeded=0
if added is None:
    added={};seed=os.environ.get('SEED_FROM')
    old={i['id'] for i in json.load(open(seed))['items']} if seed and os.path.exists(seed) else set(ids)
    sd=os.environ.get('SEED_DATES');od=json.load(open(sd)) if sd and os.path.exists(sd) else {}   # previous dates.json: last-modified day BEFORE any later rename bumped it
    for i in ids:
        if i in old: added[i]=(od.get(i) or dates.get(i) or {}).get('m') or '1970-01-01';seeded+=1
        else: added[i]=(dates.get(i) or {}).get('m') or '1970-01-01';seeded+=1   # joined since the previous crawl: its listing day is the best estimate
new=0
for i in ids:
    if i not in added: added[i]=now;new+=1
json.dump(added,open(f'{D}/added.json','w'),separators=(',',':'),sort_keys=True)
for i,a in added.items():
    if i in idset or i in dates:
        e=dates.setdefault(i,{})
        if a!=e.get('m'): e['a']=a
        else: e.pop('a',None)
for i,c in created.items():
    dates.setdefault(i,{})['c']=c
json.dump(dates,open(f'{D}/dates.json','w'),separators=(',',':'))
print('added.py: first-seen seeded',seeded,'| new today',new,'| createdTime pinned',len(created))
