"""Genera el material gráfico que pide Google Play: icono 512, gráfico destacado
1024x500 y las capturas de móvil recortadas a 9:16.

Salida en store/. Uso: python tools/make-store-assets.py
"""
import os
import runpy
from PIL import Image, ImageDraw, ImageFont

OUT = "store"
os.makedirs(OUT, exist_ok=True)

# Reutiliza el dibujo del icono de la app.
G = runpy.run_path("tools/make-icons.py")
draw_mark = G["draw_mark"]
BG = G["BG"]
LIME = G["LIME"]
WHITE = G["WHITE"]
FIELD = G["FIELD"]
LINE = G["LINE"]

# --- 1. Icono 512x512 ------------------------------------------------------
icon = draw_mark(512, with_bg=True)
icon.save(os.path.join(OUT, "icono-512.png"))
print("icono-512.png")

# --- 2. Gráfico destacado 1024x500 ----------------------------------------
W, H = 1024, 500
fg = Image.new("RGB", (W, H), BG[:3])
d = ImageDraw.Draw(fg)

# césped de fondo con bandas
turf = (21, 68, 41)
turf2 = (18, 60, 36)
d.rectangle((0, 0, W, H), fill=turf)
for i in range(0, H, 56):
    if (i // 56) % 2 == 0:
        d.rectangle((0, i, W, i + 56), fill=turf2)
# líneas de campo
for x in range(0, W, 88):
    d.line((x, 0, x, H), fill=(30, 86, 54), width=2)
for y in range(40, H, 78):
    d.line((0, y, W, y), fill=(30, 86, 54), width=2)
# degradado oscuro a la izquierda para el texto
grad = Image.new("L", (1, H))
for y in range(H):
    grad.putpixel((0, y), 235)
grad = grad.resize((int(W * 0.62), H))
oscuro = Image.new("RGB", (int(W * 0.62), H), BG[:3])
fg.paste(oscuro, (0, 0), grad)

# icono a la izquierda
ic = draw_mark(200, with_bg=True)
fg.paste(ic, (56, 150), ic)

# textos
def fuente(tam, bold=True):
    for ruta in [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]:
        try:
            return ImageFont.truetype(ruta, tam)
        except Exception:
            continue
    return ImageFont.load_default()


d = ImageDraw.Draw(fg)
d.text((292, 148), "FlagPlays", font=fuente(76), fill=WHITE)
d.text((294, 240), "Pizarra y libreta de jugadas", font=fuente(34, False), fill=(210, 235, 220))
d.text((294, 288), "de flag football", font=fuente(34, False), fill=(210, 235, 220))
# píldora
d.rounded_rectangle((294, 348, 610, 400), radius=26, fill=LIME)
d.text((318, 361), "Sin conexión · Gratis", font=fuente(26, True), fill=(11, 17, 22))
fg.save(os.path.join(OUT, "grafico-destacado-1024x500.png"))
print("grafico-destacado-1024x500.png")

# --- 3. Capturas de móvil a 9:16 ------------------------------------------
# Play pide 2-8 capturas; el móvil admite como mucho 9:16.
def a_916(origen, destino, objetivo=(1080, 1920)):
    try:
        im = Image.open(origen).convert("RGB")
    except Exception as e:
        print("  (no se pudo abrir", origen, ")", e)
        return
    tw, th = objetivo
    # recorte centrado a la proporción 9:16 y escalado
    w, h = im.size
    if w / h > tw / th:
        nueva_w = int(h * tw / th)
        im = im.crop(((w - nueva_w) // 2, 0, (w + nueva_w) // 2, h))
    else:
        nueva_h = int(w * th / tw)
        im = im.crop((0, 0, w, min(h, nueva_h)))
    im = im.resize(objetivo, Image.LANCZOS)
    im.save(destino, quality=92)
    print(" ", os.path.basename(destino))


CAPTURAS = [
    ("qa/movil-instalado.png", "captura-1-editor.png"),
    ("qa/movil-2.png", "captura-2-animacion.png"),
]
for origen, destino in CAPTURAS:
    if os.path.exists(origen):
        a_916(origen, os.path.join(OUT, destino))
print("capturas listas")
