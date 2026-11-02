#!/usr/bin/env python3
"""READ-ONLY harvest of fan-edit change lists from Google Drive.

Sources (prefer order when merging in the UI):
  1. Video file DESCRIPTION field (Drive API when FEFC_DRIVE_TOKEN or
     GOOGLE_APPLICATION_CREDENTIALS / FEFC_DRIVE_CREDENTIALS_JSON is set)
  2. README / readme / info / changes / changelog / cutlist files
     (.txt/.md/.rtf/.doc/.docx/.pdf) sitting in the edit's folder
     — fetched via public uc?export=download (collection is link-shared)

Never creates, updates, or deletes anything on Drive.

Writes data/drive-changes.json:
  {
    "generated": "...",
    "by_id": {
      "<videoOrShortcutId>": {
        "changes": [{"text": "...", "source": "Drive description"|"Drive README", "file": "Changes.txt"}],
        "sources": [{"kind": "description"|"readme", "label": "...", "fileId": "...", "name": "..."}]
      }
    },
    "coverage": { ... }
  }
"""
from __future__ import annotations

import html as htmllib
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict
from xml.etree import ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

UA = {"User-Agent": "FEFCCollection/1.0 (faneditfanclub.com read-only change-list indexer; faneditfanclub@gmail.com)"}
OUT = "data/drive-changes.json"
CACHE = "tools/cache/drive_changes_cache.json"

DOC_NAME = re.compile(
    r"(?i)^(?:"
    r"(?:\d+[\.\)]\s*)?(?:readme|read\s*me!?|info|fe\s*info|changes?|changelog|change\s*log|"
    r"cut\s*lists?|change\s*lists?|whats?\s*changed|edit\s*notes?|text\s*changes?\s*list)"
    r"(?:\s*[-–:].*)?"
    r"|"
    r".*\b(?:changelist|cutlist|changelog|changes?\s*list|readme)\b.*"
    r")"
    r"(?:\.(?:txt|md|rtf|doc|docx|pdf|odt))?$"
)
DOC_EXT = re.compile(r"(?i)\.(txt|md|rtf|doc|docx|pdf|odt)$")
VIDEO_EXT = (".mp4", ".mkv", ".avi", ".m4v", ".mov", ".webm", ".mpg", ".mpeg")

STOP = {
    "the", "a", "an", "of", "and", "cut", "edit", "fan", "fanedit", "version",
    "extended", "in", "to", "part", "movie", "series", "film", "hd", "4k", "1080p", "720p",
}


def load_json(path, default=None):
    if default is None:
        default = {}
    try:
        with open(path, encoding="utf8") as f:
            return json.load(f)
    except Exception:
        return default


def save_json(path, obj):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def norm(s: str) -> str:
    s = htmllib.unescape(s or "").lower().replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def tokens(s: str):
    return {t for t in norm(s).split() if t and t not in STOP and len(t) > 1}


def is_video(x):
    mt = (x.get("mimeType") or "")
    n = (x.get("name") or "").lower()
    if x.get("kind") == "video":
        return True
    if mt.startswith("video/"):
        return True
    if mt == "application/vnd.google-apps.shortcut":
        # may target video — treat as video candidate by name
        return n.endswith(VIDEO_EXT) or "fan edit" in n
    return n.endswith(VIDEO_EXT)


def is_change_doc(x):
    n = (x.get("name") or "").strip()
    if not n or n.startswith("._"):
        return False
    mt = x.get("mimeType") or ""
    if mt.startswith("video/") or mt.endswith("folder"):
        return False
    if DOC_NAME.match(n):
        return True
    # e.g. "Alien VI - Covenant - The CK Sensical Cut (Info).txt"
    if DOC_EXT.search(n) and re.search(
        r"(?i)\b(readme|read\s*me|changelog|changelist|cutlist|changes?|info|edit\s*notes?)\b", n
    ):
        return True
    return False


def drive_get(url, timeout=60):
    last = None
    for i in range(3):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read(), r.headers.get("content-type", ""), r.geturl()
        except Exception as e:
            last = e
            time.sleep(1.5 * (i + 1))
    raise last  # type: ignore


def download_file(fid: str, max_bytes: int = 8_000_000) -> bytes:
    """Public link-shared download with confirm-token handling. READ-ONLY."""
    cj_headers = dict(UA)
    url = f"https://drive.google.com/uc?export=download&id={fid}"
    data, ctype, final = drive_get(url)
    if (
        b"confirm=" in data[:8000]
        or b"uc-download-link" in data[:8000]
        or b"download_warning" in data[:8000]
        or "text/html" in (ctype or "")
    ):
        html = data.decode("utf8", "replace")
        m = re.search(r"confirm=([0-9A-Za-z_-]+)", html) or re.search(
            r'name="confirm"\s+value="([^"]+)"', html
        )
        if m:
            url2 = f"https://drive.google.com/uc?export=download&id={fid}&confirm={m.group(1)}"
            data, ctype, final = drive_get(url2)
        else:
            # virus-scan form sometimes uses uuid cookie path
            m2 = re.search(r'href="(/uc\?export=download[^"]+)"', html)
            if m2:
                url2 = "https://drive.google.com" + htmllib.unescape(m2.group(1)).replace("&amp;", "&")
                data, ctype, final = drive_get(url2)
    if len(data) > max_bytes:
        data = data[:max_bytes]
    return data


def docx_text(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        xml = z.read("word/document.xml")
    # preserve paragraph breaks
    xml = re.sub(rb"</w:p>", b"\n", xml)
    xml = re.sub(rb"<w:tab[^/]*/>", b"\t", xml)
    text = re.sub(rb"<[^>]+>", b"", xml)
    return text.decode("utf8", "replace")


def rtf_text(data: bytes) -> str:
    s = data.decode("utf8", "replace")
    # crude RTF strip
    s = re.sub(r"\\'[0-9a-fA-F]{2}", " ", s)
    s = re.sub(r"\\[a-zA-Z]+\d* ?", "", s)
    s = s.replace("{", "").replace("}", "")
    return s


def pdf_text(data: bytes) -> str:
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(data)
        path = f.name
    try:
        r = subprocess.run(
            ["pdftotext", "-layout", "-enc", "UTF-8", path, "-"],
            capture_output=True,
            timeout=60,
        )
        return (r.stdout or b"").decode("utf8", "replace")
    except Exception:
        return ""
    finally:
        try:
            os.unlink(path)
        except Exception:
            pass


def old_doc_text(data: bytes) -> str:
    # Very old .doc — try strings-like extraction of readable runs
    try:
        txt = data.decode("utf16", "ignore")
        if len(re.findall(r"[A-Za-z]{3,}", txt)) > 20:
            return txt
    except Exception:
        pass
    parts = re.findall(rb"[\x20-\x7e]{4,}", data)
    return "\n".join(p.decode("ascii", "ignore") for p in parts)


def bytes_to_text(name: str, data: bytes) -> str:
    n = name.lower()
    if n.endswith(".docx"):
        try:
            return docx_text(data)
        except Exception as e:
            return f""
    if n.endswith(".pdf"):
        return pdf_text(data)
    if n.endswith(".rtf"):
        return rtf_text(data)
    if n.endswith(".doc") and not n.endswith(".docx"):
        return old_doc_text(data)
    # txt / md / odt fallback
    if n.endswith(".odt"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                xml = z.read("content.xml")
            xml = re.sub(rb"</text:p>", b"\n", xml)
            return re.sub(rb"<[^>]+>", b"", xml).decode("utf8", "replace")
        except Exception:
            pass
    for enc in ("utf8", "utf-16", "latin-1", "cp1252"):
        try:
            return data.decode(enc)
        except Exception:
            continue
    return data.decode("utf8", "replace")


BULLET_LINE = re.compile(
    r"^\s*(?:[-–—*•▪◦●·]|管理|\d+[\.)]|\[\d+\])\s+(\S.*)$"
)
CHANGEY = re.compile(
    r"(?i)\b("
    r"added|removed|cut|trimmed|extended|reinserted|replaced|moved|deleted|shortened|"
    r"restored|inserted|omitted|re[- ]?scored|re[- ]?edited|changed|fixed|color[- ]?grad"
    r")\b"
)


def parse_change_lines(text: str, limit: int = 80) -> list[str]:
    if not text:
        return []
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # drop huge binary garbage
    if text.count("\x00") > 10:
        return []
    lines = []
    for raw in text.split("\n"):
        s = raw.strip()
        if not s or len(s) < 3:
            continue
        # skip page numbers / bare bullets
        if re.fullmatch(r"[\d\W]+", s):
            continue
        m = BULLET_LINE.match(s)
        if m:
            lines.append(m.group(1).strip())
            continue
        if CHANGEY.search(s) and 8 <= len(s) <= 400:
            lines.append(re.sub(r"^[-–—*•▪]\s*", "", s))
            continue
    # If almost nothing matched but the whole doc looks like a change list (many short lines)
    if len(lines) < 3:
        alt = []
        for raw in text.split("\n"):
            s = raw.strip()
            if 12 <= len(s) <= 400 and not re.fullmatch(r"[\d\W]+", s):
                if CHANGEY.search(s) or s.startswith(("-", "•", "*")):
                    alt.append(re.sub(r"^[-–—*•▪]\s*", "", s))
        if len(alt) > len(lines):
            lines = alt
    # Dedup preserve order
    out, seen = [], set()
    for L in lines:
        k = norm(L)
        if len(k) < 6 or k in seen:
            continue
        seen.add(k)
        out.append(L)
        if len(out) >= limit:
            break
    return out


def parse_description(desc: str) -> list[str]:
    if not desc or not desc.strip():
        return []
    # Prefer bullet parse; else split paragraphs that look like changes; else whole as one block split by ;
    lines = parse_change_lines(desc)
    if lines:
        return lines
    parts = re.split(r"[\n;]+", desc)
    out = []
    for p in parts:
        p = p.strip()
        if len(p) >= 12 and (CHANGEY.search(p) or len(parts) == 1):
            out.append(p)
    if not out and len(desc.strip()) >= 20:
        # keep as a single synopsis-like note if it mentions edit/cut
        if re.search(r"(?i)\b(fan\s*edit|cut|runtime|removed|added)\b", desc):
            out = [desc.strip()[:800]]
    return out[:80]


def get_access_token() -> str | None:
    tok = os.environ.get("FEFC_DRIVE_TOKEN") or os.environ.get("GOOGLE_ACCESS_TOKEN")
    if tok:
        return tok.strip()
    cred_path = os.environ.get("FEFC_DRIVE_CREDENTIALS_JSON") or os.environ.get(
        "GOOGLE_APPLICATION_CREDENTIALS"
    )
    if not cred_path or not os.path.exists(cred_path):
        # inline JSON in env
        raw = os.environ.get("FEFC_DRIVE_CREDENTIALS")
        if not raw:
            return None
        import tempfile

        fd, cred_path = tempfile.mkstemp(suffix=".json")
        os.write(fd, raw.encode()); os.close(fd)
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request

        scopes = ["https://www.googleapis.com/auth/drive.readonly"]
        creds = service_account.Credentials.from_service_account_file(cred_path, scopes=scopes)
        creds.refresh(Request())
        return creds.token
    except Exception as e:
        print(f"Drive credentials present but token refresh failed: {e}", flush=True)
        return None


def fetch_descriptions(video_ids: list[str], token: str, cache: dict) -> dict[str, str]:
    """Batch files.get?fields=description via Drive API v3. READ-ONLY."""
    out = {}
    desc_cache = cache.setdefault("descriptions", {})
    pending = [i for i in video_ids if i not in desc_cache]
    print(f"Drive description API: {len(video_ids)} videos, {len(pending)} uncached", flush=True)
    for i, fid in enumerate(pending):
        url = (
            "https://www.googleapis.com/drive/v3/files/"
            + urllib.parse.quote(fid)
            + "?fields=id,name,description,mimeType,shortcutDetails"
            + "&supportsAllDrives=true"
        )
        req = urllib.request.Request(url, headers={**UA, "Authorization": f"Bearer {token}"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                meta = json.loads(r.read().decode())
            desc = (meta.get("description") or "").strip()
            # follow shortcut target
            target = (meta.get("shortcutDetails") or {}).get("targetId")
            if not desc and target:
                url2 = (
                    "https://www.googleapis.com/drive/v3/files/"
                    + urllib.parse.quote(target)
                    + "?fields=description&supportsAllDrives=true"
                )
                req2 = urllib.request.Request(url2, headers={**UA, "Authorization": f"Bearer {token}"})
                with urllib.request.urlopen(req2, timeout=30) as r2:
                    meta2 = json.loads(r2.read().decode())
                desc = (meta2.get("description") or "").strip()
            desc_cache[fid] = desc
            if desc:
                out[fid] = desc
        except urllib.error.HTTPError as e:
            desc_cache[fid] = ""
            if e.code in (401, 403):
                print(f"Drive API auth error {e.code}; stopping description harvest", flush=True)
                break
        except Exception as e:
            desc_cache[fid] = ""
            if i < 5:
                print(f"desc fetch {fid}: {e}", flush=True)
        if (i + 1) % 50 == 0:
            save_json(CACHE, cache)
            print(f"  descriptions {i+1}/{len(pending)}", flush=True)
        time.sleep(0.05)  # gentle
    # pull cached hits too
    for fid in video_ids:
        d = (desc_cache.get(fid) or "").strip()
        if d:
            out[fid] = d
    save_json(CACHE, cache)
    return out


def folder_path_names(fid, by, root):
    names = []
    x = by.get(fid)
    g = 0
    while x and x.get("parent") and g < 40:
        p = by.get(x["parent"])
        if not p:
            break
        if p["id"] != root:
            names.append(p.get("name") or "")
        if p["id"] == root:
            break
        x = p
        g += 1
    return names


def score_match(folder_toks, video_name):
    vt = tokens(video_name)
    if not folder_toks or not vt:
        return 0.0
    inter = folder_toks & vt
    if len(inter) < 2:
        return 0.0
    return len(inter) / max(len(folder_toks), 1)


def main():
    idx = load_json("data/index.json")
    items = idx.get("items") or []
    by = {x["id"]: x for x in items}
    root = idx.get("root")
    cache = load_json(CACHE, {"descriptions": {}, "docs": {}})

    docs = [x for x in items if is_change_doc(x)]
    vids = [x for x in items if is_video(x)]
    print(f"index: {len(items)} items, {len(vids)} videos, {len(docs)} change-doc candidates", flush=True)

    videos_by_parent = defaultdict(list)
    for v in vids:
        videos_by_parent[v.get("parent")].append(v)

    # --- 1) README / info / changelog files ---
    doc_results = []  # {fileId, name, parent, lines, err}
    for i, doc in enumerate(docs):
        fid = doc["id"]
        name = doc["name"]
        cached = cache.get("docs", {}).get(fid)
        # re-fetch if missing or name changed or empty previously with error retry
        if cached and cached.get("name") == name and cached.get("lines") is not None and not os.environ.get("FORCE_REFETCH"):
            lines = cached["lines"]
            err = cached.get("err")
        else:
            lines, err = [], None
            try:
                data = download_file(fid)
                # detect HTML error pages
                if data.lstrip().startswith(b"<!DOCTYPE") or data.lstrip().startswith(b"<html"):
                    err = "html_instead_of_file"
                    lines = []
                else:
                    text = bytes_to_text(name, data)
                    lines = parse_change_lines(text)
                    if not lines and len(text.strip()) > 40:
                        # keep a short prose excerpt when it's clearly editorial notes
                        excerpt = re.sub(r"\s+", " ", text.strip())[:500]
                        if re.search(r"(?i)\b(edit|cut|version|audio|subtitle|runtime)\b", excerpt):
                            lines = [excerpt]
                cache.setdefault("docs", {})[fid] = {
                    "name": name,
                    "lines": lines,
                    "err": err,
                    "nbytes": len(data),
                    "fetched": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
            except Exception as e:
                err = str(e)[:200]
                cache.setdefault("docs", {})[fid] = {
                    "name": name,
                    "lines": [],
                    "err": err,
                    "fetched": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
            if (i + 1) % 10 == 0:
                save_json(CACHE, cache)
                print(f"  docs {i+1}/{len(docs)}", flush=True)
            time.sleep(0.15)
        doc_results.append(
            {"id": fid, "name": name, "parent": doc.get("parent"), "lines": lines or [], "err": err}
        )
    save_json(CACHE, cache)

    # Map docs -> videos
    by_id = defaultdict(lambda: {"changes": [], "sources": []})

    def add_changes(vid_id, lines, kind, label, file_id, file_name):
        if not lines:
            return
        ent = by_id[vid_id]
        src_key = (kind, file_id)
        if not any((s.get("kind"), s.get("fileId")) == src_key for s in ent["sources"]):
            ent["sources"].append(
                {"kind": kind, "label": label, "fileId": file_id, "name": file_name}
            )
        existing = {norm(c["text"]) for c in ent["changes"]}
        for L in lines:
            k = norm(L)
            if k in existing:
                continue
            existing.add(k)
            ent["changes"].append({"text": L, "source": label, "file": file_name, "kind": kind})

    matched_docs = 0
    for d in doc_results:
        if not d["lines"]:
            continue
        label = "Drive README" if re.search(r"(?i)read\s*me|readme", d["name"]) else (
            "Drive info" if re.search(r"(?i)\binfo\b", d["name"]) else "Drive changelog"
        )
        # Prefer exact file-type labels
        if re.search(r"(?i)change|cutlist|changelist", d["name"]):
            label = "Drive changelog"
        parent = d["parent"]
        targets = list(videos_by_parent.get(parent) or [])
        # If doc sits in a leaf folder with no videos, match folder name to videos
        if not targets and parent:
            folder_name = (by.get(parent) or {}).get("name") or ""
            ft = tokens(folder_name)
            scored = []
            for v in vids:
                sc = score_match(ft, v.get("name") or "")
                if sc >= 0.45:
                    scored.append((sc, v))
            scored.sort(key=lambda x: -x[0])
            targets = [v for sc, v in scored[:5] if sc >= 0.45]
            # also try parent-of-parent siblings (rare)
        if not targets:
            # still record under folder id for coverage / future linking
            add_changes(f"folder:{parent}", d["lines"], "readme", label, d["id"], d["name"])
            continue
        matched_docs += 1
        for v in targets:
            add_changes(v["id"], d["lines"], "readme", label, d["id"], d["name"])
            tid = v.get("targetId")
            if tid and tid != v["id"]:
                add_changes(tid, d["lines"], "readme", label, d["id"], d["name"])

    # --- 2) Descriptions via Drive API (optional) ---
    desc_count = 0
    desc_status = "skipped (set FEFC_DRIVE_TOKEN or FEFC_DRIVE_CREDENTIALS_JSON for read-only description harvest)"
    token = get_access_token()
    if token:
        # Prefer real video / shortcut targets
        ids = []
        for v in vids:
            ids.append(v["id"])
            if v.get("targetId"):
                ids.append(v["targetId"])
        # unique preserve order
        seen = set()
        uniq = []
        for i in ids:
            if i not in seen:
                seen.add(i)
                uniq.append(i)
        try:
            descs = fetch_descriptions(uniq, token, cache)
            desc_status = f"ok ({len(descs)} non-empty descriptions)"
            for fid, desc in descs.items():
                lines = parse_description(desc)
                if not lines:
                    continue
                desc_count += 1
                add_changes(fid, lines, "description", "Drive description", fid, (by.get(fid) or {}).get("name") or fid)
        except Exception as e:
            desc_status = f"error: {e}"
    else:
        # Import pre-seeded descriptions from cache if any were filled externally
        for fid, desc in (cache.get("descriptions") or {}).items():
            if not desc:
                continue
            lines = parse_description(desc)
            if lines:
                desc_count += 1
                add_changes(fid, lines, "description", "Drive description", fid, (by.get(fid) or {}).get("name") or fid)
        if desc_count:
            desc_status = f"from cache only ({desc_count} non-empty)"

    # Sort changes: description first, then readme/changelog
    kind_order = {"description": 0, "readme": 1}
    by_id_out = {}
    for vid, ent in by_id.items():
        if vid.startswith("folder:") and not ent["changes"]:
            continue
        ch = sorted(ent["changes"], key=lambda c: (kind_order.get(c.get("kind"), 9),))
        # re-dedupe after sort
        seen = set()
        final = []
        for c in ch:
            k = norm(c["text"])
            if k in seen:
                continue
            seen.add(k)
            final.append(c)
        ent["changes"] = final
        if final:
            by_id_out[vid] = ent

    docs_with_lines = sum(1 for d in doc_results if d["lines"])
    docs_failed = sum(1 for d in doc_results if d.get("err"))
    video_keys = [k for k in by_id_out if not k.startswith("folder:")]
    coverage = {
        "change_doc_candidates": len(docs),
        "change_docs_with_parsed_lines": docs_with_lines,
        "change_docs_download_errors": docs_failed,
        "change_docs_linked_to_videos": matched_docs,
        "videos_with_drive_changes": len(video_keys),
        "videos_with_drive_description": desc_count,
        "drive_description_status": desc_status,
        "folder_only_unlinked": sum(1 for k in by_id_out if k.startswith("folder:")),
    }

    out = {
        "generated": time.strftime("%Y-%m-%d %H:%M"),
        "by_id": by_id_out,
        "coverage": coverage,
    }
    save_json(OUT, out)
    print(json.dumps(coverage, indent=2), flush=True)
    print(f"Wrote {OUT} ({len(by_id_out)} keys)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
