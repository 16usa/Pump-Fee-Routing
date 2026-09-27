#!/usr/bin/env python3
from pathlib import Path
import re
import shutil
import sys

CSS = Path("src/styles.css")
BACKUP = Path("src/styles.css.before-home-local-typography-reset-v24-61")
MARKER = "home-local-typography-reset-v24-61"

# These are the historical HOME-only patches that explicitly changed text sizes.
# We remove ONLY their font-size declarations. No global typography scaling is touched.
TARGET_PATCHES = [
    "preview-text-unify-v20-1",
    "top-token-explore-badges-v21-1",
    "top-token-time-badge-v21-1",
    "top-tokens-name-dollar-scale-v24-7",
    "top-tokens-name-badge-match-launch-v24-8",
    "top-tokens-name-match-launch-fix-v24-9",
    "top-tokens-name-conflict-fix-v24-10",
    "top-tokens-money-mark-match-avatar-v24-11",
    "top-tokens-avatar-dollar-conflict-fix-v24-12",
    "home-pagers-match-fees-route-v24-16",
    "home-pager-arrow-scale-fix-v24-18",
    "home-pagers-match-docs-open-v24-19",
    "home-pager-arrows-visual-match-v24-20",
    "top-tokens-tabs-match-pager-v24-25",
    "home-hero-cta-match-header-launch-v24-26",
    "home-hero-subtitle-match-launch-v24-27",
    "explore-footer-match-lower-preview-v24-40",
    "hero-docs-text-match-launch-v24-49",
    "hero-cta-typography-unify-v24-50",
    "hero-cta-match-subtitle-size-v24-51",
]

if not CSS.exists():
    raise SystemExit("ERROR: src/styles.css not found. Run from the existing Replit workspace root.")

css = CSS.read_text(encoding="utf-8")

if MARKER in css:
    print("Already applied.")
    sys.exit(0)

shutil.copy2(CSS, BACKUP)

patch_comment_re = re.compile(
    r"/\*\s*([a-z0-9][a-z0-9-]*-v\d[^\s*]*)",
    re.I,
)

def next_patch_start(text: str, start: int) -> int:
    m = patch_comment_re.search(text, start)
    return m.start() if m else -1

removed = 0
missing = []

for marker in TARGET_PATCHES:
    start = css.find("/* " + marker)
    if start < 0:
        start = css.find("/*" + marker)
    if start < 0:
        missing.append(marker)
        continue

    end = next_patch_start(css, start + len(marker) + 3)
    if end < 0:
        end = len(css)

    segment = css[start:end]
    before = len(re.findall(r"font-size\s*:", segment, flags=re.I))

    # Remove ONLY font-size from the historical local Home patch.
    # Keep line-height, weight, spacing, geometry, colors, borders, etc.
    segment = re.sub(
        r"\s*font-size\s*:\s*[^;{}]+;?",
        "",
        segment,
        flags=re.I,
    )

    after = len(re.findall(r"font-size\s*:", segment, flags=re.I))
    removed += before - after
    css = css[:start] + segment + css[end:]

css += (
    "\n\n/* home-local-typography-reset-v24-61\n"
    "   Removed historical Home-only font-size overrides.\n"
    "   Global/current site typography is intentionally untouched. */\n"
)

CSS.write_text(css, encoding="utf-8")

print(f"OK: removed {removed} old Home-only font-size overrides.")
if missing:
    print("WARNING: markers not found:", ", ".join(missing))
print(f"Backup: {BACKUP}")
print("Global typography was NOT changed.")
print("No restart was performed.")
