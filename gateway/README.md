# Gateway de Máquinas EPS (PLC/HMI → ERP)

Script que corre en la laptop / mini-PC conectada al HMI Weintek de la máquina
piloto. Lee la máquina por Modbus TCP y envía eventos significativos al backend.

## Arquitectura

```
PLC LS XBM ──Cnet/RS-232C──> HMI Weintek ──Modbus TCP──> leer_maquina_eps.py
   ──HTTP POST /maquinas/evento (X-API-Key)──> Backend FastAPI ──WS──> Frontend
```

Solo se envían cambios significativos (no cada lectura): `PIEZA`,
`CAMBIO_ESTADO`, `INCIDENCIA_INICIO`, `INCIDENCIA_FIN`. Las incidencias se
filtran con un *debounce* (`UMBRAL_INCIDENCIA_SEG`) para ignorar falsos
positivos cíclicos (p. ej. "presión alta" durante los pasos 7-18 del ciclo).

Si el backend no responde, los eventos se encolan en SQLite (`cola_eventos.db`)
y se reintentan en orden FIFO — no se pierde ningún conteo.

## Instalación

```bash
python -m venv venv && source venv/bin/activate
pip install pymodbus requests
```

## Ejecución

```bash
export GATEWAY_API_KEY="<misma-clave-que-el-backend>"
export BACKEND_URL="http://<host-backend>:8000"
export MAQUINA_CODIGO="SHM-1234VS"
# Opcionales:
export HMI_IP="192.168.0.132"
export HMI_PORT="8000"
export UMBRAL_INCIDENCIA_SEG="8"
export OPERADOR="jarsen"

python leer_maquina_eps.py
```

`GATEWAY_API_KEY` debe coincidir con la variable del backend
(`docker-compose*.yml` / `.env`). El backend valida el header `X-API-Key`.

La máquina debe existir en la tabla `maquinas` (se siembra `SHM-1234VS` en la
migración `20260619_maquinas`). Para otras máquinas, insertarlas primero.
