import os
import io
import qrcode
from datetime import datetime
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader


LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "static", "Logo.png")


def generar_pdf_inspeccion(data: dict) -> io.BytesIO:
    """Genera PDF de reporte de inspección de calidad."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    w, h = letter

    tipo = data.get("tipo_inspeccion", "QC")
    resultado = data.get("resultado_final", "INDETERMINADO").upper()
    lote_id = data.get("lote_id", "N/A")
    sku = data.get("sku_producto", "N/A")

    # Logo
    if os.path.exists(LOGO_PATH):
        c.drawImage(LOGO_PATH, inch, h - 1.25 * inch,
                     width=2 * inch, height=1 * inch,
                     preserveAspectRatio=True, mask="auto")

    # Título
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(w / 2, h - 1.5 * inch,
                        f"Reporte de Inspección de Calidad ({tipo})")

    # Info producto / origen
    y = h - 2.25 * inch
    c.setFont("Helvetica-Bold", 12)
    c.drawString(inch, y, "Información del Producto")
    c.drawString(w / 2, y, "Información de Origen")
    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.line(inch, y - 0.1 * inch, w - inch, y - 0.1 * inch)

    c.setFont("Helvetica", 11)
    y -= 0.3 * inch
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

    # Resultados
    y -= 0.75 * inch
    c.setFont("Helvetica-Bold", 12)
    c.drawString(inch, y, "Resultados de la Inspección")
    c.line(inch, y - 0.1 * inch, w - inch, y - 0.1 * inch)

    y -= 0.3 * inch
    c.setFont("Helvetica-Bold", 10)
    c.drawString(inch, y, "Punto de Inspección")
    c.drawString(4.5 * inch, y, "Especificación")
    c.drawString(w - 2 * inch, y, "Resultado")

    c.setFont("Helvetica", 10)
    y -= 0.25 * inch

    for punto in data.get("resultados_puntos", []):
        nombre_punto = punto.get("punto", "")
        especificacion = punto.get("especificacion", "")
        resultado_punto = punto.get("resultado", "")

        c.drawString(inch + 0.1 * inch, y, nombre_punto[:40])
        c.drawString(4.5 * inch, y, especificacion[:25])

        # Color por resultado
        if resultado_punto.lower() == "conforme":
            c.setFillColorRGB(0, 0.5, 0)
        else:
            c.setFillColorRGB(0.8, 0, 0)
        c.drawString(w - 1.9 * inch, y, resultado_punto)
        c.setFillColorRGB(0, 0, 0)

        y -= 0.25 * inch
        if y < 2 * inch:
            c.showPage()
            y = h - inch
            c.setFont("Helvetica", 10)

    # Veredicto final
    y -= 0.5 * inch
    c.setFont("Helvetica-Bold", 16)
    if resultado == "APROBADO":
        c.setFillColorRGB(0, 0.5, 0)
    else:
        c.setFillColorRGB(0.8, 0, 0)
    c.drawString(inch, y, f"Veredicto Final: {resultado}")
    c.setFillColorRGB(0, 0, 0)

    # QR con SKU
    qr_img = qrcode.make(sku)
    qr_buf = io.BytesIO()
    qr_img.save(qr_buf, format="PNG")
    qr_buf.seek(0)
    c.drawImage(ImageReader(qr_buf), w - 2 * inch, y - 0.25 * inch,
                width=1.2 * inch, height=1.2 * inch)

    # Notas
    notas = data.get("notas")
    if notas:
        y -= 1.5 * inch
        c.setFont("Helvetica", 9)
        c.drawString(inch, y, f"Notas: {notas}")

    c.save()
    buf.seek(0)
    return buf


def generar_pdf_scrap(data: dict, items: list) -> io.BytesIO:
    """Genera PDF de reporte de scrap."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    w, h = letter

    # Logo
    if os.path.exists(LOGO_PATH):
        c.drawImage(LOGO_PATH, w - 2 * inch, h - 1.25 * inch,
                     width=1.5 * inch, height=1 * inch,
                     preserveAspectRatio=True, mask="auto")

    # Encabezado
    c.setFont("Helvetica-Bold", 16)
    c.drawString(inch, h - inch, "Reporte de Scrap")

    c.setFont("Helvetica", 11)
    c.drawString(inch, h - 1.3 * inch,
                 f"Fecha: {data.get('fecha', datetime.now().strftime('%Y-%m-%d'))}")
    c.drawString(inch, h - 1.5 * inch,
                 f"Filtro SKU: {data.get('sku_filtro', 'Todos')}")
    c.drawString(inch, h - 1.7 * inch,
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