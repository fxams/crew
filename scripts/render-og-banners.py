#!/usr/bin/env python3
"""Redraw the OG / X banner fee-split line onto the existing brand plates.

Keeps the lockup, grain, and tagline; replaces only the last caption.
Usage (repo root):
  python3 scripts/render-og-banners.py
"""
from __future__ import annotations

import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "agent/crew/public/brand"
FONT_URL = "https://github.com/google/fonts/raw/main/ofl/worksans/WorkSans%5Bwght%5D.ttf"
FONT_PATH = Path("/tmp/crew-fonts/WorkSans.ttf")
CAPTION = "60% crew · 15% agent · 25% treasury"
INK = (242, 246, 239)

# Last-line boxes measured on the current 1280x720 plates.
TARGETS = (
    {
        "stem": "banner-og",
        "box": (350, 540, 980, 590),
        "sample_y": (600, 640),
        "font_size": 28,
    },
    {
        "stem": "banner-x-header",
        "box": (400, 515, 960, 560),
        "sample_y": (575, 620),
        "font_size": 26,
    },
)


def ensure_font() -> Path:
    if FONT_PATH.exists():
        return FONT_PATH
    FONT_PATH.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(FONT_URL, FONT_PATH)
    return FONT_PATH


def cover_box(im: Image.Image, box: tuple[int, int, int, int], sample_y: tuple[int, int]) -> None:
    """Stamp a dark grain strip from below the caption over the old line."""
    x0, y0, x1, y1 = box
    sy0, sy1 = sample_y
    sample = im.crop((x0, sy0, x1, sy1))
    dest_h = y1 - y0
    tiled = Image.new("RGB", (x1 - x0, dest_h))
    y = 0
    while y < dest_h:
        tiled.paste(sample, (0, y))
        y += sample.size[1]
    im.paste(tiled.crop((0, 0, x1 - x0, dest_h)), (x0, y0))


def draw_caption(im: Image.Image, box: tuple[int, int, int, int], font_size: int, font_path: Path) -> None:
    draw = ImageDraw.Draw(im)
    font = ImageFont.truetype(str(font_path), font_size)
    x0, y0, x1, y1 = box
    bbox = draw.textbbox((0, 0), CAPTION, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = x0 + (x1 - x0 - tw) // 2 - bbox[0]
    y = y0 + (y1 - y0 - th) // 2 - bbox[1]
    draw.text((x, y), CAPTION, font=font, fill=INK)


def render_one(target: dict, font_path: Path) -> None:
    src = BRAND / f"{target['stem']}.png"
    im = Image.open(src).convert("RGB")
    cover_box(im, target["box"], target["sample_y"])
    draw_caption(im, target["box"], target["font_size"], font_path)
    im.save(BRAND / f"{target['stem']}.png", format="PNG", optimize=True)
    im.save(BRAND / f"{target['stem']}.jpg", format="JPEG", quality=88, optimize=True, progressive=True)
    print(f"wrote {target['stem']}.png/.jpg")


def main() -> None:
    font_path = ensure_font()
    for target in TARGETS:
        render_one(target, font_path)


if __name__ == "__main__":
    main()
