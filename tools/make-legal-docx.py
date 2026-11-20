"""Crea el documento de textos legales para Google Drive (y una copia en docs/).

Lee docs/legal.json (generado por tools/build-legal-docs.mjs) y escribe un .docx
con portada, índice y cada documento con su título. Lo deja en la carpeta de
Google Drive del titular (si está sincronizada) y en docs/.

Uso: python tools/make-legal-docx.py
"""
import json
import os
import sys

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, RGBColor, Cm

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(ROOT, "docs", "legal.json")
COPIA = os.path.join(ROOT, "docs", "FlagPlays - Textos legales.docx")

# Carpeta de Google Drive del titular (se sincroniza sola).
DESTINOS = [
    r"G:\Mi unidad\Flag\26-27\Playboook",
    r"G:\Mi unidad\Flag",
    r"G:\Mi unidad",
]

VERDE = RGBColor(0x1B, 0x5E, 0x20)
GRIS = RGBColor(0x55, 0x5F, 0x5A)


def estilos(doc):
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(11)
    normal.paragraph_format.space_after = Pt(6)
    for nivel, tam in ((1, 18), (2, 13), (3, 11)):
        st = doc.styles[f"Heading {nivel}"]
        st.font.name = "Calibri"
        st.font.size = Pt(tam)
        st.font.color.rgb = VERDE if nivel == 1 else GRIS
        st.font.bold = True


def parrafo(doc, texto, negrita=False, cursiva=False, gris=False, tam=None):
    p = doc.add_paragraph()
    run = p.add_run(texto)
    run.bold = negrita
    run.italic = cursiva
    if gris:
        run.font.color.rgb = GRIS
    if tam:
        run.font.size = Pt(tam)
    return p


def main():
    if not os.path.exists(DATOS):
        print("Falta docs/legal.json. Ejecuta: node tools/build-legal-docs.mjs")
        return 1
    data = json.load(open(DATOS, encoding="utf-8"))
    titular = data["titular"]

    doc = Document()
    estilos(doc)
    sec = doc.sections[0]
    sec.left_margin = sec.right_margin = Cm(2.4)
    sec.top_margin = sec.bottom_margin = Cm(2.2)

    # --- portada ---
    for _ in range(6):
        doc.add_paragraph()
    t = doc.add_paragraph()
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = t.add_run("FlagPlays")
    r.bold = True
    r.font.size = Pt(34)
    r.font.color.rgb = VERDE
    s = doc.add_paragraph()
    s.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r2 = s.add_run("Textos legales")
    r2.font.size = Pt(20)
    r2.font.color.rgb = GRIS
    doc.add_paragraph()
    info = doc.add_paragraph()
    info.alignment = WD_ALIGN_PARAGRAPH.CENTER
    info.add_run(
        f"Titular: {titular['name']}\n"
        f"Contacto: {titular['email']}\n"
        f"Web: {titular['web']}\n"
        f"Actualizado el {data['updated']}"
    ).font.size = Pt(11)
    doc.add_page_break()

    # --- índice ---
    doc.add_heading("Contenido", level=1)
    for i, d in enumerate(data["docs"], 1):
        parrafo(doc, f"{i}. {d['title']}", negrita=True)
        parrafo(doc, d["summary"], gris=True, cursiva=True, tam=10)
    doc.add_page_break()

    # --- documentos ---
    for i, d in enumerate(data["docs"], 1):
        doc.add_heading(f"{i}. {d['title']}", level=1)
        parrafo(doc, d["summary"], gris=True, cursiva=True, tam=10)
        for linea in d["text"].split("\n"):
            limpio = linea.strip()
            if not limpio or limpio.startswith(d["title"]) or limpio.startswith("Actualizado:"):
                continue
            if limpio.startswith("- "):
                parrafo(doc, "• " + limpio[2:])
            elif limpio.startswith("[") and limpio.endswith("]"):
                parrafo(doc, limpio[1:-1], cursiva=True, gris=True)
            elif len(limpio) < 70 and not limpio.endswith(".") and limpio[0].isdigit():
                doc.add_heading(limpio, level=2)
            else:
                parrafo(doc, limpio)
        if i < len(data["docs"]):
            doc.add_page_break()

    # --- pie ---
    doc.add_paragraph()
    parrafo(
        doc,
        "Documento generado desde la app FlagPlays (src/legal-texts.js). Los mismos textos "
        f"están publicados en {titular['web']} y dentro de la aplicación.",
        gris=True,
        cursiva=True,
        tam=9,
    )

    doc.save(COPIA)
    print("escrito:", COPIA)
    for destino in DESTINOS:
        if os.path.isdir(destino):
            ruta = os.path.join(destino, "FlagPlays - Textos legales.docx")
            try:
                doc.save(ruta)
                print("en Drive:", ruta)
            except Exception as e:
                print("  no se pudo escribir en", destino, "-", e)
            break
    return 0


if __name__ == "__main__":
    sys.exit(main())
