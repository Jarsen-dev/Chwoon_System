"""Espejo de Ayudas Visuales: Synology (SMB) → static/ayudas_visuales/.

Los PDFs viven en un share SMB del Synology, pero el backend NUNCA los sirve
desde ahí: los copia a disco local y sirve siempre la copia. Así el visor de AV
sigue funcionando aunque el Synology esté apagado o inalcanzable.

Este módulo es 100% bloqueante (I/O de red y disco) — se invoca desde
`asyncio.to_thread`. No conoce FastAPI ni la base de datos: solo deja el disco
igual que el share, y el indexado de la DB corre después sobre ese disco.
"""

import logging
import ntpath
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# SMB reporta mtime con menor granularidad que ext4; sin holgura, archivos
# idénticos se re-descargarían en cada sync.
MTIME_TOLERANCIA_S = 2.0
CHUNK = 512 * 1024

ProgresoCb = Callable[[str, int, int], None]


class SmbNoDisponible(RuntimeError):
    """La nube no se pudo leer. El espejo local NO se modifica."""


class SmbNoConfigurado(SmbNoDisponible):
    """Faltan las variables SMB_AYUDAS_* en el .env."""


@dataclass
class SyncResumen:
    archivos_remotos: int = 0
    copiados: int = 0
    actualizados: int = 0
    sin_cambios: int = 0
    borrados: int = 0
    bytes_descargados: int = 0
    # True cuando alguna carpeta remota no se pudo listar: no se borra nada,
    # porque un archivo ausente podría ser "no lo pude leer", no "lo borraron".
    prune_omitido: bool = False
    errores: List[str] = field(default_factory=list)


# ══════════════════════════════════════════════════════════════════════
# CONFIGURACIÓN (.env)
# ══════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class SmbConfig:
    host: str
    share: str
    usuario: str
    password: str
    subpath: str
    puerto: int
    timeout: int

    @property
    def raiz(self) -> str:
        """UNC de la raíz a espejar: \\\\192.168.1.15\\ayudas visuales[\\sub].

        El espacio del nombre del share es literal — SMB no requiere escaparlo.
        """
        base = f"\\\\{self.host}\\{self.share}"
        sub = self.subpath.strip().strip("/\\").replace("/", "\\")
        return f"{base}\\{sub}" if sub else base


def _int_env(nombre: str, default: int) -> int:
    try:
        return int(os.getenv(nombre, "").strip() or default)
    except ValueError:
        logger.warning("%s inválido, usando %s", nombre, default)
        return default


def leer_config() -> SmbConfig:
    host = os.getenv("SMB_AYUDAS_HOST", "").strip()
    share = os.getenv("SMB_AYUDAS_SHARE", "").strip()
    usuario = os.getenv("SMB_AYUDAS_USER", "").strip()
    password = os.getenv("SMB_AYUDAS_PASSWORD", "")

    faltantes = [
        n for n, v in (
            ("SMB_AYUDAS_HOST", host),
            ("SMB_AYUDAS_SHARE", share),
            ("SMB_AYUDAS_USER", usuario),
            ("SMB_AYUDAS_PASSWORD", password),
        ) if not v
    ]
    if faltantes:
        raise SmbNoConfigurado(
            "Falta configurar en el .env: " + ", ".join(faltantes)
        )

    return SmbConfig(
        host=host,
        share=share,
        usuario=usuario,
        password=password,
        subpath=os.getenv("SMB_AYUDAS_SUBPATH", "").strip(),
        puerto=_int_env("SMB_AYUDAS_PORT", 445),
        timeout=_int_env("SMB_AYUDAS_TIMEOUT", 30),
    )


def sync_automatico_activo() -> bool:
    return os.getenv("AYUDAS_SYNC_AUTO", "").strip().lower() in ("1", "true", "yes", "si", "sí")


def hora_sync_automatico() -> Tuple[int, int]:
    """Parsea AYUDAS_SYNC_HORA ('HH:MM'); default 03:00."""
    crudo = os.getenv("AYUDAS_SYNC_HORA", "").strip() or "03:00"
    try:
        h, m = crudo.split(":")
        hora, minuto = int(h), int(m)
        if not (0 <= hora <= 23 and 0 <= minuto <= 59):
            raise ValueError
        return hora, minuto
    except ValueError:
        logger.warning("AYUDAS_SYNC_HORA inválida (%r), usando 03:00", crudo)
        return 3, 0


# ══════════════════════════════════════════════════════════════════════
# FILTRO DE ARCHIVOS (compartido con el indexado del router)
# ══════════════════════════════════════════════════════════════════════

def nombre_ignorado(nombre: str) -> bool:
    """Ocultos y temporales de Windows/Office/OneDrive, y la caché .thumbnails."""
    return nombre.startswith(".") or nombre.startswith("~")


def es_pdf_indexable(f: Path, raiz: Path) -> bool:
    """PDF real dentro del espejo, fuera de carpetas ocultas como .thumbnails."""
    if f.suffix.lower() != ".pdf" or not f.is_file():
        return False
    return not any(nombre_ignorado(p) for p in f.relative_to(raiz).parts)


# ══════════════════════════════════════════════════════════════════════
# LADO REMOTO
# ══════════════════════════════════════════════════════════════════════

def _recorrer_remoto(cfg: SmbConfig, resumen: SyncResumen) -> Dict[str, Tuple[int, float, str]]:
    """Recorre recursivamente el share y devuelve {ruta_relativa: (size, mtime, unc)}.

    Usa scandir (no walk) porque el stat viene en la misma enumeración del
    directorio: un round-trip por carpeta en vez de uno por archivo.
    """
    import smbclient

    raiz = cfg.raiz
    remotos: Dict[str, Tuple[int, float, str]] = {}
    pendientes: List[Tuple[str, str]] = [(raiz, "")]
    primera = True

    while pendientes:
        unc_dir, rel_dir = pendientes.pop()
        try:
            entradas = list(smbclient.scandir(unc_dir))
        except Exception as e:
            if primera:
                # No se pudo ni abrir la raíz: la nube está caída o mal
                # configurada. Abortar sin tocar nada del espejo local.
                raise SmbNoDisponible(f"No se pudo leer {raiz}: {e}") from e
            resumen.errores.append(f"{rel_dir or '/'}: no se pudo listar ({e})")
            resumen.prune_omitido = True
            continue
        finally:
            primera = False

        for entrada in entradas:
            if nombre_ignorado(entrada.name):
                continue
            rel = f"{rel_dir}/{entrada.name}" if rel_dir else entrada.name
            unc = ntpath.join(unc_dir, entrada.name)
            try:
                if entrada.is_dir():
                    pendientes.append((unc, rel))
                elif entrada.name.lower().endswith(".pdf"):
                    st = entrada.stat()
                    remotos[rel] = (st.st_size, st.st_mtime, unc)
            except Exception as e:
                resumen.errores.append(f"{rel}: {e}")
                resumen.prune_omitido = True

    return remotos


def _descargar(unc: str, destino: Path, mtime: float) -> int:
    """Baja un PDF a `<destino>.part` y lo cierra con os.replace (atómico).

    Un PDF a medio bajar nunca queda visible con su nombre final, así que ni se
    indexa ni se sirve roto.
    """
    import smbclient

    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = destino.with_name(destino.name + ".part")
    total = 0
    try:
        with smbclient.open_file(unc, mode="rb") as src, open(tmp, "wb") as dst:
            while True:
                chunk = src.read(CHUNK)
                if not chunk:
                    break
                dst.write(chunk)
                total += len(chunk)
        os.replace(tmp, destino)
        # Copiar el mtime remoto: es la base de la comparación del próximo sync.
        os.utime(destino, (mtime, mtime))
    except Exception:
        tmp.unlink(missing_ok=True)
        raise
    return total


def _necesita_copia(local: Path, size: int, mtime: float) -> Optional[str]:
    """None si el archivo local ya está al día; si no, 'nuevo' o 'actualizado'."""
    try:
        st = local.stat()
    except FileNotFoundError:
        return "nuevo"
    if st.st_size != size or mtime - st.st_mtime > MTIME_TOLERANCIA_S:
        return "actualizado"
    return None


# ══════════════════════════════════════════════════════════════════════
# ESPEJO
# ══════════════════════════════════════════════════════════════════════

def sincronizar_espejo(destino: Path, progreso: Optional[ProgresoCb] = None) -> SyncResumen:
    """Deja `destino` idéntico al share: copia lo nuevo/cambiado y borra lo sobrante.

    Lanza SmbNoDisponible si la nube no se puede leer — en ese caso el espejo
    local queda exactamente como estaba (no se borra ni un archivo).
    """
    import smbclient

    cfg = leer_config()
    resumen = SyncResumen()

    try:
        smbclient.register_session(
            cfg.host,
            username=cfg.usuario,
            password=cfg.password,
            port=cfg.puerto,
            connection_timeout=cfg.timeout,
        )
    except Exception as e:
        # Synology apagado, sin ruta, o credenciales incorrectas.
        raise SmbNoDisponible(
            f"No se pudo conectar a {cfg.host}:{cfg.puerto} ({e})"
        ) from e

    logger.info("🔄 Sincronizando ayudas visuales desde %s", cfg.raiz)
    remotos = _recorrer_remoto(cfg, resumen)
    resumen.archivos_remotos = len(remotos)

    destino.mkdir(parents=True, exist_ok=True)
    locales = {
        f.relative_to(destino).as_posix()
        for f in destino.rglob("*")
        if es_pdf_indexable(f, destino)
    }

    # Guarda contra un SMB_AYUDAS_SUBPATH mal escrito o un share remontado
    # vacío: sin esto, "0 archivos remotos" borraría el espejo entero.
    if not remotos and locales:
        raise SmbNoDisponible(
            f"{cfg.raiz} se listó sin ningún PDF pero el espejo local tiene "
            f"{len(locales)} archivos. No se borró nada; revisa SMB_AYUDAS_SHARE "
            "y SMB_AYUDAS_SUBPATH."
        )

    # ── Copiar nuevos y actualizados ──────────────────────────────────
    total = len(remotos)
    for i, (rel, (size, mtime, unc)) in enumerate(sorted(remotos.items()), start=1):
        if progreso:
            progreso("nube", i, total)
        local = destino / rel
        motivo = _necesita_copia(local, size, mtime)
        if motivo is None:
            resumen.sin_cambios += 1
            continue
        try:
            resumen.bytes_descargados += _descargar(unc, local, mtime)
            if motivo == "nuevo":
                resumen.copiados += 1
            else:
                resumen.actualizados += 1
        except Exception as e:
            resumen.errores.append(f"{rel}: error al descargar ({e})")
            # No se pudo traer: si ya existía local, se conserva la copia vieja.
            resumen.prune_omitido = True

    # ── Borrar lo que ya no está en la nube ───────────────────────────
    if resumen.prune_omitido:
        logger.warning(
            "Sync con %d error(es) de lectura: se omite el borrado por seguridad",
            len(resumen.errores),
        )
    else:
        for rel in sorted(locales - set(remotos)):
            try:
                (destino / rel).unlink()
                resumen.borrados += 1
            except OSError as e:
                resumen.errores.append(f"{rel}: no se pudo borrar ({e})")
        _limpiar_vacios(destino)

    # Restos de descargas interrumpidas (p. ej. reinicio del backend a media copia)
    for parcial in destino.rglob("*.part"):
        parcial.unlink(missing_ok=True)

    logger.info(
        "✅ Espejo: %d remotos, %d nuevos, %d actualizados, %d borrados, %d errores",
        resumen.archivos_remotos, resumen.copiados, resumen.actualizados,
        resumen.borrados, len(resumen.errores),
    )
    return resumen


def _limpiar_vacios(destino: Path) -> None:
    """Borra subcarpetas vacías dejadas por el prune. Nunca toca .thumbnails."""
    directorios = [p for p in destino.rglob("*") if p.is_dir()]
    # De más profundo a menos: así una rama vacía completa desaparece entera.
    for d in sorted(directorios, key=lambda p: len(p.parts), reverse=True):
        if any(nombre_ignorado(p) for p in d.relative_to(destino).parts):
            continue
        try:
            d.rmdir()  # falla si no está vacía — justo lo que queremos
        except OSError:
            pass
