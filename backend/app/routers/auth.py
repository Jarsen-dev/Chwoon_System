from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional, Dict
from datetime import datetime

from app.core.security import verify_password, get_password_hash, create_access_token
from app.core.deps import get_db, get_current_user, get_current_admin
from app.models.usuario import Usuario, RolUsuario
from app.schemas.auth import LoginRequest, Token, UsuarioCreate, UsuarioUpdate, UsuarioResponse

router = APIRouter(prefix="/auth", tags=["auth"])

# ==================== LOGIN ====================

@router.post("/login", response_model=Token)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Usuario).where(Usuario.username == request.username)
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos"
        )

    if not user.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario inactivo"
        )

    token = create_access_token(data={"sub": user.username, "rol": user.rol})
    return Token(
        access_token=token,
        token_type="bearer",
        rol=user.rol,
        username=user.username
    )

# ==================== ME ====================

@router.get("/me", response_model=UsuarioResponse)
async def get_me(current_user: Usuario = Depends(get_current_user)):
    return current_user

# ==================== USUARIOS (solo admin) ====================

@router.get("/usuarios", response_model=List[UsuarioResponse])
async def listar_usuarios(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin)
):
    result = await db.execute(select(Usuario).order_by(Usuario.created_at.desc()))
    return result.scalars().all()


@router.post("/usuarios", response_model=UsuarioResponse)
async def crear_usuario(
    data: UsuarioCreate,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin)
):
    result = await db.execute(
        select(Usuario).where(Usuario.username == data.username)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="El username ya existe")

    user = Usuario(
        username        = data.username,
        email           = data.email,
        hashed_password = get_password_hash(data.password),
        rol             = data.rol,
        activo          = True,
        created_at      = datetime.utcnow(),
        permisos_tabs   = data.permisos_tabs,  # ← NUEVO (puede ser None)
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.put("/usuarios/{user_id}", response_model=UsuarioResponse)
async def actualizar_usuario(
    user_id: int,
    data: UsuarioUpdate,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin)
):
    result = await db.execute(select(Usuario).where(Usuario.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if data.email    is not None: user.email    = data.email
    if data.rol      is not None: user.rol      = data.rol
    if data.activo   is not None: user.activo   = data.activo
    if data.password is not None: user.hashed_password = get_password_hash(data.password)

    # permisos_tabs: solo se toca si el campo fue enviado explícitamente
    # Esto permite enviar null para borrar permisos, o un dict para actualizar
    if 'permisos_tabs' in data.model_fields_set:
        user.permisos_tabs = data.permisos_tabs

    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/usuarios/{user_id}")
async def eliminar_usuario(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_admin)
):
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")

    result = await db.execute(select(Usuario).where(Usuario.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    await db.delete(user)
    await db.commit()
    return {"message": "Usuario eliminado"}


@router.patch("/usuarios/{user_id}/toggle")
async def toggle_usuario(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin)
):
    result = await db.execute(select(Usuario).where(Usuario.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    user.activo = not user.activo
    await db.commit()
    return {"activo": user.activo, "username": user.username}


# ==================== PERMISOS (solo admin) ====================

@router.patch("/usuarios/{user_id}/permisos", response_model=UsuarioResponse)
@router.patch("/usuarios/{user_id}/permisos/", response_model=UsuarioResponse)
async def actualizar_permisos_usuario(
    user_id:       int,
    permisos_tabs: Optional[Dict[str, List[str]]],
    db:            AsyncSession = Depends(get_db),
    _:             Usuario      = Depends(get_current_admin),
):
    """
    Actualiza solo los permisos_tabs de un usuario.
    Enviar null borra todos los permisos (usuario ve todo lo permitido por su rol).
    Enviar {} restringe al usuario a no ver ningún tab.
    Enviar {"calidad": ["iqc", "oqc"]} da acceso solo a esos tabs.
    """
    result = await db.execute(select(Usuario).where(Usuario.id == user_id))
    user   = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    user.permisos_tabs = permisos_tabs
    await db.commit()
    await db.refresh(user)
    return user