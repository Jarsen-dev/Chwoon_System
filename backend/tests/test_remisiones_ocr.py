"""Tests del flujo de Recepciones por Foto (OCR) — sin Ollama real.

Las llamadas a Ollama se parchean; lo que se valida aquí es:
  - utilidades del servicio (rutas null, parseo con respaldo, loader de templates)
  - que el endpoint /ocr nunca rompa el flujo aunque Ollama esté caído
  - validación de números de parte contra productos al guardar
  - guardado de templates nuevos (formato desconocido)
  - ciclo de vida completo de las sesiones QR
"""

import asyncio
import io
import json
import uuid
from datetime import datetime, timedelta

import httpx
import pytest

from app.services import ocr_remisiones
from app.services.ocr_remisiones import (
    ResultadoExtraccion,
    _encontrar_campos_null,
    _parsear_json_respuesta,
    slugify_tipo,
)

FOTO_JPG = b"\xff\xd8\xff\xe0" + b"0" * 100  # bytes con magic number de JPEG


# ══════════════════════════════════════════════════════════════════════
# Utilidades del servicio
# ══════════════════════════════════════════════════════════════════════

def test_encontrar_campos_null_anidados():
    datos = {
        "proveedor": "ACME",
        "numero_remision": None,
        "items": [
            {"numero_parte": "MCZ123", "cantidad": None},
            {"numero_parte": None, "cantidad": 5},
        ],
    }
    rutas = _encontrar_campos_null(datos)
    assert rutas == ["numero_remision", "items[0].cantidad", "items[1].numero_parte"]


def test_parsear_json_con_texto_extra():
    contenido = 'Claro, aquí está el JSON:\n{"proveedor": "ACME", "items": []}\nSaludos'
    assert _parsear_json_respuesta(contenido) == {"proveedor": "ACME", "items": []}


def test_parsear_json_invalido_lanza():
    with pytest.raises(ValueError):
        _parsear_json_respuesta("no hay json aquí")


def test_slugify_tipo():
    assert slugify_tipo("Remisión ACME 2026!") == "remisi_n_acme_2026"
    assert slugify_tipo("  departure_sheet  ") == "departure_sheet"
    assert slugify_tipo("***") == ""


def test_loader_salta_json_invalido(tmp_path, monkeypatch):
    monkeypatch.setattr(ocr_remisiones, "TEMPLATES_DIR", tmp_path)
    carpeta = tmp_path / "tipo_x"
    carpeta.mkdir()
    # Par válido
    (carpeta / "ejemplo_1.jpg").write_bytes(FOTO_JPG)
    (carpeta / "ejemplo_1.json").write_text('{"proveedor": "OK", "items": []}')
    # JSON con coma colgante (inválido) — se omite con warning, no truena
    (carpeta / "ejemplo_2.jpg").write_bytes(FOTO_JPG)
    (carpeta / "ejemplo_2.json").write_text('{"proveedor": "MAL",}')
    # JSON sin imagen — se omite
    (carpeta / "ejemplo_3.json").write_text('{"proveedor": "SIN_FOTO", "items": []}')

    ejemplos = ocr_remisiones._cargar_ejemplos("tipo_x")
    assert len(ejemplos) == 1
    assert "OK" in ejemplos[0][1]
    assert ocr_remisiones.listar_tipos_documento() == ["tipo_x"]


def test_guardar_template_y_limite(tmp_path, monkeypatch):
    monkeypatch.setattr(ocr_remisiones, "TEMPLATES_DIR", tmp_path)
    datos = {"proveedor": "ACME", "numero_remision": "1", "po": None,
             "fecha": "2026-07-28", "items": [{"numero_parte": "X1", "cantidad": 10}]}

    ruta = ocr_remisiones.guardar_template("Nuevo Formato", FOTO_JPG, datos)
    assert ruta == "nuevo_formato/ejemplo_1.json"
    guardado = json.loads((tmp_path / ruta).read_text())
    assert guardado["items"][0]["numero_parte"] == "X1"

    ocr_remisiones.guardar_template("nuevo_formato", FOTO_JPG, datos)
    with pytest.raises(ValueError):  # MAX_EJEMPLOS_POR_TIPO alcanzado
        ocr_remisiones.guardar_template("nuevo_formato", FOTO_JPG, datos)


def test_extraer_con_ollama_caido(tmp_path, monkeypatch):
    """Con Ollama inaccesible el servicio regresa ocr_ok=False, nunca lanza."""
    monkeypatch.setattr(ocr_remisiones, "TEMPLATES_DIR", tmp_path)
    carpeta = tmp_path / "tipo_x"
    carpeta.mkdir()
    (carpeta / "ejemplo_1.jpg").write_bytes(FOTO_JPG)
    (carpeta / "ejemplo_1.json").write_text('{"proveedor": "OK", "items": []}')

    async def explota(*args, **kwargs):
        raise httpx.ConnectError("conexión rechazada")

    monkeypatch.setattr(httpx.AsyncClient, "post", explota)
    resultado = asyncio.run(ocr_remisiones.extraer_con_ejemplos(FOTO_JPG))
    assert resultado.ocr_ok is False
    assert resultado.tipo_detectado == "desconocido"
    assert resultado.datos == {}


# ══════════════════════════════════════════════════════════════════════
# Endpoints
# ══════════════════════════════════════════════════════════════════════

@pytest.fixture
def fotos_tmp(tmp_path, monkeypatch):
    from app.routers import remisiones as router_mod
    monkeypatch.setattr(router_mod, "FOTOS_ROOT", tmp_path / "remisiones")
    monkeypatch.setattr(ocr_remisiones, "TEMPLATES_DIR", tmp_path / "ocr_templates")
    return tmp_path


def _subir_foto(client, url="/api/remisiones/ocr"):
    return client.post(
        url,
        files={"file": ("remision.jpg", io.BytesIO(FOTO_JPG), "image/jpeg")},
    )


def test_ocr_con_ollama_caido_no_rompe(client, fotos_tmp, monkeypatch):
    async def caido(_bytes):
        return ResultadoExtraccion(
            tipo_detectado="desconocido", ocr_ok=False, error="sin conexión"
        )
    monkeypatch.setattr(ocr_remisiones, "extraer_con_ejemplos", caido)

    res = _subir_foto(client)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["ocr_ok"] is False
    assert data["items"] == []
    assert data["tipo_conocido"] is False
    # La foto quedó guardada aunque el OCR falló (evidencia)
    nombre = data["foto_path"].split("/")[-1]
    assert (fotos_tmp / "remisiones" / nombre).is_file()


def test_ocr_rechaza_no_imagen(client, fotos_tmp):
    res = client.post(
        "/api/remisiones/ocr",
        files={"file": ("datos.xlsx", io.BytesIO(b"PK"), "application/vnd.ms-excel")},
    )
    assert res.status_code == 400


def _foto_guardada(client, fotos_tmp, monkeypatch) -> str:
    """Sube una foto vía /ocr (con OCR parcheado) y regresa su foto_path."""
    async def ok(_bytes):
        return ResultadoExtraccion(tipo_detectado="departure_sheet", datos={}, advertencias=[])
    monkeypatch.setattr(ocr_remisiones, "extraer_con_ejemplos", ok)
    return _subir_foto(client).json()["foto_path"]


def _payload_remision(foto_path, **extra):
    base = {
        "proveedor": "DELTA TECH",
        "numero_remision": "R-100",
        "po": None,
        "fecha": "2026-07-28",
        "tipo_documento": "departure_sheet",
        "foto_path": foto_path,
        "items": [{"numero_parte": "MCZ-TEST-1", "cantidad": 100}],
    }
    base.update(extra)
    return base


@pytest.fixture
def producto_test(client):
    """Asegura un producto MCZ-TEST-1 en el catálogo (una sola vez por sesión)."""
    from app.database import AsyncSessionLocal
    from app.models.producto import Producto
    from sqlalchemy import select

    async def _crear():
        async with AsyncSessionLocal() as db:
            existe = await db.execute(select(Producto).where(Producto.sku == "MCZ-TEST-1"))
            if not existe.scalars().first():
                db.add(Producto(
                    sku="MCZ-TEST-1", nombre="Ducto de prueba",
                    descripcion="Ducto ABS prueba", unidad_de_medida="PZA",
                    tipo="COMPONENTE", modelo="TEST",
                ))
                await db.commit()
    asyncio.run(_crear())


def test_crear_remision_sku_desconocido(client, fotos_tmp, monkeypatch):
    foto = _foto_guardada(client, fotos_tmp, monkeypatch)
    payload = _payload_remision(foto, items=[{"numero_parte": "NO-EXISTE-99", "cantidad": 5}])
    res = client.post("/api/remisiones", json=payload)
    assert res.status_code == 400
    assert "NO-EXISTE-99" in res.json()["detail"]


def test_crear_remision_ok_con_snapshot(client, fotos_tmp, monkeypatch, producto_test):
    foto = _foto_guardada(client, fotos_tmp, monkeypatch)
    res = client.post("/api/remisiones", json=_payload_remision(foto))
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["creado_por"] == "admin"
    assert data["items"][0]["descripcion"] == "Ducto ABS prueba"
    assert data["items"][0]["unidad_de_medida"] == "PZA"

    # Aparece en el listado paginado
    listado = client.get("/api/remisiones?limit=50&offset=0").json()
    assert listado["total"] >= 1
    assert any(r["numero_remision"] == "R-100" for r in listado["items"])

    # La foto se sirve por el endpoint autenticado
    nombre = data["foto_path"].split("/")[-1]
    assert client.get(f"/api/remisiones/foto/{nombre}").status_code == 200
    assert client.get("/api/remisiones/foto/..%2FLogo.png").status_code == 404


def test_crear_remision_formato_nuevo_guarda_template(client, fotos_tmp, monkeypatch, producto_test):
    foto = _foto_guardada(client, fotos_tmp, monkeypatch)
    payload = _payload_remision(
        foto,
        numero_remision="R-200",
        tipo_documento="desconocido",
        nuevo_formato={"tipo_documento": "Remisión ACME"},
    )
    res = client.post("/api/remisiones", json=payload)
    assert res.status_code == 201, res.text
    assert res.json()["tipo_documento"] == "remisi_n_acme"

    template = fotos_tmp / "ocr_templates" / "remisi_n_acme" / "ejemplo_1.json"
    assert template.is_file()
    contenido = json.loads(template.read_text())
    assert contenido["numero_remision"] == "R-200"
    assert contenido["items"][0]["numero_parte"] == "MCZ-TEST-1"

    # Mismo nombre de nuevo → 409
    foto2 = _foto_guardada(client, fotos_tmp, monkeypatch)
    payload2 = _payload_remision(
        foto2, numero_remision="R-201", tipo_documento="desconocido",
        nuevo_formato={"tipo_documento": "remisi_n_acme"},
    )
    assert client.post("/api/remisiones", json=payload2).status_code == 409


# ══════════════════════════════════════════════════════════════════════
# Sesiones QR
# ══════════════════════════════════════════════════════════════════════

def test_qr_ciclo_completo(client, fotos_tmp, monkeypatch):
    res = client.post("/api/remisiones/qr-session")
    assert res.status_code == 200, res.text
    sid = res.json()["session_id"]

    # Estado público inicial
    estado = client.get(f"/api/remisiones/qr-session/{sid}").json()
    assert estado == {"estado": "pendiente", "valida": True}

    # El celular sube la foto (sin JWT)
    res = client.post(
        f"/api/remisiones/qr-session/{sid}/upload",
        files={"file": ("foto.jpg", io.BytesIO(FOTO_JPG), "image/jpeg")},
    )
    assert res.status_code == 200, res.text
    assert client.get(f"/api/remisiones/qr-session/{sid}").json()["estado"] == "subida"

    # Segundo upload → 410 (un solo uso)
    res = client.post(
        f"/api/remisiones/qr-session/{sid}/upload",
        files={"file": ("foto.jpg", io.BytesIO(FOTO_JPG), "image/jpeg")},
    )
    assert res.status_code == 410

    # El desktop corre OCR desde la sesión y la marca usada
    async def ok(_bytes):
        return ResultadoExtraccion(tipo_detectado="departure_sheet", datos={}, advertencias=[])
    monkeypatch.setattr(ocr_remisiones, "extraer_con_ejemplos", ok)
    res = client.post(f"/api/remisiones/ocr/desde-sesion/{sid}")
    assert res.status_code == 200, res.text
    assert client.get(f"/api/remisiones/qr-session/{sid}").json() == {
        "estado": "usada", "valida": False,
    }

    # Reusar la sesión para OCR → 404
    assert client.post(f"/api/remisiones/ocr/desde-sesion/{sid}").status_code == 404


def test_qr_sesion_expirada(client, fotos_tmp):
    from app.database import AsyncSessionLocal
    from app.models.remision_qr_sesion import RemisionQrSesion, ESTADO_PENDIENTE
    from app.models.remision_qr_sesion import TZ_LOCAL

    sid = str(uuid.uuid4())

    async def _crear_expirada():
        async with AsyncSessionLocal() as db:
            ayer = datetime.now(TZ_LOCAL) - timedelta(days=1)
            db.add(RemisionQrSesion(
                id=sid, estado=ESTADO_PENDIENTE, creado_por="admin",
                creado_en=ayer, expira_en=ayer + timedelta(minutes=10),
            ))
            await db.commit()
    asyncio.run(_crear_expirada())

    assert client.get(f"/api/remisiones/qr-session/{sid}").json()["valida"] is False
    res = client.post(
        f"/api/remisiones/qr-session/{sid}/upload",
        files={"file": ("foto.jpg", io.BytesIO(FOTO_JPG), "image/jpeg")},
    )
    assert res.status_code == 410

    assert client.get(f"/api/remisiones/qr-session/{uuid.uuid4()}").json() == {
        "estado": "inexistente", "valida": False,
    }
