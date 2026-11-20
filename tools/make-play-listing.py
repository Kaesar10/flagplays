"""Prepara los textos de la ficha de Google Play con los contadores comprobados.

Genera store/ficha-play.txt (para copiar y pegar) y comprueba los límites.
Uso: python tools/make-play-listing.py
"""
import os
import textwrap

BREVE = "Pizarra de jugadas de flag football: dibuja, anima y exporta tu playbook."

COMPLETA = """FlagPlays es la libreta y la pizarra de jugadas de tu equipo de flag football, pensada para entrenadores y jugadores de 5 contra 5 y 7 contra 7.

DIBUJA TUS JUGADAS
Arrastra a los jugadores, traza las rutas punto a punto, coloca la defensa y guarda la jugada en tu libreta. Cada jugador puede tener su color y su forma, y el campo se adapta a 5v5 o 7v7.

ANIMA Y SIMULA
Reproduce la jugada con el balón en movimiento, a la velocidad que quieras. El simulador te dice si la jugada es completa, incompleta o interceptada, y el análisis te explica los motivos y compara lecturas.

CATÁLOGO DE JUGADAS
Más de 100 jugadas listas para usar, filtradas por tipo (pase o carrera), distancia, zona que atacan, formación, situación (campo o zona roja) y contra qué defensa funcionan. Puedes añadirlas a tu libreta y editarlas a tu gusto.

ÁRBOL DE RUTAS
Monta el árbol de rutas del equipo, reordena los nodos arrastrando, cambia la jerarquía y edita cada ruta sobre el propio diagrama. Se exporta a PDF.

MUÑEQUERAS Y HOJAS DE JUGADAS
Genera muñequeras con el tamaño exacto que necesites, en centímetros, eligiendo columnas y filas. Cada celda lleva su jugada, escalada al tamaño de la celda. También hojas de jugadas, tarjetas de bolsillo y call sheet del entrenador, todo imprimible o en PDF.

SIN CONEXIÓN Y SIN CUENTAS
No hay registro, no hay publicidad y no se envía nada a ningún servidor: tus jugadas se quedan en tu dispositivo. La aplicación funciona íntegramente sin conexión a internet.

La misma aplicación está disponible también para Windows."""

NOTAS = """Primera versión: editor de jugadas, animación y simulador, catálogo de 104
jugadas, árbol de rutas y muñequeras configurables en centímetros."""

CONTACTO = "kaesar10@gmail.com"
WEB = "https://kaesar10.github.io/flagplays/"
PRIVACIDAD = "https://kaesar10.github.io/flagplays/privacidad.html"

VISUALES = [
    ("Icono de la app", "store/icono-512.png", "512 x 512 px, PNG 32 bits, sin transparencia"),
    ("Gráfico destacado", "store/grafico-destacado-1024x500.png", "1024 x 500 px, PNG o JPG"),
    ("Captura de teléfono 1", "store/captura-1-editor.png", "1080 x 1920 px, ratio 9:16"),
    ("Captura de teléfono 2", "store/captura-2-animacion.png", "1080 x 1920 px, ratio 9:16"),
]


def main():
    errores = []
    if len(BREVE) > 80:
        errores.append(f"Descripción breve: {len(BREVE)} caracteres (máximo 80)")
    if len(COMPLETA) > 4000:
        errores.append(f"Descripción completa: {len(COMPLETA)} caracteres (máximo 4000)")
    if len(NOTAS) > 500:
        errores.append(f"Notas de la versión: {len(NOTAS)} caracteres (máximo 500)")

    lineas = []
    lineas.append("FICHA DE GOOGLE PLAY · FlagPlays")
    lineas.append("=" * 60)
    lineas.append("")
    lineas.append(f"NOMBRE DE LA APLICACIÓN ({len('FlagPlays')}/30)")
    lineas.append("-" * 60)
    lineas.append("FlagPlays")
    lineas.append("")
    lineas.append(f"DESCRIPCIÓN BREVE ({len(BREVE)}/80)")
    lineas.append("-" * 60)
    lineas.append(BREVE)
    lineas.append("")
    lineas.append(f"DESCRIPCIÓN COMPLETA ({len(COMPLETA)}/4000)")
    lineas.append("-" * 60)
    lineas.append(COMPLETA)
    lineas.append("")
    lineas.append("RECURSOS VISUALES")
    lineas.append("-" * 60)
    for nombre, ruta, spec in VISUALES:
        lineas.append(f"{nombre}: {ruta}  ({spec})")
    lineas.append("")
    lineas.append("DATOS DE LA FICHA")
    lineas.append("-" * 60)
    lineas.append("Categoría: Deportes")
    lineas.append("Etiquetas: flag football, deportes, entrenador, playbook")
    lineas.append(f"Correo de contacto: {CONTACTO}")
    lineas.append(f"Sitio web: {WEB}")
    lineas.append(f"Política de privacidad: {PRIVACIDAD}")
    lineas.append("")
    lineas.append(f"NOTAS DE LA VERSIÓN ({len(NOTAS)}/500)")
    lineas.append("-" * 60)
    lineas.append(NOTAS)
    lineas.append("")
    lineas.append("RESPUESTAS A LOS FORMULARIOS")
    lineas.append("-" * 60)
    lineas.append("Seguridad de los datos: no se recopilan ni comparten datos de usuario.")
    lineas.append("Clasificación de contenido: Deportes/Utilidades, sin violencia ni contenido sensible.")
    lineas.append("Público objetivo: 13 años o más (herramienta para entrenadores).")
    lineas.append("Anuncios: no contiene anuncios.")
    lineas.append("Compras dentro de la app: no.")
    lineas.append("Acceso: todas las funciones disponibles sin iniciar sesión.")
    lineas.append("")

    os.makedirs("store", exist_ok=True)
    salida = os.path.join("store", "ficha-play.txt")
    with open(salida, "w", encoding="utf-8") as f:
        f.write("\n".join(lineas))
    print(f"escrito {salida}")
    print(f"  breve: {len(BREVE)}/80 · completa: {len(COMPLETA)}/4000 · notas: {len(NOTAS)}/500")
    if errores:
        print("PROBLEMAS:")
        for e in errores:
            print(" -", e)
    else:
        print("todos los límites están dentro de lo permitido")


if __name__ == "__main__":
    main()
