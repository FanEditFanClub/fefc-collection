#!/usr/bin/env python3
"""
Fan-edit community ratings -> data/fanedit-ratings.json

Sources (isolated; one blocked site never breaks the others):
  mrdb     Movies Remastered — sitemap + movieinfo.php (robots allow; 1 req/s; cache)
  ifdb     FanEdit.org / IFDB — live pages, or archive.org snapshots when CF blocks live
  changes  "Fan Edit Changes" UI row — Drive DESCRIPTION/README (data/drive-changes.json)
           preferred, then IFDB Cuts/Additions via data/editinfo.json
           (Master Links has no separate site named Fan Edit Changes)
  fanworx  noted but login-walled; not crawled

Usage:
  tools/fanedit_ratings.py [--budget-sec 1200] [--sources mrdb,ifdb,changes]
                           [--from-dir DIR] [--report]
"""
import argparse, json, os, re, sys, time, unicodedata, urllib.request, urllib.error, html as H
from difflib import SequenceMatcher
from urllib.parse import quote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "FEFC-collection/1.0 (+https://collection.faneditfanclub.com; faneditfanclub@gmail.com)"
OUT = os.path.join(ROOT, "data/fanedit-ratings.json")
CACHE = os.path.join(ROOT, "data/.fanedit-ratings-cache.json")

def get(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, (e.read() or b"").decode("utf-8", "replace")
    except Exception as e:
        return 0, str(e)

def is_challenge(status, body):
    return status in (403, 429, 503) and re.search(
        r"Just a moment|cf-chl|challenge-platform|Attention Required", body or ""
    ) is not None

def strip_accents(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()

def years_in(s):
    return set(re.findall(r"\b((?:19|20)\d{2})\b", s or ""))

def norm(s, keep_cut=False):
    s = strip_accents(s).lower()
    s = re.sub(r"\.(mp4|mkv|avi|mov|m4v|webm)$", "", s)
    s = re.sub(r"\((?:[^)]*)\)|\[(?:[^\]]*)\]", " ", s)
    drop = r"\b(fan ?edit|fanedit|movie|remix|recut|restored|unrated|remaster(?:ed)?|enhanced|definitive|ultimate|final|bluray|blu ray|1080p|720p|4k|hd)\b"
    if not keep_cut:
        drop = r"\b(fan ?edit|fanedit|movie|remix|edition|cut|version|recut|restored|extended|theatrical|unrated|remaster(?:ed)?|enhanced|special|definitive|ultimate|final|new|bluray|blu ray|1080p|720p|4k|hd)\b"
    s = re.sub(drop, " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return re.sub(r"^(the|a|an) ", "", s)

def scale_of(raw):
    m = re.search(r"/\s*(\d+)", raw or "")
    return int(m.group(1)) if m else 10

def parse_mrdb(page, mid):
    t = re.search(r"<H2[^>]*>(.*?)</H2>", page, re.S | re.I)
    if not t:
        return None
    title = H.unescape(re.sub(r"<[^>]+>", "", t.group(1))).strip()
    ed = re.search(r"<B>Faneditor:\s*</B>\s*<A[^>]*>([^<]+)</A>", page, re.I)
    rel = re.search(r"<B>Fanedit Release Date:\s*</B>([^<]+)", page, re.I)
    r = re.search(r"<B>MRDb Rating</B><br>(.*?)</div>", page, re.S | re.I)
    txt = H.unescape(re.sub(r"<[^>]+>", " ", r.group(1))).strip() if r else ""
    sc = re.search(r"(\d+(?:\.\d+)?)", txt) if txt and not re.search(r"no votes", txt, re.I) else None
    votes = re.search(r"\((\d[\d,]*)\s*(?:votes?|ratings?)\)|(\d[\d,]*)\s*votes?", txt, re.I)
    return {
        "id": mid,
        "title": title,
        "editor": ed.group(1).strip() if ed else "",
        "year": (re.search(r"(\d{4})", rel.group(1)).group(1) if rel and re.search(r"\d{4}", rel.group(1)) else ""),
        "score": float(sc.group(1)) if sc else None,
        "scale": scale_of(txt) if sc else None,
        "votes": int((votes.group(1) or votes.group(2)).replace(",", "")) if votes else 0,
        "raw": txt[:80],
    }

def parse_ifdb(page, url):
    """IFDB / JReviews: itemprop ratingValue + reviewCount, else JSON-LD, else text."""
    t = re.search(r"<h1[^>]*>(.*?)</h1>", page, re.S | re.I)
    title = H.unescape(re.sub(r"<[^>]+>", "", t.group(1))).strip() if t else ""
    sc = votes = None
    scale = 10.0
    # Prefer overall user rating block
    m = re.search(
        r'jrOverallUser[\s\S]{0,500}?jrRatingValue[^>]*>\s*<span>([\d.]+)</span>[\s\S]{0,200}?class="count">(\d+)',
        page, re.I,
    )
    if m:
        sc, votes = float(m.group(1)), int(m.group(2))
    if sc is None:
        m = re.search(r'itemprop="ratingValue"[^>]*>\s*([\d.]+)', page, re.I)
        if m:
            sc = float(m.group(1))
        m2 = re.search(r'itemprop="reviewCount"[^>]*>\s*(\d+)', page, re.I)
        if m2:
            votes = int(m2.group(1))
        m3 = re.search(r'itemprop="bestRating"[^>]*content="([\d.]+)"', page, re.I)
        if m3:
            scale = float(m3.group(1))
    if sc is None:
        m = re.search(r'"ratingValue"\s*:\s*"?([\d.]+)"?', page)
        if m:
            sc = float(m.group(1))
        m2 = re.search(r'"(?:ratingCount|reviewCount)"\s*:\s*"?(\d+)"?', page)
        if m2:
            votes = int(m2.group(1))
        m3 = re.search(r'"bestRating"\s*:\s*"?([\d.]+)"?', page)
        if m3:
            scale = float(m3.group(1))
    if sc is None:
        m = re.search(
            r"(?:Rating|Score)[^<\d]{0,40}(\d+(?:\.\d+)?)\s*(?:/|out of)\s*(\d+)",
            re.sub(r"<[^>]+>", " ", page),
            re.I,
        )
        if m:
            sc, scale = float(m.group(1)), float(m.group(2))
    ed = re.search(
        r"(?:Edited by|Editor|Faneditor)[^<:]*:?\s*(?:<[^>]+>\s*)*([A-Za-z0-9_ .\-']{2,40})",
        page,
    )
    return {
        "url": url,
        "title": title,
        "editor": ed.group(1).strip() if ed else "",
        "score": sc,
        "scale": scale,
        "votes": votes or 0,
    }

def load_json(p, d):
    try:
        return json.load(open(p))
    except Exception:
        return d

def crawl_mrdb(cache, budget, log):
    st, sm = get("https://www.moviesremastered.com/sitemap.xml", 40)
    if st != 200:
        log["mrdb"] = f"sitemap unavailable (HTTP {st})"
        return
    ids = sorted({int(x) for x in re.findall(r"movieinfo\.php\?id=(\d+)", sm)})
    seen = cache.setdefault("mrdb", {})
    # Prefer never-titled / missing, then stale (>14d)
    def rank(i):
        e = seen.get(str(i))
        titled = bool(e and e.get("title"))
        age = time.time() - (e or {}).get("t", 0)
        return (1 if titled and age < 14 * 86400 else 0, 0 if not titled else 1, -age)

    todo = sorted(ids, key=rank)
    t0 = time.time()
    n = 0
    fails = 0
    for i in todo:
        if time.time() - t0 > budget:
            break
        e = seen.get(str(i))
        if e and e.get("title") and time.time() - e.get("t", 0) < 14 * 86400:
            continue
        st, body = get(f"https://www.moviesremastered.com/movieinfo.php?id={i}")
        if is_challenge(st, body):
            log["mrdb"] = "blocked by challenge page; skipped"
            break
        if st != 200:
            fails += 1
            seen[str(i)] = {"t": time.time(), "err": st}
        else:
            p = parse_mrdb(body, i)
            seen[str(i)] = dict(p or {"err": "parse"}, t=time.time())
        n += 1
        if fails > 40:
            log["mrdb"] = "too many errors; stopped"
            break
        time.sleep(1.05)
        if n % 40 == 0:
            json.dump(cache, open(CACHE, "w"))
            titled = sum(1 for v in seen.values() if v.get("title"))
            print(f"mrdb progress {n} fetched; {titled}/{len(ids)} titled", flush=True)
    titled = sum(1 for v in seen.values() if v.get("title"))
    log.setdefault("mrdb", f"fetched {n} pages this run; {titled}/{len(ids)} sitemap pages cached")

def ingest_dir(d, cache, log):
    out = cache.setdefault("ifdb", {})
    n = 0
    for fn in os.listdir(d):
        if not fn.endswith((".html", ".htm")):
            continue
        page = open(os.path.join(d, fn), errors="ignore").read()
        url = re.search(r'<link rel="canonical" href="([^"]+)"', page)
        p = parse_ifdb(page, url.group(1) if url else "https://fanedit.org/" + os.path.splitext(fn)[0] + "/")
        if p["title"]:
            out[p["url"]] = dict(p, t=time.time(), src="from-dir")
            n += 1
    log["ifdb"] = f"ingested {n} saved pages from {d}"

def crawl_ifdb_live(cache, urls, budget, log):
    out = cache.setdefault("ifdb", {})
    if not urls:
        log["ifdb"] = "no IFDB urls known"
        return False
    st, body = get(urls[0])
    if is_challenge(st, body) or st in (0, 403):
        log["ifdb_live"] = f"BLOCKED (HTTP {st}, Cloudflare challenge) -- not bypassed"
        return False
    t0 = time.time()
    n = 0
    for u in urls:
        if time.time() - t0 > budget:
            break
        e = out.get(u)
        if e and e.get("score") is not None and time.time() - e.get("t", 0) < 14 * 86400:
            continue
        st, body = get(u)
        if is_challenge(st, body):
            log["ifdb_live"] = "blocked mid-run; stopped"
            break
        if st == 200:
            out[u] = dict(parse_ifdb(body, u), t=time.time(), src="live")
            n += 1
        time.sleep(1.5)
    log["ifdb_live"] = f"fetched {n} pages; {len(out)} cached"
    return True

def archive_latest(url):
    """Return best archive.org snapshot URL for a live URL, or None. Public CDX API only."""
    q = "https://web.archive.org/cdx/search/cdx?url=%s&output=json&filter=statuscode:200&fl=timestamp,original&limit=5&from=2020" % quote(url, safe="")
    st, body = get(q, timeout=45)
    if st != 200 or not body.strip().startswith("["):
        return None
    try:
        rows = json.loads(body)
    except Exception:
        return None
    if len(rows) < 2:
        return None
    # last row is usually newest when unsorted; pick max timestamp
    best = max(rows[1:], key=lambda r: r[0])
    return f"https://web.archive.org/web/{best[0]}/{best[1]}"

def crawl_ifdb_archive(cache, urls, budget, log):
    """Sanctioned fallback: archive.org snapshots when live IFDB is CF-blocked."""
    out = cache.setdefault("ifdb", {})
    t0 = time.time()
    n = 0
    miss = 0
    for u in urls:
        if time.time() - t0 > budget:
            break
        e = out.get(u)
        if e and e.get("score") is not None and time.time() - e.get("t", 0) < 30 * 86400:
            continue
        snap = archive_latest(u)
        time.sleep(1.2)
        if not snap:
            miss += 1
            continue
        st, body = get(snap, timeout=60)
        time.sleep(1.5)
        if st != 200 or is_challenge(st, body) or len(body) < 500:
            miss += 1
            continue
        p = parse_ifdb(body, u)
        if p.get("title") or p.get("score") is not None:
            out[u] = dict(p, t=time.time(), src="archive.org", snap=snap)
            n += 1
        if n and n % 20 == 0:
            json.dump(cache, open(CACHE, "w"))
            print(f"ifdb archive progress {n}", flush=True)
    log["ifdb"] = f"archive.org snapshots: fetched {n}, miss {miss}; {len(out)} urls cached"
    return n

# ---------------- matching ----------------
STOP = set(
    "fan edit fanedit movie remix edition cut version recut restored extended theatrical unrated the a an of and to for with from by in on hd 4k 1080p 720p bluray blu ray remaster remastered enhanced special definitive ultimate final new part season episode series".split()
)

def toks(s, keep_cut=False):
    return [t for t in norm(s, keep_cut=keep_cut).split() if t and t not in STOP and not t.isdigit() and len(t) > 1]

def jaccard(a, b):
    if not a or not b:
        return 0.0
    a, b = set(a), set(b)
    return len(a & b) / len(a | b)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--budget-sec", type=int, default=0, help="max seconds of crawling per site (0 = cache only)")
    ap.add_argument("--sources", default="mrdb,ifdb,changes")
    ap.add_argument("--from-dir", help="folder of saved IFDB .html pages to ingest")
    ap.add_argument("--changes-base", default=os.environ.get("FEC_BASE", ""))
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()
    src = set(a.sources.split(","))
    cache = load_json(CACHE, {})
    meta = load_json(os.path.join(ROOT, "data/metadata.json"), {})
    log = {}

    if "mrdb" in src and a.budget_sec:
        crawl_mrdb(cache, a.budget_sec, log)

    ei_pre = load_json(os.path.join(ROOT, "data/editinfo.json"), {}).get("edits", {})
    ifdb_urls = sorted(
        set((meta.get("ifdb") or {}).values())
        | {e["url"] for e in ei_pre.values() if e.get("url")}
    )

    if "ifdb" in src:
        if a.from_dir:
            ingest_dir(a.from_dir, cache, log)
        elif a.budget_sec:
            ok = crawl_ifdb_live(cache, ifdb_urls, min(a.budget_sec, 60), log)
            if not ok:
                # half budget to archive.org (sanctioned public snapshots)
                crawl_ifdb_archive(cache, ifdb_urls, max(30, a.budget_sec // 2), log)

    json.dump(cache, open(CACHE, "w"))

    idx = load_json(os.path.join(ROOT, "data/index.json"), {"items": []})["items"]
    byid = {x["id"]: x for x in idx}
    vids = [x for x in idx if x.get("kind") == "video" or str(x.get("mimeType", "")).startswith("video/")]
    unique_targets = {v.get("targetId") or v["id"] for v in vids}

    def path(x):
        s, g = x["name"], 0
        while x.get("parent") in byid and g < 12:
            x = byid[x["parent"]]
            s += " " + x["name"]
            g += 1
        return s

    name_ix, name_cut_ix, inv = {}, {}, {}
    vid_meta = []
    for v in vids:
        nt = norm(v["name"])
        ntc = norm(v["name"], keep_cut=True)
        pt = path(v)
        tk = set(toks(pt))
        tkc = set(toks(pt, keep_cut=True))
        ys = years_in(pt)
        name_ix.setdefault(nt, []).append(v)
        name_cut_ix.setdefault(ntc, []).append(v)
        vid_meta.append((v, nt, ntc, pt, tk, tkc, ys))
        for t in tkc:
            if len(t) >= 3:
                inv.setdefault(t, set()).add(len(vid_meta) - 1)

    mr_entries = [e for e in cache.get("mrdb", {}).values() if isinstance(e, dict) and e.get("title")]
    out = {}
    cov = {"mrdb": 0, "ifdb": 0, "changes": 0, "drive_changes": 0, "drive_description": 0}
    ifdb_by_url = cache.get("ifdb", {})
    ifdb_url_map = meta.get("ifdb") or {}

    def pick_mrdb(e):
        nt = norm(e["title"])
        ntc = norm(e["title"], keep_cut=True)
        ed = norm(e.get("editor") or "")
        tt = toks(e["title"], keep_cut=True)
        ey = years_in(str(e.get("year") or "") + " " + (e.get("title") or ""))
        cands, how = [], None
        if ntc in name_cut_ix:
            cands, how = list(name_cut_ix[ntc]), "exact_cut"
        elif nt in name_ix:
            cands, how = list(name_ix[nt]), "exact"
        if not cands and len(tt) >= 2:
            keys = [t for t in tt if len(t) >= 3]
            if keys and all(t in inv for t in keys):
                inter = set.intersection(*(inv[t] for t in keys))
                cands = [vid_meta[i][0] for i in inter]
                how = "contain"
        # fuzzy: high token overlap or sequence ratio against path
        if not cands and len(tt) >= 2:
            scored = []
            keys = [t for t in tt if len(t) >= 3]
            if keys:
                # candidate pool = union of inverted hits for rare-ish tokens
                pool = set()
                for t in sorted(keys, key=lambda x: len(inv.get(x, ())))[:6]:
                    pool |= inv.get(t, set())
                if len(pool) > 800:
                    pool = set(list(pool)[:800])
                for i in pool:
                    v, _nt, _ntc, pt, tk, tkc, ys = vid_meta[i]
                    jac = jaccard(tt, list(tkc))
                    ratio = SequenceMatcher(None, ntc, _ntc).ratio()
                    score = max(jac, ratio)
                    if ey and ys and not (ey & ys):
                        score -= 0.08
                    if ed and ed in norm(pt):
                        score += 0.12
                    if score >= 0.72:
                        scored.append((score, v))
                scored.sort(key=lambda x: -x[0])
                if scored and scored[0][0] >= 0.78:
                    top = scored[0][0]
                    cands = [v for s, v in scored if s >= top - 0.03][:4]
                    how = "fuzzy"
        if not cands:
            return []
        if ed:
            filt = [c for c in cands if ed in norm(path(c))]
            if filt:
                cands = filt
            elif how not in ("exact", "exact_cut") and len(cands) > 1:
                return []
        # year soft filter when multiple
        if ey and len(cands) > 1:
            yf = [c for c in cands if ey & years_in(path(c))]
            if yf:
                cands = yf
        if len(cands) > 6:
            return []
        return cands

    for e in mr_entries:
        for v in pick_mrdb(e):
            key = v["id"]
            ent = out.setdefault(key, {})
            prev = ent.get("mrdb")
            cand = {
                "url": f"https://www.moviesremastered.com/movieinfo.php?id={e['id']}",
                "score": e.get("score"),
                "scale": scale_of(e.get("raw")) if e.get("score") is not None else None,
                "votes": e.get("votes", 0),
                "title": e.get("title"),
                "editor": e.get("editor"),
            }
            if not prev or (prev.get("score") is None and cand.get("score") is not None):
                ent["mrdb"] = cand
    cov["mrdb"] = sum(1 for e in out.values() if "mrdb" in e)

    for v in vids:
        key = v.get("targetId") or v["id"]
        u = ifdb_url_map.get(v["id"]) or ifdb_url_map.get(key)
        if u:
            ent = out.setdefault(v["id"], {})
            c = ifdb_by_url.get(u)
            ent["ifdb"] = {
                "url": u,
                "score": c.get("score") if c else None,
                "scale": c.get("scale") if c else None,
                "votes": c.get("votes", 0) if c else 0,
            }

    ei = load_json(os.path.join(ROOT, "data/editinfo.json"), {}).get("edits", {})
    drive_ch = load_json(os.path.join(ROOT, "data/drive-changes.json"), {})
    drive_by = drive_ch.get("by_id") or {}
    drive_cov = drive_ch.get("coverage") or {}
    cov["drive_changes"] = 0
    cov["drive_description"] = 0
    for k, e in ei.items():
        if not e.get("url"):
            continue
        r = e.get("rating")
        ent = out.setdefault(k, {})
        # Prefer archived/live parsed score if present
        c = ifdb_by_url.get(e["url"])
        score = float(r) if r not in (None, "") else (c.get("score") if c else None)
        votes = int(e.get("reviews") or 0) or (c.get("votes", 0) if c else 0)
        ent["ifdb"] = {"url": e["url"], "score": score, "scale": 10, "votes": votes}
        ch = e.get("changes") or []
        if ch:
            ent["changes"] = {
                "url": e["url"],
                "score": None,
                "scale": None,
                "votes": 0,
                "n": len(ch),
                "label": f"{len(ch)} change" + ("s" if len(ch) != 1 else ""),
                "src": "ifdb",
            }
            cov["changes"] += 1

    # Drive DESCRIPTION + README/info change lists (preferred in UI; counted separately)
    for k, dent in drive_by.items():
        if k.startswith("folder:"):
            continue
        ch = dent.get("changes") or []
        if not ch:
            continue
        ent = out.setdefault(k, {})
        n = len(ch)
        kinds = {c.get("kind") for c in ch}
        prev = ent.get("changes") or {}
        prev_n = int(prev.get("n") or 0)
        ent["changes"] = {
            "url": None,
            "score": None,
            "scale": None,
            "votes": 0,
            "n": max(prev_n, n),
            "label": f"{max(prev_n, n)} change" + ("s" if max(prev_n, n) != 1 else ""),
            "src": "drive+ifdb" if prev_n else "drive",
            "drive_n": n,
            "ifdb_n": prev_n,
        }
        cov["drive_changes"] += 1
        if "description" in kinds or any(s.get("kind") == "description" for s in (dent.get("sources") or [])):
            cov["drive_description"] += 1

    if "changes" in src:
        log["changes"] = (
            f"{cov['changes']} IFDB via editinfo.json; {cov.get('drive_changes',0)} Drive README/description "
            f"({cov.get('drive_description',0)} with DESCRIPTION field); "
            f"status={drive_cov.get('drive_description_status', 'n/a')}"
        )
    log.setdefault("fanworx", "login-walled; not crawled (Master Links registry only)")
    log.setdefault("ifdb", log.get("ifdb") or f"editinfo harvest {len(ei)} edits; cache {len(ifdb_by_url)} pages")

    out = {k: v for k, v in out.items() if v}

    def has_rating(ent):
        for srcn in ("ifdb", "mrdb"):
            x = ent.get(srcn) or {}
            if x.get("score") is not None:
                return True
        return False

    # Map out keys to unique targets for coverage
    id_to_target = {v["id"]: (v.get("targetId") or v["id"]) for v in vids}
    rated_targets = set()
    change_targets = set()
    for k, ent in out.items():
        tid = id_to_target.get(k, k)
        if has_rating(ent):
            rated_targets.add(tid)
        if ent.get("changes"):
            change_targets.add(tid)

    n_ifdb_links = sum(1 for e in out.values() if "ifdb" in e)
    n_mr = sum(1 for e in out.values() if "mrdb" in e)
    cov_doc = {
        "catalogue_video_items": len(vids),
        "catalogue_unique_targets": len(unique_targets),
        "with_any_rating_unique": len(rated_targets),
        "with_change_list_unique": len(change_targets),
        "mrdb_cached_pages": sum(1 for v in cache.get("mrdb", {}).values() if v.get("title")),
        "mrdb_sitemap_total": None,
        "mrdb_matched": n_mr,
        "mrdb_with_score": sum(1 for e in out.values() if e.get("mrdb", {}).get("score") is not None),
        "ifdb_links": n_ifdb_links,
        "ifdb_with_score": sum(1 for e in out.values() if e.get("ifdb", {}).get("score") is not None),
        "changes_lists": cov["changes"],
        "drive_change_lists": cov.get("drive_changes", 0),
        "drive_description_lists": cov.get("drive_description", 0),
        "drive_changes_coverage": drive_cov,
        "site_status": log,
    }
    # sitemap total from cache size note
    try:
        st, sm = get("https://www.moviesremastered.com/sitemap.xml", 40)
        if st == 200:
            cov_doc["mrdb_sitemap_total"] = len({int(x) for x in re.findall(r"movieinfo\.php\?id=(\d+)", sm)})
    except Exception:
        pass

    # unmatched notable sample (popular names with no rating)
    unmatched = []
    for v in vids:
        tid = v.get("targetId") or v["id"]
        if tid in rated_targets:
            continue
        n = v["name"]
        if re.search(r"\b(trailer|sample|teaser|bonus)\b", n, re.I):
            continue
        unmatched.append(v)
    # prefer shorter, well-known-looking titles
    unmatched.sort(key=lambda v: (0 if re.search(r"Fan Edit", v["name"], re.I) else 1, len(v["name"])))
    sample = []
    seen_n = set()
    for v in unmatched:
        base = re.sub(r"\.(mp4|mkv).*$", "", v["name"], flags=re.I)[:80]
        if base.lower() in seen_n:
            continue
        seen_n.add(base.lower())
        sample.append({"id": v["id"], "name": v["name"]})
        if len(sample) >= 5:
            break
    cov_doc["unmatched_sample"] = sample

    json.dump(
        {"v": 1, "generated": time.strftime("%Y-%m-%d %H:%M"), "_coverage": cov_doc, "items": out},
        open(OUT, "w"),
        separators=(",", ":"),
    )
    print(json.dumps(cov_doc, indent=1))

if __name__ == "__main__":
    main()
