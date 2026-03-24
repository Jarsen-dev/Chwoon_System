from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import importar

from app.database import init_db
from app.routers import partes, etiquetas, produccion

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

# CORS para permitir requests del frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(partes.router)
app.include_router(etiquetas.router)
app.include_router(produccion.router)
app.include_router(importar.router)

@app.get("/")
async def root():
    return {"message": "Sistema de Producción API", "version": "1.0.0"}