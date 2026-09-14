#!/usr/bin/env python3
"""Generate P1 multi-character side-view templates (640×960) and A4 line SVGs."""
from __future__ import annotations
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHARS = ROOT / "public" / "characters"
PRINT = ROOT / "public" / "print"
W, H = 640, 960

# A4 portrait viewBox in mm-ish units used by existing wukong print
A4_W, A4_H = 210, 297


def joint_discs(cx_cy_list, r=10):
    parts = []
    for cx, cy in cx_cy_list:
        parts.append(
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#fff" stroke="#000" stroke-width="3"/>'
        )
    return "\n".join(parts)


def svg_doc(body: str, w=W, h=H) -> str:
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
  <g fill="#ffffff" stroke="#000000" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
{body}
  </g>
</svg>
'''


def a4_line_doc(body_scaled: str, title: str) -> str:
    # Scale 640x960 figure into A4 with margins
    # content box ~ 170mm wide, centered
    margin_x = 20
    content_w = 170
    scale = content_w / W
    content_h = H * scale
    margin_y = (A4_H - content_h) / 2
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{A4_W}mm" height="{A4_H}mm" viewBox="0 0 {A4_W} {A4_H}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="{A4_W/2}" y="14" text-anchor="middle" font-family="sans-serif" font-size="6" fill="#333">{title}・側面線稿</text>
  <g fill="none" stroke="#000000" stroke-width="{4/W*content_w}" stroke-linejoin="round" stroke-linecap="round"
     transform="translate({margin_x},{margin_y}) scale({scale})">
{body_scaled}
  </g>
  <text x="{A4_W/2}" y="{A4_H-8}" text-anchor="middle" font-family="sans-serif" font-size="4" fill="#877f71">皮影戲・列印後著色・影相入偶</text>
</svg>
'''


# ---- Character path bodies (fill+stroke shapes). Facing RIGHT. ----

def tangseng_body() -> str:
    # Monk: tall hat (毗盧帽), robe, staff optional as thin prop on back
    return f'''
    <!-- head + 毗盧帽 -->
    <ellipse cx="360" cy="168" rx="52" ry="58"/>
    <path d="M308,140 C308,90 360,55 412,90 C420,110 418,130 412,145 L308,145 Z"/>
    <path d="M330,55 L360,28 L390,55" fill="none"/>
    <!-- ear -->
    <ellipse cx="318" cy="175" rx="10" ry="16"/>
    <!-- neck -->
    <rect x="345" y="220" width="30" height="36" rx="6"/>
    <!-- torso robe -->
    <path d="M280,250 L400,248 L430,520 L360,560 L250,530 Z"/>
    <!-- sleeves / arms -->
    <path d="M280,280 L220,360 L200,480 L230,490 L270,380 L300,310 Z"/>
    <path d="M400,275 L470,340 L520,430 L490,450 L430,350 L405,300 Z"/>
    <!-- legs under robe hint -->
    <path d="M300,540 L280,780 L320,790 L350,560 Z"/>
    <path d="M370,555 L390,780 L440,785 L420,555 Z"/>
    <!-- feet -->
    <ellipse cx="295" cy="800" rx="36" ry="18"/>
    <ellipse cx="425" cy="800" rx="36" ry="18"/>
    <!-- prayer beads hint -->
    <circle cx="360" cy="310" r="8"/><circle cx="348" cy="330" r="7"/><circle cx="372" cy="330" r="7"/>
    {joint_discs([(360,250),(250,300),(210,420),(430,300),(500,400),(320,560),(400,560),(300,780),(420,780)])}
    '''


def bajie_body() -> str:
    # Pig: snout, ears, pot belly, rake on back arm
    return f'''
    <!-- pig head -->
    <ellipse cx="380" cy="200" rx="70" ry="62"/>
    <!-- snout facing right -->
    <ellipse cx="455" cy="215" rx="38" ry="28"/>
    <ellipse cx="480" cy="208" rx="8" ry="10"/>
    <ellipse cx="480" cy="225" rx="8" ry="10"/>
    <!-- ears -->
    <path d="M330,150 L300,80 L360,130 Z"/>
    <path d="M400,145 L430,70 L450,140 Z"/>
    <!-- neck -->
    <rect x="350" y="255" width="50" height="30" rx="8"/>
    <!-- big belly torso -->
    <path d="M250,280 L420,275 L460,480 L400,560 L240,540 L220,380 Z"/>
    <!-- arms -->
    <path d="M250,310 L180,400 L160,520 L200,530 L240,410 L280,330 Z"/>
    <path d="M420,300 L500,350 L560,420 L530,450 L450,370 L425,320 Z"/>
    <!-- rake (九齿钉耙) held front -->
    <path d="M540,200 L555,200 L555,460 L540,460 Z" fill="#fff"/>
    <path d="M520,200 L575,200 L575,230 L520,230 Z"/>
    <path d="M525,195 L530,170 M540,195 L545,165 M555,195 L560,170 M565,195 L570,165" fill="none"/>
    <!-- legs -->
    <path d="M280,540 L260,800 L310,810 L340,555 Z"/>
    <path d="M380,550 L400,800 L460,805 L430,555 Z"/>
    <ellipse cx="280" cy="820" rx="40" ry="18"/>
    <ellipse cx="440" cy="820" rx="40" ry="18"/>
    <!-- short tail curl -->
    <path d="M230,480 C180,470 170,520 200,540" fill="none" stroke-width="6"/>
    {joint_discs([(380,260),(230,330),(185,450),(450,320),(530,390),(310,560),(400,560),(285,800),(430,800)])}
    '''


def sha_body() -> str:
    # Sha Wujing: tall, necklace of skulls, monk staff
    return f'''
    <!-- head -->
    <ellipse cx="355" cy="155" rx="50" ry="56"/>
    <!-- hair bun -->
    <circle cx="355" cy="95" r="28"/>
    <ellipse cx="310" cy="160" rx="10" ry="16"/>
    <!-- neck -->
    <rect x="338" y="205" width="34" height="40" rx="6"/>
    <!-- skull necklace -->
    <circle cx="340" cy="255" r="12"/><circle cx="365" cy="260" r="12"/><circle cx="390" cy="255" r="12"/>
    <!-- torso (darker robe silhouette) -->
    <path d="M275,250 L430,248 L450,530 L355,575 L255,525 Z"/>
    <!-- arms -->
    <path d="M275,285 L210,370 L185,500 L225,515 L270,380 L305,310 Z"/>
    <path d="M430,280 L500,340 L555,450 L515,470 L455,360 L435,305 Z"/>
    <!-- monk staff (锡杖) -->
    <path d="M545,80 L562,80 L562,820 L545,820 Z"/>
    <circle cx="553" cy="70" r="22" fill="none" stroke-width="4"/>
    <circle cx="553" cy="70" r="12" fill="none"/>
    <!-- legs -->
    <path d="M295,560 L275,820 L325,830 L355,575 Z"/>
    <path d="M375,565 L400,820 L455,825 L430,570 Z"/>
    <ellipse cx="295" cy="840" rx="38" ry="16"/>
    <ellipse cx="435" cy="840" rx="38" ry="16"/>
    {joint_discs([(355,245),(245,310),(205,430),(455,305),(530,400),(320,575),(400,575),(300,820),(430,820)])}
    '''


def baima_body() -> str:
    # White horse side view facing right — still on 640×960 canvas, figure centered
    return f'''
    <!-- body -->
    <ellipse cx="330" cy="480" rx="175" ry="95"/>
    <!-- neck -->
    <path d="M450,430 C500,380 520,300 500,240 L460,230 C470,300 450,370 410,420 Z"/>
    <!-- head -->
    <ellipse cx="520" cy="210" rx="70" ry="42"/>
    <!-- ear -->
    <path d="M500,175 L495,130 L525,165 Z"/>
    <!-- muzzle -->
    <ellipse cx="585" cy="220" rx="28" ry="20"/>
    <!-- eye -->
    <circle cx="535" cy="200" r="6" fill="#000" stroke="none"/>
    <!-- mane -->
    <path d="M470,240 C450,200 430,280 445,320 C420,300 400,350 420,380" fill="none" stroke-width="5"/>
    <!-- forelegs -->
    <path d="M420,550 L440,780 L480,785 L470,555 Z"/>
    <path d="M380,560 L370,790 L410,795 L415,560 Z"/>
    <!-- hindlegs -->
    <path d="M220,540 L200,790 L245,795 L265,545 Z"/>
    <path d="M270,550 L280,785 L320,790 L310,555 Z"/>
    <!-- hooves -->
    <ellipse cx="460" cy="800" rx="28" ry="14"/>
    <ellipse cx="390" cy="805" rx="26" ry="12"/>
    <ellipse cx="220" cy="805" rx="28" ry="14"/>
    <ellipse cx="300" cy="800" rx="26" ry="12"/>
    <!-- tail -->
    <path d="M160,450 C80,480 70,600 120,680 C90,620 100,520 160,480 Z"/>
    <!-- saddle hint (blank for coloring) -->
    <path d="M280,420 L380,415 L390,470 L270,475 Z" fill="none" stroke-width="3"/>
    {joint_discs([(480,300),(330,480),(450,555),(390,560),(240,545),(290,555),(160,470),(520,210)], r=9)}
    '''


CHAR_DEFS = [
    ("tangseng-v1", "唐僧", tangseng_body),
    ("bajie-v1", "豬八戒", bajie_body),
    ("sha-v1", "沙僧", sha_body),
    ("baima-v1", "白馬", baima_body),
]


def stroke_only_body(fill_body: str) -> str:
    """For A4: keep shapes but print as stroke; circles for joints become small rings."""
    # Bodies already use fill white + stroke black in template; for line art we set fill none via parent g
    return fill_body


def main():
    import cairosvg
    from PIL import Image
    import io

    PRINT.mkdir(parents=True, exist_ok=True)
    for cid, label, body_fn in CHAR_DEFS:
        body = body_fn()
        out_dir = CHARS / cid
        out_dir.mkdir(parents=True, exist_ok=True)

        # Source SVG (design) — also save for reference
        design = svg_doc(body)
        design_path = out_dir / "template.svg"
        design_path.write_text(design, encoding="utf-8")

        png_bytes = cairosvg.svg2png(bytestring=design.encode("utf-8"), output_width=W, output_height=H)
        # Ensure RGBA with true transparency outside (cairosvg may leave white/opaque bg)
        im = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
        px = im.load()
        # Flood-fill near-white / checker from edges → transparent; keep figure whites
        # Simple approach: any pixel that is near-white AND connected to edge OR fully outside silhouette
        # cairosvg default bg is transparent already if no rect — check corners
        w, h = im.size
        # Remove near-white only if alpha high and at edges flood
        from collections import deque
        seen = [[False] * w for _ in range(h)]
        q = deque()
        def is_backdrop(x, y):
            r, g, b, a = px[x, y]
            if a < 8:
                return True
            # treat very light gray/white with no strong black nearby as possible leftover
            return r + g + b > 720 and a > 200
        for x in range(w):
            for y in (0, h - 1):
                if is_backdrop(x, y):
                    q.append((x, y)); seen[y][x] = True
        for y in range(h):
            for x in (0, w - 1):
                if not seen[y][x] and is_backdrop(x, y):
                    q.append((x, y)); seen[y][x] = True
        while q:
            x, y = q.popleft()
            px[x, y] = (0, 0, 0, 0)
            for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and is_backdrop(nx, ny):
                    seen[ny][nx] = True
                    q.append((nx, ny))
        # Force interior near-white to pure white
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a > 8 and r > 215 and g > 215 and b > 215:
                    px[x, y] = (255, 255, 255, 255)
                elif a > 8 and r + g + b < 80:
                    px[x, y] = (0, 0, 0, 255)

        tpl = out_dir / "template.png"
        im.save(tpl, "PNG")
        print(f"wrote {tpl} {im.size}")

        # A4 line art
        a4 = a4_line_doc(stroke_only_body(body), label)
        a4_path = PRINT / f"{cid}-profile-line-a4.svg"
        a4_path.write_text(a4, encoding="utf-8")
        print(f"wrote {a4_path}")


if __name__ == "__main__":
    main()
