from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.database          import AsyncSessionLocal
from app.models.usuario    import Usuario
from app.models.empresa    import ConfiguracionEmpresa, ContactoEmpresa
from app.core.deps         import get_current_admin
from app.schemas.empresa   import (
    ConfiguracionEmpresaCreate,
    ConfiguracionEmpresaUpdate,
    ConfiguracionEmpresaOut,
    ContactoEmpresaCreate,
    ContactoEmpresaUpdate,
    ContactoEmpresaOut,
)

router = APIRouter(prefix="/api/admin/empresa", tags=["empresa"])


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


# ══════════════════════════════════════════════════════════════════════
# CONFIGURACIÓN GENERAL — registro único
# ══════════════════════════════════════════════════════════════════════

@router.get("/actual", response_model=ConfiguracionEmpresaOut | None)
@router.get("/actual/", response_model=ConfiguracionEmpresaOut | None)
async def get_configuracion_empresa(
    db: AsyncSession = Depends(get_db),
    _:  Usuario      = Depends(get_current_admin),
):
    """Devuelve el único registro de configuración, o null si aún no existe."""
    result = await db.execute(
        select(ConfiguracionEmpresa).order_by(ConfiguracionEmpresa.id).limit(1)
    )
    return result.scalar_one_or_none()


@router.post("/actual", response_model=ConfiguracionEmpresaOut, status_code=201)
@router.post("/actual/", response_model=ConfiguracionEmpresaOut, status_code=201)
async def create_configuracion_empresa(
    body: ConfiguracionEmpresaCreate,
    db:   AsyncSession = Depends(get_db),
    _:    Usuario      = Depends(get_current_admin),
):
    """Crea la configuración de empresa (solo si no existe aún)."""
    existing = (await db.execute(
        select(ConfiguracionEmpresa).limit(1)
    )).scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe una configuración. Usa PUT para actualizarla.",
        )

    cfg = ConfiguracionEmpresa(**body.model_dump())
    db.add(cfg)
    await db.commit()
    await db.refresh(cfg)
    return cfg


@router.put("/actual", response_model=ConfiguracionEmpresaOut)
@router.put("/actual/", response_model=ConfiguracionEmpresaOut)
async def update_configuracion_empresa(
    body: ConfiguracionEmpresaUpdate,
    db:   AsyncSession = Depends(get_db),
    _:    Usuario      = Depends(get_current_admin),
):
    """Actualiza la configuración existente (crea si no hay ninguna)."""
    cfg = (await db.execute(
        select(ConfiguracionEmpresa).order_by(ConfiguracionEmpresa.id).limit(1)
    )).scalar_one_or_none()

    if not cfg:
        # Upsert: si no existe, crear con los campos provistos
        data = {k: v for k, v in body.model_dump().items() if v is not None}
        if "nombre" not in data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Se requiere 'nombre' al crear la configuración por primera vez.",
            )
        cfg = ConfiguracionEmpresa(**data)
        db.add(cfg)
    else:
        for field, value in body.model_dump(exclude_unset=True).items():
            setattr(cfg, field, value)

    await db.commit()
    await db.refresh(cfg)
    return cfg


# ══════════════════════════════════════════════════════════════════════
# CONTACTOS — múltiples por área
# ══════════════════════════════════════════════════════════════════════

@router.get("/contactos", response_model=list[ContactoEmpresaOut])
@router.get("/contactos/", response_model=list[ContactoEmpresaOut])
async def get_contactos(
    solo_activos: bool = False,
    db: AsyncSession   = Depends(get_db),
    _:  Usuario        = Depends(get_current_admin),
):
    q = select(ContactoEmpresa).order_by(ContactoEmpresa.area, ContactoEmpresa.nombre)
    if solo_activos:
        q = q.where(ContactoEmpresa.activo == True)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/contactos/area/{area}", response_model=list[ContactoEmpresaOut])
@router.get("/contactos/area/{area}/", response_model=list[ContactoEmpresaOut])
async def get_contactos_por_area(
    area: str,
    db:   AsyncSession = Depends(get_db),
    _:    Usuario      = Depends(get_current_admin),
):
    result = await db.execute(
        select(ContactoEmpresa)
        .where(ContactoEmpresa.area == area)
        .order_by(ContactoEmpresa.es_principal.desc(), ContactoEmpresa.nombre)
    )
    return result.scalars().all()


@router.get("/contactos/principal/{area}", response_model=ContactoEmpresaOut | None)
@router.get("/contactos/principal/{area}/", response_model=ContactoEmpresaOut | None)
async def get_contacto_principal(
    area: str,
    db:   AsyncSession = Depends(get_db),
    _:    Usuario      = Depends(get_current_admin),
):
    result = await db.execute(
        select(ContactoEmpresa).where(
            ContactoEmpresa.area == area,
            ContactoEmpresa.es_principal == True,
            ContactoEmpresa.activo == True,
        ).limit(1)
    )
    return result.scalar_one_or_none()


@router.post("/contactos", response_model=ContactoEmpresaOut, status_code=201)
@router.post("/contactos/", response_model=ContactoEmpresaOut, status_code=201)
async def create_contacto(
    body: ContactoEmpresaCreate,
    db:   AsyncSession = Depends(get_db),
    _:    Usuario      = Depends(get_current_admin),
):
    """Crea un contacto. Si es_principal=True, desflaga el anterior principal del área."""
    if body.es_principal:
        await _desmarcar_principal(db, body.area, exclude_id=None)

    contacto = ContactoEmpresa(**body.model_dump())
    db.add(contacto)
    await db.commit()
    await db.refresh(contacto)
    return contacto


@router.put("/contactos/{contacto_id}", response_model=ContactoEmpresaOut)
@router.put("/contactos/{contacto_id}/", response_model=ContactoEmpresaOut)
async def update_contacto(
    contacto_id: int,
    body:        ContactoEmpresaUpdate,
    db:          AsyncSession = Depends(get_db),
    _:           Usuario      = Depends(get_current_admin),
):
    contacto = (await db.execute(
        select(ContactoEmpresa).where(ContactoEmpresa.id == contacto_id)
    )).scalar_one_or_none()

    if not contacto:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")

    # Si se marca como principal, desmarcar el anterior en su área
    if body.es_principal is True and not contacto.es_principal:
        area_destino = body.area if body.area is not None else contacto.area
        await _desmarcar_principal(db, area_destino, exclude_id=contacto_id)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(contacto, field, value)

    await db.commit()
    await db.refresh(contacto)
    return contacto


@router.delete("/contactos/{contacto_id}", status_code=204)
@router.delete("/contactos/{contacto_id}/", status_code=204)
async def delete_contacto(
    contacto_id: int,
    db:          AsyncSession = Depends(get_db),
    _:           Usuario      = Depends(get_current_admin),
):
    contacto = (await db.execute(
        select(ContactoEmpresa).where(ContactoEmpresa.id == contacto_id)
    )).scalar_one_or_none()

    if not contacto:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")

    await db.delete(contacto)
    await db.commit()
    return None


# ── helpers internos ─────────────────────────────────────────────────

async def _desmarcar_principal(
    db: AsyncSession,
    area: str,
    exclude_id: int | None,
) -> None:
    """Pone es_principal=False a todos los contactos del área excepto exclude_id."""
    q = (
        update(ContactoEmpresa)
        .where(
            ContactoEmpresa.area == area,
            ContactoEmpresa.es_principal == True,
        )
        .values(es_principal=False)
    )
    if exclude_id is not None:
        q = q.where(ContactoEmpresa.id != exclude_id)
    await db.execute(q)