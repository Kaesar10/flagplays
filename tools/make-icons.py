"""Genera los iconos de FlagPlays (Android launcher + PWA) con PIL."""
from PIL import Image, ImageDraw
import os, math

OUT = "android/app/src/main/res"
WEB = "assets/icons"
for d in [OUT, WEB]:
    os.makedirs(d, exist_ok=True)

BG = (11, 17, 22, 255)        # --bg-1
FIELD = (21, 68, 41, 255)     # --turf
FIELD2 = (16, 56, 33, 255)
LINE = (234, 255, 242, 255)
LIME = (154, 230, 63, 255)
WHITE = (240, 251, 244, 255)
DEF = (255, 122, 92, 255)


def rounded(draw, box, r, fill):
    draw.rounded_rectangle(box, radius=r, fill=fill)


def draw_mark(size, with_bg=True, scale=1.0):
    """Icono: campo + ruta con flecha + receptor. Tres formas, legible a 48 px."""
    s = size
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if with_bg:
        rounded(d, (0, 0, s - 1, s - 1), int(s * 0.235), BG)
    # campo
    m = s * 0.135
    box = (m, m, s - m, s - m)
    fw = box[2] - box[0]
    fh = box[3] - box[1]
    rounded(d, box, int(s * 0.075), FIELD)
    # bandas del césped
    band = fh / 4.0
    d.rectangle((box[0] + s * 0.05, box[1] + band, box[2] - s * 0.05, box[1] + band * 2), fill=FIELD2)
    d.rectangle((box[0] + s * 0.05, box[1] + band * 3, box[2] - s * 0.05, box[1] + band * 4), fill=FIELD2)
    # receptor abajo a la izquierda + ruta que sube y rompe a la derecha
    x0 = box[0] + fw * 0.30
    y0 = box[1] + fh * 0.80
    x1 = box[0] + fw * 0.30
    y1 = box[1] + fh * 0.44
    x2 = box[0] + fw * 0.74
    y2 = box[1] + fh * 0.26
    lw = max(2, int(round(s * 0.075)))
    d.line((x0, y0, x1, y1), fill=WHITE, width=lw, joint="curve")
    d.line((x1, y1, x2, y2), fill=WHITE, width=lw, joint="curve")
    # punta de flecha
    ang = math.atan2(y2 - y1, x2 - x1)
    a1, a2 = ang + math.radians(148), ang - math.radians(148)
    ah = s * 0.15
    d.polygon(
        [
            (x2, y2),
            (x2 + math.cos(a1) * ah, y2 + math.sin(a1) * ah),
            (x2 + math.cos(a2) * ah, y2 + math.sin(a2) * ah),
        ],
        fill=WHITE,
    )
    # jugador (círculo blanco con punto lima)
    r = s * 0.105
    d.ellipse((x0 - r, y0 - r, x0 + r, y0 + r), fill=WHITE)
    r2 = r * 0.42
    d.ellipse((x0 - r2, y0 - r2, x0 + r2, y0 + r2), fill=LIME)
    if scale != 1.0:
        img = img.resize((int(s * scale), int(s * scale)), Image.LANCZOS)
    return img


def draw_foreground(size):
    """Primer plano del icono adaptativo: el dibujo centrado al 66 % (zona segura)."""
    inner = int(size * 0.64)
    mark = draw_mark(inner, with_bg=False)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    off = (size - inner) // 2
    img.paste(mark, (off, off), mark)
    return img


DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

for dpi, mult in DENSITIES.items():
    folder = f"{OUT}/mipmap-{dpi}"
    os.makedirs(folder, exist_ok=True)
    draw_mark(int(48 * mult)).save(f"{folder}/ic_launcher.png")
    draw_mark(int(48 * mult), with_bg=True).save(f"{folder}/ic_launcher_round.png")
    draw_foreground(int(108 * mult)).save(f"{folder}/ic_launcher_foreground.png")

# iconos para la web (PWA)
draw_mark(192).save(f"{WEB}/icon-192.png")
draw_mark(512).save(f"{WEB}/icon-512.png")
draw_mark(512, with_bg=False).save(f"{WEB}/icon-maskable-512.png")
draw_mark(180).save(f"{WEB}/apple-touch-icon.png")

# vista previa para revisión
draw_mark(512).save("qa/out/icon-preview.png") if os.path.isdir("qa/out") else None
print("iconos generados en", OUT, "y", WEB)
