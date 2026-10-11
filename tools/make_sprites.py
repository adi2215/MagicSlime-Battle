"""Builds recoloured slime sprite sheets from the original MagicSlime frames.

Output: public/assets/sprites/<id>.png  — 5 frames of 48x56 laid out horizontally
(native pixel size; the game scales them up with image-rendering: pixelated).
"""
import json
import os
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
OUT = os.path.join(HERE, "..", "public", "game", "sprites")
os.makedirs(OUT, exist_ok=True)

FW, FH, PAD_TOP = 48, 56, 8
ORIG = {
    (115, 156, 170): "b",
    (197, 228, 238): "h",
    (63, 107, 121): "s",
    (12, 15, 15): "o",
}


def load_frames():
    frames = []
    for i in range(1, 6):
        im = Image.open(os.path.join(SRC, f"Slime{i}.png")).convert("RGBA")
        im = im.resize((48, 48), Image.NEAREST)
        grid = [["." for _ in range(FW)] for _ in range(FH)]
        for y in range(48):
            for x in range(48):
                p = im.getpixel((x, y))
                if p[3] == 0:
                    continue
                grid[y + PAD_TOP][x] = ORIG.get(p[:3], "b")
        frames.append(grid)
    return frames


def top_at(grid, x):
    for y in range(FH):
        if grid[y][x] != ".":
            return y
    return None


def body_top(grid):
    for y in range(FH):
        xs = [x for x in range(FW) if grid[y][x] != "."]
        if xs:
            return y, (xs[0] + xs[-1]) // 2
    return 0, FW // 2


def find_eyes(grid):
    """Eye pixels: outline-coloured pixels with body pixels on both sides."""
    eyes = {}
    for y in range(1, FH - 1):
        for x in range(1, FW - 1):
            if grid[y][x] == "o" and grid[y][x - 1] in "bhs" and grid[y][x + 1] in "bhs":
                eyes.setdefault(x, []).append(y)
    return {x: ys for x, ys in eyes.items() if len(ys) >= 2}


# ---- accessories: small pixel patterns. Anchor = bottom-centre of the pattern.
ACC = {
    "flame": (["...r...", "..rYr..", ".rYYYr.", "rYYyYYr", "rYyyyYr", ".ryyyr."], {"r": (214, 64, 36), "Y": (255, 168, 40), "y": (255, 236, 140)}),
    "leaf": (["..gg...", ".gGGg..", "gGGGGg.", ".gGGGGg", "..ggk..", "....k..", "....k.."], {"g": (40, 120, 40), "G": (120, 210, 90), "k": (70, 60, 30)}),
    "spark": (["..YY.", ".YY..", "YYYY.", "..YY.", ".YY..", "..k..", "..k.."], {"Y": (255, 236, 90), "k": (60, 50, 20)}),
    "halo": ([".yyyyyyy.", "y.......y", ".yyyyyyy."], {"y": (255, 226, 110)}),
    "crown": (["y...y...y", "yy.yyy.yy", "yyyyyyyyy", "yRyyByyRy", "yyyyyyyyy"], {"y": (246, 196, 50), "R": (220, 40, 60), "B": (60, 140, 230)}),
    "crown_dark": (["p...p...p", "pp.ppp.pp", "ppppppppp", "pRppRppRp", "ppppppppp"], {"p": (70, 46, 104), "R": (240, 40, 60)}),
    "droplet": (["..c..", "..c..", ".cCc.", "cCWCc", "cCCCc", ".ccc."], {"c": (50, 120, 196), "C": (130, 196, 250), "W": (240, 250, 255)}),
    "sollogo": (["..PPPPP", ".......", "TTTTT..", ".......", "..GGGGG"], {"P": (153, 69, 255), "T": (60, 150, 225), "G": (20, 241, 149)}),
    "icicle": (["iIIi", "iIIi", ".Ii.", ".i.."], {"i": (150, 210, 240), "I": (230, 248, 255)}),
}
HORN = (["...w", "..wd", ".wdd", "wddd"], {"w": (240, 232, 210), "d": (160, 140, 118)})
HORN_DARK = (["...r", "..rk", ".rkk", "rkkk"], {"r": (220, 50, 60), "k": (50, 14, 24)})


def stamp(img, pattern, palette, ax, ay, flip=False):
    rows = pattern
    h = len(rows)
    w = len(rows[0])
    for r, row in enumerate(rows):
        for c, ch in enumerate(row):
            if ch == ".":
                continue
            cc = (w - 1 - c) if flip else c
            x = ax - w // 2 + cc
            y = ay - h + 1 + r
            if 0 <= x < img.width and 0 <= y < img.height:
                img.putpixel((x, y), palette[ch] + (255,))


def render(frames, spec):
    pal = {k: tuple(v) for k, v in spec["palette"].items()}
    sheet = Image.new("RGBA", (FW * len(frames), FH), (0, 0, 0, 0))
    for i, grid in enumerate(frames):
        img = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
        eyes = find_eyes(grid)
        ty0, _ = body_top(grid)
        grad = spec.get("grad")
        for y in range(FH):
            for x in range(FW):
                ch = grid[y][x]
                if ch == ".":
                    continue
                col = pal[ch]
                if grad and ch in grad[0]:
                    t = max(0.0, min(1.0, (y - ty0) / 19))
                    a, b2 = grad[0][ch], grad[1][ch]
                    col = tuple(int(a[i] + (b2[i] - a[i]) * t) for i in range(3))
                img.putpixel((x, y), col + (255,))
        eye_xs = sorted(eyes)
        # eyes
        eye_col = tuple(spec.get("eye", (12, 15, 15)))
        for ex in eye_xs:
            for ey in eyes[ex]:
                img.putpixel((ex, ey), eye_col + (255,))
            if spec.get("eyeGlow"):
                img.putpixel((ex, eyes[ex][0]), tuple(spec["eyeGlow"]) + (255,))
        if spec.get("angry") and len(eye_xs) >= 2:
            brow = pal["o"] + (255,)
            lx, rx = eye_xs[0], eye_xs[-1]
            ly, ry = eyes[lx][0], eyes[rx][0]
            for dx, dy in ((-3, -4), (-2, -3), (-1, -3), (-1, -2), (0, -2), (1, -2), (-2, -4)):
                img.putpixel((lx + dx, ly + dy), brow)
            for dx, dy in ((3, -4), (2, -3), (1, -3), (1, -2), (0, -2), (-1, -2), (2, -4)):
                img.putpixel((rx + dx, ry + dy), brow)
        if spec.get("blush") and len(eye_xs) >= 2:
            bc = tuple(spec["blush"]) + (255,)
            for ex in (eye_xs[0] - 2, eye_xs[-1] + 2):
                yb = eyes[eye_xs[0]][-1] + 2
                if grid[yb][ex] in "bhs":
                    img.putpixel((ex, yb), bc)
        # accessories
        ty, cx = body_top(grid)
        for acc in spec.get("acc", []):
            if acc in ("horns", "horns_dark"):
                pat, hp = HORN if acc == "horns" else HORN_DARK
                for side in (-1, 1):
                    hx = cx + side * 8
                    hy = top_at(grid, hx)
                    if hy is None:
                        continue
                    stamp(img, pat, hp, hx, hy, flip=(side == 1))
                continue
            pat, pp = ACC[acc]
            if acc in ("halo", "sollogo"):
                stamp(img, pat, pp, cx, ty - 2)
            elif acc in ("crown", "crown_dark"):
                stamp(img, pat, pp, cx, ty + 1)
            elif acc == "icicle":
                stamp(img, pat, pp, cx - 6, (top_at(grid, cx - 6) or ty) + 2)
            else:
                ox = cx + spec.get("accDx", 0)
                stamp(img, pat, pp, ox, (top_at(grid, ox) or ty))
        sheet.alpha_composite(img, (FW * i, 0))
    return sheet


SPECS = {
    # ---- player slimes
    "p_water": {"palette": {"b": (86, 160, 214), "h": (196, 236, 255), "s": (44, 98, 152), "o": (14, 22, 40)}, "acc": ["droplet"], "accDx": 2, "blush": (240, 140, 170)},
    "p_fire": {"palette": {"b": (236, 110, 60), "h": (255, 210, 130), "s": (166, 56, 40), "o": (42, 14, 10)}, "acc": ["flame"], "blush": (255, 170, 140)},
    "p_nature": {"palette": {"b": (108, 190, 86), "h": (210, 246, 156), "s": (54, 124, 60), "o": (14, 38, 18)}, "acc": ["leaf"], "accDx": 1, "blush": (240, 150, 150)},
    "p_storm": {"palette": {"b": (240, 206, 70), "h": (255, 248, 190), "s": (182, 132, 34), "o": (46, 34, 8)}, "acc": ["spark"], "accDx": 2, "blush": (255, 160, 120)},
    "p_shadow": {"palette": {"b": (128, 88, 182), "h": (204, 176, 244), "s": (74, 46, 120), "o": (18, 10, 32)}, "acc": ["horns"], "eye": (250, 230, 120), "blush": (220, 120, 200)},
    "p_sol": {"palette": {"b": (120, 120, 220), "h": (230, 220, 255), "s": (60, 60, 140), "o": (16, 10, 36)},
              "grad": ({"b": (153, 69, 255), "h": (225, 200, 255), "s": (96, 36, 180)}, {"b": (20, 220, 150), "h": (190, 255, 225), "s": (10, 140, 100)}),
              "acc": ["sollogo"], "blush": (255, 160, 220)},
    "p_light": {"palette": {"b": (250, 240, 214), "h": (255, 255, 255), "s": (222, 188, 112), "o": (70, 54, 26)}, "acc": ["halo"], "blush": (255, 170, 160)},
    # ---- enemies
    "e_moss": {"palette": {"b": (82, 128, 66), "h": (152, 192, 112), "s": (42, 78, 42), "o": (16, 26, 12)}, "acc": ["leaf"], "angry": True, "eye": (200, 30, 30), "accDx": -3},
    "e_puddle": {"palette": {"b": (60, 108, 150), "h": (130, 182, 214), "s": (32, 64, 100), "o": (10, 18, 30)}, "acc": [], "angry": True, "eye": (200, 30, 30)},
    "e_ice": {"palette": {"b": (150, 200, 226), "h": (232, 248, 255), "s": (88, 140, 180), "o": (20, 40, 60)}, "acc": ["icicle"], "angry": True, "eye": (30, 60, 160)},
    "e_ember": {"palette": {"b": (186, 66, 40), "h": (240, 150, 80), "s": (110, 34, 26), "o": (30, 8, 6)}, "acc": ["flame"], "angry": True, "eye": (255, 220, 60), "accDx": -2},
    "e_spark": {"palette": {"b": (196, 166, 52), "h": (240, 220, 130), "s": (130, 100, 30), "o": (36, 28, 8)}, "acc": ["spark"], "angry": True, "eye": (40, 120, 220), "accDx": -3},
    "e_horned": {"palette": {"b": (92, 62, 124), "h": (160, 130, 200), "s": (52, 32, 80), "o": (12, 6, 20)}, "acc": ["horns_dark"], "angry": True, "eye": (240, 40, 60)},
    "e_magma": {"palette": {"b": (70, 50, 46), "h": (240, 120, 50), "s": (40, 28, 26), "o": (16, 8, 6)}, "acc": ["horns"], "angry": True, "eye": (255, 160, 40)},
    # ---- bosses
    "b_mossking": {"palette": {"b": (70, 150, 60), "h": (170, 220, 120), "s": (36, 90, 40), "o": (14, 30, 12)}, "acc": ["crown"], "angry": True, "eye": (200, 30, 30)},
    "b_deeplord": {"palette": {"b": (40, 90, 170), "h": (110, 180, 240), "s": (20, 50, 110), "o": (8, 14, 36)}, "acc": ["crown"], "angry": True, "eye": (250, 240, 120)},
    "b_lavatitan": {"palette": {"b": (200, 60, 30), "h": (255, 190, 70), "s": (120, 30, 20), "o": (30, 6, 4)}, "acc": ["horns", "crown"], "angry": True, "eye": (255, 240, 120)},
    "b_darkking": {"palette": {"b": (54, 34, 80), "h": (130, 90, 180), "s": (30, 18, 46), "o": (6, 2, 12)}, "acc": ["horns_dark", "crown_dark"], "angry": True, "eye": (255, 40, 60), "eyeGlow": (255, 160, 170)},
}


def main():
    frames = load_frames()
    only = sys.argv[1:]
    for sid, spec in SPECS.items():
        if only and sid not in only:
            continue
        render(frames, spec).save(os.path.join(OUT, f"{sid}.png"))
    # items
    items = {"potion": "Blue Potion.png", "elixir": "Water Bottle.png", "apple": "Green Apple.png", "coin": "Golden Coin.png"}
    for k, f in items.items():
        Image.open(os.path.join(SRC, f)).convert("RGBA").save(os.path.join(OUT, f"{k}.png"))
    print("sprites:", len(SPECS))


if __name__ == "__main__":
    main()
