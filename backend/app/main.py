import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routers import partes, etiquetas, produccion, importar
from app.routers import plan
from app.routers import inventario


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Sistema de Producción",
    description="API para control de planta y generación de etiquetas",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "ALLOWED_ORIGINS", 
        "http://localhost:3000,http://localhost:5050"
    ).split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(partes.router)
app.include_router(etiquetas.router)
app.include_router(produccion.router)
app.include_router(importar.router)
app.include_router(plan.router)
app.include_router(inventario.router)


@app.get("/")
async def root():
    return {
        "message": "Sistema de Producción API",
        "version": "1.0.0"
    }