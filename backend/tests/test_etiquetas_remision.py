"""Tests de las etiquetas de lote (ZPL) y la cola de impresión.

No se toca ninguna impresora: el backend solo genera el ZPL y lo encola; lo
imprime el agente de Windows (`gateway/agente_impresion.py`). Aquí se valida:
  - el formato y la unicidad del lote_id
  - que las cantidades no puedan exceder lo recibido en la remisión
  - que el ZPL salga bien formado y a prueba de caracteres de control
  - el ciclo reclamar → confirmar de la cola, y la reimpresión individual
"""

import asyncio
import io
import os
from datetime import date

import pytest

from app.routers.remisiones import _sufijo
from app.services.zpl_etiquetas import _sanitizar, fmt_cantidad, generar_zpl

FOTO_JPG = b"\xff\xd8\xff\xe0" + b"0" * 100
API_KEY = os.getenv("GATEWAY_API_KEY", "")


# ── Utilidades puras ──────────────────────────────────────────────────

@pytest.mark.parametrize("entrada,esperado", [
    ("CWM260420-04", "2004"),   # el guion no cuenta como carácter del sufijo
    ("A 83332", "3332"),        # ni el espacio
    ("REM 1846", "1846"),
    ("MCZ65377801", "7801"),
    ("27", "0027"),             # más corto que 4 → se rellena
    ("", "0000"),
    ("rem-9", "REM9"),          # normaliza a mayúsculas
])
def test_sufijo(entrada, esperado):
    assert _sufijo(entrada) == esperado


def test_sanitizar_quita_control_zpl():
    """Una descripción con ^ o ~ rompería la etiqueta completa."""
    assert "^" not in _sanitizar("CAJA ^FS DE CARTON")
    assert "~" not in _sanitizar("EMPAQUE ~JA GRANDE")
    assert _sanitizar(None) == ""


def test_fmt_cantidad_sin_ceros_de_relleno():
    assert fmt_cantidad("1000.00") == "1000"
    assert fmt_cantidad("2.50") == "2.5"
    assert fmt_cantidad("0.75") == "0.75"


def test_generar_zpl_bien_formado():
    zpl = generar_zpl(
        lote_id="20260731_1846_7801_1",
        numero_parte="MCZ65377801",
        descripcion="DUCT INSULATION",
        cantidad=250,
        unidad_de_medida="PZA",
        fecha_recepcion=date(2026, 7, 31),
    )
    assert zpl.startswith("^XA") and zpl.endswith("^XZ")
    assert "^PW831^LL406" in zpl          # 104 x 50.8 mm a 203 dpi
    assert "^CI28" in zpl                 # UTF-8 para los acentos
    assert "^GFA,1125,1125,15," in zpl    # logo 118x75 a 1 bit
    assert "^BQN,2,6^FDQA,20260731_1846_7801_1^FS" in zpl   # QR con el lote
    assert "CHEONG WOON MEXICO" in zpl
    for etiqueta in ("Número de Parte:", "Descripción:", "Cantidad:",
                     "Fecha Recepción:", "Lote ID:"):
        assert etiqueta in zpl
    assert "31/07/2026" in zpl


def test_layout_cabe_en_la_etiqueta():
    """Ningún campo puede salirse de los 831 x 406 dots, ni el texto invadir el QR.

    Es una red de seguridad para cuando se ajuste el layout con impresiones
    reales: un ^FO mal puesto imprimiría media etiqueta cortada.
    """
    import re as _re
    from app.services import zpl_etiquetas as z

    zpl = generar_zpl("20260731_1846_7801_1", "MCZ65377801", "DUCT INSULATION",
                      250, "PZA", date(2026, 7, 31))

    origenes = [(int(x), int(y)) for x, y in _re.findall(r"\^FO(\d+),(\d+)", zpl)]
    assert origenes, "no se encontró ningún ^FO"
    for x, y in origenes:
        assert 0 <= x < z.ANCHO_DOTS and 0 <= y < z.ALTO_DOTS, f"^FO{x},{y} fuera de la etiqueta"

    # El logo y la línea divisoria caben a lo ancho
    assert z.MARGEN + z.LOGO_ANCHO < z.ANCHO_DOTS
    # La columna de texto termina antes de donde arranca el QR
    fin_texto = z.MARGEN + z.ANCHO_TEXTO
    x_qr = min(x for x, y in origenes if y >= 150 and x > fin_texto)
    assert fin_texto < x_qr, "el bloque de texto se encima con el QR"
    # El QR más grande que puede salir (versión 3, 29 módulos x 6 dots) cabe
    assert x_qr + 29 * 6 <= z.ANCHO_DOTS


def test_generar_zpl_no_se_rompe_con_descripcion_maliciosa():
    zpl = generar_zpl(
        lote_id="20260731_1846_7801_1",
        numero_parte="X^Y",
        descripcion="CAJA ^XZ^FO0,0^FDHACK^FS",
        cantidad=1,
        unidad_de_medida=None,
        fecha_recepcion=date(2026, 7, 31),
    )
    # Un solo ^XZ: el del cierre. Si el sanitizado fallara habría dos etiquetas.
    assert zpl.count("^XZ") == 1
    assert "HACK" in zpl        # el texto se conserva, solo se neutraliza el control


# ── Endpoints ─────────────────────────────────────────────────────────

@pytest.fixture
def fotos_tmp(tmp_path, monkeypatch):
    """Aísla la carpeta de fotos y de templates OCR (igual que test_remisiones_ocr)."""
    from app.routers import remisiones as router_mod
    from app.services import ocr_remisiones

    monkeypatch.setattr(router_mod, "FOTOS_ROOT", tmp_path / "remisiones")
    monkeypatch.setattr(ocr_remisiones, "TEMPLATES_DIR", tmp_path / "ocr_templates")
    monkeypatch.setattr(ocr_remisiones, "_texto_ocr_desde_imagen", lambda b: "TEXTO DE PRUEBA")
    return tmp_path


@pytest.fixture
def producto_etiqueta(client):
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models.producto import Producto

    async def _crear():
        async with AsyncSessionLocal() as db:
            existe = await db.execute(select(Producto).where(Producto.sku == "ETQ-TEST-1"))
            if not existe.scalars().first():
                db.add(Producto(
                    sku="ETQ-TEST-1", nombre="Parte de etiquetas",
                    descripcion="Componente para pruebas de etiqueta",
                    unidad_de_medida="PZA", tipo="COMPONENTE", modelo="TEST",
                ))
                await db.commit()
    asyncio.run(_crear())


@pytest.fixture
def remision(client, fotos_tmp, monkeypatch, producto_etiqueta):
    """Crea una remisión R-2026-4271 con una partida de 10 piezas."""
    from app.services import ocr_remisiones
    from app.services.ocr_remisiones import ResultadoExtraccion

    async def ok(_bytes):
        return ResultadoExtraccion(tipo_detectado="departure_sheet", datos={}, advertencias=[])
    monkeypatch.setattr(ocr_remisiones, "extraer_con_ejemplos", ok)

    foto = client.post(
        "/api/remisiones/ocr",
        files={"file": ("remision.jpg", io.BytesIO(FOTO_JPG), "image/jpeg")},
    ).json()["foto_path"]

    res = client.post("/api/remisiones", json={
        "proveedor": "PROVEEDOR ETIQUETAS",
        "numero_remision": "R-2026-4271",
        "fecha": "2026-07-31",
        "tipo_documento": "departure_sheet",
        "foto_path": foto,
        "items": [{"numero_parte": "ETQ-TEST-1", "cantidad": 10}],
    })
    assert res.status_code == 201, res.text
    return res.json()


def test_etiquetas_formato_de_lote_id(client, remision):
    item_id = remision["items"][0]["id"]
    res = client.post(f"/api/remisiones/{remision['id']}/etiquetas", json={
        "items": [{"item_id": item_id, "cantidades": [4, 3, 3]}],
    })
    assert res.status_code == 201, res.text
    etiquetas = res.json()
    assert len(etiquetas) == 3

    # {fecha}_{últimos4 remisión}_{últimos4 parte}_{n}
    sufijo_parte = _sufijo("ETQ-TEST-1")
    # `n` arranca donde haya quedado el prefijo (otras remisiones del mismo día
    # con la misma parte siguen contando), pero es consecutivo dentro del lote
    inicio = etiquetas[0]["secuencia"]
    esperados = [f"{e['fecha_recepcion'].replace('-', '')}_4271_{sufijo_parte}_{inicio + i}"
                 for i, e in enumerate(etiquetas)]
    assert [e["lote_id"] for e in etiquetas] == esperados
    assert [e["secuencia"] for e in etiquetas] == [inicio, inicio + 1, inicio + 2]
    assert [e["cantidad"] for e in etiquetas] == [4, 3, 3]
    assert all(e["estado_impresion"] == "pendiente" for e in etiquetas)

    # El detalle las devuelve para poder reimprimirlas
    detalle = client.get(f"/api/remisiones/{remision['id']}").json()
    assert len(detalle["etiquetas"]) == 3


def test_etiquetas_rechaza_suma_mayor_a_lo_recibido(client, remision):
    item_id = remision["items"][0]["id"]
    res = client.post(f"/api/remisiones/{remision['id']}/etiquetas", json={
        "items": [{"item_id": item_id, "cantidades": [6, 5]}],   # 11 > 10
    })
    assert res.status_code == 422
    assert "excede" in res.json()["detail"]

    # Nada quedó a medias: la validación corre completa antes de escribir
    assert client.get(f"/api/remisiones/{remision['id']}").json()["etiquetas"] == []


def test_etiquetas_permite_etiquetado_parcial(client, remision):
    item_id = remision["items"][0]["id"]
    res = client.post(f"/api/remisiones/{remision['id']}/etiquetas", json={
        "items": [{"item_id": item_id, "cantidades": [4]}],   # 4 de 10
    })
    assert res.status_code == 201


def test_etiquetas_rechaza_cantidad_no_positiva_y_partida_ajena(client, remision):
    item_id = remision["items"][0]["id"]
    res = client.post(f"/api/remisiones/{remision['id']}/etiquetas", json={
        "items": [{"item_id": item_id, "cantidades": [5, 0]}],
    })
    assert res.status_code == 422
    assert "cero o negativas" in res.json()["detail"]

    res = client.post(f"/api/remisiones/{remision['id']}/etiquetas", json={
        "items": [{"item_id": 999999, "cantidades": [1]}],
    })
    assert res.status_code == 422
    assert "no pertenece" in res.json()["detail"]


def test_etiquetas_no_se_generan_dos_veces(client, remision):
    item_id = remision["items"][0]["id"]
    assert client.post(f"/api/remisiones/{remision['id']}/etiquetas", json={
        "items": [{"item_id": item_id, "cantidades": [10]}],
    }).status_code == 201

    res = client.post(f"/api/remisiones/{remision['id']}/etiquetas", json={
        "items": [{"item_id": item_id, "cantidades": [1]}],
    })
    assert res.status_code == 409


def test_cola_reclamar_confirmar_y_reimprimir(client, remision, monkeypatch):
    monkeypatch.setenv("GATEWAY_API_KEY", "clave-de-prueba")
    from app.core import deps
    monkeypatch.setattr(deps, "GATEWAY_API_KEY", "clave-de-prueba", raising=False)
    headers = {"X-API-Key": "clave-de-prueba"}
    impresora = {"impresora": "ZDesigner ZD220-203dpi ZPL", "max": 50}

    # La BD de tests es compartida: vaciar lo que hayan dejado otros tests
    while client.post("/api/impresion/reclamar", headers=headers, json=impresora).json():
        pass

    item_id = remision["items"][0]["id"]
    etiquetas = client.post(f"/api/remisiones/{remision['id']}/etiquetas", json={
        "items": [{"item_id": item_id, "cantidades": [5, 5]}],
    }).json()

    # Sin API key no se entrega nada
    assert client.post("/api/impresion/reclamar",
                       json={"impresora": "ZDesigner ZD220-203dpi ZPL"}).status_code == 401

    trabajos = client.post("/api/impresion/reclamar", headers=headers, json=impresora).json()
    assert len(trabajos) == 2
    assert all(t["zpl"].startswith("^XA") for t in trabajos)

    # Ya reclamados: no se vuelven a entregar (si no, saldrían duplicados)
    assert client.post("/api/impresion/reclamar", headers=headers, json=impresora).json() == []

    client.post("/api/impresion/confirmar", headers=headers, json={"resultados": [
        {"id": trabajos[0]["id"], "ok": True},
        {"id": trabajos[1]["id"], "ok": False, "error": "Sin papel"},
    ]})
    estados = {e["lote_id"]: e["estado_impresion"]
               for e in client.get(f"/api/remisiones/{remision['id']}").json()["etiquetas"]}
    assert sorted(estados.values()) == ["error", "impreso"]

    # La que falló se reencola reusando su ZPL original
    fallida = etiquetas[1]["id"]
    assert client.post(f"/api/remisiones/etiquetas/{fallida}/reimprimir").status_code == 202
    reencolados = client.post("/api/impresion/reclamar", headers=headers, json=impresora).json()
    assert len(reencolados) == 1
    assert etiquetas[1]["lote_id"] in reencolados[0]["zpl"]


# ── Enlace con inventario e IQC ───────────────────────────────────────

def test_etiquetas_crean_lote_de_inventario_pendiente_iqc(client, remision):
    """La etiqueta impresa ES el lote: mismo lote_id, listo para IQC."""
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models.lote_inventario import LoteInventario, MovimientoLote

    item_id = remision["items"][0]["id"]
    etiquetas = client.post(f"/api/remisiones/{remision['id']}/etiquetas", json={
        "items": [{"item_id": item_id, "cantidades": [6, 4]}],
    }).json()

    async def _leer(lote_id):
        async with AsyncSessionLocal() as db:
            lote = (await db.execute(
                select(LoteInventario).where(LoteInventario.lote_id == lote_id)
            )).scalars().first()
            movs = (await db.execute(
                select(MovimientoLote).where(MovimientoLote.lote_id == lote_id)
            )).scalars().all()
            return lote, [m.tipo for m in movs]

    for etiqueta, cantidad in zip(etiquetas, [6, 4]):
        lote, tipos = asyncio.run(_leer(etiqueta["lote_id"]))
        assert lote is not None, f"no se creó el lote de {etiqueta['lote_id']}"
        assert lote.estado_calidad == "Pendiente IQC"
        assert lote.sku_producto == "ETQ-TEST-1"      # SKU completo, no el sufijo
        assert lote.cantidad_actual == cantidad       # cantidad de ESA caja
        assert lote.ubicacion_id is None              # se ubica tras aprobar IQC
        assert lote.numero_remision == "R-2026-4271"
        assert lote.bultos == 1
        assert lote.oc_origen is None
        assert "RECEPCION_REMISION" in tipos


def test_lookup_calidad_de_una_etiqueta(client, remision):
    item_id = remision["items"][0]["id"]
    etiquetas = client.post(f"/api/remisiones/{remision['id']}/etiquetas", json={
        "items": [{"item_id": item_id, "cantidades": [5, 5]}],
    }).json()

    res = client.get(f"/calidad/lote/{etiquetas[0]['lote_id']}")
    assert res.status_code == 200, res.text
    info = res.json()
    # El SKU sale del item, NO de parsear los 4 caracteres del lote_id
    assert info["sku_producto"] == "ETQ-TEST-1"
    assert info["cantidad"] == 5                 # la caja, no las 10 de la partida
    assert info["total_etiquetas"] == 2          # "Caja 1 de 2"
    assert info["proveedor"] == "PROVEEDOR ETIQUETAS"
    assert info["numero_remision"] == "R-2026-4271"
    assert info["estado_calidad"] == "Pendiente IQC"

    assert client.get("/calidad/lote/20260731_0000_0000_9").status_code == 404


def test_iqc_aprueba_solo_la_caja_escaneada(client, remision):
    """Aprobar una etiqueta no toca a sus hermanas, y la deja lista para ubicar."""
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models.lote_inventario import LoteInventario

    item_id = remision["items"][0]["id"]
    etiquetas = client.post(f"/api/remisiones/{remision['id']}/etiquetas", json={
        "items": [{"item_id": item_id, "cantidades": [3, 3, 4]}],
    }).json()

    for etiqueta, resultado in zip(etiquetas, ["Aprobado", "Aprobado", "Rechazado"]):
        info = client.get(f"/calidad/lote/{etiqueta['lote_id']}").json()
        res = client.post("/calidad/inspecciones", json={
            "lote_id": info["lote_id"],
            "sku_producto": info["sku_producto"],
            "tipo_inspeccion": "IQC",
            "resultado_final": resultado,
            "resultados_puntos": [],
            "cantidad_inspeccionada": info["cantidad"],
        })
        assert res.status_code == 200, res.text
        # Se actualizó el lote existente, no se creó uno fantasma
        assert res.json()["lote_creado"] is False

    async def _estados():
        async with AsyncSessionLocal() as db:
            filas = (await db.execute(
                select(LoteInventario.lote_id, LoteInventario.estado_calidad, LoteInventario.ubicacion_id)
                .where(LoteInventario.lote_id.in_([e["lote_id"] for e in etiquetas]))
                .order_by(LoteInventario.lote_id)
            )).all()
            return filas

    filas = asyncio.run(_estados())
    assert [f.estado_calidad for f in filas] == ["Aprobado", "Aprobado", "Rechazado"]
    # Aprobado + sin ubicación = aparece en "Pendientes de Ubicar"
    assert all(f.ubicacion_id is None for f in filas)


# ── Hoja carta (HP de red) ────────────────────────────────────────────

def _datos_pdf(n: int):
    from app.services.pdf_etiquetas import DatosEtiqueta
    return [DatosEtiqueta(
        lote_id=f"20260803_4271_TST1_{i + 1}",
        numero_parte="ETQ-TEST-1",
        descripcion="COMPONENTE PARA PRUEBAS DE ETIQUETA EN HOJA CARTA",
        cantidad=10,
        unidad_de_medida="PZA",
        fecha_recepcion=date(2026, 8, 3),
    ) for i in range(n)]


@pytest.mark.parametrize("etiquetas,hojas", [(1, 1), (8, 1), (9, 2), (12, 2), (17, 3)])
def test_pdf_pagina_de_ocho_en_ocho(etiquetas, hojas):
    """La grilla es 2 x 4: la novena etiqueta obliga a una hoja nueva."""
    import re as _re
    from app.services.pdf_etiquetas import generar_pdf

    pdf = generar_pdf(_datos_pdf(etiquetas))
    assert pdf.startswith(b"%PDF")
    # El nodo /Pages lleva el total; evita contar objetos a mano
    assert max(int(n) for n in _re.findall(rb"/Count (\d+)", pdf)) == hojas


def test_pdf_layout_cabe_en_la_hoja():
    """Red de seguridad de la geometría: la grilla no puede salirse del papel."""
    from app.services import pdf_etiquetas as p

    ancho = 2 * p.MARGEN_X + p.COLUMNAS * p.ETIQUETA_ANCHO + (p.COLUMNAS - 1) * p.SEPARACION
    alto = 2 * p.MARGEN_Y + p.FILAS * p.ETIQUETA_ALTO + (p.FILAS - 1) * p.SEPARACION
    assert abs(ancho - p.ANCHO_HOJA) < 0.01 and abs(alto - p.ALTO_HOJA) < 0.01

    # Margen no imprimible de la E78625: ~4.2 mm. Sin esto la etiqueta sale cortada.
    assert p.MARGEN_X > 4.5 * p.mm and p.MARGEN_Y > 4.5 * p.mm
    # Misma proporción que la etiqueta de la Zebra (104 x 50.8 mm)
    assert abs(p.ETIQUETA_ANCHO / p.ETIQUETA_ALTO - 104 / 50.8) < 0.01
    # La columna de texto termina antes de donde arranca el QR, y el QR no se
    # sale por el borde derecho
    assert p.MARGEN + p.ANCHO_TEXTO < p.QR_X
    assert p.QR_X + p.QR_LADO <= p.ETIQUETA_ANCHO - p.MARGEN
    assert p.QR_Y + p.QR_LADO <= p.ETIQUETA_ALTO - p.MARGEN


def test_pjl_declara_carta_y_sin_duplex():
    """Sin DUPLEX=OFF la impresora arrastra el dúplex del trabajo anterior."""
    from app.services.impresion_red import _envolver_pjl

    envuelto = _envolver_pjl(b"%PDF-1.4 fake", 'Etiquetas "R-1"')
    assert envuelto.startswith(b"\x1b%-12345X")
    assert envuelto.endswith(b"\x1b%-12345X")
    assert b"@PJL SET PAPER=LETTER" in envuelto
    assert b"@PJL SET DUPLEX=OFF" in envuelto
    assert b"@PJL ENTER LANGUAGE=PDF" in envuelto
    assert b"%PDF-1.4 fake" in envuelto
    # Las comillas del título romperían el JOB NAME
    assert b'@PJL JOB NAME="Etiquetas R-1"' in envuelto


@pytest.fixture
def hp_falsa(monkeypatch):
    """Sustituye la HP por una lista donde se apunta lo que se le mandó."""
    from app.services import impresion_red

    enviados: list[tuple[bytes, str]] = []

    async def _fake(pdf: bytes, titulo: str):
        enviados.append((pdf, titulo))

    monkeypatch.setattr(impresion_red, "enviar_pdf", _fake)
    return enviados


def test_etiquetas_en_hoja_carta_no_pasan_por_la_cola(client, remision, hp_falsa):
    """El backend imprime en línea: nada de ZPL y nada que reclame el agente."""
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models.impresion_trabajo import ImpresionTrabajo

    item_id = remision["items"][0]["id"]
    res = client.post(f"/api/remisiones/{remision['id']}/etiquetas", json={
        "items": [{"item_id": item_id, "cantidades": [4, 3, 3]}],
        "destino": "carta",
    })
    assert res.status_code == 201, res.text
    etiquetas = res.json()
    assert len(etiquetas) == 3
    # Ya salieron: la UI no puede mostrarlas como "pendiente"
    assert {e["estado_impresion"] for e in etiquetas} == {"impreso"}

    # Una sola hoja con las tres etiquetas, no tres envíos
    assert len(hp_falsa) == 1
    pdf, titulo = hp_falsa[0]
    assert pdf.startswith(b"%PDF") and "R-2026-4271" in titulo

    async def _trabajos():
        async with AsyncSessionLocal() as db:
            return (await db.execute(
                select(ImpresionTrabajo.formato, ImpresionTrabajo.zpl, ImpresionTrabajo.estado)
                .where(ImpresionTrabajo.etiqueta_id.in_([e["id"] for e in etiquetas]))
            )).all()

    filas = asyncio.run(_trabajos())
    assert len(filas) == 3
    assert all(f.formato == "pdf" and f.zpl is None and f.estado == "impreso" for f in filas)

    # El agente de Windows no debe ver ninguno de estos trabajos
    headers = {"X-API-Key": API_KEY}
    pendientes = client.post("/api/impresion/reclamar", headers=headers,
                             json={"impresora": "HP Color LaserJet MFP E78625", "max": 50}).json()
    assert pendientes == []


def test_fallo_de_impresion_no_deja_etiquetas_ni_lotes(client, remision, monkeypatch):
    """Si la HP no contesta, la remisión queda como estaba: nada a medias."""
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models.lote_inventario import LoteInventario
    from app.services import impresion_red

    async def _explota(pdf, titulo):
        raise OSError("Connection refused")
    monkeypatch.setattr(impresion_red, "enviar_pdf", _explota)

    async def _lotes():
        # La base en memoria se comparte entre tests y varios usan el mismo
        # numero_remision: hay que comparar contra lo que ya había.
        async with AsyncSessionLocal() as db:
            return set((await db.execute(
                select(LoteInventario.lote_id)
                .where(LoteInventario.numero_remision == "R-2026-4271")
            )).scalars().all())

    antes = asyncio.run(_lotes())

    item_id = remision["items"][0]["id"]
    res = client.post(f"/api/remisiones/{remision['id']}/etiquetas", json={
        "items": [{"item_id": item_id, "cantidades": [5, 5]}],
        "destino": "carta",
    })
    assert res.status_code == 502
    assert "No se generó ninguna etiqueta" in res.json()["detail"]

    # Ni etiquetas ni lotes nuevos: se reintenta sin limpiar nada a mano
    assert client.get(f"/api/remisiones/{remision['id']}").json()["etiquetas"] == []
    assert asyncio.run(_lotes()) == antes


def test_reimpresion_en_carta_de_una_etiqueta_de_zebra(client, remision, hp_falsa):
    """Se puede rescatar en papel una etiqueta que la Zebra no sacó."""
    item_id = remision["items"][0]["id"]
    etiquetas = client.post(f"/api/remisiones/{remision['id']}/etiquetas", json={
        "items": [{"item_id": item_id, "cantidades": [10]}],
    }).json()

    res = client.post(f"/api/remisiones/etiquetas/{etiquetas[0]['id']}/reimprimir",
                      json={"destino": "carta"})
    assert res.status_code == 202, res.text
    assert len(hp_falsa) == 1
    # Una etiqueta suelta ocupa una hoja, y lleva el lote_id de la original
    assert etiquetas[0]["lote_id"] in hp_falsa[0][1]


def test_destinos_solo_ofrece_lo_que_responde(client, monkeypatch):
    """El modal se arma con esto: una impresora caída no puede aparecer."""
    from app.routers import impresion as router_mod
    from app.services import impresion_red

    async def _no_responde():
        return False
    monkeypatch.setattr(impresion_red, "disponible", _no_responde)
    monkeypatch.setattr(router_mod, "ULTIMO_VISTO", {})

    destinos = client.get("/api/impresion/destinos").json()
    assert {d["id"] for d in destinos} == {"zebra", "carta"}
    assert all(not d["disponible"] for d in destinos)
    assert "no se ha conectado" in next(d for d in destinos if d["id"] == "zebra")["detalle"]

    # Con el agente sondeando, la Zebra vuelve
    from datetime import datetime
    from app.services import zpl_etiquetas
    monkeypatch.setattr(router_mod, "ULTIMO_VISTO", {
        zpl_etiquetas.IMPRESORA_DEFAULT: datetime.now(router_mod.TZ_LOCAL),
    })
    destinos = client.get("/api/impresion/destinos").json()
    assert next(d for d in destinos if d["id"] == "zebra")["disponible"] is True
    assert next(d for d in destinos if d["id"] == "carta")["disponible"] is False
