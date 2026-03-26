import json
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import engine, AsyncSessionLocal, Base
from app.models.parte import Parte
from sqlalchemy import select, func, text  # ✅ Importar text


async def migrar():
    ruta_data = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        '..', 'etiqueta', 'data.json'
    )
    ruta_data = os.path.normpath(ruta_data)

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

    async with AsyncSessionLocal() as db:
        # Verificar si ya hay datos
        result = await db.execute(
            select(func.count()).select_from(Parte)
        )
        count_existente = result.scalar()

        if count_existente > 0:
            print(f"⚠️  Ya existen {count_existente} partes")
            respuesta = input("¿Deseas limpiar y reimportar? (s/n): ")
            if respuesta.lower() != 's':
                print("Migración cancelada.")
                return
            # ✅ FIX: usar text() para SQL raw
            await db.execute(
                text("TRUNCATE TABLE partes RESTART IDENTITY CASCADE")
            )
            await db.commit()
            print("🗑️  Tabla limpiada")

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
        print(f"✅ {len(data)} partes migradas exitosamente")


if __name__ == "__main__":
    asyncio.run(migrar())