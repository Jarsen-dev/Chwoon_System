import json
import asyncio
import os
import sys

# Añadir backend al path
sys.path.insert(0, '/home/jarsen/production/produccion/backend')

from app.database import engine, AsyncSessionLocal, Base
from app.models.parte import Parte
from sqlalchemy import select, func


async def migrar():
    # Ruta absoluta al data.json
    ruta_data = "/home/jarsen/production/produccion/etiqueta/data.json"
    
    print(f"Cargando desde: {ruta_data}")
    
    if not os.path.exists(ruta_data):
        print(f"❌ No existe: {ruta_data}")
        return
    
    with open(ruta_data, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"📦 {len(data)} partes encontradas en JSON")
    
    # Crear tablas
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Tablas creadas/verificadas")
    
    # Migrar datos
    async with AsyncSessionLocal() as db:
        # Verificar si ya hay datos
        result = await db.execute(select(func.count()).select_from(Parte))
        count_existente = result.scalar()
        
        if count_existente > 0:
            print(f"⚠️  Ya existen {count_existente} partes")
            await db.execute("TRUNCATE TABLE partes RESTART IDENTITY CASCADE")
            await db.commit()
            print("🗑️ Tabla limpiada")
        
        for numero_parte, info in data.items():
            parte = Parte(
                numero_parte=numero_parte,
                descripcion=info.get('descripcion', ''),
                linea=info.get('linea', ''),
                id_interno=info.get('id', ''),
                cantidad_por_etiqueta=str(info.get('qtu', '')),
                cliente_lg=info.get('linea_lg', ''),
                ayuda_visual=info.get('ayuda_visual', '')
            )
            db.add(parte)
        
        await db.commit()
        print(f"✅ {len(data)} partes migradas")


if __name__ == "__main__":
    asyncio.run(migrar())
