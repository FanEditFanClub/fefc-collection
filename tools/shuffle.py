#!/usr/bin/env python3
"""Precompute Shuffle Play eligibility -> data/shuffle.json {v, ids:[...]} (Drive target ids of 'shuffleable' videos; any index copy/shortcut of one is eligible).
Rules: videos only; skip trailers/samples/extras/featurettes; multi-part movies only Part 1;
series/episodic only S01E01 / Episode 1. Run tests: python3 tools/shuffle.py --test"""
import json, re, os, sys
ROMAN = {'i':1,'ii':2,'iii':3,'iv':4,'v':5,'vi':6,'vii':7,'viii':8,'ix':9,'x':10}
WORD = {'one':1,'two':2,'three':3,'four':4,'five':5,'first':1,'second':2,'third':3}
def num(s):
    s = s.lower().strip('.')
    return int(s) if s.isdigit() else ROMAN.get(s, WORD.get(s))
EXTRA = re.compile(r'\btrailers?\b|\bteaser\b|\bsample\b|featurette|\bextras\b|\bbonus\b|behind[ -]the[ -]scenes|making[ -]of|deleted scenes|\bpromo\b|\btv spot\b', re.I)
SEP = r'(?:^|[-–—|(\[,_.]\s*|\s-\s)'
N = r'(\d+|[ivx]+|one|two|three|four|five|first|second|third)'
def classify(name):
    """returns (eligible, reason)"""
    n = re.sub(r'\.(mkv|mp4|m4v|avi|mov|wmv|webm|ts)$', '', name, flags=re.I)
    if EXTRA.search(n): return False, 'extra'
    if re.search(r'^VTS_|\.vob$', name, re.I): return False, 'dvd fragment'
    if re.search(r'\bpost\s*\d+\b|\bpost$|(?:^|[^a-z])\d*shots?$|^y2mate|^(opening|ending|intro|outro|credits)$|\bad #?\d+|\bcommercials?\b', n, re.I): return False, 'work clip'
    m = re.search(r'\bS(\d{1,4})\s*[ .]?E(\d{1,4})\b', n, re.I)
    if m: return (int(m[1]) == 1 and int(m[2]) == 1), 'SxxEyy'
    m = re.search(r'\bseason\s*(\d+)\D{0,4}episode\s*(\d+)', n, re.I)
    if m: return (int(m[1]) == 1 and int(m[2]) == 1), 'season/episode'
    se = re.search(r'\bseason\s*(\d+)(?!\s*-\s*\d)', n, re.I)
    if se and int(se[1]) != 1: return False, 'season>1'
    m = re.search(r'\b(?:episode|ep\.?)\s*(\d+)(?!\d)', n, re.I)
    if m: return int(m[1]) == 1, 'episode'
    m = re.search(r'^\s*(\d{1,2})\.(\d{1,3})\s*-', n) or re.search(r'\s(\d{1,2})\.(\d{1,3})(?:\s+\W.*)?$', n)
    if m: return (int(m[1]) == 1 and int(m[2]) == 1), 'n.m numbering'
    m = re.search(r'^\s*(\d{1,4})(?:\s*[.)]\s+|\s+)\D', n)
    if m and not 1900 <= int(m[1]) <= 2099: return int(m[1]) == 1, 'numbered'
    m = re.search(r'\s[-–]\s*(\d{1,4})(?:v\d)?\s*(?:[\[(].*)?$', n) if re.match(r'^\s*\[', n) or re.search(r'\s[-–]\s*\d{1,4}(?:v\d)?\s*\[', n) else None
    if m: return int(m[1]) == 1, 'fansub episode'
    m = re.search(r'\s-\s(\d{2,4})\s-\s', n)
    if m and not 1900 <= int(m[1]) <= 2099: return int(m[1]) == 1, 'dash-numbered episode'
    m = re.search(r'\bchapter\s*' + N + r'\b', n, re.I)
    if m and num(m[1]): return num(m[1]) == 1, 'chapter'
    m = re.search(SEP + r'(?:part|pt\.?)\s*' + N + r'\b', n, re.I)
    if m and num(m[1]): return num(m[1]) == 1, 'part'
    m = re.search(r'\bpart\s+(\d+)(?!\d)', n, re.I)
    if m and int(m[1]) >= 4: return False, 'part (unseparated)'
    m = re.search(r'\b(?:disc|disk|cd|dvd)\s*' + N + r'\b', n, re.I)
    if m and num(m[1]): return num(m[1]) == 1, 'disc'
    m = re.search(r'\b(\d+)\s*of\s*(\d+)\b', n, re.I)
    if m and int(m[2]) > 1: return int(m[1]) == 1, 'n of m'
    m = re.search(SEP + r'(?:side\s*([ab])|([ab])[ -]side)\b', n, re.I)
    if m: return (m[1] or m[2]).lower() == 'a', 'side'
    if se: return True, 'season 1 (movie-style)'
    return True, 'single'
TESTS = [
 ('Lost - Chronologically LOST - Part 1 - The Beginning - Chronological Fan Edit.mkv', True),
 ('Lost - In The Detail - Part 105 - Intermission - The Orchid Station - Chronological Fan Edit.avi', False),
 ('DCEU Snyderverse Series - Part 5 - Fan Edit.mp4', False),
 ('Friday The 13th Part VIII: Jason Takes Manhattan - MFMT Cut - Extended Cut - Fan Edit.mp4', True),
 ('The Flash Mini-Series - Season 3 - Part 4 - Fan Edit.mp4', False),
 ('The Witcher - Season 1 - Part 1 - The Last Wish - Movie Fan Edit.mkv', True),
 ('Alien: Earth - Season 1 - Part 2 - Lost Boys - Movie Fan Edit.mp4', False),
 ('Alias S04E15 - Another Mister Sloane v2 (1080p).mkv', False),
 ('S01E01.PaulNewman-1994.06.12.ITAS.HD.mp4', True),
 ('s01e05.mp4', False),
 ('Battlestar Galactica - Season 2 Episode 19 - Downloaded - Extended Episode - Fan Edit.mp4', False),
 ('Space Force - Season 1 Episode 1 - The Launch - Fan Edit.mp4', True),
 ('DCU Show Episode 4.mp4', False),
 ('235. The Late Late Show with Craig Ferguson | 2006 vol. 1 in chronological order - 017.mp4', False),
 ('Season 2 Trailer.mp4', False),
 ('TRAILER - The Crow (1994) The Brandon Lee Project (2160p 60fps).mp4', False),
 ('E.T. The Extra-Terrestrial - The Extended Cut - Fan Edit.mp4', True),
 ('Creepshow - Extra Creepy Cut - Fan Edit.mp4', True),
 ('Movie X - Disc 2.mkv', False), ('Movie X - CD1.avi', True), ('Movie X (1 of 3).mp4', True), ('Movie X (2 of 3).mp4', False),
 ('Kill Bill - Pt. 2 - Fan Edit.mp4', False), ('Kill Bill - Pt 1 - Fan Edit.mp4', True),
 ('Blade Runner - Fan Edit.mkv', True),
 ('46   The Neverscroll_360p.mp4', False), ('1 Pilot_360p.mp4', True), ('4.11 - Course Correction.mp4', False), ('1.1 - Pilot.mp4', True),
 ('DD 1.3.mp4', False), ('VTS_01_0.VOB', False), ('MonsterVision - S2000E100 - Embrace of the Vampire (1995).mp4', False),
 ('2020 Texas Gladiators (1984) - In 53 Minutes - CK Cut - Fan Edit.mp4', True), ('Star Trek: Starfleet Academy - Chapter 2 - Fan Edit.mkv', False),
 ('John Wick 1-4 - Symphony of Pain - Fan Edit.mp4', True),
 ('[Kaze-MattMurdock] Fullmetal Alchemist - 24.mkv', False), ('[KatawareDoki] Dragon Ball - 118 [BD 1080p x264 AAC] [CC38FB5D].mkv', False),
 ('JJ 1.7 "No more Purple".mp4', False), ('DS 40 post.avi', False), ('Exegol fight post 26.mov', False), ('TROS_KlaudRemoval_2shots.mov', False),
 ('Blade Runner - 2049 - Fan Edit.mkv', True),
 ('Journey to the Center of the Earth Episode 16_XYqQXdTTtc0_360p.mp4', False), ('The Walking Dead Part 16 No Way Out.mp4', False), ('Friday the 13th Part 2 - Fan Edit.mp4', True),
 ('Soul Eater - 49 [BDRip 1080p][Dual Audio].mkv', False), ('[Group] Cowboy Bebop - 01 [BD].mkv', True),
 ('Star Wars: Episode I - The Phantom Menace - The Rise of Naboo - Fan Edit.mkv', True), ('Star Wars (1977) 4K77v1.4 (1080p BluRay x265 10bit Tigole).mkv', True),
]
if '--test' in sys.argv:
    bad = [(n, e, classify(n)) for n, e in TESTS if classify(n)[0] != e]
    for b in bad: print('FAIL', b)
    print(f'{len(TESTS)-len(bad)}/{len(TESTS)} passed'); sys.exit(1 if bad else 0)
here = os.path.join(os.path.dirname(__file__), '..', 'data')
items = json.load(open(os.path.join(here, 'index.json')))['items']
JUNK = re.compile(r'^\.|^thumbs\.db$|^desktop\.ini$', re.I)
ids, seen = [], set()
for f in sorted(items, key=lambda f: f['name']):
    if f.get('kind') != 'video' or JUNK.search(f['name']): continue
    t = f.get('targetId') or f['id']
    if t in seen: continue
    seen.add(t)
    if classify(f['name'])[0]: ids.append(t)
# sibling heuristic: >=4 videos in one folder sharing the text before their first number = a numbered series; keep only the lowest number
from collections import defaultdict
grp = defaultdict(list)
for f in items:
    if f.get('kind') != 'video': continue
    m = re.match(r'^(\D{3,}?)\s*(\d{1,3})(?!\d)', f['name'])
    if m and not re.search(r'part|season|episode|chapter|vol', m[1], re.I): grp[(f.get('parent'), m[1].strip().lower())].append((int(m[2]), f.get('targetId') or f['id']))
drop = set()
for k, v in grp.items():
    if len({n for n, _ in v}) >= 4:
        lo = min(n for n, _ in v); drop |= {t for n, t in v if n != lo}
ids = [t for t in ids if t not in drop]
json.dump({'v': 1, 'ids': ids}, open(os.path.join(here, 'shuffle.json'), 'w'), separators=(',', ':'))
print(len(seen), 'unique videos;', len(ids), 'shuffleable')
