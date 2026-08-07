#!/usr/bin/env python3
"""Integration tests for WMS modules."""
import subprocess, sys, time, json, os

BASE = "http://localhost:8001"
TOKEN = None

def log(msg): print(f"[TEST] {msg}")
def fail(msg): print(f"[FAIL] {msg}"); sys.exit(1)

def req(method, path, data=None, auth=True, check=True):
    import urllib.request
    url = f"{BASE}{path}"
    headers = {"Content-Type": "application/json"}
    if auth and TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    body = json.dumps(data).encode() if data else None
    req_obj = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req_obj, timeout=15)
        code = resp.status
        body_text = resp.read().decode()
        try:
            body_json = json.loads(body_text) if body_text else {}
        except json.JSONDecodeError:
            body_json = body_text
        if check and code >= 400:
            fail(f"{method} {path} => {code}: {body_text[:200]}")
        return code, body_json
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        if check:
            fail(f"{method} {path} => {e.code}: {body_text[:500]}")
        return e.code, json.loads(body_text) if body_text else {}

def login():
    global TOKEN
    code, data = req("POST", "/api/auth/login", {"username": "admin", "password": "admin123"}, auth=False)
    TOKEN = data["access_token"]
    log("Logged in, token obtained")

TS = str(int(time.time()))

def test_ubicaciones():
    log("=== UBICACIONES ===")
    # crear padre
    code, data = req("POST", "/almacen/ubicaciones", {"nombre": f"ALMACEN TEST {TS}", "tipo_zona": "ALMACEN"})
    assert code == 200, f"create ub padre failed: {data}"
    padre_id = data["id"]
    log(f"Created padre id={padre_id}")

    # crear hijo
    code, data = req("POST", "/almacen/ubicaciones", {"nombre": f"RACK-A1-{TS}", "tipo_zona": "APROBADO", "parent_id": padre_id, "capacidad_max": 5000})
    assert code == 200
    hijo_id = data["id"]
    log(f"Created hijo id={hijo_id}")

    # listar
    code, data = req("GET", "/almacen/ubicaciones")
    assert code == 200 and isinstance(data, list)
    assert any(u["id"] == hijo_id and u["tipo_zona"] == "APROBADO" for u in data)
    log("List ubicaciones OK")
    return padre_id, hijo_id

def test_producto():
    log("=== PRODUCTO ===")
    # check existing
    code, data = req("GET", "/productos/", auth=True)
    if isinstance(data, list) and len(data) > 0:
        log(f"Using existing producto {data[0]['sku']}")
        return data[0]["sku"]
    sku = f"TEST-{TS}"
    code, data = req("POST", "/productos/", {"sku": sku, "tipo": "COMPONENTE", "descripcion": "Producto test", "clase_producto": "TEST"})
    if code == 200 or code == 400:
        return sku
    fail(f"producto create: {data}")

def test_dashboard():
    log("=== DASHBOARD ===")
    code, data = req("GET", "/almacen/dashboard")
    assert code == 200
    assert "total_lotes_activos" in data
    assert "stock_por_zona" in data
    log(f"Dashboard OK: activos={data['total_lotes_activos']}")

def test_conteo(sku):
    log("=== CONTEO FISICO ===")
    code, data = req("POST", "/almacen/conteo/crear", {"zona": "ALMACEN"})
    assert code == 200, f"conteo create failed: {data}"
    conteo_id = data["conteo_id"]
    log(f"Conteo created {conteo_id}")

    # registrar conteo
    items = data.get("items", [])
    if items:
        lote_id = items[0]["lote_id"]
        code, data = req("POST", f"/almacen/conteo/{conteo_id}/registrar", {
            "lote_id": lote_id, "cantidad_contada": items[0]["cantidad_sistema"] + 2
        })
        assert code == 200, f"registrar failed: {data}"
        log("Conteo registrar OK")

        # aprobar
        code, data = req("POST", f"/almacen/conteo/{conteo_id}/aprobar", {"motivo": "Ajuste test"})
        assert code == 200, f"aprobar failed: {data}"
        log("Conteo aprobar OK")

def test_alertas(sku):
    log("=== ALERTAS ===")
    code, data = req("POST", "/almacen/alertas/config", {"sku": sku, "stock_minimo": 99999})
    assert code == 200, f"config create failed: {data}"
    config_id = data["id"]
    log(f"Alert config created id={config_id}")

    code, data = req("GET", "/almacen/alertas/evaluar")
    assert code == 200
    alertas = data.get("alertas", [])
    assert any(a["tipo"] == "STOCK_MINIMO" and a["sku"] == sku for a in alertas), f"Expected STOCK_MINIMO alert for {sku}"
    log(f"Alertas eval OK ({len(alertas)} alertas)")

    # cleanup
    req("DELETE", f"/almacen/alertas/config/{config_id}")
    log("Alert config cleaned up")

def main():
    log("Waiting for server...")
    for i in range(30):
        try:
            import urllib.request
            urllib.request.urlopen(f"{BASE}/", timeout=2)
            break
        except Exception:
            time.sleep(1)
    else:
        fail("Server not up")

    # NOTA: los tests de recepción / inventario / FIFO / picking se eliminaron
    # junto con el flujo clásico de Recepciones (era el único que sembraba lotes
    # vía API). Recepciones ahora es el flujo por foto, que requiere una imagen
    # de remisión y no se puede automatizar desde este script.
    login()
    _, ubic_id = test_ubicaciones()
    sku = test_producto()
    test_dashboard()
    test_conteo(sku)
    test_alertas(sku)
    log("\n🎉 ALL TESTS PASSED")

if __name__ == "__main__":
    main()
