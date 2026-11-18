"""Builds the composed Cold Call assets from the vector mascot and the code drawn parts.

Run order (from anywhere):
  python3 ~/Desktop/coldcall/brand/src/draw_assets.py   # wordmark, chips, chip icon, favicon
  python3 ~/Desktop/coldcall/brand/src/mascot.py        # mascot poses (SVG + PNG)
  python3 ~/Desktop/coldcall/brand/src/compose.py       # logo with mascot, icon, hero, og, brand board, web files
"""
import math
import os
import random
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import draw_assets as A  # noqa: E402
import mascot as M  # noqa: E402

ROOT = A.ROOT
OUT, WEB = A.OUT, A.WEB
SVG_DIR = M.SVG_DIR
BOARD = os.path.join(ROOT, "brand", "brand-board.png")
INTER = os.path.join(ROOT, "brand", "fonts", "Inter.ttf")
TAGLINE = "Play it cool. Call their bluff."
SUB = "Chess, Backgammon, Tichu and Ice Floe Battle on Sui devnet"


def inter(size, weight="SemiBold"):
    f = ImageFont.truetype(INTER, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


def load(name):
    return Image.open(os.path.join(OUT, name + ".png")).convert("RGBA")


def trim_fit(im, box, margin=0.04):
    im = im.crop(im.getbbox())
    bw, bh = box
    s = min(bw * (1 - 2 * margin) / im.width, bh * (1 - 2 * margin) / im.height)
    im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    canvas = Image.new("RGBA", box, (0, 0, 0, 0))
    canvas.paste(im, ((bw - im.width) // 2, (bh - im.height) // 2), im)
    return canvas


def rsvg(svg_text, name, w, h):
    sp = os.path.join(SVG_DIR, name + ".svg")
    with open(sp, "w") as fh:
        fh.write(svg_text)
    op = os.path.join(SVG_DIR, name + ".png")
    subprocess.run(["rsvg-convert", "-w", str(w), "-h", str(h), "-o", op, sp], check=True)
    return Image.open(op).convert("RGBA")


# ------------------------------------------------------------ hero scene (vector)
def nested(svg_text, x, y, size):
    return svg_text.replace('width="2048" height="2048"', f'x="{x}" y="{y}" width="{size}" height="{size}"', 1)


def mountains(rnd, base, peaks, fill, cap, seed_shift=0):
    pts = [(-50, 900)]
    for (x, y) in peaks:
        pts.append((x, y))
    pts.append((1650, 900))
    d = "M" + " L".join(f"{x},{y}" for x, y in pts) + " Z"
    caps = []
    for i in range(1, len(pts) - 1):
        x, y = pts[i]
        lx, ly = pts[i - 1]
        rx, ry = pts[i + 1]
        if y > base - 120:
            continue
        t = 0.28
        a = (x + (lx - x) * t, y + (ly - y) * t)
        b = (x + (rx - x) * t, y + (ry - y) * t)
        mid1 = ((a[0] + x) / 2 - 6, max(a[1], b[1]) + 14)
        mid2 = ((b[0] + x) / 2 + 8, max(a[1], b[1]) - 4)
        caps.append(f'<path d="M{x},{y} L{a[0]:.0f},{a[1]:.0f} L{mid1[0]:.0f},{mid1[1]:.0f} L{x},{(a[1] + b[1]) / 2 - 6:.0f} '
                    f'L{mid2[0]:.0f},{mid2[1]:.0f} L{b[0]:.0f},{b[1]:.0f} Z" fill="{cap}" stroke="{M.INK}" stroke-width="6" stroke-linejoin="round"/>')
    return f'<path d="{d}" fill="{fill}" stroke="{M.INK}" stroke-width="7" stroke-linejoin="round"/>' + "".join(caps)


def chip_stack(x, y, n, color, edge="#FFFFFF", rx=46, ry=16, step=12):
    out = []
    for i in range(n):
        cy = y - i * step
        out.append(f'<ellipse cx="{x}" cy="{cy + 6}" rx="{rx}" ry="{ry}" fill="{M.INK}"/>')
        out.append(f'<rect x="{x - rx}" y="{cy - 2}" width="{2 * rx}" height="8" fill="{color}"/>')
        for k in range(-2, 3):
            out.append(f'<rect x="{x + k * rx * 0.38 - 5:.0f}" y="{cy - 2}" width="10" height="8" fill="{edge}"/>')
        out.append(f'<ellipse cx="{x}" cy="{cy - 2}" rx="{rx}" ry="{ry}" fill="{color}" stroke="{M.INK}" stroke-width="5"/>')
    top = y - (n - 1) * step - 2
    out.append(f'<ellipse cx="{x}" cy="{top}" rx="{rx * 0.6:.0f}" ry="{ry * 0.6:.0f}" fill="none" stroke="{M.GOLD}" stroke-width="3" stroke-dasharray="6 5"/>')
    return "".join(out)


def ice_piece(x, y, s=1.0):
    """A clear ice chess pawn."""
    d = ("M-26,0 L26,0 L20,-14 L10,-18 Q18,-34 10,-46 Q22,-58 12,-74 Q0,-86 -12,-74 Q-22,-58 -10,-46 Q-18,-34 -10,-18 L-20,-14 Z")
    return (f'<g transform="translate({x},{y}) scale({s})">'
            f'<path d="{d}" fill="#BFF3FF" fill-opacity="0.9" stroke="{M.INK}" stroke-width="5" stroke-linejoin="round"/>'
            f'<path d="M-6,-70 Q-12,-60 -6,-50 M-4,-40 L-6,-20" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" fill="none"/>'
            f'</g>')


def scene_svg():
    rnd = random.Random(21)
    defs = (
        '<defs>'
        '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#081427"/>'
        '<stop offset="0.6" stop-color="#13294A"/><stop offset="1" stop-color="#22457A"/></linearGradient>'
        '<linearGradient id="felt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4FB6E3"/><stop offset="1" stop-color="#2A7FB5"/></linearGradient>'
        '<filter id="blur40" filterUnits="userSpaceOnUse" x="-400" y="-400" width="2400" height="1700"><feGaussianBlur stdDeviation="40"/></filter>'
        '<filter id="blur12"><feGaussianBlur stdDeviation="12"/></filter>'
        '</defs>')
    parts = [defs, '<rect width="1600" height="900" fill="url(#sky)"/>']
    # aurora
    parts.append('<path d="M-100,260 C200,120 500,300 820,170 S1400,120 1700,220" fill="none" stroke="#7FE3FF" stroke-width="70" opacity="0.22" filter="url(#blur40)"/>')
    parts.append('<path d="M-100,320 C260,210 560,350 900,250 S1450,210 1700,300" fill="none" stroke="#5A8FE0" stroke-width="60" opacity="0.25" filter="url(#blur40)"/>')
    # moon
    parts.append(f'<circle cx="1490" cy="120" r="46" fill="#F2F7FC" stroke="{M.INK}" stroke-width="6"/>'
                 f'<circle cx="1476" cy="110" r="9" fill="#D5E1F0"/><circle cx="1504" cy="136" r="6" fill="#D5E1F0"/>')
    # stars
    for _ in range(90):
        x, y, r = rnd.randint(0, 1600), rnd.randint(0, 420), rnd.choice([1.5, 2, 2.5, 3])
        parts.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#F2F7FC" opacity="{rnd.uniform(0.4, 0.95):.2f}"/>')
    # mountains: back, mid, front
    parts.append(mountains(rnd, 520, [(0, 470), (160, 330), (300, 430), (470, 250), (650, 420), (820, 300), (980, 440), (1150, 230), (1330, 400), (1480, 290), (1600, 380)], "#29497E", "#E8F1FB"))
    parts.append(mountains(rnd, 620, [(0, 600), (130, 470), (280, 560), (420, 420), (600, 590), (760, 470), (930, 600), (1100, 450), (1290, 580), (1450, 470), (1600, 560)], "#33609E", "#F2F7FC"))
    # snow field
    parts.append(f'<path d="M-20,700 Q400,640 800,690 T1620,670 L1620,920 L-20,920 Z" fill="#E6EFF9" stroke="{M.INK}" stroke-width="7"/>')
    parts.append('<path d="M-20,760 Q500,720 900,760 T1620,750 L1620,920 L-20,920 Z" fill="#D5E1F0"/>')
    # warm lounge glow behind the table
    parts.append('<ellipse cx="1180" cy="700" rx="420" ry="160" fill="#F5C542" opacity="0.22" filter="url(#blur40)"/>')
    # mascot dealing, behind the table
    parts.append(nested(M.pose_deal(), 790, 150, 780))
    # card table
    parts.append(f'<ellipse cx="1180" cy="930" rx="560" ry="190" fill="{M.INK}"/>'
                 f'<ellipse cx="1180" cy="918" rx="548" ry="178" fill="#C99512"/>'
                 f'<ellipse cx="1180" cy="918" rx="548" ry="178" fill="none" stroke="#F5C542" stroke-width="8" opacity="0.8"/>'
                 f'<ellipse cx="1180" cy="934" rx="500" ry="150" fill="{M.INK}"/>'
                 f'<ellipse cx="1180" cy="938" rx="492" ry="144" fill="url(#felt)"/>'
                 f'<ellipse cx="1180" cy="938" rx="430" ry="110" fill="none" stroke="#BFF3FF" stroke-width="4" stroke-dasharray="14 10" opacity="0.7"/>')
    # table props
    parts.append(chip_stack(820, 860, 5, "#5A8FE0"))
    parts.append(chip_stack(905, 880, 3, "#F2F7FC", edge="#5A8FE0"))
    parts.append(chip_stack(1500, 868, 4, "#4DA2FF"))
    parts.append(ice_piece(1400, 880, 0.9) + ice_piece(1440, 892, 0.75))
    parts.append(f'<g transform="translate(1040,880) rotate(-12)"><rect x="-40" y="-28" width="80" height="56" rx="8" fill="#FFFFFF" stroke="{M.INK}" stroke-width="6"/>'
                 f'<rect x="-32" y="-20" width="64" height="40" rx="5" fill="{M.BLUE}"/></g>'
                 f'<g transform="translate(1110,890) rotate(9)"><rect x="-40" y="-28" width="80" height="56" rx="8" fill="#FFFFFF" stroke="{M.INK}" stroke-width="6"/>'
                 f'<rect x="-32" y="-20" width="64" height="40" rx="5" fill="{M.BLUE}"/></g>')
    # falling snow in front
    for _ in range(70):
        x, y, r = rnd.randint(0, 1600), rnd.randint(0, 900), rnd.choice([3, 4, 5, 6])
        parts.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#FFFFFF" opacity="{rnd.uniform(0.5, 0.9):.2f}"/>')
    return parts


def scene(vb, w, h, name):
    body = "".join(scene_svg())
    s = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}">{body}</svg>'
    return rsvg(s, name, w, h)


def scrim_left(im, frac=0.55, strength=210):
    w, h = im.size
    m = Image.new("L", (w, 1))
    for x in range(w):
        t = x / (w * frac)
        m.putpixel((x, 0), int(strength * max(0.0, 1 - t) ** 1.6))
    m = m.resize((w, h))
    out = im.copy()
    out.paste(Image.new("RGBA", (w, h), A.NAVY + (255,)), (0, 0), m)
    return out


wordmark = A.wordmark(width_out=2048)


def headline(canvas, x, y, wm_width, tag_size, sub_size=None):
    wm = wordmark.resize((wm_width, int(wordmark.height * wm_width / wordmark.width)), Image.LANCZOS)
    canvas.alpha_composite(wm, (x, y))
    d = ImageDraw.Draw(canvas)
    ty = y + wm.height + int(tag_size * 0.6)
    d.text((x + 6, ty), TAGLINE, font=A.font(tag_size), fill=A.SNOW, stroke_width=max(3, tag_size // 10), stroke_fill=A.INK)
    if sub_size:
        d.text((x + 8, ty + int(tag_size * 1.55)), SUB, font=inter(sub_size, "SemiBold"), fill=A.FROST,
               stroke_width=3, stroke_fill=A.NAVY)


def main():
    poses = {p: load(f"mascot-{p}") for p in ("neutral", "win", "deal", "shrug")}
    for p, im in poses.items():
        im = trim_fit(im, (2048, 2048), 0.03)
        poses[p] = im
        im.save(os.path.join(OUT, f"mascot-{p}.png"), optimize=True)
        im.resize((1024, 1024), Image.LANCZOS).save(os.path.join(WEB, f"mascot-{p}.png"), optimize=True)
    bust = load("mascot-bust")
    bust_c = bust.crop(bust.getbbox())

    # logo with mascot: bust on top, wordmark tucked under
    W = 2048
    hh = int(W * 0.56)
    hd = bust_c.resize((int(bust_c.width * hh / bust_c.height), hh), Image.LANCZOS)
    gap = -int(hh * 0.10)
    lock = Image.new("RGBA", (W, hh + gap + wordmark.height), (0, 0, 0, 0))
    lock.paste(hd, ((W - hd.width) // 2, 0), hd)
    lock.alpha_composite(wordmark, (0, hh + gap))
    lock = lock.crop(lock.getbbox())
    lock.save(os.path.join(OUT, "logo-mascot.png"), optimize=True)
    lock.resize((1400, int(lock.height * 1400 / lock.width)), Image.LANCZOS).save(os.path.join(WEB, "logo-mascot.png"), optimize=True)

    # app icon with the mascot head (chip version kept as icon-chip-1024.png)
    A.app_icon().convert("RGB").save(os.path.join(OUT, "icon-chip-1024.png"), optimize=True)
    N = 1024
    bg = A.vgrad(N, N, A.DEEP, A.NAVY).convert("RGBA")
    glow = Image.new("L", (N, N), 0)
    ImageDraw.Draw(glow).ellipse([N * 0.10, N * 0.08, N * 0.90, N * 0.88], fill=150)
    glow = glow.filter(ImageFilter.GaussianBlur(80))
    bg.paste(Image.new("RGBA", (N, N), A.LOFI + (255,)), (0, 0), glow)
    rnd = random.Random(5)
    d = ImageDraw.Draw(bg)
    for _ in range(40):
        x, y, r = rnd.randint(0, N), rnd.randint(0, N), rnd.randint(3, 7)
        d.ellipse([x - r, y - r, x + r, y + r], fill=A.SNOW + (rnd.randint(60, 140),))
    s = (N * 0.96) / bust_c.width
    b = bust_c.resize((int(bust_c.width * s), int(bust_c.height * s)), Image.LANCZOS)
    bg.alpha_composite(b, ((N - b.width) // 2, N - b.height + int(N * 0.04)))
    bg.convert("RGB").save(os.path.join(OUT, "icon-1024.png"), optimize=True)
    bg.convert("RGB").save(os.path.join(WEB, "icon-1024.png"), optimize=True)

    # hero 1600x900 and og 1200x630
    hero = scrim_left(scene("0 0 1600 900", 1600, 900, "hero-scene"), 0.62, 215)
    headline(hero, 80, 250, 700, 56, 26)
    hero.convert("RGB").save(os.path.join(OUT, "hero.png"), optimize=True)
    hero.convert("RGB").save(os.path.join(WEB, "hero.webp"), "WEBP", quality=84, method=6)
    og = scrim_left(scene("0 40 1600 840", 1200, 630, "og-scene"), 0.62, 225)
    headline(og, 60, 165, 540, 42, 20)
    og.convert("RGB").save(os.path.join(OUT, "og.png"), optimize=True)
    og.convert("RGB").save(os.path.join(WEB, "og.jpg"), "JPEG", quality=86, optimize=True, progressive=True)

    board(poses)
    shrink_web()
    print("composed")


def shrink_web():
    """256 colour palettes for the web PNGs; no visible change on flat art, about 5x smaller."""
    for n in ["mascot-deal", "mascot-neutral", "mascot-shrug", "mascot-win", "logo-mascot", "logo", "icon-1024", "lofi-chip", "sui-chip"]:
        p = os.path.join(WEB, n + ".png")
        im = Image.open(p)
        if im.mode == "P":
            continue
        if im.mode == "RGBA":
            q = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        else:
            q = im.convert("RGB").quantize(colors=256, dither=Image.Dither.NONE)
        q.save(p, optimize=True)


def board(cut):
    BW, BH = 2400, 1600
    bd = A.vgrad(BW, BH, A.DEEP, A.NAVY).convert("RGBA")
    d = ImageDraw.Draw(bd)
    Mx = 80
    wm = wordmark.resize((900, int(wordmark.height * 900 / wordmark.width)), Image.LANCZOS)
    bd.alpha_composite(wm, (Mx, Mx))
    d.text((Mx + 6, Mx + wm.height + 30), TAGLINE, font=A.font(56), fill=A.SNOW)
    d.text((Mx + 8, Mx + wm.height + 110), "Brand board. Skill games arena on Sui devnet. Mascot: Lucky Lo.", font=inter(28, "Medium"), fill=A.FROST)

    lm = Image.open(os.path.join(OUT, "logo-mascot.png"))
    s = 400 / lm.height
    lm = lm.resize((int(lm.width * s), 400), Image.LANCZOS)
    bd.alpha_composite(lm, (BW - Mx - lm.width, Mx - 30))

    labels = {"neutral": "Neutral", "win": "Win", "deal": "Dealing", "shrug": "Shrug"}
    py, ps = 470, 520
    gapx = (BW - 2 * Mx - 4 * ps) // 3
    for i, pose in enumerate(["neutral", "win", "deal", "shrug"]):
        x = Mx + i * (ps + gapx)
        panel = Image.new("RGBA", bd.size, (0, 0, 0, 0))
        ImageDraw.Draw(panel).rounded_rectangle([x, py, x + ps, py + ps + 60], radius=28, fill=(255, 255, 255, 16), outline=(127, 227, 255, 70), width=2)
        bd.alpha_composite(panel)
        im = trim_fit(cut[pose], (ps - 20, ps - 20), 0.04)
        bd.alpha_composite(im, (x + 10, py + 10))
        f = inter(28, "SemiBold")
        tw = d.textlength(labels[pose], font=f)
        d.text((x + (ps - tw) / 2, py + ps + 10), labels[pose], font=f, fill=A.SNOW)

    sy = 1110
    d.text((Mx, sy), "Palette", font=A.font(40), fill=A.SNOW)
    sw = [("Glacier Navy", "#0B1A2E", A.NAVY), ("Deep Ice", "#13294A", A.DEEP), ("Lofi Blue", "#5A8FE0", A.LOFI),
          ("Frost Cyan", "#7FE3FF", A.FROST), ("Snow", "#F2F7FC", A.SNOW), ("Chip Gold", "#F5C542", A.GOLD),
          ("Sui Blue", "#4DA2FF", A.SUI), ("Thaw Green", "#3DDC97", (61, 220, 151)), ("Bust Red", "#FF5A6E", (255, 90, 110))]
    cw = 132
    for i, (nm, hx, col) in enumerate(sw):
        x = Mx + i * (cw + 14)
        d.rounded_rectangle([x, sy + 66, x + cw, sy + 196], radius=18, fill=col + (255,), outline=(255, 255, 255, 70), width=2)
        d.text((x + 4, sy + 208), nm, font=inter(20, "SemiBold"), fill=A.SNOW)
        d.text((x + 4, sy + 236), hx, font=inter(20, "Regular"), fill=A.FROST)

    ty = sy + 300
    d.text((Mx, ty), "Lilita One", font=A.font(60), fill=A.SNOW)
    d.text((Mx + 330, ty + 26), "Display: headlines, buttons, scores", font=inter(24, "Medium"), fill=A.FROST)
    d.text((Mx + 800, ty + 4), "Inter", font=inter(54, "Bold"), fill=A.SNOW)
    d.text((Mx + 970, ty + 26), "UI and body: 1,250.00", font=inter(24, "Medium"), fill=A.FROST)

    cx = 1560
    d.text((cx, sy), "Chips and icons", font=A.font(40), fill=A.SNOW)
    items = [os.path.join(OUT, "lofi-chip.png"), os.path.join(OUT, "sui-chip.png"), os.path.join(OUT, "icon-1024.png")]
    for i, pth in enumerate(items):
        im = Image.open(pth).convert("RGBA").resize((200, 200), Image.LANCZOS)
        if i == 2:
            m = Image.new("L", (200, 200), 0)
            ImageDraw.Draw(m).rounded_rectangle([0, 0, 200, 200], radius=44, fill=255)
            im.putalpha(m)
        bd.alpha_composite(im, (cx + i * 240, sy + 80))
    fv = Image.open(os.path.join(OUT, "favicon.png")).convert("RGBA")
    bd.alpha_composite(fv, (cx, sy + 310))
    d.text((cx + 80, sy + 326), "favicon 64 px", font=inter(22, "Medium"), fill=A.FROST)
    bd.convert("RGB").save(BOARD, optimize=True)


if __name__ == "__main__":
    main()
