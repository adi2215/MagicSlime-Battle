"""Procedural pixel-art battle backgrounds (240x135, scaled up in the game)."""
import math
import os
import random
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "game", "bg")
os.makedirs(OUT, exist_ok=True)
W, H = 240, 135


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def sky(img, top, bottom, bands=10):
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H * 0.75)
        t = min(1, t)
        # banded with ordered dithering between bands
        f = t * bands
        lo = int(f)
        frac = f - lo
        for x in range(W):
            th = ((x % 2) * 2 + (y % 2)) / 4 + 0.125
            band = lo + (1 if frac > th else 0)
            d.point((x, y), lerp(top, bottom, min(1, band / bands)))


def ridge(img, base, amp, color, seed, freq=0.05, rough=0.3, step=None):
    rnd = random.Random(seed)
    ph = [rnd.random() * 10 for _ in range(4)]
    d = ImageDraw.Draw(img)
    for x in range(W):
        y = base
        y -= amp * (0.6 * math.sin(x * freq + ph[0]) + 0.3 * math.sin(x * freq * 2.3 + ph[1]) + rough * math.sin(x * freq * 5.1 + ph[2]))
        if step:
            y = round(y / step) * step
        d.line([(x, int(y)), (x, H)], fill=color)


def pine(d, x, y, h, c, c2):
    for i in range(h):
        w = int((i / h) * h * 0.45) + 1
        d.line([(x - w, y + i), (x + w, y + i)], fill=c if i % 4 else c2)
    d.line([(x, y + h), (x, y + h + 3)], fill=(60, 40, 30))


def ground(img, top_y, c1, c2, edge, seed, tuft=None):
    d = ImageDraw.Draw(img)
    rnd = random.Random(seed)
    for y in range(top_y, H):
        for x in range(W):
            c = c1 if ((x // 6 + y // 3) % 5) else c2
            if rnd.random() < 0.04:
                c = c2
            d.point((x, y), c)
    d.line([(0, top_y), (W, top_y)], fill=edge)
    d.line([(0, top_y + 1), (W, top_y + 1)], fill=edge)
    if tuft:
        for _ in range(70):
            x = rnd.randrange(W)
            d.point((x, top_y - 1), tuft)
            if rnd.random() < 0.5:
                d.point((x + 1, top_y - 2), tuft)


def ellipse_shadow(img, cx, cy, rx, ry, color):
    d = ImageDraw.Draw(img)
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=color)


def stars(img, n, seed, color=(255, 255, 255), maxy=70):
    d = ImageDraw.Draw(img)
    rnd = random.Random(seed)
    for _ in range(n):
        d.point((rnd.randrange(W), rnd.randrange(maxy)), color)


def forest():
    img = Image.new("RGB", (W, H))
    sky(img, (120, 196, 236), (214, 240, 222))
    d = ImageDraw.Draw(img)
    d.ellipse([186, 14, 204, 32], fill=(255, 246, 200))
    ridge(img, 70, 10, (150, 196, 170), 1, 0.03)
    ridge(img, 82, 8, (96, 156, 110), 2, 0.05)
    rnd = random.Random(3)
    for i in range(26):
        x = rnd.randrange(-4, W + 4)
        pine(d, x, 62 + rnd.randrange(14), 20 + rnd.randrange(10), (46, 110, 64), (36, 92, 54))
    ground(img, 98, (110, 178, 80), (92, 156, 66), (70, 130, 52), 4, tuft=(140, 204, 96))
    return img


def lake():
    img = Image.new("RGB", (W, H))
    sky(img, (64, 110, 190), (180, 214, 240))
    stars(img, 12, 5, (230, 240, 255), 40)
    ridge(img, 66, 14, (110, 140, 200), 6, 0.04, step=2)
    d = ImageDraw.Draw(img)
    # crystal spires
    rnd = random.Random(7)
    for i in range(9):
        x = rnd.randrange(W)
        h = 14 + rnd.randrange(20)
        d.polygon([(x, 74 - h), (x - 4, 76), (x + 4, 76)], fill=(150, 200, 250))
        d.line([(x, 74 - h), (x, 76)], fill=(220, 240, 255))
    # water band
    for y in range(76, 98):
        for x in range(W):
            c = (60, 120, 190) if ((x + y * 3) // 7) % 6 else (150, 200, 240)
            d.point((x, y), c)
    ground(img, 98, (196, 186, 150), (170, 160, 126), (140, 130, 100), 8, tuft=(220, 210, 176))
    return img


def volcano():
    img = Image.new("RGB", (W, H))
    sky(img, (40, 20, 30), (200, 90, 50))
    d = ImageDraw.Draw(img)
    d.polygon([(90, 80), (130, 22), (146, 22), (190, 80)], fill=(70, 40, 40))
    d.polygon([(128, 24), (148, 24), (140, 40), (134, 34)], fill=(255, 120, 40))
    rnd = random.Random(9)
    for _ in range(30):
        x = 130 + rnd.randrange(-30, 30)
        y = rnd.randrange(0, 24)
        d.point((x, y), (255, 170, 60) if rnd.random() < 0.5 else (240, 80, 40))
    ridge(img, 82, 10, (90, 46, 40), 10, 0.06, step=3)
    for y in range(92, 98):
        d.line([(0, y), (W, y)], fill=(255, 110 + (y - 92) * 12, 40))
    ground(img, 98, (66, 46, 44), (52, 36, 36), (255, 120, 40), 11, tuft=(110, 70, 60))
    return img


def castle():
    img = Image.new("RGB", (W, H))
    sky(img, (16, 10, 30), (90, 50, 120))
    stars(img, 60, 12, (220, 210, 255), 70)
    d = ImageDraw.Draw(img)
    d.ellipse([30, 12, 48, 30], fill=(230, 220, 250))
    d.ellipse([36, 10, 52, 28], fill=(30, 18, 50))
    # castle silhouette
    col = (34, 22, 50)
    for x0, w, h in ((120, 26, 60), (150, 14, 74), (168, 30, 52), (204, 12, 66), (96, 18, 44)):
        d.rectangle([x0, 96 - h, x0 + w, 96], fill=col)
        for bx in range(x0, x0 + w, 4):
            d.rectangle([bx, 96 - h - 3, bx + 1, 96 - h], fill=col)
        for wy in range(96 - h + 8, 92, 12):
            d.rectangle([x0 + w // 2 - 1, wy, x0 + w // 2, wy + 3], fill=(240, 200, 90))
    d.polygon([(150, 22), (157, 8), (164, 22)], fill=col)
    ridge(img, 90, 6, (46, 30, 66), 13, 0.05)
    ground(img, 98, (60, 50, 70), (48, 40, 58), (100, 80, 130), 14, tuft=(84, 70, 100))
    return img


def map_bg():
    img = Image.new("RGB", (W, H))
    sky(img, (90, 160, 220), (200, 230, 240))
    ridge(img, 60, 12, (120, 170, 150), 20, 0.03)
    ridge(img, 80, 10, (90, 150, 100), 21, 0.04)
    ground(img, 96, (110, 178, 80), (92, 156, 66), (70, 130, 52), 22)
    return img


for name, fn in (("forest", forest), ("lake", lake), ("volcano", volcano), ("castle", castle)):
    fn().save(os.path.join(OUT, f"{name}.png"))
print("bg ok")
