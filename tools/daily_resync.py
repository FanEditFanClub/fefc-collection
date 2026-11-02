#!/usr/bin/env python3
"""
Nightly collection resync & metadata pipeline for Fan Edit Fan Club Collection.
Runs at midnight to:
 1. Crawl Drive catalog to detect additions & updates
 2. Rebuild links and dates index
 3. Classify file kinds and audit naming standards
 4. Sync fan-edit metadata from IFDB (fanedit.org), IMDb, MRDB/moviesremastered
 5. Sync artwork and folder thumbnails
 6. Update shuffle pools and AI search titles
 7. Compile frontend bundle (npm run build)
 8. Deploy snapshot to Cloudflare Pages
 9. Push updated data to GitHub
 10. Record log entry in FanEditFanClub/fanedit-daily-changelog
"""
import os
import sys
import time
import json
import subprocess
from datetime import datetime

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT_DIR)

# Optional Mac-local node bin (only if present). On GitHub Actions, setup-node PATH is used.
_MAC_NODE = "/Users/carson/.gemini/antigravity/scratch/tools/node-v20.18.0-darwin-arm64/bin"
NODE_BIN = os.environ.get("FEFC_NODE_BIN", "")
if not NODE_BIN and os.path.isdir(_MAC_NODE):
    NODE_BIN = _MAC_NODE

ENV = dict(os.environ)
if NODE_BIN:
    ENV["PATH"] = f"{NODE_BIN}:{ENV.get('PATH', '')}"
ENV["XDG_CONFIG_HOME"] = os.path.join(ROOT_DIR, ".config")
ENV["XDG_DATA_HOME"] = os.path.join(ROOT_DIR, ".data")

# Cloudflare: never hardcode. Prefer GitHub Actions secret CLOUDFLARE_API_TOKEN.
# Account id is not secret; allow env override, else known FEFC Pages account.
ENV.setdefault("CLOUDFLARE_ACCOUNT_ID", "770241106ff0deecb47b7761b2e752c2")
if not ENV.get("CLOUDFLARE_API_TOKEN"):
    raise SystemExit(
        "CLOUDFLARE_API_TOKEN is required (set the GitHub Actions secret or export it locally). "
        "Do not hardcode the token. Owner should rotate the previously exposed token."
    )

# Changelog repo for optional nightly entry (entries.jsonl only — never touch its workflow/state).
_MAC_CHANGELOG = "/Users/carson/.gemini/antigravity/scratch/fanedit-daily-changelog"
_SIBLING_CHANGELOG = os.path.abspath(os.path.join(ROOT_DIR, "..", "fanedit-daily-changelog"))
CHANGELOG_REPO = os.environ.get("CHANGELOG_REPO", "")
if not CHANGELOG_REPO:
    for candidate in (_SIBLING_CHANGELOG, _MAC_CHANGELOG):
        if os.path.isdir(candidate):
            CHANGELOG_REPO = candidate
            break

def run_cmd(cmd, check=True):
    print(f"--> Running: {cmd}", flush=True)
    res = subprocess.run(cmd, shell=True, env=ENV, cwd=ROOT_DIR, capture_output=True, text=True)
    if res.stdout:
        print(res.stdout[-1000:], flush=True)
    if res.stderr:
        print(res.stderr[-1000:], flush=True)
    if check and res.returncode != 0:
        raise RuntimeError(f"Command failed (exit {res.returncode}): {cmd}")
    return res

def main():
    start_ts = datetime.utcnow().isoformat() + "Z"
    print(f"=== Starting Daily FEFC Collection Resync at {start_ts} ===", flush=True)

    # 1. Drive Catalog Crawl & Links
    try:
        run_cmd("python3 tools/crawl.py")
    except Exception as e:
        print(f"Warning during crawl: {e}", flush=True)

    try:
        run_cmd("python3 tools/links.py")
    except Exception as e:
        print(f"Warning during links: {e}", flush=True)

    try:
        run_cmd("python3 tools/dates.py")
    except Exception as e:
        print(f"Warning during dates: {e}", flush=True)

    # 1b. When each item was added to the collection (first-seen + pinned Drive createdTime) -> dates.json a/c, added.json
    try:
        run_cmd("python3 tools/added.py")
    except Exception as e:
        print(f"Warning during added: {e}", flush=True)

    # 2. File classification
    try:
        run_cmd("python3 tools/classify_probe.py")
        run_cmd("python3 tools/classify.py")
    except Exception as e:
        print(f"Warning during classify: {e}", flush=True)

    # 3. Metadata sync (IFDB, IMDb, source films)
    try:
        run_cmd("python3 tools/editinfo.py")
    except Exception as e:
        print(f"Warning during editinfo: {e}", flush=True)

    # 3a. Drive change lists (file DESCRIPTION + README/info/changelog in edit folders). READ-ONLY.
    try:
        run_cmd("python3 tools/drive_changes.py")
    except Exception as e:
        print(f"Warning during drive_changes: {e}", flush=True)

    try:
        run_cmd("python3 tools/metadata.py")
    except Exception as e:
        print(f"Warning during metadata: {e}", flush=True)

    # 3b. Fan-edit community ratings (MRDb crawl continues each night; IFDB reported as blocked if Cloudflare challenges it)
    # Set SKIP_RATINGS=1 for a faster workflow_dispatch smoke test.
    if os.environ.get("SKIP_RATINGS", "").strip().lower() in ("1", "true", "yes"):
        print("Skipping fanedit_ratings (SKIP_RATINGS set)", flush=True)
    else:
        try:
            run_cmd("python3 tools/fanedit_ratings.py --budget-sec 900")
        except Exception as e:
            print(f"Warning during fanedit ratings: {e}", flush=True)

    # 4. Artwork sync
    try:
        run_cmd("python3 tools/posters.py")
    except Exception as e:
        print(f"Warning during posters: {e}", flush=True)

    # 4b. Poster accuracy: year/title re-match + pinned official art (data/poster-pins.json); regenerated posters.json would otherwise lose them
    try:
        run_cmd("python3 tools/poster_fix.py")
    except Exception as e:
        print(f"Warning during poster_fix: {e}", flush=True)

    try:
        run_cmd("python3 tools/folderthumbs.py")
    except Exception as e:
        print(f"Warning during folderthumbs: {e}", flush=True)

    # 5. Search & Shuffle precomputation
    try:
        run_cmd("python3 tools/shuffle.py")
    except Exception as e:
        print(f"Warning during shuffle: {e}", flush=True)

    try:
        run_cmd("python3 tools/genre_collections.py")
    except Exception as e:
        print(f"Warning during genre_collections: {e}", flush=True)

    try:
        run_cmd("python3 tools/ai_titles.py")
    except Exception as e:
        print(f"Warning during ai_titles: {e}", flush=True)

    # 6. Rebuild frontend assets
    run_cmd("npm run build")

    # 7. Deploy to Cloudflare Pages
    deploy_res = run_cmd("./node_modules/.bin/wrangler pages deploy . --project-name=fefc-collection --branch=main")
    print("Cloudflare deploy output:", deploy_res.stdout[-300:], flush=True)

    # 8. Git commit & push data updates to GitHub fefc-collection
    try:
        run_cmd("git add data/ assets/")
        status_res = subprocess.run("git status --porcelain", shell=True, capture_output=True, text=True, cwd=ROOT_DIR)
        if status_res.stdout.strip():
            run_cmd(f'git commit -m "Nightly collection sync ({datetime.utcnow().strftime("%Y-%m-%d")})"')
            run_cmd("git push origin main")
    except Exception as e:
        print(f"Git push warning: {e}", flush=True)

    # 9. Append entry to changelog
    try:
        if os.path.exists(CHANGELOG_REPO):
            ch_file = os.path.join(CHANGELOG_REPO, "changelog", "entries.jsonl")
            entry = {"ts": datetime.utcnow().isoformat() + "Z", "text": f"FEFC Collection: Nightly automated catalog refresh and metadata sync completed on {datetime.utcnow().strftime('%B %d, %Y')}."}
            with open(ch_file, "a") as f:
                f.write("\n" + json.dumps(entry) + "\n")
            subprocess.run("git add changelog/entries.jsonl && git commit -m 'Nightly sync changelog entry' && git push origin main", shell=True, cwd=CHANGELOG_REPO)
    except Exception as e:
        print(f"Changelog warning: {e}", flush=True)

    print(f"=== Nightly sync completed successfully at {datetime.utcnow().isoformat()}Z ===", flush=True)

if __name__ == "__main__":
    main()
