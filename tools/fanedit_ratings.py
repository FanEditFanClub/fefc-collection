#!/usr/bin/env python3
"""
Fan-edit community ratings -> data/fanedit-ratings.json  (shown in the details page "Fan Edit Ratings" block)

Sources (each isolated; one failing/blocked site never breaks the others):
  mrdb  Movies Remastered database  www.moviesremastered.com/movieinfo.php?id=N  (robots.txt allows /movieinfo.php;
        pages found via the public sitemap.xml; polite 1 request/second; cached in data/.fanedit-ratings-cache.json)
  ifdb  FanEdit.org / IFDB          fanedit.org/<slug>/   (Cloudflare-protected: if a challenge page is returned the
        site is reported as "blocked" and skipped -- we never try to get around it. Pages can instead be supplied with
        --from-dir DIR, a folder of saved .html pages, e.g. exported from a browser by the owner.)
  changes  "Fan Edit Changes" -- no public URL configured yet: set env FEC_BASE or --changes-base to enable.

Usage:
  tools/fanedit_ratings.py [--budget-sec 1200] [--sources mrdb,ifdb,changes] [--from-dir DIR] [--report]
Nightly: tools/daily_resync.py calls it with a bounded budget; the cache lets later nights continue where the last stopped.
Matching: normalised title equality (year/"Fan Edit"/cut-name noise removed); when several candidates share a title the
editor name must appear in the file name or its folders. Coverage per site is printed and stored under "_coverage".
"""
import argparse, json, os, re, sys, time, unicodedata, urllib.request, urllib.error, html as H
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
    return status in (403, 429, 503) and re.search(r"Just a moment|cf-chl|challenge-platform|Attention Required", body or "") is not None

def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\.(mp4|mkv|avi|mov|m4v|webm)$", "", s)
    s = re.sub(r"\((?:[^)]*)\)|\[(?:[^\]]*)\]", " ", s)            # (2015), [4K]
    s = re.sub(r"\b(fan ?edit|fanedit|movie|remix|edition|cut|version|recut|restored|extended|theatrical)\b", " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return re.sub(r"^(the|a|an) ", "", s)

# ---------------- parsers ----------------
def scale_of(raw):
    m = re.search(r"/\s*(\d+)", raw or "")
    return int(m.group(1)) if m else 10

def parse_mrdb(page, mid):
    t = re.search(r"<H2[^>]*>(.*?)</H2>", page, re.S | re.I)
    if not t: return None
    title = H.unescape(re.sub(r"<[^>]+>", "", t.group(1))).strip()
    ed = re.search(r"<B>Faneditor:\s*</B>\s*<A[^>]*>([^<]+)</A>", page, re.I)
    rel = re.search(r"<B>Fanedit Release Date:\s*</B>([^<]+)", page, re.I)
    r = re.search(r"<B>MRDb Rating</B><br>(.*?)</div>", page, re.S | re.I)
    txt = H.unescape(re.sub(r"<[^>]+>", " ", r.group(1))).strip() if r else ""
    sc = re.search(r"(\d+(?:\.\d+)?)", txt) if txt and not re.search(r"no votes", txt, re.I) else None
    votes = re.search(r"\((\d[\d,]*)\s*(?:votes?|ratings?)\)|(\d[\d,]*)\s*votes?", txt, re.I)
    return {"id": mid, "title": title, "editor": ed.group(1).strip() if ed else "",
            "year": (re.search(r"(\d{4})", rel.group(1)).group(1) if rel and re.search(r"\d{4}", rel.group(1)) else ""),
            "score": float(sc.group(1)) if sc else None, "scale": scale_of(txt) if sc else None,
            "votes": int((votes.group(1) or votes.group(2)).replace(",", "")) if votes else 0, "raw": txt[:80]}

def parse_ifdb(page, url):
    """IFDB (fanedit.org, WordPress): prefer schema.org aggregateRating, else 'Rating: x/10 (n votes)' style text."""
    t = re.search(r"<h1[^>]*>(.*?)</h1>", page, re.S | re.I)
    title = H.unescape(re.sub(r"<[^>]+>", "", t.group(1))).strip() if t else ""
    sc = votes = None; scale = 10
    m = re.search(r'"ratingValue"\s*:\s*"?([\d.]+)"?', page)
    if m: sc = float(m.group(1))
    m2 = re.search(r'"(?:ratingCount|reviewCount)"\s*:\s*"?(\d+)"?', page)
    if m2: votes = int(m2.group(1))
    m3 = re.search(r'"bestRating"\s*:\s*"?([\d.]+)"?', page)
    if m3: scale = float(m3.group(1))
    if sc is None:
        m = re.search(r"(?:Rating|Score)[^<\d]{0,40}(\d+(?:\.\d+)?)\s*(?:/|out of)\s*(\d+)", re.sub(r"<[^>]+>", " ", page), re.I)
        if m: sc, scale = float(m.group(1)), float(m.group(2))
    ed = re.search(r"(?:Edited by|Editor|Faneditor)[^<:]*:?\s*(?:<[^>]+>\s*)*([A-Za-z0-9_ .\-']{2,40})", page)
    return {"url": url, "title": title, "editor": ed.group(1).strip() if ed else "", "score": sc, "scale": scale, "votes": votes or 0}

# ---------------- crawlers ----------------
def load_json(p, d):
    try: return json.load(open(p))
    except Exception: return d

def crawl_mrdb(cache, budget, log):
    st, sm = get("https://www.moviesremastered.com/sitemap.xml", 40)
    if st != 200: log["mrdb"] = f"sitemap unavailable (HTTP {st})"; return
    ids = [int(x) for x in re.findall(r"movieinfo\.php\?id=(\d+)", sm)]
    seen = cache.setdefault("mrdb", {})
    todo = sorted(ids, reverse=True)
    # unseen first, then the stalest (re-check ratings after 14 days)
    todo.sort(key=lambda i: (str(i) in seen, seen.get(str(i), {}).get("t", 0)))
    t0 = time.time(); n = 0; fails = 0
    for i in todo:
        if time.time() - t0 > budget: break
        e = seen.get(str(i))
        if e and time.time() - e.get("t", 0) < 14 * 86400: continue
        st, body = get(f"https://www.moviesremastered.com/movieinfo.php?id={i}")
        if is_challenge(st, body): log["mrdb"] = "blocked by challenge page; skipped"; break
        if st != 200: fails += 1; seen[str(i)] = {"t": time.time(), "err": st}; 
        else:
            p = parse_mrdb(body, i); seen[str(i)] = dict(p or {"err": "parse"}, t=time.time())
        n += 1
        if fails > 25: log["mrdb"] = "too many errors; stopped"; break
        time.sleep(1.0)
        if n % 50 == 0: json.dump(cache, open(CACHE, "w"))
    log.setdefault("mrdb", f"fetched {n} pages this run; {sum(1 for v in seen.values() if v.get('title'))}/{len(ids)} sitemap pages cached")

def ingest_dir(d, cache, log):
    out = cache.setdefault("ifdb", {}); n = 0
    for fn in os.listdir(d):
        if not fn.endswith((".html", ".htm")): continue
        page = open(os.path.join(d, fn), errors="ignore").read()
        url = re.search(r'<link rel="canonical" href="([^"]+)"', page)
        p = parse_ifdb(page, url.group(1) if url else "https://fanedit.org/" + os.path.splitext(fn)[0] + "/")
        if p["title"]: out[p["url"]] = dict(p, t=time.time()); n += 1
    log["ifdb"] = f"ingested {n} saved pages from {d}"

def crawl_ifdb(cache, metadata, budget, log):
    urls = sorted(set((metadata.get("ifdb") or {}).values()))
    out = cache.setdefault("ifdb", {})
    if not urls: log["ifdb"] = "no IFDB urls known"; return
    st, body = get(urls[0])
    if is_challenge(st, body) or st in (0, 403):
        log["ifdb"] = f"BLOCKED (HTTP {st}, Cloudflare challenge) -- not bypassed; supply saved pages with --from-dir"; return
    t0 = time.time(); n = 0
    for u in urls:
        if time.time() - t0 > budget: break
        e = out.get(u)
        if e and time.time() - e.get("t", 0) < 14 * 86400: continue
        st, body = get(u)
        if is_challenge(st, body): log["ifdb"] = "blocked mid-run; stopped"; break
        if st == 200: out[u] = dict(parse_ifdb(body, u), t=time.time()); n += 1
        time.sleep(1.5)
    log.setdefault("ifdb", f"fetched {n} pages; {len(out)}/{len(urls)} cached")

# ---------------- matching ----------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--budget-sec", type=int, default=0, help="max seconds of crawling per site (0 = use cache only)")
    ap.add_argument("--sources", default="mrdb,ifdb,changes")
    ap.add_argument("--from-dir", help="folder of saved IFDB .html pages to ingest")
    ap.add_argument("--changes-base", default=os.environ.get("FEC_BASE", ""))
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()
    src = set(a.sources.split(","))
    cache = load_json(CACHE, {}); meta = load_json(os.path.join(ROOT, "data/metadata.json"), {}); log = {}
    if "mrdb" in src and a.budget_sec: crawl_mrdb(cache, a.budget_sec, log)
    if "ifdb" in src:
        if a.from_dir: ingest_dir(a.from_dir, cache, log)
        elif a.budget_sec: crawl_ifdb(cache, meta, a.budget_sec, log)
    if "changes" in src: log["changes"] = "not configured (no base URL)" if not a.changes_base else "configured but no parser yet"
    json.dump(cache, open(CACHE, "w"))
    # --- match onto catalogue video items
    idx = load_json(os.path.join(ROOT, "data/index.json"), {"items": []})["items"]
    byid = {x["id"]: x for x in idx}
    vids = [x for x in idx if x.get("kind") == "video" or str(x.get("mimeType", "")).startswith("video/")]
    def path(x):
        s, g = x["name"], 0
        while x.get("parent") in byid and g < 12: x = byid[x["parent"]]; s += " " + x["name"]; g += 1
        return norm(s)
    mr = {}
    for e in cache.get("mrdb", {}).values():
        if e.get("title"): mr.setdefault(norm(e["title"]), []).append(e)
    out = {}; cov = {"mrdb": 0, "ifdb": 0}
    ifdb_by_url = cache.get("ifdb", {})
    ifdb_urls = meta.get("ifdb") or {}
    for v in vids:
        key = v.get("targetId") or v["id"]; ent = {}
        nt = norm(v["name"]); p = None
        cands = mr.get(nt) or []
        if len(cands) > 1: cands = [c for c in cands if c.get("editor") and norm(c["editor"]) and norm(c["editor"]) in path(v)] or []
        if len(cands) == 1:
            c = cands[0]; ent["mrdb"] = {"url": f"https://www.moviesremastered.com/movieinfo.php?id={c['id']}", "score": c.get("score"), "scale": scale_of(c.get("raw")) if c.get("score") is not None else None, "votes": c.get("votes", 0)}; cov["mrdb"] += 1
        u = ifdb_urls.get(v["id"]) or ifdb_urls.get(key)
        if u:
            c = ifdb_by_url.get(u)
            ent["ifdb"] = {"url": u, "score": c.get("score") if c else None, "scale": c.get("scale") if c else None, "votes": c.get("votes", 0) if c else 0}
            if c and c.get("score") is not None: cov["ifdb"] += 1
        if ent: out[v["id"]] = ent
    # IFDB scores already harvested by tools/editinfo.py (data/editinfo.json "edits", keyed by Drive id): authoritative for those edits
    ei = load_json(os.path.join(ROOT, "data/editinfo.json"), {}).get("edits", {})
    for k, e in ei.items():
        if not e.get("url"): continue
        r = e.get("rating")
        ent = out.setdefault(k, {})
        ent["ifdb"] = {"url": e["url"], "score": float(r) if r not in (None, "") else None, "scale": 10, "votes": int(e.get("reviews") or 0)}
        if r not in (None, ""): cov["ifdb"] += 1
    log.setdefault("ifdb", f"live fetch skipped; {len(ei)} edits from data/editinfo.json (harvested earlier)")
    n_ifdb_links = sum(1 for e in out.values() if "ifdb" in e); n_mr = sum(1 for e in out.values() if "mrdb" in e)
    cov_doc = {"catalogue_fan_edits": len(vids), "mrdb_cached_pages": sum(1 for v in cache.get("mrdb", {}).values() if v.get("title")),
               "mrdb_matched": n_mr, "mrdb_with_score": sum(1 for e in out.values() if e.get("mrdb", {}).get("score") is not None),
               "ifdb_links": n_ifdb_links, "ifdb_with_score": cov["ifdb"], "site_status": log}
    json.dump({"v": 1, "generated": time.strftime("%Y-%m-%d %H:%M"), "_coverage": cov_doc, "items": out}, open(OUT, "w"), separators=(",", ":"))
    print(json.dumps(cov_doc, indent=1))

if __name__ == "__main__":
    main()
