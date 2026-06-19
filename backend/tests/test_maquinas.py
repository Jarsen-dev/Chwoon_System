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
    data = client.get("/maquinas/").json()
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
