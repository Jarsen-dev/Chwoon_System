# Agente de impresión de etiquetas (Backend → Zebra ZD220)

Script que corre en la **PC de Windows** que tiene la Zebra ZD220 conectada por
USB. Sondea la cola de impresión del backend y manda cada etiqueta en RAW.

## Por qué existe

El backend corre en Docker sobre Linux/WSL2 y **no puede alcanzar la impresora**.
Está comprobado, no supuesto:

- La ZD220 está en `USB001`, `Shared: False`, `Published: False`. No hay TCP/9100.
- El contenedor no tiene `devices:`, ni `privileged:`, ni CUPS/`lpr` instalados,
  y corre como usuario no-root.
- `host.docker.internal` no resuelve dentro del contenedor (es Docker Engine
  nativo en WSL, no Docker Desktop).
- Desde el contenedor, cualquier IP de Windows (`192.168.1.78`, `172.18.0.1`,
  `100.115.152.13`) en un puerto que solo escucha Windows da **ConnectionRefused**:
  los paquetes los termina el stack de Linux y nunca cruzan.

Por eso el backend solo **encola el ZPL** y este agente lo saca.

## Arquitectura

```
Navegador (cualquier PC/tablet)
   │  POST /api/remisiones/{id}/etiquetas
   ▼
Backend FastAPI (Docker) ── genera ZPL ── tabla impresion_trabajos
   ▲
   │  POST /api/impresion/reclamar    (X-API-Key, cada 2 s)
   │  POST /api/impresion/confirmar
agente_impresion.py (Windows)
   │  win32print WritePrinter RAW
   ▼
ZDesigner ZD220-203dpi ZPL / USB001
```

**No hay que compartir la impresora ni publicarla en red.** El driver ZPL de
Zebra acepta trabajos RAW tal cual; el ZPL viaja sin pasar por el driver gráfico
de Windows.

## La HP de hoja carta NO usa este agente

El segundo destino de impresión —etiquetas en hoja carta, 8 por hoja— va por otro
camino y **no hay que montarle un agente**. La diferencia es que sí se alcanza
desde el contenedor:

```
docker-compose exec backend python -c "import socket;socket.create_connection(('192.168.1.250',9100),5)"
```

Conecta. Así que el backend genera el PDF (`app/services/pdf_etiquetas.py`) y se
lo manda él mismo por TCP raw (`app/services/impresion_red.py`), en la misma
petición HTTP. No pasa por `impresion_trabajos` como cola: la fila se crea ya en
estado `impreso`, solo para auditoría.

La impresora es una **HP Color LaserJet MFP E78625** con JetDirect, y acepta el
PDF tal cual porque lo trae entre sus personalidades instaladas. Se comprueba sin
imprimir nada, en su página de configuración:

```
https://192.168.1.250/hp/device/InternalPages/Index?id=ConfigurationPage
  → Installed Personalities and Options: PCL, PCLXL, POSTSCRIPT, PDF, TIFF
```

Si algún día se cambia por un modelo sin PDF, hay que convertir a PostScript
antes de mandar; el resto del camino no cambia.

| | Zebra ZD220 | HP E78625 |
|---|---|---|
| Conexión | USB en la PC de Windows | Red, TCP 9100 |
| ¿Agente? | Sí, obligatorio | No |
| Formato | ZPL | PDF con envoltura PJL |
| Cuándo falla | El trabajo se queda `pendiente` y la etiqueta ya está creada | Se revierte todo: ni etiquetas ni lotes, y la UI responde 502 |
| Config | `IMPRESORA_ETIQUETAS` | `IMPRESORA_CARTA_HOST/PORT/NOMBRE` |

En la UI el modal solo ofrece las impresoras que responden
(`GET /api/impresion/destinos`): la Zebra mientras este agente siga sondeando, y
la HP mientras conteste en el 9100.

## Instalación (en Windows, no en WSL)

```powershell
python -m venv venv
venv\Scripts\activate
pip install requests pywin32
```

## Ejecución

La forma corta — doble clic en `agente_impresion.bat` (guarda la clave una sola
vez con `setx GATEWAY_API_KEY "<clave>"` y vuelve a abrir la terminal).

Como el repo vive en WSL, desde Windows el `.bat` está en:

```
\\wsl.localhost\Ubuntu-24.04\home\jarsen\production\produccion\gateway\agente_impresion.bat
```

CMD imprime un aviso de *"No se permiten rutas UNC. Regresando al directorio
Windows"* — es inofensivo, el agente arranca igual porque la ruta del script se
le pasa completa.

A mano:

```powershell
$env:GATEWAY_API_KEY = "<misma-clave-que-el-backend>"
$env:BACKEND_URL     = "http://127.0.0.1:8000"
# Opcionales:
$env:IMPRESORA           = "ZDesigner ZD220-203dpi ZPL"   # nombre exacto de la cola
$env:INTERVALO_SEGUNDOS  = "2"
$env:MAX_POR_VUELTA      = "10"

python agente_impresion.py
```

> **`BACKEND_URL` tiene que ser `http://127.0.0.1:8000`** cuando el agente corre
> en la misma máquina que el stack. Está medido: desde Windows, `localhost:8000`
> falla (resuelve a IPv6, que WSL no expone) y la IP de Tailscale también falla;
> solo responde `127.0.0.1`, que es el loopback que comparte el modo mirrored de
> WSL2. Si el agente corriera en **otra** PC, ahí sí va la IP de Tailscale.

`GATEWAY_API_KEY` debe coincidir con la variable del backend (`.env` /
`docker-compose*.yml`) — es la misma que usa `leer_maquina_eps.py`.

El nombre de la cola tiene que ser **exacto**. Para verlo:

```powershell
Get-Printer | Select-Object Name, DriverName, PortName
```

Si el nombre no existe, el agente lo dice y lista las colas disponibles antes
de salir.

## Arranque automático

Para que quede corriendo al iniciar sesión, crear un acceso directo en
`shell:startup` (Win+R → `shell:startup`) que apunte a un `.bat` con las
variables y el `python agente_impresion.py`.

## Comportamiento ante fallas

| Situación | Qué pasa |
|---|---|
| Agente apagado | Las etiquetas quedan en `pendiente` y salen todas al encenderlo. |
| Backend caído | El agente reintenta; nada se pierde (los trabajos viven en la BD). |
| Falla la impresión | El trabajo queda en `error` con el mensaje, visible en el detalle de la remisión. Se resuelve con la reimpresión individual. |
| Agente muere a media impresión | El trabajo queda en `enviado` y **no** se reencola solo: reencolar a ciegas sacaría la etiqueta dos veces. Se reimprime a mano si hace falta. |

## Etiqueta

104 × 50.8 mm (831 × 406 dots a 203 dpi). El ZPL lo genera el backend en
`backend/app/services/zpl_etiquetas.py`; ahí se ajusta el layout (posiciones,
tamaños de fuente, tamaño del QR y del logo).
