import os
from io import BytesIO
from datetime import datetime

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.units import inch, cm
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import black
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF

from app.services.contador_service import obtener_siguiente_carrito


# ── Helpers ─────────────────────────────────────────────────────────

def _normalizar_turno(turno_str: str | None) -> str:
    """Convierte cualquier variante de turno a 'D' o 'N'"""
    if not turno_str:
        return 'D'
    t = turno_str.strip().upper()
    # Cubre 'Día', 'DÍA', 'DIA', 'D', 'DAY'
    if t in ['D', 'DIA', 'DÍA', 'DAY', 'DIURNO', 'DÍA']:
        return 'D'
    # Cubre 'Noche', 'NOCHE', 'N', 'NIGHT'
    if t in ['N', 'NOCHE', 'NIGHT', 'NOCTURNO']:
        return 'N'
    return 'D'


def _get_fecha() -> str:
    return datetime.now().strftime('%d%m%Y')


async def _generar_codigo_carrito(
    numero_parte: str,
    turno_item:   str | None,
) -> str:
    turno_qr    = _normalizar_turno(turno_item)
    fecha       = _get_fecha()
    num_carrito = await obtener_siguiente_carrito(numero_parte, turno_qr)

    # Formato: PARTE_TURNO_FECHA_CARRITO
    return f"{numero_parte}_{turno_qr}_{fecha}_{num_carrito}"


# ── Generador principal ─────────────────────────────────────────────

async def generar_pdf_etiquetas(items_cola: list) -> bytes:
    buffer   = BytesIO()
    c        = canvas.Canvas(buffer, pagesize=landscape(letter))
    page_w, page_h = landscape(letter)

    margin         = 0.5 * cm
    usable_w       = page_w - (2 * margin)
    usable_h       = page_h - (2 * margin)
    target_label_w = usable_w / 2
    target_label_h = usable_h / 2
    original_label_w = 6 * inch
    original_label_h = 5 * inch
    scale_x = target_label_w / original_label_w
    scale_y = target_label_h / original_label_h

    positions = [
        (margin,                  page_h - margin - target_label_h),
        (margin + target_label_w, page_h - margin - target_label_h),
        (margin,                  margin),
        (margin + target_label_w, margin),
    ]

    # Pre-calcular todos los códigos de forma async antes del canvas
    todas_las_etiquetas = []
    for item in items_cola:
        num_labels = item.get('cantidad_etiquetas', 1)
        for _ in range(num_labels):
            codigo_carrito = await _generar_codigo_carrito(
                item.get('numero_parte', ''),
                item.get('turno', None),
            )
            todas_las_etiquetas.append((item, codigo_carrito))

    if not todas_las_etiquetas:
        c.drawString(100, 100, "Cola de impresión vacía")
        c.save()
        buffer.seek(0)
        return buffer.getvalue()

    # Dibujar de forma síncrona
    label_count_on_page = 0
    for item, codigo_carrito in todas_las_etiquetas:
        if label_count_on_page >= 4:
            c.showPage()
            label_count_on_page = 0

        x_offset, y_offset = positions[label_count_on_page]
        c.saveState()
        c.translate(x_offset, y_offset)
        c.scale(scale_x, scale_y)
        _draw_single_label(c, item, codigo_carrito)
        c.restoreState()
        label_count_on_page += 1

    c.save()
    buffer.seek(0)
    return buffer.getvalue()


# ── Dibujar etiqueta ─────────────────────────────────────────────────

def _draw_single_label(c, item, codigo_carrito: str):
    default_font = "Helvetica"
    bold_font    = "Helvetica-Bold"

    c.rect(0.25 * inch, 0.25 * inch, 5.5 * inch, 4.5 * inch)
    c.rect(0.5  * inch, 3.72 * inch, 1.5 * inch, 0.8 * inch)

    base_dir  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    logo_path = os.path.join(base_dir, "static", "Logo.png")

    if os.path.exists(logo_path):
        try:
            c.drawImage(logo_path, 0.6 * inch, 3.745 * inch,
                        width=1.3 * inch, height=0.75 * inch, mask='auto')
        except Exception:
            c.setFont(default_font, 8)
            c.drawCentredString(1.25 * inch, 4.12 * inch, "Error Logo")
    else:
        c.setFont(default_font, 10)
        c.drawCentredString(1.25 * inch, 4.12 * inch, "LG / EPS")

    box_top_right_x      = 4    * inch
    box_top_right_y      = 3.72 * inch
    box_top_right_width  = 1.5  * inch
    box_top_right_height = 0.8  * inch
    c.rect(box_top_right_x, box_top_right_y, box_top_right_width, box_top_right_height)

    display_text_top_right = item.get('cliente', 'IQC').upper()
    font_size_top_right    = 40
    c.setFont(bold_font, font_size_top_right)
    text_width_top_right = c.stringWidth(display_text_top_right, bold_font, font_size_top_right)
    while text_width_top_right > (box_top_right_width - 0.1 * inch) and font_size_top_right > 5:
        font_size_top_right -= 1
        c.setFont(bold_font, font_size_top_right)
        text_width_top_right = c.stringWidth(display_text_top_right, bold_font, font_size_top_right)

    text_x_top_right = box_top_right_x + (box_top_right_width  - text_width_top_right)      / 2
    text_y_top_right = box_top_right_y + (box_top_right_height - font_size_top_right * 0.8) / 2
    c.drawString(text_x_top_right, text_y_top_right, display_text_top_right)

    try:
        partes_codigo = codigo_carrito.split('_')
        # El turno es el segundo elemento después del número de parte
        # Buscamos 'D' o 'N' en las partes
        turno_qr = 'D'
        for parte in partes_codigo:
            if parte in ('D', 'N'):
                turno_qr = parte
                break
        turno_display = 'Día' if turno_qr == 'D' else 'Noche'
    except Exception:
        turno_display = 'Día'

    c.setFont(default_font, 12)
    c.drawString(2.33 * inch, 4.1 * inch, f"Fecha: {datetime.now().strftime('%d/%m/%Y')}")
    c.drawString(2.33 * inch, 3.8 * inch, f"Turno: {turno_display}")

    info_y_start      = 3.2 * inch
    box_label_x       = 0.5 * inch
    box_value_x       = 1.5 * inch
    box_value_width   = 2.4 * inch
    box_height_abs    = 0.3 * inch
    box_height_vector = -box_height_abs

    labels_and_values = {
        "Part Number:": item.get('numero_parte', ''),
        "Description:": item.get('descripcion', ''),
        "Qty:":         str(item.get('cantidad_por_etiqueta', '0')),
    }

    y_pos = info_y_start
    for label, value in labels_and_values.items():
        c.setFont(default_font, 12)
        c.drawString(box_label_x, y_pos, label)

        value_box_y = y_pos + 0.2 * inch
        c.rect(box_value_x, value_box_y, box_value_width, box_height_vector)

        if label == "Description:":
            font_size_desc = 14
            while font_size_desc > 5:
                style = ParagraphStyle(
                    name='DescStyle', fontName=bold_font,
                    fontSize=font_size_desc, leading=font_size_desc + 1,
                    alignment=1, textColor=black
                )
                p    = Paragraph(value, style)
                w, h = p.wrapOn(c, box_value_width - 0.1 * inch, box_height_abs)
                if h <= box_height_abs:
                    break
                font_size_desc -= 1
            p.drawOn(c, box_value_x + 0.05 * inch,
                     (value_box_y + box_height_vector) + (box_height_abs - h) / 2)
        else:
            c.setFont(bold_font, 14)
            text_width = c.stringWidth(value, bold_font, 14)
            c.drawString(box_value_x + (box_value_width - text_width) / 2, y_pos, value)

        y_pos -= 0.4 * inch

    maquina = item.get('maquina', 'SIN MAQUINA').strip().upper()
    c.setFont(bold_font, 12)
    dynamic_text_width = c.stringWidth(maquina, bold_font, 12)
    c.drawString(4 * inch + (1.75 * inch - dynamic_text_width) / 2,
                 y_pos + 0.4 * inch, maquina)

    line_y_separator = y_pos + 0.15 * inch
    c.line(0.25 * inch, line_y_separator, 5.75 * inch, line_y_separator)

    qr_size  = 0.75 * inch
    qr_x_pos = 4 * inch + (1.75 * inch - qr_size) / 2

    y_qr1 = line_y_separator - 0.05 * inch - qr_size
    _generar_qr_code(c, codigo_carrito, qr_x_pos, y_qr1, qr_size)

    y_qr2 = y_qr1 - 0.15 * inch - qr_size
    lote_base = item.get('lote', '')
    # Extraer número de carrito del QR1 y añadirlo al lote del QR2
    try:
        num_carrito = int(codigo_carrito.split('_')[-1])
        qr_lote = f"{lote_base}_{num_carrito:02d}"
    except (ValueError, IndexError):
        qr_lote = lote_base
    _generar_qr_code(c, qr_lote, qr_x_pos, y_qr2, qr_size)

    c.line(0.25 * inch, 3.5  * inch, 5.75 * inch, 3.5  * inch)
    c.line(4    * inch, 3.5  * inch, 4    * inch,  0.25 * inch)
    c.line(1.4  * inch, line_y_separator, 1.4  * inch, 0.25 * inch)
    c.line(2.75 * inch, line_y_separator, 2.75 * inch, 0.25 * inch)

    c.setFont(default_font, 10)
    bottom_text_y = y_qr2 - 0.15 * inch
    texto_iqc     = f"{display_text_top_right} IQC" if display_text_top_right else "IQC"

    c.drawString(0.6  * inch, bottom_text_y, "LQC")
    c.drawString(1.9  * inch, bottom_text_y, "OQC")
    c.drawString(3.12 * inch, bottom_text_y, texto_iqc)


def _generar_qr_code(canvas_obj, data, x, y, size):
    qr_widget = qr.QrCodeWidget(data)
    bounds    = qr_widget.getBounds()
    width     = bounds[2] - bounds[0]
    height    = bounds[3] - bounds[1]
    scale_x   = size / width
    scale_y   = size / height
    drawing   = Drawing(size, size, transform=[scale_x, 0, 0, scale_y, 0, 0])
    drawing.add(qr_widget)
    renderPDF.draw(drawing, canvas_obj, x, y)