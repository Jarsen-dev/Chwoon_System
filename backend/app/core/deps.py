import os

from fastapi import Depends, HTTPException, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.core.security import decode_token
from app.models.usuario import Usuario, RolUsuario

security = HTTPBearer()

# Clave compartida que el gateway (script Python en la laptop/mini-PC) usa para
# autenticar el POST de eventos de máquina. No es un usuario humano, por eso no
# pasa por el flujo JWT. Se define vía variable de entorno.
GATEWAY_API_KEY = os.getenv("GATEWAY_API_KEY", "")


async def verify_gateway_key(x_api_key: str = Header(None)) -> None:
    """Valida el header X-API-Key contra GATEWAY_API_KEY.

    Falla si la variable de entorno no está configurada (fail-closed) o si la
    clave no coincide.
    """
    if not GATEWAY_API_KEY or x_api_key != GATEWAY_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key de gateway inválida",
        )


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Usuario:
    token = credentials.credentials
    payload = decode_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
        )

    username = payload.get("sub")
    result = await db.execute(select(Usuario).where(Usuario.username == username))
    user = result.scalar_one_or_none()

    if not user or not user.activo:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado o inactivo",
        )
    return user


async def get_current_admin(
    current_user: Usuario = Depends(get_current_user),
) -> Usuario:
    if current_user.rol != RolUsuario.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol administrador",
        )
    return current_user


async def get_supervisor_or_admin(
    current_user: Usuario = Depends(get_current_user),
) -> Usuario:
    if current_user.rol not in [RolUsuario.admin, RolUsuario.supervisor]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol supervisor o administrador",
        )
    return current_user


async def get_current_finanzas(
    current_user: Usuario = Depends(get_current_user),
) -> Usuario:
    """Mantiene compatibilidad — admin + finanzas (acceso total a ambos paneles)."""
    if current_user.rol not in [RolUsuario.admin, RolUsuario.finanzas]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol administrador o finanzas",
        )
    return current_user


async def get_current_compras(
    current_user: Usuario = Depends(get_current_user),
) -> Usuario:
    """Permite acceso solo a usuarios con rol admin, finanzas o compras."""
    if current_user.rol not in [RolUsuario.admin, RolUsuario.finanzas, RolUsuario.compras]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol administrador, finanzas o compras",
        )
    return current_user


async def get_current_ventas(
    current_user: Usuario = Depends(get_current_user),
) -> Usuario:
    """Permite acceso solo a usuarios con rol admin, finanzas o ventas."""
    if current_user.rol not in [RolUsuario.admin, RolUsuario.finanzas, RolUsuario.ventas]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol administrador, finanzas o ventas",
        )
    return current_user


async def get_current_calidad(
    current_user: Usuario = Depends(get_current_user),
) -> Usuario:
    """Permite acceso solo a usuarios con rol admin o calidad."""
    if current_user.rol not in [RolUsuario.admin, RolUsuario.calidad]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol administrador o calidad",
        )
    return current_user


async def get_current_almacen(
    current_user: Usuario = Depends(get_current_user),
) -> Usuario:
    """Permite acceso solo a usuarios con rol admin o almacen."""
    if current_user.rol not in [RolUsuario.admin, RolUsuario.almacen]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol administrador o almacén",
        )
    return current_user


async def get_current_logistica(
    current_user: Usuario = Depends(get_current_user),
) -> Usuario:
    """Permite acceso solo a usuarios con rol admin o logistica."""
    if current_user.rol not in [RolUsuario.admin, RolUsuario.logistica]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol administrador o logística",
        )
    return current_user