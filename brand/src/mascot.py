"""Lucky Lo, the Cold Call mascot, built as vector art.

Writes brand/svg/mascot-<pose>.svg and renders PNGs with rsvg-convert.
Run: python3 brand/src/mascot.py
"""
import math
import os
import random
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SVG_DIR = os.path.join(ROOT, "brand", "svg")
OUT = os.path.join(ROOT, "brand", "out")
os.makedirs(SVG_DIR, exist_ok=True)
os.makedirs(OUT, exist_ok=True)

INK = "#0A1220"
FUR = "#F7FAFE"
FUR_SH = "#D5E1F0"
BLUE = "#5A8FE0"
BLUE_D = "#3F6FC4"
BLUE_L = "#7DA9EE"
NAVY = "#1A2B52"
NAVY_D = "#111D3A"
GOLD = "#F5C542"
GOLD_D = "#C99512"
GREEN = "#2FD07A"
RED = "#E8384F"
OW = 14  # main outline width


def f(v):
    return f"{v:.1f}"


# ------------------------------------------------------------ primitives
def fur_path(cx, cy, rx, ry, n, tuft, seed, rot=0.0, flat_bottom=False):
    """Shaggy blob: curved pointed tufts all around."""
    rnd = random.Random(seed)
    pts = []
    for i in range(n):
        a = rot + 2 * math.pi * i / n
        a2 = rot + 2 * math.pi * (i + 0.5) / n
        t = tuft * (0.45 + 0.9 * rnd.random())
        a2 = a2 + (rnd.random() - 0.5) * (2 * math.pi / n) * 0.5
        lean = (2 * math.pi / n) * 0.9  # tufts lean, like brushed fur
        valley = (cx + rx * math.cos(a), cy + ry * math.sin(a))
        tip = (cx + (rx + t) * math.cos(a2 + lean * 0.3), cy + (ry + t) * math.sin(a2 + lean * 0.3))
        pts.append((valley, tip, a, a2))
    d = []
    for i, (valley, tip, a, a2) in enumerate(pts):
        nxt = pts[(i + 1) % n][0]
        if i == 0:
            d.append(f"M{f(valley[0])},{f(valley[1])}")
        # bowed curve up to the tip, then a straighter run down to the next valley
        c1 = (cx + (rx + tuft * 0.15) * math.cos(a + (a2 - a) * 0.2), cy + (ry + tuft * 0.15) * math.sin(a + (a2 - a) * 0.2))
        c2 = (cx + (rx * 0.98) * math.cos(a2 + (a2 - a) * 0.6), cy + (ry * 0.98) * math.sin(a2 + (a2 - a) * 0.6))
        d.append(f"Q{f(c1[0])},{f(c1[1])} {f(tip[0])},{f(tip[1])}")
        d.append(f"Q{f(c2[0])},{f(c2[1])} {f(nxt[0])},{f(nxt[1])}")
    d.append("Z")
    return " ".join(d)


def union(shapes, fill, ow=OW, extra=""):
    """Outline the union of several shapes: thick dark strokes first, fills on top."""
    under = "".join(s.replace("/>", f' fill="{INK}" stroke="{INK}" stroke-width="{ow * 2}" stroke-linejoin="round"/>') for s in shapes)
    over = "".join(s.replace("/>", f' fill="{fill}" stroke="none"/>') for s in shapes)
    return f"<g {extra}>{under}{over}</g>"


def path(d):
    return f'<path d="{d}"/>'


def ell(cx, cy, rx, ry, rot=0):
    t = f' transform="rotate({rot} {f(cx)} {f(cy)})"' if rot else ""
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}"{t}/>'


def circ(cx, cy, r):
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}"/>'


# ------------------------------------------------------------ parts
def horns():
    out = []
    for s in (-1, 1):
        bx = 500 + s * 120
        d = (f"M{bx - s * 34},{150} C{bx - s * 30},{110} {bx + s * 8},{78} {bx + s * 44},{52} "
             f"C{bx + s * 40},{88} {bx + s * 38},{120} {bx + s * 36},{150} Z")
        out.append(f'<path d="{d}" fill="{BLUE}" stroke="{INK}" stroke-width="{OW}" stroke-linejoin="round"/>')
        # small highlight
        out.append(f'<path d="M{bx - s * 14},{132} C{bx - s * 10},{110} {bx + s * 6},{92} {bx + s * 26},{76}" fill="none" stroke="{BLUE_L}" stroke-width="7" stroke-linecap="round"/>')
    return "".join(out)


def ears():
    out = []
    for s in (-1, 1):
        x = 500 + s * 268
        out.append(f'<ellipse cx="{x}" cy="365" rx="62" ry="54" fill="{BLUE}" stroke="{INK}" stroke-width="{OW}"/>')
        out.append(f'<ellipse cx="{x + s * 8}" cy="368" rx="32" ry="28" fill="{BLUE_D}"/>')
    return "".join(out)


def head_fur(seed=3):
    d = fur_path(500, 365, 270, 245, 21, 58, seed, rot=-math.pi / 2)
    shade = f'<ellipse cx="560" cy="520" rx="300" ry="150" fill="{FUR_SH}"/>'
    return (f'<defs><clipPath id="hc"><path d="{d}"/></clipPath></defs>'
            f'<path d="{d}" fill="{FUR}" stroke="{INK}" stroke-width="{OW}" stroke-linejoin="round"/>'
            f'<g clip-path="url(#hc)">{shade}</g>'
            f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{OW}" stroke-linejoin="round"/>'
            # a few inner fur strokes
            f'<path d="M300,250 q18,-14 34,-6 M690,248 q-16,-14 -34,-6 M280,470 q14,10 32,6 M720,470 q-14,10 -32,6" '
            f'fill="none" stroke="{INK}" stroke-width="7" stroke-linecap="round" opacity="0.55"/>')


def face_base():
    shapes = [circ(415, 345, 92), circ(590, 340, 96), ell(505, 452, 196, 112)]
    return union(shapes, BLUE)


def eye(cx, cy, rx, ry, lid, look=(10, 6), lid_tilt=0.0, idx=0):
    """Pepe eye: white, pupil, heavy lid covering `lid` fraction from the top."""
    cid = f"eye{idx}"
    ly = cy - ry + 2 * ry * lid
    px, py = cx + look[0], cy + look[1]
    lid_d = (f"M{f(cx - rx - 10)},{f(cy - ry - 10)} L{f(cx + rx + 10)},{f(cy - ry - 10)} "
             f"L{f(cx + rx + 10)},{f(ly - lid_tilt)} Q{f(cx)},{f(ly + 8)} {f(cx - rx - 10)},{f(ly + lid_tilt)} Z")
    lid_line = f"M{f(cx - rx - 4)},{f(ly + lid_tilt)} Q{f(cx)},{f(ly + 8)} {f(cx + rx + 4)},{f(ly - lid_tilt)}"
    return (f'<defs><clipPath id="{cid}"><ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}"/></clipPath></defs>'
            f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="#FFFFFF"/>'
            f'<g clip-path="url(#{cid})">'
            f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(ry * 0.62)}" fill="{INK}"/>'
            f'<circle cx="{f(px - ry * 0.2)}" cy="{f(py - ry * 0.22)}" r="{f(ry * 0.16)}" fill="#FFFFFF"/>'
            f'<path d="{lid_d}" fill="{BLUE}"/>'
            f'</g>'
            f'<path d="{lid_line}" fill="none" stroke="{INK}" stroke-width="{OW}" stroke-linecap="round"/>'
            f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="none" stroke="{INK}" stroke-width="{OW}"/>')


def eyes(lid=0.55, look=(14, 8), tilt=6, brows=False):
    s = eye(418, 352, 66, 46, lid, look, tilt, 0) + eye(592, 348, 70, 48, lid, look, -tilt, 1)
    if brows:
        s += (f'<path d="M352,272 Q410,236 470,262 M532,258 Q596,228 652,262" fill="none" stroke="{INK}" '
              f'stroke-width="{OW}" stroke-linecap="round"/>')
    return s


def nose():
    return (f'<path d="M482,410 Q505,392 528,410 Q530,424 505,426 Q480,424 482,410 Z" fill="{BLUE}" stroke="{INK}" stroke-width="10" stroke-linejoin="round"/>'
            f'<circle cx="495" cy="415" r="3.5" fill="{INK}"/><circle cx="515" cy="415" r="3.5" fill="{INK}"/>')


def mouth(kind="smug"):
    if kind == "grin":
        d = "M338,450 Q505,438 676,440 Q650,560 505,564 Q368,560 338,450 Z"
        return (f'<defs><clipPath id="mc"><path d="{d}"/></clipPath></defs>'
                f'<path d="{d}" fill="#24152E"/>'
                f'<g clip-path="url(#mc)"><rect x="300" y="430" width="420" height="44" fill="#FFFFFF"/>'
                f'<path d="M332,474 L690,474" stroke="{INK}" stroke-width="6"/>'
                f'<ellipse cx="510" cy="560" rx="110" ry="50" fill="#F2727F"/></g>'
                f'<path d="M420,442 L420,474 M505,440 L505,474 M590,441 L590,474" stroke="{INK}" stroke-width="5"/>'
                f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{OW}" stroke-linejoin="round"/>'
                # lip rim
                f'<path d="M326,446 Q505,426 690,436" fill="none" stroke="{BLUE_D}" stroke-width="10" stroke-linecap="round" opacity="0.0"/>')
    if kind == "flat":
        lips = "M340,466 Q505,450 672,462 Q690,474 670,486 Q505,500 342,488 Q322,477 340,466 Z"
        line = "M350,477 Q505,470 664,474"
    elif kind == "focus":
        lips = "M346,462 Q505,446 666,450 Q688,462 668,478 Q505,496 348,484 Q326,472 346,462 Z"
        line = "M356,474 Q505,464 660,462"
    else:  # smug: right corner lifts
        lips = "M340,470 Q500,452 664,440 Q694,446 680,466 Q505,500 342,492 Q320,481 340,470 Z"
        line = "M350,481 Q505,474 672,452"
    return (f'<path d="{lips}" fill="{BLUE_D}" stroke="{INK}" stroke-width="{OW}" stroke-linejoin="round"/>'
            f'<path d="{line}" fill="none" stroke="{INK}" stroke-width="9" stroke-linecap="round"/>'
            f'<path d="M380,468 Q460,458 540,458" fill="none" stroke="{BLUE_L}" stroke-width="6" stroke-linecap="round" opacity="0.8"/>')


def candy_cane(x=668, y=462, ang=-24):
    d = f"M{x},{y} l86,0 q26,0 26,-24 q0,-20 -20,-20 q-14,0 -16,12"
    return (f'<g transform="rotate({ang} {x} {y})">'
            f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<path d="{d}" fill="none" stroke="#FFFFFF" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<path d="{d}" fill="none" stroke="{RED}" stroke-width="13" stroke-dasharray="12 12" stroke-linejoin="round"/>'
            f'</g>')


def visor():
    """Dealer visor: forehead band plus a translucent green brim, drawn over the face."""
    band = "M282,268 Q500,160 718,268 L712,240 Q500,130 288,240 Z"
    brim = "M244,286 Q500,178 756,286 Q778,326 736,336 Q500,268 264,336 Q222,326 244,286 Z"
    return (f'<path d="{band}" fill="#178A4E" stroke="{INK}" stroke-width="{OW}" stroke-linejoin="round"/>'
            f'<path d="{brim}" fill="{GREEN}" fill-opacity="0.78" stroke="{INK}" stroke-width="{OW}" stroke-linejoin="round"/>'
            f'<path d="M300,286 Q500,206 700,286" fill="none" stroke="#C8FFE2" stroke-width="9" stroke-linecap="round" opacity="0.85"/>')


def shades():
    """Optional sunglasses, sitting on the eyes."""
    def lens(cx, cy, w, h):
        return f"M{cx - w},{cy - h * 0.5} Q{cx},{cy - h * 0.75} {cx + w},{cy - h * 0.5} Q{cx + w * 0.95},{cy + h} {cx},{cy + h * 0.95} Q{cx - w * 0.95},{cy + h} {cx - w},{cy - h * 0.5} Z"
    l1, l2 = lens(418, 350, 82, 56), lens(594, 346, 86, 58)
    return (f'<path d="M500,330 Q505,318 512,330" fill="none" stroke="{INK}" stroke-width="14"/>'
            f'<path d="{l1}" fill="#14203A" stroke="{INK}" stroke-width="{OW}" stroke-linejoin="round"/>'
            f'<path d="{l2}" fill="#14203A" stroke="{INK}" stroke-width="{OW}" stroke-linejoin="round"/>'
            f'<path d="M360,322 L410,316 M540,318 L592,312" stroke="#7FE3FF" stroke-width="10" stroke-linecap="round" opacity="0.8"/>'
            f'<path d="M336,336 L250,322 M680,330 L760,318" stroke="{INK}" stroke-width="14" stroke-linecap="round"/>')


def body(seed=11):
    d = fur_path(500, 760, 196, 178, 17, 40, seed, rot=0.2)
    vest = ("M352,640 L460,640 L500,770 L540,640 L648,640 Q712,770 652,920 L348,920 Q288,770 352,640 Z")
    shirt = "M440,630 L560,630 L500,772 Z"
    return (f'<defs><clipPath id="bc"><path d="{d}"/></clipPath></defs>'
            f'<path d="{d}" fill="{FUR}" stroke="{INK}" stroke-width="{OW}" stroke-linejoin="round"/>'
            f'<g clip-path="url(#bc)">'
            f'<ellipse cx="560" cy="900" rx="260" ry="90" fill="{FUR_SH}"/>'
            f'<path d="{shirt}" fill="#FFFFFF" stroke="{INK}" stroke-width="10"/>'
            f'<path d="{vest}" fill="{NAVY}" stroke="{INK}" stroke-width="{OW}" stroke-linejoin="round"/>'
            f'<path d="M470,662 L500,770 M530,662 L500,770" stroke="#2C4378" stroke-width="8" fill="none"/>'
            f'<path d="M380,700 Q370,780 386,880" stroke="#2C4378" stroke-width="10" fill="none" stroke-linecap="round"/>'
            f'<circle cx="500" cy="812" r="10" fill="{GOLD}" stroke="{INK}" stroke-width="6"/>'
            f'<circle cx="500" cy="856" r="10" fill="{GOLD}" stroke="{INK}" stroke-width="6"/>'
            f'</g>'
            f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{OW}" stroke-linejoin="round"/>')


def neckwear():
    bow = (f'<path d="M500,644 L456,622 Q446,644 456,666 Z M500,644 L544,622 Q554,644 544,666 Z" fill="{GOLD}" stroke="{INK}" stroke-width="9" stroke-linejoin="round"/>'
           f'<rect x="488" y="632" width="24" height="24" rx="6" fill="{GOLD_D}" stroke="{INK}" stroke-width="8"/>')
    chain = (f'<path d="M418,628 Q440,720 500,728 Q560,720 582,628" fill="none" stroke="{INK}" stroke-width="12"/>'
             f'<path d="M418,628 Q440,720 500,728 Q560,720 582,628" fill="none" stroke="{GOLD}" stroke-width="6" stroke-dasharray="7 4"/>')
    flake = "".join(
        f'<line x1="500" y1="752" x2="{f(500 + 17 * math.cos(math.pi / 2 + k * math.pi / 3))}" y2="{f(752 - 17 * math.sin(math.pi / 2 + k * math.pi / 3))}" stroke="{INK}" stroke-width="11" stroke-linecap="round"/>'
        for k in range(6)) + "".join(
        f'<line x1="500" y1="752" x2="{f(500 + 17 * math.cos(math.pi / 2 + k * math.pi / 3))}" y2="{f(752 - 17 * math.sin(math.pi / 2 + k * math.pi / 3))}" stroke="{GOLD}" stroke-width="5" stroke-linecap="round"/>'
        for k in range(6))
    link = f'<line x1="500" y1="728" x2="500" y2="736" stroke="{GOLD}" stroke-width="5"/>'
    return chain + link + flake + bow


def feet():
    return (f'<ellipse cx="425" cy="930" rx="66" ry="34" fill="{BLUE}" stroke="{INK}" stroke-width="{OW}"/>'
            f'<ellipse cx="575" cy="930" rx="66" ry="34" fill="{BLUE}" stroke="{INK}" stroke-width="{OW}"/>'
            f'<path d="M392,936 l0,-10 M420,940 l0,-12 M580,940 l0,-12 M608,936 l0,-10" stroke="{INK}" stroke-width="6" stroke-linecap="round"/>')


def arm(points):
    """Fur tube arm through a list of points (shoulder, elbow, wrist)."""
    p = points
    if len(p) == 3:
        d = f"M{p[0][0]},{p[0][1]} Q{p[1][0]},{p[1][1]} {p[2][0]},{p[2][1]}"
    else:
        d = f"M{p[0][0]},{p[0][1]} L{p[1][0]},{p[1][1]}"
    return (f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{74 + OW * 2}" stroke-linecap="round"/>'
            f'<path d="{d}" fill="none" stroke="{FUR}" stroke-width="74" stroke-linecap="round"/>'
            f'<path d="{d}" fill="none" stroke="{FUR_SH}" stroke-width="22" stroke-linecap="round" transform="translate(10,12)" opacity="0.9"/>')


def hand(x, y, ang, kind="open", mirror=False):
    """Three fingers and a thumb. Local frame: fingers point up (-y)."""
    sx = -1 if mirror else 1
    if kind == "fist":
        shapes = [ell(0, 0, 44, 40), ell(-40 * sx, 4, 16, 24, -30 * sx)]
        inner = (f'<path d="M-24,-30 Q-14,-14 -24,4 M0,-36 Q10,-16 0,6 M24,-30 Q32,-12 24,6" fill="none" stroke="{INK}" stroke-width="7" stroke-linecap="round"/>')
    elif kind == "pinch":
        shapes = [ell(0, 0, 38, 36), ell(-14 * sx, -40, 13, 24, -10 * sx), ell(14 * sx, -34, 13, 20, 18 * sx),
                  ell(32 * sx, -14, 12, 18, 50 * sx), ell(-40 * sx, -14, 13, 22, -40 * sx)]
        inner = ""
    else:  # open palm up
        shapes = [ell(0, 0, 40, 36), ell(-24, -38, 13, 25, -12), ell(0, -46, 13, 26), ell(24, -38, 13, 25, 12),
                  ell(-44 * sx, -4, 13, 23, -55 * sx)]
        inner = (f'<path d="M-14,-6 Q0,6 14,-6" fill="none" stroke="{BLUE_D}" stroke-width="6" stroke-linecap="round"/>')
    return f'<g transform="translate({x},{y}) rotate({ang})">{union(shapes, BLUE, 11)}{inner}</g>'


def ice_chip(x, y, r=44, ang=0):
    ins = "".join(
        f'<path d="M0,0 L{f(r * math.cos(math.radians(a0)))},{f(r * math.sin(math.radians(a0)))} A{r},{r} 0 0 1 {f(r * math.cos(math.radians(a0 + 20)))},{f(r * math.sin(math.radians(a0 + 20)))} Z" fill="#FFFFFF"/>'
        for a0 in range(0, 360, 60))
    return (f'<g transform="translate({x},{y}) rotate({ang})">'
            f'<circle r="{r + 7}" fill="{INK}"/><circle r="{r}" fill="{FROST}"/>{ins}'
            f'<circle r="{r * 0.66}" fill="{INK}"/><circle r="{r * 0.58}" fill="#E9FAFF"/>'
            f'<circle r="{r * 0.46}" fill="none" stroke="{GOLD}" stroke-width="4" stroke-dasharray="6 5"/>'
            f'<path d="M{-r * 0.5},{-r * 0.6} A{r},{r} 0 0 1 {r * 0.6},{-r * 0.5}" stroke="#FFFFFF" stroke-width="5" fill="none" opacity="0.8"/>'
            f'</g>')


FROST = "#7FE3FF"


def card(x, y, ang, w=96, h=136):
    flake = "".join(
        f'<line x1="0" y1="0" x2="{f(20 * math.cos(k * math.pi / 3))}" y2="{f(20 * math.sin(k * math.pi / 3))}" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>'
        for k in range(6))
    return (f'<g transform="translate({x},{y}) rotate({ang})">'
            f'<g transform="translate(0,{-h * 0.62})">'
            f'<rect x="{-w / 2}" y="{-h / 2}" width="{w}" height="{h}" rx="12" fill="#FFFFFF" stroke="{INK}" stroke-width="10"/>'
            f'<rect x="{-w / 2 + 10}" y="{-h / 2 + 10}" width="{w - 20}" height="{h - 20}" rx="7" fill="{BLUE}"/>'
            f'<rect x="{-w / 2 + 16}" y="{-h / 2 + 16}" width="{w - 32}" height="{h - 32}" rx="5" fill="none" stroke="{GOLD}" stroke-width="3"/>'
            f'{flake}</g></g>')


def sparkle(x, y, s=1.0, color=FROST):
    return (f'<path transform="translate({x},{y}) scale({s})" d="M0,-26 Q4,-4 26,0 Q4,4 0,26 Q-4,4 -26,0 Q-4,-4 0,-26 Z" '
            f'fill="{color}" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>')


# ------------------------------------------------------------ assembly
def head(expr="smug", tilt=0, glasses=False):
    lid, look, brows, m = {
        "smug": (0.55, (14, 8), False, "smug"),
        "grin": (0.5, (10, 6), False, "grin"),
        "focus": (0.58, (-6, 16), False, "focus"),
        "shrug": (0.38, (0, 4), True, "flat"),
    }[expr]
    face = [face_base(), eyes(lid, look, 6 if expr != "shrug" else -4, brows), nose(), mouth(m)]
    if glasses:
        face.append(shades())
    if expr in ("smug", "focus"):
        face.append(candy_cane())
    fg = "".join(face)
    g = horns() + ears() + head_fur() + f'<g transform="translate(505,440) scale(0.86) translate(-505,-430)">{fg}</g>' + visor()
    return f'<g transform="rotate({tilt} 500 600)">{g}</g>'


def svg(content, vb="0 -20 1000 1000"):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="2048" height="2048">{content}</svg>'


def pose_neutral(glasses=False):
    back = feet() + body() + neckwear()
    left = arm([(345, 680), (282, 790), (338, 862)]) + hand(346, 868, 160, "fist", mirror=True)
    right = arm([(655, 690), (800, 730), (790, 610)]) + hand(790, 596, 10, "pinch") + ice_chip(800, 515, 40, 15)
    return svg(back + left + head("smug", 0, glasses) + right)


def pose_win():
    back = feet() + body() + neckwear()
    chips = ice_chip(150, 200, 36, -20) + ice_chip(880, 150, 32, 25) + ice_chip(120, 540, 28, 10) + ice_chip(930, 330, 26, -15)
    sp = sparkle(250, 110, 0.9) + sparkle(940, 560, 0.7, GOLD) + sparkle(120, 360, 0.6, GOLD) + sparkle(900, 600, 0.8)
    left = arm([(345, 680), (262, 760), (322, 846)]) + hand(330, 852, 160, "fist", mirror=True)
    right = arm([(655, 690), (820, 660), (840, 500)]) + hand(842, 468, 8, "fist")
    return svg(chips + sp + back + left + head("grin", -3) + right)


def pose_deal():
    back = feet() + body() + neckwear()
    fan = "".join(card(392, 800, a) for a in (-34, -17, 0, 17, 34))
    left = arm([(345, 680), (300, 770), (388, 800)]) + fan + hand(392, 806, 20, "fist", mirror=True)
    flying = card(800, 600, 28)
    right = arm([(655, 680), (760, 760), (742, 676)]) + flying + hand(744, 664, 30, "pinch")
    lines = f'<path d="M870,470 q24,-10 40,4 M884,520 q24,-6 38,10" fill="none" stroke="{INK}" stroke-width="7" stroke-linecap="round"/>'
    return svg(back + left + right + lines + head("focus", 2))


def pose_shrug():
    back = feet() + body() + neckwear()
    left = arm([(345, 690), (210, 740), (176, 620)]) + hand(170, 600, -18, "open", mirror=True)
    right = arm([(655, 690), (790, 740), (824, 620)]) + hand(830, 600, 18, "open")
    return svg(back + left + right + head("shrug", -7))


def bust():
    """Head and shoulders for the app icon and logo lockup."""
    content = body() + neckwear() + head("smug")
    return svg(content, vb="140 30 720 720")


def render(name, s, px=2048):
    sp = os.path.join(SVG_DIR, name + ".svg")
    with open(sp, "w") as fh:
        fh.write(s)
    op = os.path.join(OUT, name + ".png")
    subprocess.run(["rsvg-convert", "-w", str(px), "-h", str(px), "-o", op, sp], check=True)
    return op


if __name__ == "__main__":
    render("mascot-neutral", pose_neutral())
    render("mascot-win", pose_win())
    render("mascot-deal", pose_deal())
    render("mascot-shrug", pose_shrug())
    render("mascot-shades", pose_neutral(glasses=True))
    render("mascot-bust", bust())
    print("rendered")
