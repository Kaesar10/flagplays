# Extrae jugadas (jugadores + rutas) de los playbooks PDF vectoriales del club.
# Uso: python tools/extract-playbook.py
# Genera: src/club-content.js  (rutas y jugadas del club para la app)
#
# Cómo funciona el PDF del club:
#   - campo y rejilla: líneas gruesas (width >= 0.3)
#   - rutas: líneas finas (width < 0.3)
#   - flechas: triángulos rellenos sin ancho
#   - jugadores: puntos rellenos de color (verde X, rojo Y, amarillo C, azul Z, negro QB)
import json
import math
import os
import sys

import pymupdf as fitz

FIELD_WIDTH_YD = 30.0  # ancho de campo de la app
FIELD_DEPTH_YD = 24.0  # profundidad de campo de la app

# Color RGB (0-1) -> etiqueta del jugador según el playbook del club.
COLOR_LABELS = [
    ((0.35, 0.75, 0.35), "X"),  # verde
    ((0.85, 0.15, 0.15), "Y"),  # rojo
    ((0.95, 0.8, 0.1), "C"),  # amarillo
    ((0.2, 0.6, 0.95), "Z"),  # azul
    ((0.1, 0.1, 0.1), "QB"),  # negro
]
COLOR_TOL = 0.22


def es_color(rgb):
    return isinstance(rgb, (tuple, list)) and len(rgb) == 3


def label_de_color(rgb):
    if not es_color(rgb):
        return None
    mejor, dist = None, 9
    for ref, label in COLOR_LABELS:
        d = sum((a - b) ** 2 for a, b in zip(rgb, ref)) ** 0.5
        if d < dist:
            dist, mejor = d, label
    return mejor if dist <= COLOR_TOL * 2 else None


def items_de(pagina):
    """Devuelve líneas finas, líneas de campo, flechas y puntos de color."""
    finas, campo, flechas, puntos = [], [], [], []
    for dr in pagina.get_drawings():
        w = dr.get("width") or 0
        col = dr.get("color")
        fill = dr.get("fill")
        bb = dr["rect"]
        for it in dr.get("items", []):
            if it[0] == "l":
                a, b = it[1], it[2]
                seg = (a.x, a.y, b.x, b.y)
                if w >= 0.3:
                    campo.append(seg)
                elif w > 0:
                    finas.append(seg)
                else:
                    flechas.append(seg)
            elif it[0] == "c":
                pts = [p for p in it[1:5] if hasattr(p, "x")]
                if not pts:
                    continue
                xs = [p.x for p in pts]
                ys = [p.y for p in pts]
                ww, hh = max(xs) - min(xs), max(ys) - min(ys)
                etiqueta = label_de_color(fill) or label_de_color(col)
                # Los puntos del club son círculos de 4 arcos de 2x2 px.
                if etiqueta and ww <= 9 and hh <= 9:
                    puntos.append(
                        {"x": (min(xs) + max(xs)) / 2, "y": (min(ys) + max(ys)) / 2, "label": etiqueta}
                    )
    # Cada círculo llega como 4 arcos: se agrupan por cercanía y se promedia.
    grupos = []
    for punto in puntos:
        for g in grupos:
            if math.hypot(punto["x"] - g["x"] / g["n"], punto["y"] - g["y"] / g["n"]) < 5.0:
                g["x"] += punto["x"]
                g["y"] += punto["y"]
                g["n"] += 1
                if punto["label"] == "QB":
                    g["qb"] = True
                break
        else:
            grupos.append({"x": punto["x"], "y": punto["y"], "n": 1, "label": punto["label"], "qb": punto["label"] == "QB"})
    unicos = []
    for g in grupos:
        etiqueta = "QB" if g["qb"] and g["n"] else g["label"]
        unicos.append({"x": g["x"] / g["n"], "y": g["y"] / g["n"], "label": etiqueta})
    return finas, campo, flechas, unicos


def celdas_de_campo(campo):
    """Detecta los mini-campos: parejas de verticales separadas ~64 px."""
    vx = sorted({round(s[0], 1) for s in campo if abs(s[0] - s[2]) < 0.6})
    celdas = []
    for i in range(len(vx) - 1):
        ancho = vx[i + 1] - vx[i]
        if 50 <= ancho <= 80:
            celdas.append((vx[i], vx[i + 1]))
    return celdas


def agrupar_por_rejilla(puntos, campo):
    """Agrupa los puntos en jugadas usando la rejilla de mini-campos del PDF."""
    celdas = celdas_de_campo(campo)
    if not celdas:
        return []
    centros = [((a + b) / 2, a, b) for a, b in celdas]
    # Filas: agrupar por altura con un umbral amplio (las jugadas de una fila
    # comparten la línea de scrimmage).
    ys = sorted({round(p["y"], 1) for p in puntos})
    filas = []
    for y in ys:
        if filas and y - filas[-1][-1] <= 40:
            filas[-1].append(y)
        else:
            filas.append([y])
    grupos = []
    for fila in filas:
        y_min, y_max = min(fila) - 25, max(fila) + 25
        en_fila = [p for p in puntos if y_min <= p["y"] <= y_max]
        for cx, izq, der in centros:
            del_campo = [p for p in en_fila if izq - 6 <= p["x"] <= der + 6]
            if len(del_campo) >= 3:
                grupos.append({"puntos": del_campo, "x0": izq, "x1": der, "y": max(q["y"] for q in del_campo)})
    return grupos


def cadenas(segmentos, tolerancia=1.6):
    """Une segmentos sueltos en polilíneas (rutas)."""
    segs = list(segmentos)
    usados = [False] * len(segs)
    polis = []
    for i, s in enumerate(segs):
        if usados[i]:
            continue
        usados[i] = True
        cadena = [(s[0], s[1]), (s[2], s[3])]
        creció = True
        while creció:
            creció = False
            for j, t in enumerate(segs):
                if usados[j]:
                    continue
                for punta, extremo in ((0, (t[0], t[1])), (0, (t[2], t[3])), (-1, (t[0], t[1])), (-1, (t[2], t[3]))):
                    dx = cadena[punta][0] - extremo[0]
                    dy = cadena[punta][1] - extremo[1]
                    if math.hypot(dx, dy) <= tolerancia:
                        otro = (t[2], t[3]) if extremo == (t[0], t[1]) else (t[0], t[1])
                        if punta == 0:
                            cadena.insert(0, otro)
                        else:
                            cadena.append(otro)
                        usados[j] = True
                        creció = True
                        break
                if usados[j]:
                    break
        if len(cadena) >= 2:
            polis.append(cadena)
    return polis


def longitud(poli):
    total = 0
    for a, b in zip(poli, poli[1:]):
        total += math.hypot(b[0] - a[0], b[1] - a[1])
    return total


def recta(poli, tol=0.6):
    """¿La polilínea es recta? Devuelve el ángulo si lo es."""
    a, b = poli[0], poli[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy)
    if L < 1:
        return None
    for p in poli[1:-1]:
        # distancia del punto a la recta
        dist = abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L
        if dist > tol:
            return None
    return math.degrees(math.atan2(dy, dx))


def clasificar(poli_yd):
    """Pone nombre a una ruta a partir de su forma (yardas, deltas)."""
    if len(poli_yd) < 2:
        return None
    recta_ang = recta([(p["x"], p["y"]) for p in poli_yd])
    total = longitud([(p["x"], p["y"]) for p in poli_yd])
    if total < 1.5:
        return None
    if recta_ang is not None:
        ang = recta_ang
        if -100 <= ang <= -80:
            return "vertical"
        if 30 < ang < 150:
            return "in"
        if -150 < ang < -30:
            return "out"
        if abs(ang) < 30:
            return "plana"
        return "recta"
    # Con quiebro: se mira el tramo principal y el último.
    x0, y0 = poli_yd[0]["x"], poli_yd[0]["y"]
    x1, y1 = poli_yd[-1]["x"], poli_yd[-1]["y"]
    prof = max(p["y"] for p in poli_yd)
    if prof >= 18:
        return "post" if x1 > x0 else "corner"
    if prof >= 9:
        if x1 > x0 + 3:
            return "in"
        if x1 < x0 - 3:
            return "out"
        return "vuelta"
    if x1 > x0 + 3:
        return "cruce"
    if x1 < x0 - 3:
        return "out corta"
    return "quiebro"


def procesar_pdf(ruta, nombre):
    doc = fitz.open(ruta)
    salida = []
    for num_pag, pagina in enumerate(doc):
        finas, campo, flechas, puntos = items_de(pagina)
        if len(puntos) < 4:
            continue
        grupos = agrupar_por_rejilla(puntos, campo)
        textos = []
        for bl in pagina.get_text("dict")["blocks"]:
            for ln in bl.get("lines", []):
                for sp in ln.get("spans", []):
                    if sp["text"].strip():
                        textos.append({"texto": sp["text"].strip(), "x": (sp["bbox"][0] + sp["bbox"][2]) / 2, "y": sp["bbox"][3]})
        for grupo in grupos:
            g = grupo["puntos"]
            if len(g) < 3:
                continue
            izq, der = grupo["x0"], grupo["x1"]
            xs = [p["x"] for p in g]
            ys = [p["y"] for p in g]
            x0, x1, y1 = min(xs), max(xs), max(ys)
            y0 = min(ys)
            ancho_px = der - izq
            if ancho_px < 20:
                continue
            px_yd = ancho_px / FIELD_WIDTH_YD
            # La línea de scrimmage se estima con la mediana de las alturas de
            # los jugadores (todos están en la línea).
            alturas = sorted(p["y"] for p in g)
            los_y = alturas[len(alturas) // 2]
            centro_x = (izq + der) / 2
            # Rutas dentro del recuadro del dibujo.
            del_grupo = [
                s
                for s in finas
                if izq - 3 <= min(s[0], s[2]) and max(s[0], s[2]) <= der + 3
                and los_y - 105 <= min(s[1], s[3]) and max(s[1], s[3]) <= los_y + 6
            ]
            polis = cadenas(del_grupo)
            g = [p for p in g if p["label"] != "QB"] or g
            rutas = []
            for poli in polis:
                L = longitud(poli)
                if L < 6:  # ruido (marcas cortas)
                    continue
                # jugador más cercano al inicio de la ruta
                inicio = poli[0]
                jugador = min(g, key=lambda p: math.hypot(p["x"] - inicio[0], p["y"] - inicio[1]))
                dist = math.hypot(jugador["x"] - inicio[0], jugador["y"] - inicio[1])
                if dist > 14:
                    continue
                puntos_yd = [
                    {
                        "x": round((p[0] - jugador["x"]) / px_yd, 1),
                        "y": round((jugador["y"] - p[1]) / px_yd, 1),
                    }
                    for p in poli
                ]
                # quitar primer punto si es el propio jugador
                if abs(puntos_yd[0]["x"]) < 0.6 and abs(puntos_yd[0]["y"]) < 0.6:
                    puntos_yd = puntos_yd[1:]
                if len(puntos_yd) < 1:
                    continue
                tipo = clasificar(puntos_yd)
                if not tipo:
                    continue
                rutas.append({"label": jugador["label"], "tipo": tipo, "puntos": puntos_yd})
            if len(rutas) < 2:
                continue
            dentro = []
            qbs = []
            for p in g:
                x_yd = (p["x"] - centro_x) / px_yd
                y_yd = (los_y - p["y"]) / px_yd
                if p["label"] == "QB":
                    qbs.append((abs(y_yd), x_yd, y_yd))
                    continue
                dentro.append({"label": p["label"], "x": round(x_yd, 1), "y": round(y_yd, 1)})
            if qbs:
                _, qx, qy = min(qbs)
                dentro.append({"label": "QB", "x": round(qx, 1), "y": round(qy, 1)})
            # sin repetidos de la misma etiqueta
            vistos = set()
            jugadores = []
            for p in dentro:
                if p["label"] in vistos:
                    continue
                vistos.add(p["label"])
                jugadores.append(p)
            # Nombre: el texto más cercano por encima del dibujo.
            titulo = None
            mejor_d = 1e9
            for t in textos:
                if abs(t["x"] - centro_x) < ancho_px * 0.9 and los_y - 130 <= t["y"] <= y0 - 4:
                    d = abs(t["y"] - (y0 - 10)) + abs(t["x"] - centro_x) * 0.4
                    if d < mejor_d:
                        mejor_d, titulo = d, t["texto"]
            salida.append(
                {
                    "pdf": nombre,
                    "pagina": num_pag + 1,
                    "titulo": titulo,
                    "jugadores": jugadores,
                    "rutas": rutas,
                }
            )
    doc.close()
    return salida


def main():
    import glob

    # Carpeta con los playbooks PDF del club. Se puede indicar por argumento.
    base = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("PLAYBOOKS_DIR", ".")
    candidatos = []
    for patron in ["**/Playbook Beach.pdf", "**/Playbook 21 Noviembre.pdf", "**/Playbook 2 de abril.pdf",
                   "**/01 Playbook Harriers 2023-24 Liga-1.pdf", "**/Playbook copa final 2025.pdf",
                   "**/Playbook año pasado.pdf"]:
        candidatos += glob.glob(os.path.join(base, patron), recursive=True)
    visto, todos = set(), []
    for ruta in candidatos:
        if ruta in visto:
            continue
        visto.add(ruta)
        nombre = os.path.splitext(os.path.basename(ruta))[0]
        try:
            jugadas = procesar_pdf(ruta, nombre)
        except Exception as e:
            print(f"  ERROR {nombre}: {e}")
            continue
        print(f"{nombre}: {len(jugadas)} jugadas, {sum(len(j['rutas']) for j in jugadas)} rutas")
        todos += jugadas
    print(f"\nTOTAL: {len(todos)} jugadas, {sum(len(j['rutas']) for j in todos)} rutas")
    with open("qa/club-extraido.json", "w", encoding="utf-8") as f:
        json.dump(todos, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
