def test_crear_proveedor(client):
    payload = {
        "razon_social": "Proveedor Test",
        "rfc": "TEST123456T01",
        "lead_time_dias": 5,
        "condiciones_pago": "15 días",
        "estatus_calidad": "Aprobado",
        "notas": "Nota de prueba",
        "materiales": [
            {"sku_material": "MP-001", "codigo_proveedor": "COD-1", "costo_unitario": 10.5, "moneda": "MXN"}
        ]
    }
    response = client.post("/finanzas/proveedores", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["razon_social"] == "Proveedor Test"
    assert data["rfc"] == "TEST123456T01"
    assert len(data["materiales"]) == 1
    assert data["materiales"][0]["sku_material"] == "MP-001"


def test_listar_proveedores(client):
    response = client.get("/finanzas/proveedores")
    assert response.status_code == 200, response.text
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["razon_social"] == "Proveedor Test"
    assert len(data[0]["materiales"]) == 1
