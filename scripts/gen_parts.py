#!/usr/bin/env python3
"""Generate flat Chinese shadow-puppet style silhouette PNGs for wukong."""
from PIL import Image, ImageDraw
import math
import os

OUT = "/workspace/shadow-puppet/public/characters/wukong/parts"
os.makedirs(OUT, exist_ok=True)

# Dark brown/black fill for traditional shadow puppet look
FILL = (40, 20, 10, 255)
EDGE = (20, 10, 5, 255)


def blank(w, h):
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def save(img, name):
    path = os.path.join(OUT, name)
    img.save(path, "PNG")
    print(f"wrote {path} {img.size}")


def capsule(draw, cx, y0, y1, r, fill=FILL):
    """Vertical capsule from y0 to y1 centered at cx with radius r."""
    draw.ellipse([cx - r, y0 - r, cx + r, y0 + r], fill=fill)
    draw.ellipse([cx - r, y1 - r, cx + r, y1 + r], fill=fill)
    draw.rectangle([cx - r, y0, cx + r, y1], fill=fill)


def disk_overlap(draw, cx, cy, r, fill=FILL):
    """Proximal tenon/disk for ~12-20% overlap."""
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)


# --- head: round with golden hoop (金箍) ---
def make_head():
    w, h = 160, 160
    img = blank(w, h)
    d = ImageDraw.Draw(img)
    # face circle
    d.ellipse([20, 28, 140, 148], fill=FILL)
    # ear tufts (monkey)
    d.ellipse([8, 60, 36, 100], fill=FILL)
    d.ellipse([124, 60, 152, 100], fill=FILL)
    # golden hoop band across forehead
    d.arc([28, 18, 132, 70], start=200, end=340, fill=EDGE, width=10)
    d.ellipse([70, 8, 90, 28], fill=FILL)  # hoop knot top
    # snout suggestion
    d.ellipse([58, 100, 102, 138], fill=FILL)
    # proximal disk at bottom (neck attach ~15%)
    disk_overlap(d, 80, 145, 18)
    save(img, "head.png")


# --- torso: tunic suggestion ---
def make_torso():
    w, h = 180, 240
    img = blank(w, h)
    d = ImageDraw.Draw(img)
    # shoulder disk (proximal / top)
    disk_overlap(d, 90, 20, 22)
    # upper body / chest
    d.ellipse([30, 10, 150, 100], fill=FILL)
    # tunic body polygon
    d.polygon(
        [
            (40, 70),
            (140, 70),
            (155, 200),
            (130, 230),
            (90, 220),
            (50, 230),
            (25, 200),
        ],
        fill=FILL,
    )
    # belt suggestion
    d.rectangle([45, 145, 135, 165], fill=EDGE)
    # hip disk (bottom attach)
    disk_overlap(d, 90, 220, 20)
    # shoulder sockets L/R
    disk_overlap(d, 35, 55, 16)
    disk_overlap(d, 145, 55, 16)
    save(img, "torso.png")


# --- upper arm capsule ---
def make_upper_arm(name):
    w, h = 60, 140
    img = blank(w, h)
    d = ImageDraw.Draw(img)
    r = 22
    # proximal at top
    disk_overlap(d, 30, 18, r)
    capsule(d, 30, 25, 115, 18)
    # distal disk
    disk_overlap(d, 30, 122, 16)
    save(img, name)


# --- lower arm with hand at end ---
def make_lower_arm(name):
    w, h = 50, 130
    img = blank(w, h)
    d = ImageDraw.Draw(img)
    disk_overlap(d, 25, 14, 14)
    capsule(d, 25, 20, 95, 14)
    # hand/paw at distal end
    d.ellipse([8, 95, 42, 125], fill=FILL)
    # finger bumps
    for i, fx in enumerate([10, 20, 30]):
        d.ellipse([fx, 118, fx + 10, 128], fill=FILL)
    save(img, name)


# --- thigh ---
def make_thigh(name):
    w, h = 70, 160
    img = blank(w, h)
    d = ImageDraw.Draw(img)
    disk_overlap(d, 35, 20, 20)
    capsule(d, 35, 28, 135, 22)
    disk_overlap(d, 35, 142, 16)
    save(img, name)


# --- shin with shoe at end ---
def make_shin(name):
    w, h = 60, 150
    img = blank(w, h)
    d = ImageDraw.Draw(img)
    disk_overlap(d, 30, 16, 15)
    capsule(d, 30, 22, 110, 16)
    # shoe / boot at distal
    d.ellipse([5, 108, 55, 145], fill=FILL)
    d.polygon([(8, 125), (55, 125), (58, 142), (5, 142)], fill=FILL)
    save(img, name)


# --- curly tail ---
def make_tail():
    w, h = 80, 200
    img = blank(w, h)
    d = ImageDraw.Draw(img)
    # proximal attach disk at top
    disk_overlap(d, 40, 16, 14)
    # curly S-curve as thick strokes via ellipses along a path
    pts = []
    for i in range(40):
        t = i / 39.0
        y = 20 + t * 165
        x = 40 + math.sin(t * math.pi * 2.2) * (18 + t * 12)
        pts.append((x, y))
    for x, y in pts:
        r = 10 - (y - 20) / 165 * 3
        d.ellipse([x - r, y - r, x + r, y + r], fill=FILL)
    # tip curl
    d.ellipse([48, 175, 72, 198], fill=FILL)
    save(img, "tail.png")


# --- staff stick ---
def make_staff():
    w, h = 40, 280
    img = blank(w, h)
    d = ImageDraw.Draw(img)
    # stick
    d.rounded_rectangle([12, 8, 28, 270], radius=6, fill=FILL)
    # end caps
    d.ellipse([8, 2, 32, 22], fill=FILL)
    d.ellipse([8, 258, 32, 278], fill=FILL)
    # grip rings
    for gy in (80, 100, 120):
        d.rectangle([10, gy, 30, gy + 6], fill=EDGE)
    save(img, "staff.png")


def main():
    make_head()
    make_torso()
    make_upper_arm("upperArmL.png")
    make_upper_arm("upperArmR.png")
    make_lower_arm("lowerArmL.png")
    make_lower_arm("lowerArmR.png")
    make_thigh("thighL.png")
    make_thigh("thighR.png")
    make_shin("shinL.png")
    make_shin("shinR.png")
    make_tail()
    make_staff()
    print("done")


if __name__ == "__main__":
    main()
