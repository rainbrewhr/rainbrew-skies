# Rainbrew Sky app icon: a golden winged unicorn flying over dusk clouds, with a rainbow trail. Run: python3 make_icons.py
import math, random
from PIL import Image, ImageDraw, ImageFilter
S = 1024
RB = ['#ff5a5a', '#ff9a3c', '#ffe45a', '#6ee06e', '#4fc3ff', '#b07cff']
def hexc(h): return tuple(int(h[i:i+2], 16) for i in (1, 3, 5))
def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
def sky(w, h):
    stops = [(0, hexc('#1b1250')), (.40, hexc('#52289a')), (.72, hexc('#d9508f')), (1, hexc('#ffc08c'))]
    im = Image.new('RGB', (w, h)); d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / (h - 1)
        for i in range(len(stops) - 1):
            if stops[i][0] <= t <= stops[i + 1][0]:
                u = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0]); c = lerp(stops[i][1], stops[i + 1][1], u); break
        d.line([(0, y), (w, y)], fill=c)
    return im
def glow(size, color, radius, strength):
    g = Image.new('RGBA', size, (0, 0, 0, 0)); d = ImageDraw.Draw(g)
    cx, cy = size[0] // 2, size[1] // 2
    for r in range(radius, 0, -6):
        a = int(strength * (1 - r / radius) ** 2 * 255); d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color + (a,))
    return g
def sparkle(d, x, y, r, col=(255, 255, 255, 230)):
    d.polygon([(x, y - r), (x + r * .28, y - r * .28), (x + r, y), (x + r * .28, y + r * .28), (x, y + r), (x - r * .28, y + r * .28), (x - r, y), (x - r * .28, y - r * .28)], fill=col)
def bez(p0, p1, p2, p3, n=120):
    pts = []
    for i in range(n + 1):
        t = i / n; a = (1 - t) ** 3; b = 3 * (1 - t) ** 2 * t; c = 3 * (1 - t) * t * t; e = t ** 3
        pts.append((a * p0[0] + b * p1[0] + c * p2[0] + e * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + e * p3[1]))
    return pts
def art():
    im = sky(S, S).convert('RGBA')
    im.alpha_composite(glow((S, S), (255, 214, 120), 560, .55), (0, 0)) if False else None
    g = glow((1100, 1100), (170, 215, 255), 540, .50); im.alpha_composite(g, (S // 2 - 550, 330 - 550 + 120))
    d = ImageDraw.Draw(im, 'RGBA'); random.seed(7)
    for (x, y, r) in [(120, 130, 26), (880, 100, 20), (210, 360, 14), (840, 330, 24), (90, 560, 12), (940, 600, 14), (470, 90, 16), (700, 220, 12), (330, 190, 11)]: sparkle(d, x, y, r)
    for _ in range(60):
        x, y = random.randint(20, S - 20), random.randint(20, 520)
        if (x - 512) ** 2 + (y - 430) ** 2 > 300 ** 2: d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 255, 255, random.randint(90, 200)))
    bg = im.copy(); im = Image.new('RGBA', (S, S), (0, 0, 0, 0))   # everything from here on is the content layer
    # the rainbow trail: six ribbons flowing down from the unicorn's tail in a gentle S
    trail = Image.new('RGBA', (S, S), (0, 0, 0, 0)); td = ImageDraw.Draw(trail)
    center = bez((505, 735), (500, 800), (380, 830), (420, 985), 200)
    for k, col in enumerate(RB):
        off = (k - 2.5) * 40
        pts = []
        for i, (x, y) in enumerate(center):
            if i < len(center) - 1: dx, dy = center[i + 1][0] - x, center[i + 1][1] - y
            nx, ny = -dy, dx; L = math.hypot(nx, ny) or 1
            sc = 0.75 + 0.9 * (i / len(center))
            pts.append((x + nx / L * off * sc, y + ny / L * off * sc))
        td.line(pts, fill=hexc(col) + (255,), width=40, joint='curve')
        for (x, y) in (pts[0], pts[-1]): td.ellipse([x - 20, y - 20, x + 20, y + 20], fill=hexc(col) + (255,))
    fade = Image.new('L', (S, S), 255); fd = ImageDraw.Draw(fade)
    for y in range(640, S): fd.line([(0, y), (S, y)], fill=255)
    trail.putalpha(Image.composite(trail.getchannel('A'), Image.new('L', (S, S), 0), fade))
    im.alpha_composite(trail)
    # clouds along the bottom, soft and puffy
    cl = Image.new('RGBA', (S, S), (0, 0, 0, 0)); cd = ImageDraw.Draw(cl)
    for (x, y, rx, ry, a) in [(110, 1010, 250, 110, 255), (370, 1050, 300, 120, 255), (700, 1035, 300, 115, 255), (960, 1005, 240, 110, 255), (-10, 950, 190, 90, 230), (1040, 945, 190, 90, 230), (530, 1100, 400, 110, 255)]:
        cd.ellipse([x - rx, y - ry, x + rx, y + ry], fill=(255, 244, 250, a))
    shadow = cl.filter(ImageFilter.GaussianBlur(14)); sh = Image.new('RGBA', (S, S), (255, 120, 180, 0)); sh.putalpha(shadow.getchannel('A').point(lambda v: int(v * .55)))
    im.alpha_composite(sh, (0, -16)); im.alpha_composite(cl.filter(ImageFilter.GaussianBlur(1.5)))
    cd2 = ImageDraw.Draw(im, 'RGBA')
    for (x, y, r) in [(250, 985, 16), (790, 975, 14), (600, 1000, 11)]: sparkle(cd2, x, y, r, (190, 235, 255, 255))
    # the unicorn
    u = Image.open('/home/claude/catch2/icon_src/crystal_unicorn.png').convert('RGBA'); u = u.crop(u.getbbox()); U = 800; sq = max(u.size); pad = Image.new('RGBA', (sq, sq), (0, 0, 0, 0)); pad.alpha_composite(u, ((sq - u.width) // 2, (sq - u.height) // 2)); u = pad
    u = u.resize((U, U), Image.LANCZOS)
    halo = Image.new('RGBA', (U + 120, U + 120), (0, 0, 0, 0)); halo.putalpha(u.getchannel('A').resize((U, U)).filter(ImageFilter.GaussianBlur(22)).point(lambda v: int(v * .7)).crop((0, 0, U, U)).resize((U, U)).convert('L') if False else Image.new('L', (U + 120, U + 120), 0))
    sa = u.getchannel('A').filter(ImageFilter.GaussianBlur(26)).point(lambda v: int(v * .65)); gl = Image.new('RGBA', (U, U), (150, 225, 255, 0)); gl.putalpha(sa)
    sx, sy = (S - U) // 2, 110
    im.alpha_composite(gl, (sx, sy)); 
    drop = Image.new('RGBA', (U, U), (40, 10, 80, 0)); drop.putalpha(u.getchannel('A').filter(ImageFilter.GaussianBlur(12)).point(lambda v: int(v * .45))); im.alpha_composite(drop, (sx + 6, sy + 22))
    im.alpha_composite(u, (sx, sy))
    return bg, im
def save_all(bg, ct):
    out = '/home/claude/catch2/assets/'
    full = bg.copy(); full.alpha_composite(ct); im = full.convert('RGB')
    im.resize((512, 512), Image.LANCZOS).save(out + 'icon-512.png')
    im.resize((192, 192), Image.LANCZOS).save(out + 'icon-192.png')
    im.resize((180, 180), Image.LANCZOS).save(out + 'apple-touch-icon.png')
    im.resize((64, 64), Image.LANCZOS).save(out + 'favicon-64.png')
    # maskable: the sky fills the whole square and the artwork sits inside the central safe zone (Android crops to a circle or squircle)
    mb = bg.copy(); md = ImageDraw.Draw(mb, 'RGBA')
    for (x, y, rx, ry) in [(60, 940, 250, 130), (300, 985, 280, 130), (700, 975, 280, 130), (980, 935, 250, 130), (520, 1050, 460, 140), (-40, 860, 160, 100), (1064, 860, 160, 100)]: md.ellipse([x - rx, y - ry, x + rx, y + ry], fill=(255, 244, 250, 255))
    k = 0.8; small = ct.resize((int(S * k), int(S * k)), Image.LANCZOS)
    W = small.width; fadem = Image.new('L', (W, small.height), 255); fdd = ImageDraw.Draw(fadem)
    for i in range(70): v = int(255 * i / 70); fdd.line([(i, 0), (i, small.height)], fill=v); fdd.line([(W - 1 - i, 0), (W - 1 - i, small.height)], fill=v)
    from PIL import ImageChops; small.putalpha(ImageChops.multiply(small.getchannel('A'), fadem)); mb.alpha_composite(small, (int(S * (1 - k) / 2), int(S * (1 - k) / 2) - 10))
    mb.convert('RGB').resize((512, 512), Image.LANCZOS).save(out + 'icon-maskable-512.png')
    return full

def og_image(bg, ct):                                                # the picture shown when the game's link is shared (1200 x 630)
    from PIL import ImageFont
    W, H = 1200, 630
    im = sky(W, H).convert('RGBA'); d = ImageDraw.Draw(im, 'RGBA'); random.seed(11)
    for _ in range(90):
        x, y = random.randint(10, W - 10), random.randint(10, H - 10)
        if x < 640 or y < 380: d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(255, 255, 255, random.randint(80, 200)))
    for (x, y, r) in [(90, 80, 22), (560, 60, 16), (1120, 110, 24), (440, 520, 14)]: sparkle(d, x, y, r)
    im.alpha_composite(glow((900, 900), (170, 215, 255), 440, .5), (880 - 450, 300 - 450))
    cl = Image.new('RGBA', (W, H), (0, 0, 0, 0)); cdd = ImageDraw.Draw(cl)
    for (x, y, rx, ry) in [(60, 640, 230, 90), (330, 668, 260, 90), (640, 655, 270, 90), (930, 640, 250, 90), (1200, 650, 230, 90), (500, 700, 400, 80)]: cdd.ellipse([x - rx, y - ry, x + rx, y + ry], fill=(255, 244, 250, 255))
    cshadow = cl.filter(ImageFilter.GaussianBlur(10)); shd = Image.new('RGBA', (W, H), (255, 120, 180, 0)); shd.putalpha(cshadow.getchannel('A').point(lambda v: int(v * .5))); im.alpha_composite(shd, (0, -12))
    k = 740; c = ct.resize((k, k), Image.LANCZOS); fm = Image.new('L', (k, k), 255); fmd = ImageDraw.Draw(fm)
    for i in range(60): v = int(255 * i / 60); fmd.line([(i, 0), (i, k)], fill=v); fmd.line([(k - 1 - i, 0), (k - 1 - i, k)], fill=v)
    from PIL import ImageChops; c.putalpha(ImageChops.multiply(c.getchannel('A'), fm)); im.alpha_composite(c, (880 - k // 2, -140)); im.alpha_composite(cl.filter(ImageFilter.GaussianBlur(1.2)))
    f1 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 112); f2 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 38); f3 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 30)
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0)); sd = ImageDraw.Draw(sh)
    sd.text((70, 190), 'Rainbrew', font=f1, fill=(20, 8, 60, 200)); sd.text((70, 310), 'Sky', font=f1, fill=(20, 8, 60, 200))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(8)), (4, 6))
    d = ImageDraw.Draw(im)
    d.text((70, 190), 'Rainbrew', font=f1, fill=(255, 255, 255)); d.text((70, 310), 'Sky', font=f1, fill=(255, 214, 120))
    d.text((74, 450), 'Fly the café skies', font=f2, fill=(255, 240, 250))
    d.rounded_rectangle([70, 520, 330, 572], radius=26, outline=(255, 255, 255, 220), width=3); d.text((106, 530), 'Play free', font=f3, fill=(255, 255, 255))
    im.convert('RGB').save('/home/claude/catch2/assets/og-image.png')
if __name__ == '__main__':
    bg, ct = art(); full = save_all(bg, ct); full.convert('RGB').save('/tmp/icon_master.png'); bg.save('/tmp/icon_bg.png'); ct.save('/tmp/icon_content.png'); og_image(bg, ct); print('icons written')
