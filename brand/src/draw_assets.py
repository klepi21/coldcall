"""Draws the code-made Cold Call assets: wordmark, LOFI and SUI chips, app icon, favicon.

Run: python3 brand/src/draw_assets.py  (from the coldcall folder)
Everything is drawn at 4x and downsampled for clean edges.
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BRAND = os.path.join(ROOT, "brand")
OUT = os.path.join(BRAND, "out")
WEB = os.path.join(ROOT, "apps", "web", "public", "brand")
FONT = os.path.join(BRAND, "fonts", "LilitaOne-Regular.ttf")
os.makedirs(OUT, exist_ok=True)
os.makedirs(WEB, exist_ok=True)

# Palette (see BRAND_COLDCALL.md)
NAVY = (11, 26, 46)        # #0B1A2E Glacier Navy
DEEP = (19, 41, 74)        # #13294A Deep Ice
LOFI = (90, 143, 224)      # #5A8FE0 Lofi Blue
FROST = (127, 227, 255)    # #7FE3FF Frost Cyan
SNOW = (242, 247, 252)     # #F2F7FC Snow
GOLD = (245, 197, 66)      # #F5C542 Chip Gold
GOLD_D = (184, 134, 20)    # #B88614 Gold shade
SUI = (77, 162, 255)       # #4DA2FF Sui blue
INK = (8, 14, 26)          # #080E1A outline ink


def font(size):
    return ImageFont.truetype(FONT, size)


def vgrad(w, h, top, bottom):
    g = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        g.putpixel((0, y), tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return g.resize((w, h))


# ---------------------------------------------------------------- wordmark
def wordmark(text="COLD CALL", width_out=2048):
    S = 4
    size = 300 * S
    f = font(size)
    stroke = 22 * S
    probe = ImageDraw.Draw(Image.new("L", (10, 10)))
    l, t, r, b = probe.textbbox((0, 0), text, font=f, stroke_width=stroke)
    pad = 60 * S
    W, H = r - l + pad * 2, b - t + pad * 2 + 70 * S
    ox, oy = pad - l, pad - t

    # outline + drop shadow layer
    shadow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shadow).text((ox + 10 * S, oy + 16 * S), text, font=f, fill=255, stroke_width=stroke, stroke_fill=255)
    outline = Image.new("L", (W, H), 0)
    ImageDraw.Draw(outline).text((ox, oy), text, font=f, fill=255, stroke_width=stroke, stroke_fill=255)
    fillm = Image.new("L", (W, H), 0)
    ImageDraw.Draw(fillm).text((ox, oy), text, font=f, fill=255)

    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    img.paste(Image.new("RGBA", (W, H), LOFI + (255,)), (0, 0), shadow)
    img.paste(Image.new("RGBA", (W, H), INK + (255,)), (0, 0), outline)

    # icy fill: snow on top fading to frost
    fb = fillm.getbbox()
    grad = vgrad(W, fb[3] - fb[1], SNOW, FROST)
    gfull = Image.new("RGB", (W, H), FROST)
    gfull.paste(grad, (0, fb[1]))
    img.paste(gfull, (0, 0), fillm)

    # glossy highlight band on upper third of letters
    hl = Image.new("L", (W, H), 0)
    hd = ImageDraw.Draw(hl)
    band_top = fb[1] + int((fb[3] - fb[1]) * 0.10)
    band_bot = fb[1] + int((fb[3] - fb[1]) * 0.30)
    hd.rectangle([0, band_top, W, band_bot], fill=90)
    hl = Image.composite(hl, Image.new("L", (W, H), 0), fillm.filter(ImageFilter.MinFilter(9)))
    img.paste(Image.new("RGBA", (W, H), (255, 255, 255, 255)), (0, 0), hl)

    # icicles hanging under a few letters
    d = ImageDraw.Draw(img)
    base_y = fb[3] - 6 * S
    letters = [i for i, c in enumerate(text) if c != " "]
    xs = []
    for idx in (2, 3, 7, 8):
        if idx < len(text):
            lx0 = probe.textlength(text[:idx], font=f)
            lw = probe.textlength(text[idx], font=f)
            xs.append(ox + lx0 + lw * (0.36 if text[idx] == 'L' else 0.5))
    lens = [120, 80, 105, 70]
    for x, ln in zip(xs, lens):
        ln *= S
        w = 30 * S
        poly = [(x - w, base_y - 4 * S), (x + w, base_y - 4 * S), (x, base_y + ln)]
        d.polygon(poly, fill=INK)
        inner = [(x - w + 9 * S, base_y - 10 * S), (x + w - 9 * S, base_y - 10 * S), (x, base_y + ln - 14 * S)]
        d.polygon(inner, fill=FROST)
        d.polygon([(x - w + 13 * S, base_y - 10 * S), (x - 3 * S, base_y - 10 * S), (x - 4 * S, base_y + ln * 0.45)], fill=SNOW)

    img = img.crop(img.getbbox())
    h_out = int(img.height * width_out / img.width)
    return img.resize((width_out, h_out), Image.LANCZOS)


# ---------------------------------------------------------------- shapes
def snowflake(d, cx, cy, r, color, w):
    for k in range(6):
        a = math.pi / 2 + k * math.pi / 3
        x2, y2 = cx + r * math.cos(a), cy - r * math.sin(a)
        d.line([(cx, cy), (x2, y2)], fill=color, width=w)
        for frac in (0.5, 0.75):
            bx, by = cx + r * frac * math.cos(a), cy - r * frac * math.sin(a)
            for s in (-1, 1):
                b = a + s * math.pi / 4
                ln = r * 0.28
                d.line([(bx, by), (bx + ln * math.cos(b), by - ln * math.sin(b))], fill=color, width=w)
        d.ellipse([x2 - w * 0.8, y2 - w * 0.8, x2 + w * 0.8, y2 + w * 0.8], fill=color)
    d.ellipse([cx - w * 1.4, cy - w * 1.4, cx + w * 1.4, cy + w * 1.4], fill=color)


def drop(d, cx, cy, h, fill, outline, ow):
    """Generic rounded water drop (not the official Sui mark)."""
    r = h * 0.36
    ccy = cy + h * 0.5 - r
    tip = (cx, cy - h * 0.5)
    dist = ccy - tip[1]
    phi = math.asin(r / dist)
    pts = []
    a0, a1 = -phi, math.pi + phi
    for i in range(61):
        a = a0 + (a1 - a0) * i / 60
        pts.append((cx + r * math.cos(a), ccy + r * math.sin(a)))
    poly = [tip] + pts
    d.polygon(poly, fill=fill)
    d.line(poly + [tip], fill=outline, width=ow, joint="curve")
    # highlight
    d.ellipse([cx - r * 0.55, ccy - r * 0.35, cx - r * 0.15, ccy + r * 0.25], fill=(255, 255, 255, 200))


def chip(base, base_dark, insert, center_fn, label, size_out=256):
    S = 4
    N = 1024
    img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = N / 2
    R = N / 2 - 30
    ow = 24
    # drop shadow
    sh = Image.new("L", (N, N), 0)
    ImageDraw.Draw(sh).ellipse([c - R + 10, c - R + 26, c + R + 10, c + R + 26], fill=110)
    sh = sh.filter(ImageFilter.GaussianBlur(10))
    img.paste(Image.new("RGBA", (N, N), INK + (255,)), (0, 0), sh)
    d.ellipse([c - R, c - R, c + R, c + R], fill=INK)
    R1 = R - ow
    d.ellipse([c - R1, c - R1, c + R1, c + R1], fill=base)
    # edge inserts
    for k in range(8):
        a0 = k * 45 - 9
        d.pieslice([c - R1, c - R1, c + R1, c + R1], a0, a0 + 18, fill=insert)
    # inner dark ring
    R2 = R1 * 0.74
    d.ellipse([c - R2 - ow * 0.7, c - R2 - ow * 0.7, c + R2 + ow * 0.7, c + R2 + ow * 0.7], fill=INK)
    d.ellipse([c - R2, c - R2, c + R2, c + R2], fill=base_dark)
    # dashed gold ring
    R3 = R2 * 0.9
    for k in range(36):
        a0 = k * 10
        d.arc([c - R3, c - R3, c + R3, c + R3], a0, a0 + 6, fill=GOLD, width=10)
    # center face
    R4 = R2 * 0.78
    d.ellipse([c - R4, c - R4, c + R4, c + R4], fill=SNOW)
    d.ellipse([c - R4, c - R4, c + R4, c + R4], outline=INK, width=12)
    center_fn(d, c, c - R4 * 0.16, R4)
    # label
    f = font(int(R4 * 0.36))
    tw = d.textlength(label, font=f)
    d.text((c - tw / 2, c + R4 * 0.30), label, font=f, fill=NAVY)
    # top gloss
    gl = Image.new("L", (N, N), 0)
    ImageDraw.Draw(gl).chord([c - R1, c - R1, c + R1, c + R1], 200, 340, fill=40)
    img.paste(Image.new("RGBA", (N, N), (255, 255, 255, 255)), (0, 0), gl)
    return img.resize((size_out, size_out), Image.LANCZOS)


def lofi_center(d, cx, cy, r):
    snowflake(d, cx, cy, r * 0.42, LOFI, 22)


def sui_center(d, cx, cy, r):
    drop(d, cx, cy - r * 0.02, r * 0.72, SUI + (255,), INK, 12)


# ---------------------------------------------------------------- icon
def app_icon(size_out=1024, rounded=False):
    N = 2048
    bg = vgrad(N, N, DEEP, NAVY).convert("RGBA")
    d = ImageDraw.Draw(bg)
    # soft snow flakes in the background
    import random
    rnd = random.Random(7)
    for _ in range(70):
        x, y, r = rnd.randint(0, N), rnd.randint(0, N), rnd.randint(4, 14)
        d.ellipse([x - r, y - r, x + r, y + r], fill=SNOW + (rnd.randint(40, 120),))
    # big chip with horns
    c = N / 2
    R = N * 0.34
    cy = c + N * 0.04
    for s_ in (-1, 1):
        # narrow curved yeti horn, leaning outward, rounded tip
        hx = c + s_ * R * 0.42
        base = cy - R * 0.80
        pts = []
        for i in range(21):
            t = i / 20
            x = hx + s_ * (N * 0.05) * t * t - N * 0.05 * (1 - t) + N * 0.008
            y = base - N * 0.13 * t
            pts.append((x, y))
        for i in range(20, -1, -1):
            t = i / 20
            x = hx + s_ * (N * 0.05) * t * t + N * 0.05 * (1 - t) + N * 0.008
            y = base - N * 0.13 * t + N * 0.012 * t
            pts.append((x, y))
        d.polygon(pts, fill=LOFI)
        d.line(pts + [pts[0]], fill=INK, width=30, joint="curve")
    ow = 40
    d.ellipse([c - R, cy - R, c + R, cy + R], fill=INK)
    R1 = R - ow
    d.ellipse([c - R1, cy - R1, c + R1, cy + R1], fill=LOFI)
    for k in range(8):
        a0 = k * 45 - 9
        d.pieslice([c - R1, cy - R1, c + R1, cy + R1], a0, a0 + 18, fill=SNOW)
    R2 = R1 * 0.76
    d.ellipse([c - R2 - 28, cy - R2 - 28, c + R2 + 28, cy + R2 + 28], fill=INK)
    d.ellipse([c - R2, cy - R2, c + R2, cy + R2], fill=SNOW)
    R3 = R2 * 0.88
    for k in range(30):
        a0 = k * 12
        d.arc([c - R3, cy - R3, c + R3, cy + R3], a0, a0 + 7, fill=GOLD, width=22)
    f = font(int(R2 * 0.95))
    txt = "CC"
    l, t, r, b = d.textbbox((0, 0), txt, font=f, stroke_width=26)
    d.text((c - (r - l) / 2 - l, cy - (b - t) / 2 - t + 10), txt, font=f, fill=NAVY, stroke_width=0)
    if rounded:
        m = Image.new("L", (N, N), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, N, N], radius=int(N * 0.22), fill=255)
        bg.putalpha(m)
    return bg.resize((size_out, size_out), Image.LANCZOS)


def favicon(size_out=64):
    """Favicon: the snow chip with CC, no horns, filling the square for legibility."""
    N = 1024
    img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = N / 2
    R = N / 2 - 8
    d.ellipse([c - R, c - R, c + R, c + R], fill=INK)
    R1 = R - 50
    d.ellipse([c - R1, c - R1, c + R1, c + R1], fill=LOFI)
    for k in range(6):
        a0 = k * 60 - 12
        d.pieslice([c - R1, c - R1, c + R1, c + R1], a0, a0 + 24, fill=SNOW)
    R2 = R1 * 0.72
    d.ellipse([c - R2 - 34, c - R2 - 34, c + R2 + 34, c + R2 + 34], fill=INK)
    d.ellipse([c - R2, c - R2, c + R2, c + R2], fill=SNOW)
    f = font(int(R2 * 1.05))
    l, t, r, b = d.textbbox((0, 0), "CC", font=f)
    d.text((c - (r - l) / 2 - l, c - (b - t) / 2 - t), "CC", font=f, fill=NAVY)
    return img.resize((size_out, size_out), Image.LANCZOS)


if __name__ == "__main__":
    wm = wordmark()
    wm.save(os.path.join(OUT, "logo-wordmark.png"), optimize=True)
    wm.resize((1200, int(wm.height * 1200 / wm.width)), Image.LANCZOS).save(os.path.join(WEB, "logo.png"), optimize=True)

    lofi = chip((222, 234, 248), LOFI, LOFI, lofi_center, "LOFI")
    sui = chip(SUI, (40, 120, 220), SNOW, sui_center, "SUI")
    for name, im in (("lofi-chip.png", lofi), ("sui-chip.png", sui)):
        im.save(os.path.join(OUT, name), optimize=True)
        im.save(os.path.join(WEB, name), optimize=True)

    ic = app_icon()
    ic.convert("RGB").save(os.path.join(OUT, "icon-1024.png"), optimize=True)
    ic.convert("RGB").save(os.path.join(WEB, "icon-1024.png"), optimize=True)

    fv = favicon()
    fv.save(os.path.join(OUT, "favicon.png"), optimize=True)
    fv.save(os.path.join(WEB, "favicon.png"), optimize=True)
    print("done")
