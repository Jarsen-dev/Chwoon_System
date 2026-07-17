def _crear(client, sku, **extra):
    payload = {"sku": sku, "tipo": "RESINA", "modelo": "", **extra}
    response = client.post("/productos/", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def test_crear_producto_asigna_controles(client):
    data = _crear(client, "TP-RES-001", descripcion="Resina de prueba", cliente="LG")
    assert data["sku"] == "TP-RES-001"
    assert data["controles_calidad"] == ["IQC"]
    assert data["status"] == "Activo"


def test_listado_paginado_ligero(client):
    for i in range(2, 6):
        _crear(
            client,
            f"TP-RES-00{i}",
            descripcion=f"Resina de prueba {i}",
            bom=[{"sku_componente": "COMP-1", "cantidad": 1}, {"sku_componente": "COMP-2", "cantidad": 2}],
        )

    response = client.get("/productos/", params={"search": "TP-RES-", "limit": 2, "offset": 2})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["total"] == 5
    assert data["limit"] == 2
    assert data["offset"] == 2
    assert len(data["items"]) == 2
    skus = [i["sku"] for i in data["items"]]
    assert skus == ["TP-RES-003", "TP-RES-004"]  # orden por sku

    item = data["items"][0]
    assert item["bom_count"] == 2
    assert "bom" not in item
    assert "puntos_inspeccion_iqc" not in item
    assert "caracteristicas_inyeccion" not in item
    assert item["controles_calidad"] == ["IQC"]


def test_listado_search_y_filtros(client):
    _crear(client, "TP-FIN-001", tipo="PRODUCTO FINAL", modelo="QUANTUM-X",
           descripcion="Control Box", cliente="ClienteEspecial")

    # search case-insensitive por sku
    r = client.get("/productos/", params={"search": "tp-fin"})
    assert r.json()["total"] == 1

    # search por modelo
    r = client.get("/productos/", params={"search": "quantum"})
    assert r.json()["total"] == 1

    # search por descripcion
    r = client.get("/productos/", params={"search": "control box"})
    assert r.json()["total"] == 1

    # search por cliente
    r = client.get("/productos/", params={"search": "clienteespecial"})
    assert r.json()["total"] == 1

    # filtro por tipo (exacto)
    r = client.get("/productos/", params={"search": "TP-", "tipo": "PRODUCTO FINAL"})
    data = r.json()
    assert data["total"] == 1
    assert data["items"][0]["sku"] == "TP-FIN-001"

    # sin coincidencias
    r = client.get("/productos/", params={"search": "no-existe-xyz"})
    assert r.json()["total"] == 0
    assert r.json()["items"] == []

    # limit fuera de rango
    r = client.get("/productos/", params={"limit": 5000})
    assert r.status_code == 422


def test_detalle_por_id(client):
    creado = _crear(client, "TP-DET-001", bom=[{"sku_componente": "COMP-9", "cantidad": 3}])
    r = client.get(f"/productos/id/{creado['id']}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["sku"] == "TP-DET-001"
    # El detalle enriquece el BOM con descripcion ('' si el componente no está en catálogo)
    assert data["bom"] == [{"sku_componente": "COMP-9", "cantidad": 3, "descripcion": ""}]
    assert "puntos_inspeccion_iqc" in data

    r = client.get("/productos/id/999999")
    assert r.status_code == 404


def test_bom_persiste_descripcion_unidad(client):
    creado = _crear(client, "TP-BOM-001")
    bom = [
        {"sku_componente": "COMP-A", "cantidad": 2, "descripcion": "Descripción editada", "unidad": "pza"},
        {"sku_componente": "COMP-B", "cantidad": 1.5, "descripcion": "Cable especial", "unidad": "m"},
    ]
    r = client.put(f"/productos/{creado['id']}/bom", json={"bom": bom})
    assert r.status_code == 200, r.text

    r = client.get(f"/productos/id/{creado['id']}")
    data = r.json()
    assert data["bom"][0] == bom[0]
    assert data["bom"][1] == bom[1]


def test_bom_enriquece_descripcion_desde_catalogo(client):
    _crear(client, "TP-COMP-CAT", descripcion="Descripción del catálogo")
    padre = _crear(
        client,
        "TP-BOM-002",
        bom=[
            {"sku_componente": "TP-COMP-CAT", "cantidad": 3},           # sin descripción → se enriquece
            {"sku_componente": "TP-NO-EXISTE", "cantidad": 1},          # no está en catálogo → queda vacía
            {"sku_componente": "COMP-C", "cantidad": 2, "descripcion": "Propia"},  # guardada → no se pisa
        ],
    )
    r = client.get(f"/productos/id/{padre['id']}")
    assert r.status_code == 200, r.text
    bom = r.json()["bom"]
    assert bom[0]["descripcion"] == "Descripción del catálogo"
    assert bom[1]["descripcion"] == ""
    assert bom[2]["descripcion"] == "Propia"


def test_detalle_por_sku_con_duplicados(client):
    _crear(client, "TP-DUP-001", modelo="MODELO-A")
    _crear(client, "TP-DUP-001", modelo="MODELO-B")

    r = client.get("/productos/TP-DUP-001")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["sku"] == "TP-DUP-001"
    assert data["modelo"] == "MODELO-A"  # primero por modelo
