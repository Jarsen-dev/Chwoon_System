"""Tests del espejo Synology → static/ayudas_visuales con un share SMB simulado.

Sustituye smbclient por un doble que lee de un directorio temporal, para poder
verificar copia, actualización, borrado y las guardas de seguridad sin un
Synology real.
"""

import ntpath
import os
from pathlib import Path

import pytest

from app.services import ayudas_sync
from app.services.ayudas_sync import SmbNoDisponible, sincronizar_espejo

RAIZ_UNC = "\\\\fake\\ayudas visuales"


class _Entrada:
    def __init__(self, path: Path):
        self._path = path
        self.name = path.name

    def is_dir(self):
        return self._path.is_dir()

    def stat(self):
        return self._path.stat()


class _SmbFalso:
    """Mapea el UNC del share a un directorio local que hace de 'nube'."""

    def __init__(self, origen: Path):
        self.origen = origen
        self.rotos: set[str] = set()   # rutas relativas que fallan al listar/leer

    def _local(self, unc: str) -> Path:
        rel = unc[len(RAIZ_UNC):].strip("\\").replace("\\", "/")
        return self.origen / rel if rel else self.origen

    def register_session(self, *a, **kw):
        pass

    def scandir(self, unc):
        p = self._local(unc)
        rel = p.relative_to(self.origen).as_posix() if p != self.origen else ""
        if rel in self.rotos:
            raise OSError("acceso denegado")
        if not p.is_dir():
            raise OSError(f"no existe {unc}")
        return [_Entrada(h) for h in sorted(p.iterdir())]

    def open_file(self, unc, mode="rb"):
        p = self._local(unc)
        if p.relative_to(self.origen).as_posix() in self.rotos:
            raise OSError("lectura fallida")
        return open(p, mode)


@pytest.fixture
def nube(tmp_path, monkeypatch):
    origen = tmp_path / "synology"
    origen.mkdir()
    falso = _SmbFalso(origen)
    monkeypatch.setitem(__import__("sys").modules, "smbclient", falso)
    monkeypatch.setenv("SMB_AYUDAS_HOST", "fake")
    monkeypatch.setenv("SMB_AYUDAS_SHARE", "ayudas visuales")
    monkeypatch.setenv("SMB_AYUDAS_USER", "u")
    monkeypatch.setenv("SMB_AYUDAS_PASSWORD", "p")
    monkeypatch.setenv("SMB_AYUDAS_SUBPATH", "")
    return falso


def _crear(base: Path, rel: str, contenido: bytes = b"%PDF-1.4 x"):
    f = base / rel
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_bytes(contenido)
    return f


def test_copia_recursiva_y_estructura(nube, tmp_path):
    _crear(nube.origen, "R1/Control Box/AV-CA-EPS-001.01 MAL62484101.pdf")
    _crear(nube.origen, "R2/sub/AV-002 ABC123.pdf")
    destino = tmp_path / "espejo"

    r = sincronizar_espejo(destino)

    assert r.archivos_remotos == 2
    assert r.copiados == 2
    assert r.errores == []
    # La red de subcarpetas se replica tal cual: la ruta relativa es la clave
    # con la que el indexado da de alta cada AyudaVisual.
    assert (destino / "R1/Control Box/AV-CA-EPS-001.01 MAL62484101.pdf").is_file()
    assert (destino / "R2/sub/AV-002 ABC123.pdf").is_file()


def test_idempotente(nube, tmp_path):
    _crear(nube.origen, "a/uno.pdf")
    destino = tmp_path / "espejo"
    sincronizar_espejo(destino)

    r = sincronizar_espejo(destino)

    assert (r.copiados, r.actualizados, r.borrados) == (0, 0, 0)
    assert r.sin_cambios == 1


def test_espejo_agrega_actualiza_y_borra(nube, tmp_path):
    _crear(nube.origen, "viejo.pdf")
    _crear(nube.origen, "cambia.pdf", b"corto")
    destino = tmp_path / "espejo"
    sincronizar_espejo(destino)

    (nube.origen / "viejo.pdf").unlink()
    _crear(nube.origen, "cambia.pdf", b"contenido mucho mas largo")
    _crear(nube.origen, "nuevo.pdf")

    r = sincronizar_espejo(destino)

    assert (r.copiados, r.actualizados, r.borrados) == (1, 1, 1)
    assert not (destino / "viejo.pdf").exists()
    assert (destino / "nuevo.pdf").is_file()
    assert (destino / "cambia.pdf").read_bytes() == b"contenido mucho mas largo"


def test_ignora_no_pdf_y_ocultos(nube, tmp_path):
    _crear(nube.origen, "bueno.pdf")
    _crear(nube.origen, "notas.txt")
    _crear(nube.origen, "~$temporal.pdf")
    _crear(nube.origen, ".oculta/escondido.pdf")
    destino = tmp_path / "espejo"

    r = sincronizar_espejo(destino)

    assert r.archivos_remotos == 1
    assert [f.name for f in destino.rglob("*.pdf")] == ["bueno.pdf"]


def test_no_borra_las_miniaturas(nube, tmp_path):
    _crear(nube.origen, "uno.pdf")
    destino = tmp_path / "espejo"
    thumb = destino / ".thumbnails" / "1.png"
    thumb.parent.mkdir(parents=True)
    thumb.write_bytes(b"png")

    sincronizar_espejo(destino)

    assert thumb.is_file()


def test_share_vacio_no_borra_el_espejo(nube, tmp_path):
    """Un SUBPATH mal escrito no debe vaciar el espejo local."""
    _crear(nube.origen, "uno.pdf")
    destino = tmp_path / "espejo"
    sincronizar_espejo(destino)

    (nube.origen / "uno.pdf").unlink()

    with pytest.raises(SmbNoDisponible):
        sincronizar_espejo(destino)
    assert (destino / "uno.pdf").is_file()


def test_raiz_ilegible_aborta_sin_tocar_nada(nube, tmp_path):
    _crear(nube.origen, "uno.pdf")
    destino = tmp_path / "espejo"
    sincronizar_espejo(destino)

    nube.rotos.add("")  # la raíz del share deja de responder

    with pytest.raises(SmbNoDisponible):
        sincronizar_espejo(destino)
    assert (destino / "uno.pdf").is_file()


def test_error_parcial_omite_el_borrado(nube, tmp_path):
    """Si una carpeta no se pudo leer, sus archivos no se borran del espejo."""
    _crear(nube.origen, "ok.pdf")
    _crear(nube.origen, "restringida/secreto.pdf")
    destino = tmp_path / "espejo"
    sincronizar_espejo(destino)

    nube.rotos.add("restringida")

    r = sincronizar_espejo(destino)

    assert r.prune_omitido is True
    assert r.borrados == 0
    assert (destino / "restringida/secreto.pdf").is_file()


def test_descarga_fallida_no_deja_part(nube, tmp_path):
    _crear(nube.origen, "malo.pdf")
    nube.rotos.add("malo.pdf")
    destino = tmp_path / "espejo"

    r = sincronizar_espejo(destino)

    assert r.copiados == 0
    assert len(r.errores) == 1
    assert list(destino.rglob("*.part")) == []


def test_limpia_carpetas_vacias(nube, tmp_path):
    _crear(nube.origen, "linea/uno.pdf")
    _crear(nube.origen, "otra.pdf")
    destino = tmp_path / "espejo"
    sincronizar_espejo(destino)

    (nube.origen / "linea/uno.pdf").unlink()

    sincronizar_espejo(destino)

    assert not (destino / "linea").exists()
