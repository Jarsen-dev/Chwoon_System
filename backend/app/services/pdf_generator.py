import os
from io import BytesIO
from datetime import datetime

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch, cm
from reportlab.lib.colors import (
    Color, black, white, HexColor
)
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF

from app.services.contador_service import obtener_siguiente_carrito


# ── Paleta de colores corporativos ──────────────────────────────────
COLOR_PRIMARY   = HexColor('#1A3A5C')   # Azul marino oscuro
COLOR_SECONDARY = HexColor('#2E6DA4')   # Azul medio
COLOR_ACCENT    = HexColor('#E8F0F7')   # Azul muy claro (fondo headers)
COLOR_LINE      = HexColor('#CBD5E1')   # Gris líneas
COLOR_TEXT      = HexColor('#1E293B')   # Texto principal
COLOR_SUBTEXT   = HexColor('#64748B')   # Texto secundario
COLOR_SUCCESS   = HexColor('#15803D')   # Verde para totales
COLOR_ROW_ALT   = HexColor('#F8FAFC')   # Fondo filas alternas


# ════════════════════════════════════════════════════════════════════
# HELPERS
# ════════════════════════════════════════════════════════════════════

def _normalizar_turno(turno_str: str | None) -> str:
    if not turno_str:
        return 'D'
    t = turno_str.strip().upper()
    if t in ['D', 'DIA', 'DÍA', 'DAY', 'DIURNO']:
        return 'D'
    if t in ['N', 'NOCHE', 'NIGHT', 'NOCTURNO']:
        return 'N'
    return 'D'


def _get_fecha() -> str:
    return datetime.now().strftime('%d%m%Y')


async def _generar_codigo_carrito(numero_parte: str, turno_item: str | None) -> str:
    turno_qr    = _normalizar_turno(turno_item)
    fecha       = _get_fecha()
    num_carrito = await obtener_siguiente_carrito(numero_parte, turno_qr)
    return f"{numero_parte}_{turno_qr}_{fecha}_{num_carrito}"


def _fmt_currency(val: float, moneda: str = 'MXN') -> str:
    return f"${val:,.2f} {moneda}"


def _fmt_date(dt) -> str:
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace('Z', '+00:00'))
        except Exception:
            return dt
    return dt.strftime('%d/%m/%Y') if dt else '—'


# ════════════════════════════════════════════════════════════════════
# GENERADOR DE ETIQUETAS (sin cambios funcionales, igual que antes)
# ════════════════════════════════════════════════════════════════════

async def generar_pdf_etiquetas(items_cola: list) -> bytes:
    buffer   = BytesIO()
    c        = canvas.Canvas(buffer, pagesize=_landscape_letter())
    page_w, page_h = _landscape_letter()

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


def _landscape_letter():
    from reportlab.lib.pagesizes import landscape, letter
    return landscape(letter)


# ════════════════════════════════════════════════════════════════════
# ORDEN DE COMPRA — DOCUMENTO PROFESIONAL
# ════════════════════════════════════════════════════════════════════

async def generar_pdf_orden_compra(orden: dict, empresa: dict | None = None, contacto_compras: dict | None = None) -> bytes:
    """
    Genera un PDF profesional de Orden de Compra.

    Args:
        orden: diccionario con los campos de OrdenCompraResponse +
               datos del proveedor enriquecidos (proveedor_detalle opcional).
        empresa: dict con ConfiguracionEmpresa (nombre, rfc, direccion, etc.).
        contacto_compras: dict con el ContactoEmpresa del área de compras.
    """
    buffer = BytesIO()
    page_w, page_h = letter          # 612 x 792 pt
    c = canvas.Canvas(buffer, pagesize=letter)

    MARGIN_L = 0.65 * inch
    MARGIN_R = 0.65 * inch
    MARGIN_T = 0.75 * inch
    MARGIN_B = 0.85 * inch

    content_w = page_w - MARGIN_L - MARGIN_R

    # ── Datos básicos de la orden ────────────────────────────────────
    oc_id        = orden.get('oc_id', '—')
    fecha_oc     = _fmt_date(orden.get('fecha_creacion'))
    notas        = orden.get('notas') or ''
    status       = orden.get('status', '—')
    creado_por   = orden.get('creado_por') or '—'
    iva_pct      = float(orden.get('iva', 16.0))
    items        = orden.get('items', [])
    proveedor    = orden.get('proveedor_detalle') or {}   # objeto Proveedor enriquecido (opcional)

    nombre_prov  = orden.get('nombre_proveedor', proveedor.get('razon_social', '—'))
    rfc_prov     = proveedor.get('rfc', '—')
    dir_prov     = proveedor.get('direccion', '—') or '—'
    cond_pago    = proveedor.get('condiciones_pago', '—') or '—'
    lead_time    = proveedor.get('lead_time_dias', '—')
    contacto_prov_nombre  = proveedor.get('nombre_ventas') or '—'
    contacto_prov_tel     = proveedor.get('numero_contacto') or '—'
    contacto_prov_email   = proveedor.get('correo_contacto') or '—'

    # ── Datos empresa compradora ─────────────────────────────────────
    emp_nombre   = (empresa or {}).get('nombre', 'Mi Empresa S.A. de C.V.')
    emp_rfc      = (empresa or {}).get('rfc', '—')
    emp_dir      = (empresa or {}).get('direccion', '—') or '—'
    emp_tel      = (empresa or {}).get('telefono', '—') or '—'
    emp_email    = (empresa or {}).get('email', '—') or '—'
    emp_ciudad   = (empresa or {}).get('ciudad', '') or ''
    emp_estado   = (empresa or {}).get('estado', '') or ''
    emp_cp       = (empresa or {}).get('cp', '') or ''

    # Contacto de compras
    cmp_nombre   = (contacto_compras or {}).get('nombre', '—')
    cmp_puesto   = (contacto_compras or {}).get('puesto', 'Compras') or 'Compras'
    cmp_tel      = (contacto_compras or {}).get('telefono', '—') or '—'
    cmp_email    = (contacto_compras or {}).get('email', '—') or '—'

    # ── Calcular totales ─────────────────────────────────────────────
    subtotal = sum(
        float(i.get('cantidad_requerida', 0)) * float(i.get('precio_unitario', 0))
        for i in items
    )
    moneda_oc = items[0].get('moneda', 'MXN') if items else 'MXN'
    monto_iva = subtotal * (iva_pct / 100.0)
    total_con_iva = subtotal + monto_iva

    # ════════════════════════════════════════════════════════════
    # DIBUJAR PÁGINA
    # ════════════════════════════════════════════════════════════
    y = page_h - MARGIN_T

    # ── 1. HEADER — banda azul con logo + título ─────────────────────
    header_h = 1.05 * inch
    c.setFillColor(COLOR_PRIMARY)
    c.rect(0, y - header_h, page_w, header_h, fill=1, stroke=0)

    # Logo (si existe)
    base_dir  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    logo_path = os.path.join(base_dir, "static", "Logo.png")
    logo_drawn = False
    if os.path.exists(logo_path):
        try:
            c.drawImage(logo_path,
                        MARGIN_L, y - header_h + 0.12 * inch,
                        width=1.5 * inch, height=0.8 * inch,
                        mask='auto', preserveAspectRatio=True)
            logo_drawn = True
        except Exception:
            pass

    if not logo_drawn:
        c.setFillColor(white)
        c.setFont('Helvetica-Bold', 14)
        c.drawString(MARGIN_L, y - header_h / 2 - 0.05 * inch, emp_nombre)

    # Título ORDEN DE COMPRA
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 22)
    titulo = 'ORDEN DE COMPRA'
    t_w = c.stringWidth(titulo, 'Helvetica-Bold', 22)
    c.drawString(page_w - MARGIN_R - t_w, y - 0.42 * inch, titulo)

    c.setFont('Helvetica', 10)
    c.setFillColor(HexColor('#B0C8E4'))
    sub_txt = f"No. {oc_id}   ·   {fecha_oc}"
    sub_w = c.stringWidth(sub_txt, 'Helvetica', 10)
    c.drawString(page_w - MARGIN_R - sub_w, y - 0.65 * inch, sub_txt)

    y -= header_h + 0.18 * inch

    # ── 2. BLOQUE INFO — Empresa | Proveedor ────────────────────────
    col_w = (content_w - 0.2 * inch) / 2
    left_x  = MARGIN_L
    right_x = MARGIN_L + col_w + 0.2 * inch

    block_h = 1.55 * inch

    # Recuadro empresa compradora
    _draw_info_box(c, left_x, y - block_h, col_w, block_h,
                   title='EMPRESA COMPRADORA',
                   lines=[
                       ('Razón Social:', emp_nombre),
                       ('RFC:',          emp_rfc),
                       ('Dirección:',    emp_dir[:55]),
                       ('Tel / Email:',  f"{emp_tel}  |  {emp_email}"),
                       ('C.P. / Ciudad:', f"{emp_cp} {emp_ciudad} {emp_estado}".strip()),
                   ])

    # Recuadro proveedor
    _draw_info_box(c, right_x, y - block_h, col_w, block_h,
                   title='PROVEEDOR',
                   lines=[
                       ('Razón Social:', nombre_prov),
                       ('RFC:',          rfc_prov),
                       ('Dirección:',    dir_prov[:55]),
                       ('Condiciones:',  cond_pago),
                       ('Lead Time:',    f"{lead_time} días"),
                   ])

    y -= block_h + 0.15 * inch

    # ── 3. BLOQUE CONTACTOS + CONTROL ───────────────────────────────
    ctrl_col_w = (content_w - 0.4 * inch) / 3
    block2_h   = 1.0 * inch

    _draw_info_box(c, left_x, y - block2_h, ctrl_col_w, block2_h,
                   title='CONTACTO COMPRAS',
                   lines=[
                       ('Nombre:', cmp_nombre),
                       ('Puesto:', cmp_puesto),
                       ('Tel:',    cmp_tel),
                       ('Email:',  cmp_email),
                   ])

    _draw_info_box(c, left_x + ctrl_col_w + 0.2 * inch, y - block2_h, ctrl_col_w, block2_h,
                   title='CONTACTO PROVEEDOR',
                   lines=[
                       ('Nombre:', contacto_prov_nombre),
                       ('Tel:',    contacto_prov_tel),
                       ('Email:',  contacto_prov_email),
                   ])

    _draw_info_box(c, left_x + (ctrl_col_w + 0.2 * inch) * 2, y - block2_h, ctrl_col_w, block2_h,
                   title='CONTROL',
                   lines=[
                       ('No. OC:',      oc_id),
                       ('Fecha:',       fecha_oc),
                       ('Estatus:',     status),
                       ('Elaboró:',     creado_por),
                   ])

    y -= block2_h + 0.22 * inch

    # ── 4. TABLA DE PRODUCTOS ────────────────────────────────────────
    # Encabezado sección
    _section_header(c, MARGIN_L, y, content_w, 'DETALLE DE PRODUCTOS')
    y -= 0.22 * inch

    col_widths = [
        0.40 * inch,   # #
        1.25 * inch,   # SKU
        2.50 * inch,   # Descripción
        0.70 * inch,   # Cant.
        0.55 * inch,   # U.M.
        1.10 * inch,   # Precio Unit.
        1.10 * inch,   # Subtotal
    ]
    # Ajustar último col para llenar ancho exacto
    col_widths[-1] = content_w - sum(col_widths[:-1])

    headers = ['#', 'SKU / No. Parte', 'Descripción', 'Cantidad', 'UM', 'Precio Unit.', 'Subtotal']
    data_rows = [headers]

    for idx, item in enumerate(items, 1):
        qty   = float(item.get('cantidad_requerida', 0))
        price = float(item.get('precio_unitario', 0))
        sub   = qty * price
        mon   = item.get('moneda', 'MXN')
        data_rows.append([
            str(idx),
            item.get('sku_producto', ''),
            item.get('nombre_producto', ''),
            f"{qty:,.2f}",
            mon,
            f"${price:,.2f}",
            f"${sub:,.2f}",
        ])

    row_h = 0.26 * inch
    tbl_h = row_h * len(data_rows)

    # Check if we need to overflow to next page
    available = y - MARGIN_B - 2.0 * inch   # reserve space for totals + signatures
    if tbl_h > available:
        # Draw partial rows that fit, add page, continue
        rows_that_fit = max(2, int(available / row_h))
        _draw_product_table(c, MARGIN_L, y, col_widths, data_rows[:rows_that_fit + 1], row_h)
        y -= rows_that_fit * row_h + row_h
        c.showPage()
        y = page_h - MARGIN_T
        remaining = data_rows[rows_that_fit + 1:]
        if remaining:
            _draw_product_table(c, MARGIN_L, y, col_widths, [headers] + remaining, row_h)
            y -= (len(remaining) + 1) * row_h
    else:
        _draw_product_table(c, MARGIN_L, y, col_widths, data_rows, row_h)
        y -= tbl_h

    y -= 0.15 * inch

    # ── 5. RESUMEN FINANCIERO ────────────────────────────────────────
    fin_w = 2.6 * inch
    fin_x = page_w - MARGIN_R - fin_w

    lines_fin = [
        ('Subtotal',                  f"${subtotal:,.2f} {moneda_oc}",  False),
        (f'IVA ({iva_pct:.0f}%)',     f"${monto_iva:,.2f} {moneda_oc}", False),
        ('TOTAL',                     f"${total_con_iva:,.2f} {moneda_oc}", True),
    ]

    fin_row_h = 0.265 * inch
    fin_h     = fin_row_h * len(lines_fin) + 0.05 * inch

    # Fondo sutil
    c.setFillColor(COLOR_ACCENT)
    c.roundRect(fin_x - 0.1 * inch, y - fin_h, fin_w + 0.1 * inch, fin_h, 4, fill=1, stroke=0)

    fy = y - fin_row_h * 0.5
    for label, valor, bold in lines_fin:
        font = 'Helvetica-Bold' if bold else 'Helvetica'
        size = 9.5 if not bold else 11
        c.setFillColor(COLOR_PRIMARY if bold else COLOR_TEXT)
        c.setFont(font, size)
        c.drawString(fin_x, fy, label)
        v_w = c.stringWidth(valor, font, size)
        c.drawString(fin_x + fin_w - v_w, fy, valor)
        if bold:
            c.setStrokeColor(COLOR_PRIMARY)
            c.setLineWidth(1)
            c.line(fin_x, fy + fin_row_h - 0.03 * inch, fin_x + fin_w, fy + fin_row_h - 0.03 * inch)
        fy -= fin_row_h

    # Notas (izquierda del resumen financiero)
    if notas:
        _section_header(c, MARGIN_L, y, fin_x - MARGIN_L - 0.2 * inch, 'NOTAS')
        c.setFont('Helvetica', 8.5)
        c.setFillColor(COLOR_TEXT)
        _draw_wrapped_text(c, MARGIN_L, y - 0.22 * inch,
                           fin_x - MARGIN_L - 0.25 * inch, notas, font_size=8.5)

    y -= fin_h + 0.35 * inch

    # ── 6. FIRMAS ────────────────────────────────────────────────────
    sig_w  = 2.2 * inch
    sig_h  = 0.75 * inch
    gap    = (content_w - 2 * sig_w) / 3

    sig_positions = [
        (MARGIN_L + gap,               'ELABORÓ',      cmp_nombre),
        (MARGIN_L + gap + sig_w + gap, 'AUTORIZADO POR', ''),
    ]

    # Asegurar espacio en la página
    if y - sig_h - 0.6 * inch < MARGIN_B:
        c.showPage()
        y = page_h - MARGIN_T

    for sx, label, nombre in sig_positions:
        c.setStrokeColor(COLOR_LINE)
        c.setLineWidth(0.8)
        c.line(sx, y - sig_h, sx + sig_w, y - sig_h)          # línea de firma
        c.setFont('Helvetica-Bold', 8)
        c.setFillColor(COLOR_PRIMARY)
        lw = c.stringWidth(label, 'Helvetica-Bold', 8)
        c.drawString(sx + (sig_w - lw) / 2, y - sig_h - 0.18 * inch, label)
        if nombre and nombre != '—':
            c.setFont('Helvetica', 7.5)
            c.setFillColor(COLOR_SUBTEXT)
            nw = c.stringWidth(nombre, 'Helvetica', 7.5)
            c.drawString(sx + (sig_w - nw) / 2, y - sig_h - 0.34 * inch, nombre)

    # ── 7. PIE DE PÁGINA ─────────────────────────────────────────────
    _draw_footer(c, page_w, MARGIN_B, oc_id)

    c.save()
    buffer.seek(0)
    return buffer.getvalue()


# ════════════════════════════════════════════════════════════════════
# HELPERS INTERNOS DE DISEÑO
# ════════════════════════════════════════════════════════════════════

def _draw_info_box(c, x, y, w, h, title: str, lines: list):
    """Dibuja un recuadro informativo con título y filas label: valor."""
    # Borde
    c.setStrokeColor(COLOR_LINE)
    c.setLineWidth(0.5)
    c.roundRect(x, y, w, h, 3, fill=0, stroke=1)

    # Título
    c.setFillColor(COLOR_PRIMARY)
    c.rect(x, y + h - 0.22 * inch, w, 0.22 * inch, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 7.5)
    c.drawString(x + 0.1 * inch, y + h - 0.16 * inch, title)

    # Filas
    row_h = (h - 0.22 * inch - 0.06 * inch) / max(len(lines), 1)
    for i, (label, value) in enumerate(lines):
        ry = y + h - 0.22 * inch - 0.06 * inch - (i + 0.75) * row_h
        c.setFont('Helvetica-Bold', 7)
        c.setFillColor(COLOR_SUBTEXT)
        c.drawString(x + 0.1 * inch, ry, label)
        c.setFont('Helvetica', 7)
        c.setFillColor(COLOR_TEXT)
        # Truncar valor si es muy largo
        val_x  = x + 0.1 * inch + c.stringWidth(label + ' ', 'Helvetica-Bold', 7)
        max_vw = w - (val_x - x) - 0.08 * inch
        value  = _truncate_text(c, str(value), 'Helvetica', 7, max_vw)
        c.drawString(val_x, ry, value)


def _section_header(c, x, y, w, title: str):
    """Banda delgada de sección."""
    c.setFillColor(COLOR_SECONDARY)
    c.rect(x, y - 0.19 * inch, w, 0.19 * inch, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 8)
    c.drawString(x + 0.1 * inch, y - 0.135 * inch, title)


def _draw_product_table(c, x, y, col_widths, rows, row_h):
    """Dibuja la tabla de productos manualmente para control total."""
    total_w = sum(col_widths)

    for r_idx, row in enumerate(rows):
        is_header = r_idx == 0
        row_y = y - (r_idx + 1) * row_h

        # Fondo fila
        if is_header:
            c.setFillColor(COLOR_PRIMARY)
        elif r_idx % 2 == 0:
            c.setFillColor(white)
        else:
            c.setFillColor(COLOR_ROW_ALT)
        c.rect(x, row_y, total_w, row_h, fill=1, stroke=0)

        # Línea inferior
        c.setStrokeColor(COLOR_LINE)
        c.setLineWidth(0.3)
        c.line(x, row_y, x + total_w, row_y)

        # Textos de celda
        cx = x
        alignments = ['center', 'left', 'left', 'right', 'center', 'right', 'right']
        for c_idx, (cell, cw) in enumerate(zip(row, col_widths)):
            text  = str(cell)
            pad   = 0.06 * inch
            align = alignments[c_idx] if c_idx < len(alignments) else 'left'

            if is_header:
                c.setFont('Helvetica-Bold', 7.5)
                c.setFillColor(white)
            else:
                c.setFont('Helvetica-Bold' if c_idx == 0 else 'Helvetica', 7.5)
                c.setFillColor(COLOR_SECONDARY if c_idx == 6 else COLOR_TEXT)

            text = _truncate_text(c, text, c.currentFont.fontName if hasattr(c, 'currentFont') else 'Helvetica', 7.5, cw - pad * 2)

            ty = row_y + row_h * 0.3
            if align == 'right':
                tw = c.stringWidth(text, 'Helvetica-Bold' if (is_header or c_idx == 0) else 'Helvetica', 7.5)
                c.drawString(cx + cw - pad - tw, ty, text)
            elif align == 'center':
                tw = c.stringWidth(text, 'Helvetica-Bold' if (is_header or c_idx == 0) else 'Helvetica', 7.5)
                c.drawString(cx + (cw - tw) / 2, ty, text)
            else:
                c.drawString(cx + pad, ty, text)

            cx += cw

    # Borde exterior de la tabla
    c.setStrokeColor(COLOR_SECONDARY)
    c.setLineWidth(0.8)
    c.rect(x, y - len(rows) * row_h, total_w, len(rows) * row_h, fill=0, stroke=1)


def _draw_footer(c, page_w, margin_b, oc_id):
    """Pie de página con línea y texto."""
    c.setStrokeColor(COLOR_LINE)
    c.setLineWidth(0.5)
    c.line(0.5 * inch, margin_b, page_w - 0.5 * inch, margin_b)
    c.setFont('Helvetica', 7)
    c.setFillColor(COLOR_SUBTEXT)
    fecha_imp = datetime.now().strftime('%d/%m/%Y %H:%M')
    c.drawString(0.65 * inch, margin_b - 0.15 * inch,
                 f"Documento generado el {fecha_imp}  |  Este documento es una Orden de Compra oficial.")
    txt_r = f"OC: {oc_id}"
    tw = c.stringWidth(txt_r, 'Helvetica', 7)
    c.drawString(page_w - 0.65 * inch - tw, margin_b - 0.15 * inch, txt_r)


def _truncate_text(c, text: str, font: str, size: float, max_w: float) -> str:
    """Trunca el texto con '…' si supera max_w."""
    try:
        if c.stringWidth(text, font, size) <= max_w:
            return text
        while text and c.stringWidth(text + '…', font, size) > max_w:
            text = text[:-1]
        return text + '…'
    except Exception:
        return text[:30]


def _draw_wrapped_text(c, x, y, max_w, text: str, font_size=8.5, line_h=None):
    """Dibuja texto con wrap simple."""
    if line_h is None:
        line_h = font_size * 1.3
    words = text.split()
    line  = ''
    for word in words:
        test = (line + ' ' + word).strip()
        if c.stringWidth(test, 'Helvetica', font_size) <= max_w:
            line = test
        else:
            c.drawString(x, y, line)
            y   -= line_h
            line = word
    if line:
        c.drawString(x, y, line)


# ════════════════════════════════════════════════════════════════════
# ETIQUETAS — funciones internas (sin cambios)
# ════════════════════════════════════════════════════════════════════

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
                    alignment=1
                )
                from reportlab.platypus import Paragraph as _P
                p    = _P(value, style)
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