#!/usr/bin/env python3
"""Generate the Dean's Car Audio brand logo (raster + svg assets).

Design: rounded "sound-bar" equalizer mark (gold accent bar) beside a
two-line condensed wordmark. Theme-matched to the site's dark + gold palette.
"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Palette (matched to the site's blue accent #2f8cff -> #1f6fd6)
GOLD = (47, 140, 255, 255)      # site primary blue
INK = (245, 246, 248, 255)        # near-white wordmark
INK_SOFT = (196, 201, 209, 255)   # secondary line
BAR = (228, 231, 236, 255)        # light bars
BLUE_DARK = (31, 111, 214, 255)   # deeper blue (unused spare)
TRANSPARENT = (0, 0, 0, 0)

AVENIR_COND = "/System/Library/Fonts/Avenir Next Condensed.ttc"
AVENIR = "/System/Library/Fonts/Avenir Next.ttc"
HELVETICA = "/System/Library/Fonts/Helvetica.ttc"
HELVEU = "/System/Library/Fonts/HelveticaNeue.ttc"


def font(path, size, index=0):
    return ImageFont.truetype(path, size, index=index)


# Solid, highly-legible weights
F_LINE1 = (HELVEU, 2)   # HelveticaNeue Bold  -> "DEAN'S"
F_LINE2 = (HELVEU, 1)   # HelveticaNeue Medium -> "CAR AUDIO"


def rr(draw, box, rad, fill):
    draw.rounded_rectangle(box, radius=rad, fill=fill)


def make_mark(size, pad_ratio=0.10, badge=False):
    """Square sound-bar equalizer mark. Returns RGBA image."""
    img = Image.new("RGBA", (size, size), TRANSPARENT)
    d = ImageDraw.Draw(img)
    if badge:
        # subtle dark rounded badge behind bars
        rr(d, (0, 0, size, size), int(size * 0.22), (16, 19, 25, 255))
    pad = int(size * pad_ratio)
    area = size - 2 * pad
    # 5 equalizer bars, varying heights, center one is gold accent
    heights = [0.52, 0.82, 1.00, 0.68, 0.40]
    n = len(heights)
    gap = area * 0.16 / (n - 1)
    bw = (area - gap * (n - 1)) / n
    cx_mid = pad + area / 2
    cy_mid = pad + area / 2
    for i, h in enumerate(heights):
        bh = area * h
        x0 = pad + i * (bw + gap)
        x1 = x0 + bw
        y0 = cy_mid - bh / 2
        y1 = cy_mid + bh / 2
        fill = GOLD if i == 2 else BAR
        rr(d, (x0, y0, x1, y1), bw * 0.5, fill)
    return img


def measure(draw, text, f):
    box = draw.textbbox((0, 0), text, font=f)
    return box[2] - box[0], box[3] - box[1], box


def make_lockup(target_h=165):
    """Full horizontal logo at 682x165 (4x supersampled then downscaled)."""
    S = 4  # supersample
    H = target_h * S
    pad = int(H * 0.06)
    mark_size = H - 2 * pad

    # Wordmark fonts (solid weights)
    f1 = font(F_LINE1[0], int(H * 0.44), index=F_LINE1[1])   # DEAN'S
    f2 = font(F_LINE2[0], int(H * 0.22), index=F_LINE2[1])   # CAR AUDIO

    tmp = Image.new("RGBA", (10, 10))
    td = ImageDraw.Draw(tmp)

    t1 = "DEAN'S"
    t2 = "C A R   A U D I O"
    w1, h1, _ = measure(td, t1, f1)
    w2, h2, _ = measure(td, t2, f2)

    gap = int(H * 0.10)
    text_w = max(w1, w2)
    W = pad + mark_size + gap + text_w + pad

    img = Image.new("RGBA", (W, H), TRANSPARENT)
    d = ImageDraw.Draw(img)

    # mark
    mark = make_mark(mark_size)
    img.alpha_composite(mark, (pad, pad))

    # wordmark stacked, left aligned
    tx = pad + mark_size + gap
    total_th = h1 + int(H * 0.04) + h2
    ty = (H - total_th) // 2
    d.text((tx, ty), t1, font=f1, fill=INK)
    ty2 = ty + h1 + int(H * 0.04)
    d.text((tx, ty2), t2, font=f2, fill=GOLD)

    # downscale to target height, keep aspect
    final_h = target_h
    final_w = round(W * (final_h / H))
    img = img.resize((final_w, final_h), Image.LANCZOS)
    return img


def save_white_bg(img, path):
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    bg.alpha_composite(img)
    bg.convert("RGB").save(path, "JPEG", quality=92, optimize=True)


def main():
    # 1) Primary header logo (replaces assets/img/logo.jpg) at 682x165
    lockup = make_lockup(165)
    # match original width-ish (682) by padding canvas to 682 wide
    canvas = Image.new("RGBA", (682, 165), TRANSPARENT)
    x = (682 - lockup.width) // 2
    canvas.alpha_composite(lockup, (x, 0))
    save_white_bg(canvas, os.path.join(OUT, "assets", "img", "logo.jpg"))
    print("logo.jpg", canvas.size)

    # 2) Transparent PNG lockup (crisp, for future use / dark header)
    lockup2 = make_lockup(165)
    lockup2.save(os.path.join(OUT, "assets", "brand", "logo.png"))
    print("logo.png", lockup2.size)

    # 3) Square app icon / favicon mark
    make_mark(512, badge=True).save(os.path.join(OUT, "assets", "brand", "logo-mark.png"))
    make_mark(180, badge=True).save(os.path.join(OUT, "assets", "brand", "apple-touch-icon.png"))
    make_mark(32, badge=True).save(os.path.join(OUT, "assets", "brand", "favicon-32.png"))
    print("icons written")


if __name__ == "__main__":
    main()
