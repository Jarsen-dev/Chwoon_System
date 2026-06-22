import asyncio

import pytest

from app.main import app
from app.core.deps import verify_gateway_key
from app.database import AsyncSessionLocal
from app.models.maquina import Maquina


def _seed_maquina(codigo="SHM-1234VS"):
    async def _crear():
        async with AsyncSessionLocal() as db:
            db.add(Maquina(codigo=codigo, nombre="Sunghoon Test", tipo="EPS",
                           marca_plc="LS XBM", activa=True))
            await db.commit()
    asyncio.run(_crear())


@pytest.fixture
def gateway_ok():
    """Sobrescribe la verificación de API key para los tests."""
    app.dependency_overrides[verify_gateway_key] = lambda: None
    yield
    app.dependency_overrides.pop(verify_gateway_key, None)


def test_evento_maquina_inexistente_404(client, gateway_ok):
    resp = client.post("/maquinas/evento", json={
        "maquina_codigo": "NO-EXISTE",
        "tipo_evento": "PIEZA",
        "valor": 1,
    })
    assert resp.status_code == 404, resp.text


def test_registrar_pieza_y_turno(client, gateway_ok):
    _seed_maquina()
    resp = client.post("/maquinas/evento", json={
        "maquina_codigo": "SHM-1234VS",
        "tipo_evento": "PIEZA",
        "valor": 173,
        "estado": "AUTO",
        "metadata": {"process_no": 4, "meta_h": 44},
    })
    assert resp.status_code == 200, resp.text
    assert resp.json()["ok"] is True

    # El evento debe quedar persistido con turno y fecha_turno asignados
    eventos = client.get("/maquinas/SHM-1234VS/eventos").json()
    assert len(eventos) >= 1
    ev = eventos[0]
    assert ev["tipo_evento"] == "PIEZA"
    assert ev["valor"] == 173
    assert ev["turno"] in ("DIA", "NOCHE")
    assert ev["fecha_turno"]
    assert ev["metadata"]["meta_h"] == 44


def test_listar_maquinas_con_estado(client, gateway_ok):
    _seed_maquina(codigo="SHM-OTRA")
    client.post("/maquinas/evento", json={
        "maquina_codigo": "SHM-OTRA",
        "tipo_evento": "PIEZA",
        "valor": 5,
        "metadata": {"meta_h": 40},
    })
    data = client.get("/maquinas/lista").json()
    codigos = {m["codigo"] for m in data}
    assert "SHM-OTRA" in codigos
    otra = next(m for m in data if m["codigo"] == "SHM-OTRA")
    assert otra["piezas_turno"] >= 1


def test_api_key_invalida_401(client):
    """Sin override, y con GATEWAY_API_KEY vacío en entorno de test, debe fallar."""
    resp = client.post("/maquinas/evento", json={
        "maquina_codigo": "SHM-1234VS",
        "tipo_evento": "PIEZA",
    })
    assert resp.status_code == 401, resp.text


def test_crear_maquina_y_aparece_en_lista(client):
    resp = client.post("/maquinas/crear", json={
        "codigo": "CK-1820",
        "nombre": "Cheonkwang CK-1820",
        "tipo": "EPS",
        "ip_hmi": "192.168.0.140",
        "umbral_incidencia_seg": 10,
    })
    assert resp.status_code == 201, resp.text
    assert resp.json()["codigo"] == "CK-1820"

    codigos = {m["codigo"] for m in client.get("/maquinas/lista").json()}
    assert "CK-1820" in codigos


def test_crear_maquina_codigo_duplicado_409(client):
    client.post("/maquinas/crear", json={"codigo": "DUP-1", "nombre": "Dup"})
    resp = client.post("/maquinas/crear", json={"codigo": "DUP-1", "nombre": "Dup 2"})
    assert resp.status_code == 409, resp.text


def test_patch_desactiva_oculta_de_lista(client):
    creada = client.post("/maquinas/crear", json={"codigo": "SOFT-1", "nombre": "Soft"}).json()
    resp = client.patch(f"/maquinas/{creada['id']}", json={"activa": False})
    assert resp.status_code == 200, resp.text
    assert resp.json()["activa"] is False

    codigos = {m["codigo"] for m in client.get("/maquinas/lista").json()}
    assert "SOFT-1" not in codigos


def test_patch_maquina_inexistente_404(client):
    resp = client.patch("/maquinas/999999", json={"nombre": "x"})
    assert resp.status_code == 404, resp.text


def test_telemetria_actualiza_estado_en_vivo(client, gateway_ok):
    _seed_maquina(codigo="TELE-1")
    resp = client.post("/maquinas/telemetria", json={
        "maquina_codigo": "TELE-1",
        "counter": 50,
        "process_no": 12,
        "meta_h": 44,
        "estado": "AUTO",
    })
    assert resp.status_code == 200, resp.text

    # El snapshot en vivo debe reflejarse en GET /maquinas/lista sin persistir un evento
    data = client.get("/maquinas/lista").json()
    m = next(x for x in data if x["codigo"] == "TELE-1")
    assert m["process_no"] == 12
    assert m["counter"] == 50
    assert m["estado_actual"] == "AUTO"
    assert m["piezas_turno"] == 0   # telemetría no cuenta como pieza


def test_eventos_filtro_familia_incidencia(client, gateway_ok):
    _seed_maquina(codigo="INC-1")
    client.post("/maquinas/evento", json={
        "maquina_codigo": "INC-1", "tipo_evento": "PIEZA", "valor": 1})
    client.post("/maquinas/evento", json={
        "maquina_codigo": "INC-1", "tipo_evento": "INCIDENCIA_INICIO",
        "metadata": {"incidencia": "PRESION HIDRAULICA ALTA"}})
    client.post("/maquinas/evento", json={
        "maquina_codigo": "INC-1", "tipo_evento": "INCIDENCIA_FIN",
        "metadata": {"incidencia": "PRESION HIDRAULICA ALTA", "duracion_seg": 60}})

    eventos = client.get("/maquinas/INC-1/eventos?tipo=INCIDENCIA").json()
    tipos = {e["tipo_evento"] for e in eventos}
    assert tipos == {"INCIDENCIA_INICIO", "INCIDENCIA_FIN"}
    assert len(eventos) == 2   # la PIEZA queda excluida del filtro
