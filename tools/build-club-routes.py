# Convierte lo extraído de los PDFs en la librería de rutas del club para la app.
# Entrada: qa/club-extraido.json   Salida: src/club-routes.js
import json
import math
import os
from collections import Counter

ENTRADA = "qa/club-extraido.json"
SALIDA = "src/club-routes.js"

NOMBRES = {
    "vertical": ("Vertical / Go", "Profunda"),
    "in": ("In / Dig", "Media"),
    "out": ("Out / Salida", "Corta"),
    "plana": ("Plana / Flat", "Corta"),
    "post": ("Post", "Profunda"),
    "corner": ("Corner / Esquina", "Profunda"),
    "cruce": ("Cruce / Drag", "Corta"),
    "vuelta": ("Vuelta / Comeback", "Corta"),
    "quiebro": ("Quiebro", "Corta"),
    "out corta": ("Out corto", "Corta"),
    "recta": ("Recta", "Corta"),
}


def normalizar(puntos):
    """Redondea a 0,5 yd y quita puntos repetidos."""
    out = []
    for p in puntos:
        q = (round(p["x"] * 2) / 2, round(p["y"] * 2) / 2)
        if not out or out[-1] != q:
            out.append(q)
    return out


def firma(puntos):
    return tuple(puntos)


def profundidad(puntos):
    return max(p["y"] for p in puntos)


def main():
    with open(ENTRADA, encoding="utf-8") as f:
        jugadas = json.load(f)

    unicas = {}
    orden = []
    por_tipo = Counter()
    for jug in jugadas:
        for ruta in jug["rutas"]:
            pts = normalizar(ruta["puntos"])
            if len(pts) < 1:
                continue
            if profundidad(ruta["puntos"]) < 1.5:
                continue
            sig = firma(pts)
            if sig in unicas:
                unicas[sig]["usos"] += 1
                continue
            tipo = ruta["tipo"]
            unicas[sig] = {"tipo": tipo, "pts": pts, "usos": 1, "origen": jug["pdf"]}
            orden.append(sig)
            por_tipo[tipo] += 1

    # Nombres únicos y legibles
    contador = Counter()
    salida = []
    for i, sig in enumerate(orden):
        r = unicas[sig]
        base, categoria = NOMBRES.get(r["tipo"], ("Ruta", "Corta"))
        contador[base] += 1
        nombre = f"{base}" if contador[base] == 1 else f"{base} {contador[base]}"
        prof = round(max(p[1] for p in r["pts"]), 1)
        salida.append(
            {
                "id": f"club_{i + 1}",
                "name": nombre,
                "category": categoria,
                "desc": f"Extraída de «{r['origen']}» · {prof:g} yd de profundidad · vista {r['usos']} vez/veces",
                "points": [{"x": float(x), "y": float(y)} for x, y in r["pts"]],
                "source": r["origen"],
                "uses": r["usos"],
            }
        )

    print(f"rutas únicas: {len(salida)} (de {sum(por_tipo.values())} dibujadas)")
    print("por tipo:", dict(por_tipo.most_common()))

    # Fichero JS
    lineas = [
        "// Rutas del club extraídas de los playbooks PDF (vectoriales).",
        "// Generado por tools/extract-playbook.py + tools/build-club-routes.py:",
        "// no editar a mano. Cada ruta son deltas en yardas desde el receptor.",
        "",
        "export const CLUB_ROUTES = [",
    ]
    for r in salida:
        pts = ", ".join(f"{{ x: {p['x']:g}, y: {p['y']:g} }}" for p in r["points"])
        desc = r["desc"].replace('"', "'")
        lineas.append("  {")
        lineas.append(f'    id: "{r["id"]}",')
        lineas.append(f'    name: "{r["name"]}",')
        lineas.append(f'    category: "{r["category"]}",')
        lineas.append(f'    desc: "{desc}",')
        lineas.append(f"    points: [{pts}],")
        lineas.append(f'    source: "{r["source"]}",')
        lineas.append("  },")
    lineas.append("];")
    lineas.append("")
    lineas.append("/** Rutas del club agrupadas por categoría (para la rejilla del editor). */")
    lineas.append("export function clubRoutesByCategory() {")
    lineas.append("  const out = {};")
    lineas.append("  for (const r of CLUB_ROUTES) (out[r.category] ||= []).push(r);")
    lineas.append("  return out;")
    lineas.append("}")
    lineas.append("")
    with open(SALIDA, "w", encoding="utf-8") as f:
        f.write("\n".join(lineas))
    print("escrito", SALIDA, os.path.getsize(SALIDA), "bytes")


if __name__ == "__main__":
    main()
