import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.database               import init_db, AsyncSessionLocal
from app.routers                import partes, etiquetas, produccion, importar
from app.routers                import plan, inventario, auth, secado
from app.models.usuario         import Usuario, RolUsuario
from app.core.security          import get_password_hash
from app.services.turno_service import iniciar_scheduler
from app.routers import admin as admin_router
from app.routers import productos as productos_router
from app.routers import finanzas as finanzas_router
from app.routers import calidad as calidad_router
from app.routers import almacen as almacen_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(levelname)s │ %(name)s │ %(message)s",
)
logger = logging.getLogger(__name__)


async def crear_admin_inicial() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Usuario).where(Usuario.username == "admin")
        )
        if not result.scalar_one_or_none():
            db.add(Usuario(
                username="admin",
                email="admin@planta.com",
                hashed_password=get_password_hash("admin123"),
                rol=RolUsuario.admin,
                activo=True,
            ))
            await db.commit()
            logger.info("✅ Usuario admin creado: admin / admin123")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🔧 Inicializando base de datos...")
    await init_db()

    logger.info("👤 Verificando usuario admin...")
    await crear_admin_inicial()

    logger.info("⏰ Iniciando scheduler de turnos...")
    scheduler = iniciar_scheduler()

    logger.info("🚀 Backend listo")
    yield

    logger.info("🛑 Deteniendo scheduler...")
    scheduler.shutdown(wait=False)
    logger.info("👋 Backend detenido")


app = FastAPI(
    title="Sistema de Producción",
    description="API para control de planta y generación de etiquetas",
    version="1.0.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://localhost:5050",
    ).split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,            prefix="/api")
app.include_router(partes.router)
app.include_router(etiquetas.router)
app.include_router(produccion.router)
app.include_router(importar.router)
app.include_router(plan.router)
app.include_router(inventario.router)
app.include_router(secado.router)
app.include_router(admin_router.router)
app.include_router(productos_router.router)
app.include_router(finanzas_router.router)
app.include_router(calidad_router.router)
app.include_router(almacen_router.router)


@app.get("/")
async def root():
    return {
        "message": "Sistema de Producción API",
        "version": "1.0.0",
    }