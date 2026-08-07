import os
import io
import logging
import textwrap
import qrcode
from datetime import datetime
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader

logger = logging.getLogger(__name__)

# ── Ruta robusta al logo ──────────────────────────────────────────────
_CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
_APP_DIR = os.path.dirname(_CURRENT_DIR)
_PROJECT_DIR = os.path.dirname(_APP_DIR)

LOGO_PATH = os.path.join(_PROJECT_DIR, "static", "Logo.png")

# Verde / rojo / ámbar de los veredictos
_COLOR_OK = (0, 0.5, 0)
_COLOR_NG = (0.8, 0, 0)
_COLOR_CUARENTENA = (0.85, 0.55, 0)


def _color_resultado(resultado: str):
    r = (resultado or "").upper()
    if r == "APROBADO":
        return _COLOR_OK
    if r == "CUARENTENA":
        return _COLOR_CUARENTENA
    return _COLOR_NG


def _fecha_legible(valor) -> str:
    """Acepta datetime, ISO string o None."""
    if isinstance(valor, datetime):
        return valor.strftime("%Y-%m-%d %H:%M")
    if not valor:
        return "N/A"
    return str(valor)[:16].replace("T", " ")


def generar_pdf_inspeccion(data: dict) -> io.BytesIO:
    """Genera PDF de reporte de inspección de calidad."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    w, h = letter

    tipo = data.get("tipo_inspeccion", "QC")
    resultado = data.get("resultado_final", "INDETERMINADO").upper()
    lote_id = data.get("lote_id", "N/A")
    sku = data.get("sku_producto", "N/A")

    # ── Logo arriba a la izquierda ────────────────────────────────────
    if os.path.exists(LOGO_PATH):
        c.drawImage(LOGO_PATH, 0.75 * inch, h - 1.5 * inch,
                     width=1.5 * inch, height=1.2 * inch,
                     preserveAspectRatio=True, mask="auto")

    # ── Título centrado, debajo del logo ──────────────────────────────
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(w / 2, h - 2 * inch,
                        f"Reporte de Inspección de Calidad ({tipo})")

    # ── Info producto / origen ────────────────────────────────────────
    y = h - 2.75 * inch
    c.setFont("Helvetica-Bold", 12)
    c.drawString(inch, y, "Información del Producto")
    c.drawString(w / 2, y, "Información de Origen")
    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.line(inch, y - 0.1 * inch, w - inch, y - 0.1 * inch)

    c.setFont("Helvetica", 11)
    y -= 0.35 * inch
    c.drawString(inch, y, f"Lote: {lote_id}")
    origen = data.get("oc_origen") or data.get("op_origen", "N/A")
    c.drawString(w / 2, y, f"Origen (OC/OP): {origen}")

    y -= 0.25 * inch
    c.drawString(inch, y, f"SKU: {sku}")
    fecha = data.get("fecha")
    if isinstance(fecha, datetime):
        fecha = fecha.strftime("%Y-%m-%d %H:%M")
    c.drawString(w / 2, y, f"Fecha: {fecha or 'N/A'}")

    y -= 0.25 * inch
    c.drawString(inch, y, f"Nombre: {data.get('nombre_producto', 'N/A')}")

    y -= 0.25 * inch
    c.drawString(inch, y, f"Cantidad: {data.get('cantidad_inspeccionada', 0)}")
    c.drawString(w / 2, y, f"Inspector: {data.get('inspector', 'N/A')}")

    # Salto de página cuando el cursor se acerca al pie
    def salto_si_hace_falta(y_actual: float, minimo: float = 2.0 * inch) -> float:
        if y_actual < minimo:
            c.showPage()
            return h - inch
        return y_actual

    def encabezado_seccion(y_actual: float, titulo: str) -> float:
        y_actual = salto_si_hace_falta(y_actual, 2.5 * inch)
        c.setFont("Helvetica-Bold", 12)
        c.setFillColorRGB(0, 0, 0)
        c.drawString(inch, y_actual, titulo)
        c.setStrokeColorRGB(0.8, 0.8, 0.8)
        c.line(inch, y_actual - 0.1 * inch, w - inch, y_actual - 0.1 * inch)
        return y_actual - 0.35 * inch

    # ── Evaluación (preguntas del inspector) ──────────────────────────
    respuestas = data.get("respuestas") or []
    if respuestas:
        y = encabezado_seccion(y - 0.75 * inch, "Evaluación")

        for r in respuestas:
            pregunta = str(r.get("pregunta", ""))
            valor = str(r.get("respuesta", ""))
            conforme = valor.lower() in ("si", "sí")

            c.setFont("Helvetica", 10)
            c.setFillColorRGB(0, 0, 0)
            for linea in textwrap.wrap(pregunta, 78) or [""]:
                c.drawString(inch + 0.1 * inch, y, linea)
                y -= 0.2 * inch
                y = salto_si_hace_falta(y)

            c.setFont("Helvetica-Bold", 10)
            c.setFillColorRGB(*(_COLOR_OK if conforme else _COLOR_NG))
            c.drawString(inch + 0.3 * inch, y, "Sí" if conforme else "No")
            c.setFillColorRGB(0, 0, 0)
            y -= 0.22 * inch
            y = salto_si_hace_falta(y)

            motivo = (r.get("motivo") or "").strip()
            if motivo:
                c.setFont("Helvetica-Oblique", 9)
                for linea in textwrap.wrap(f"Motivo: {motivo}", 88):
                    c.drawString(inch + 0.3 * inch, y, linea)
                    y -= 0.18 * inch
                    y = salto_si_hace_falta(y)

            y -= 0.12 * inch
            y = salto_si_hace_falta(y)

    # ── Puntos de inspección (registros anteriores al cambio) ─────────
    puntos = data.get("resultados_puntos") or []
    if puntos:
        y = encabezado_seccion(y - (0.4 * inch if respuestas else 0.75 * inch),
                               "Resultados de la Inspección")

        c.setFont("Helvetica-Bold", 10)
        c.drawString(inch, y, "Punto de Inspección")
        c.drawString(4.5 * inch, y, "Especificación")
        c.drawString(w - 2 * inch, y, "Resultado")

        c.setFont("Helvetica", 10)
        y -= 0.25 * inch

        for punto in puntos:
            nombre_punto = punto.get("punto", "")
            especificacion = punto.get("especificacion", "")
            resultado_punto = punto.get("resultado", "")

            c.drawString(inch + 0.1 * inch, y, nombre_punto[:40])
            c.drawString(4.5 * inch, y, especificacion[:25])

            if resultado_punto.lower() == "conforme":
                c.setFillColorRGB(*_COLOR_OK)
            else:
                c.setFillColorRGB(*_COLOR_NG)
            c.drawString(w - 1.9 * inch, y, resultado_punto)
            c.setFillColorRGB(0, 0, 0)

            y -= 0.25 * inch
            if y < 2.5 * inch:
                c.showPage()
                y = h - inch
                c.setFont("Helvetica", 10)

    # ── Segunda revisión (solo si el lote pasó por cuarentena) ────────
    segunda = data.get("segunda_revision")
    if segunda:
        y = encabezado_seccion(y - 0.4 * inch, "Segunda Revisión")

        c.setFont("Helvetica", 10)
        c.setFillColorRGB(0, 0, 0)
        c.drawString(inch + 0.1 * inch, y,
                     f"Revisor: {segunda.get('revisor', 'N/A')}")
        c.drawString(w / 2, y, f"Fecha: {_fecha_legible(segunda.get('fecha'))}")
        y -= 0.22 * inch

        c.drawString(inch + 0.1 * inch, y, "¿Ahora están bien?")
        c.setFont("Helvetica-Bold", 10)
        ok = bool(segunda.get("ahora_ok"))
        c.setFillColorRGB(*(_COLOR_OK if ok else _COLOR_NG))
        c.drawString(inch + 2.0 * inch, y, "Sí" if ok else "No")
        c.setFillColorRGB(0, 0, 0)
        y -= 0.25 * inch
        y = salto_si_hace_falta(y)

        motivos_previos = [m for m in (segunda.get("motivos_previos") or []) if m]
        if motivos_previos:
            c.setFont("Helvetica-Bold", 9)
            c.drawString(inch + 0.1 * inch, y, "Motivos que originaron la cuarentena:")
            y -= 0.2 * inch
            c.setFont("Helvetica-Oblique", 9)
            for motivo in motivos_previos:
                for linea in textwrap.wrap(f"· {motivo}", 88):
                    c.drawString(inch + 0.3 * inch, y, linea)
                    y -= 0.18 * inch
                    y = salto_si_hace_falta(y)

        notas_segunda = (segunda.get("notas") or "").strip()
        if notas_segunda:
            c.setFont("Helvetica", 9)
            for linea in textwrap.wrap(f"Notas: {notas_segunda}", 88):
                c.drawString(inch + 0.1 * inch, y, linea)
                y -= 0.18 * inch
                y = salto_si_hace_falta(y)

    # ── Veredicto final (izquierda) ───────────────────────────────────
    y -= 0.5 * inch

    if y < 2 * inch:
        c.showPage()
        y = h - 1.5 * inch

    c.setFont("Helvetica-Bold", 16)
    c.setFillColorRGB(*_color_resultado(resultado))
    c.drawString(inch, y, f"Veredicto Final: {resultado}")
    c.setFillColorRGB(0, 0, 0)

    # ── Notas + QR al mismo nivel ─────────────────────────────────────
    notas = data.get("notas")
    notas_y = y - 0.5 * inch

    if notas_y < 1.5 * inch:
        c.showPage()
        notas_y = h - inch

    # Generar QR
    qr_img = qrcode.make(sku)
    qr_buf = io.BytesIO()
    qr_img.save(qr_buf, format="PNG")
    qr_buf.seek(0)

    qr_size = 1.3 * inch
    qr_x = w - inch - qr_size
    qr_y = notas_y - 0.5 * inch  # QR al nivel de las notas

    c.drawImage(ImageReader(qr_buf), qr_x, qr_y,
                width=qr_size, height=qr_size)

    # Notas a la izquierda, al mismo nivel que el QR
    if notas:
        c.setFont("Helvetica", 9)
        c.drawString(inch, qr_y + qr_size / 2, f"Notas: {notas}")

    # ── Evidencia fotográfica, una foto por página ────────────────────
    _dibujar_fotos(c, w, h, data.get("fotos") or [], lote_id)

    c.save()
    buf.seek(0)
    return buf


def _dibujar_fotos(c, w: float, h: float, rutas: list, lote_id: str) -> None:
    """Anexa las fotos de evidencia, una por página, ajustadas al marco."""
    marco_w = w - 2 * inch
    marco_h = h - 2.5 * inch

    for i, ruta in enumerate(rutas, start=1):
        try:
            imagen = ImageReader(ruta)
            img_w, img_h = imagen.getSize()
        except Exception as e:
            # Una foto ilegible no debe tumbar el reporte entero
            logger.warning("PDF inspección: no se pudo leer la foto %s (%s)", ruta, e)
            continue

        c.showPage()
        c.setFont("Helvetica-Bold", 12)
        c.setFillColorRGB(0, 0, 0)
        c.drawString(inch, h - inch,
                     f"Evidencia {i} de {len(rutas)} — Lote {lote_id}")

        escala = min(marco_w / img_w, marco_h / img_h)
        dib_w, dib_h = img_w * escala, img_h * escala
        c.drawImage(
            imagen,
            (w - dib_w) / 2,
            h - 1.4 * inch - dib_h,
            width=dib_w,
            height=dib_h,
            preserveAspectRatio=True,
            anchor="n",
        )


def generar_pdf_scrap(data: dict, items: list) -> io.BytesIO:
    """Genera PDF de reporte de scrap."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    w, h = letter

    # ── Logo arriba a la izquierda ────────────────────────────────────
    if os.path.exists(LOGO_PATH):
        c.drawImage(LOGO_PATH, 0.75 * inch, h - 1.5 * inch,
                     width=1.5 * inch, height=1.2 * inch,
                     preserveAspectRatio=True, mask="auto")

    # Encabezado a la derecha del logo
    c.setFont("Helvetica-Bold", 16)
    c.drawString(3 * inch, h - inch, "Reporte de Scrap")

    c.setFont("Helvetica", 11)
    c.drawString(3 * inch, h - 1.3 * inch,
                 f"Fecha: {data.get('fecha', datetime.now().strftime('%Y-%m-%d'))}")
    c.drawString(3 * inch, h - 1.5 * inch,
                 f"Filtro SKU: {data.get('sku_filtro', 'Todos')}")
    c.drawString(3 * inch, h - 1.7 * inch,
                 f"Total registros: {len(items)}")

    # Tabla
    y = h - 2.5 * inch
    c.setFont("Helvetica-Bold", 9)
    c.drawString(inch, y, "Fecha/Hora")
    c.drawString(2.2 * inch, y, "SKU")
    c.drawString(3.5 * inch, y, "Lote")
    c.drawString(4.8 * inch, y, "Cantidad")
    c.drawString(5.5 * inch, y, "Origen")
    c.drawString(6.3 * inch, y, "Referencia")
    y -= 0.15 * inch
    c.line(inch, y, w - inch, y)
    y -= 0.2 * inch

    c.setFont("Helvetica", 8)
    total_scrap = 0

    for item in items:
        fecha = item.get("fecha")
        if isinstance(fecha, datetime):
            fecha = fecha.strftime("%Y-%m-%d %H:%M")
        elif fecha:
            fecha = str(fecha)[:16]
        else:
            fecha = "N/A"

        cantidad = item.get("cantidad", 0)
        total_scrap += cantidad

        c.drawString(inch, y, fecha)
        c.drawString(2.2 * inch, y, str(item.get("sku_producto", ""))[:15])
        c.drawString(3.5 * inch, y, str(item.get("lote_id", ""))[:15])
        c.drawString(4.8 * inch, y, str(cantidad))
        c.drawString(5.5 * inch, y, str(item.get("origen", ""))[:12])
        c.drawString(6.3 * inch, y, str(item.get("referencia", ""))[:15])

        y -= 0.2 * inch
        if y < 1.5 * inch:
            c.showPage()
            y = h - inch
            c.setFont("Helvetica", 8)

    # Total
    y -= 0.3 * inch
    c.setFont("Helvetica-Bold", 11)
    c.drawString(inch, y, f"Total Scrap: {total_scrap}")

    c.save()
    buf.seek(0)
    return buf