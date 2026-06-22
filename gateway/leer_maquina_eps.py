"""
Gateway Modbus TCP → Backend ERP — Máquina EPS vía HMI Weintek
==============================================================
Lee COUNTER, PROCESS NO, HORA/META y bits de estado/incidencia desde el HMI
Weintek (puente Modbus hacia el PLC LS XBM) y envía SOLO eventos significativos
al backend FastAPI vía POST /maquinas/evento.

Eventos que emite:
  - PIEZA              → flanco de COUNTER (nueva pieza)
  - CAMBIO_ESTADO      → transición AUTO ↔ MANUAL
  - INCIDENCIA_INICIO  → alarma sostenida ≥ UMBRAL_INCIDENCIA_SEG (filtra los
                          falsos positivos cíclicos como "presión alta" en los
                          pasos 7-18, que se limpian dentro del mismo ciclo)
  - INCIDENCIA_FIN     → la alarma sostenida se liberó

Resiliencia: si el backend no responde, el evento se encola en SQLite local y se
reintenta en cada iteración (FIFO), de modo que no se pierde ningún conteo.

Requiere:  pip install pymodbus requests
"""
import os
import json
import time
import sqlite3
from datetime import datetime

import requests
from pymodbus.client import ModbusTcpClient
from pymodbus.exceptions import ModbusException

# ---------- CONFIGURACIÓN (vía variables de entorno) ----------
HMI_IP = os.getenv("HMI_IP", "192.168.0.132")
HMI_PORT = int(os.getenv("HMI_PORT", "8000"))      # Puerto Modbus del Weintek
SLAVE_ID = int(os.getenv("HMI_SLAVE_ID", "1"))
INTERVALO_SEGUNDOS = float(os.getenv("INTERVALO_SEGUNDOS", "2"))

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
GATEWAY_API_KEY = os.getenv("GATEWAY_API_KEY", "")
MAQUINA_CODIGO = os.getenv("MAQUINA_CODIGO", "SHM-1234VS")
OPERADOR = os.getenv("OPERADOR") or None
UMBRAL_INCIDENCIA_SEG = float(os.getenv("UMBRAL_INCIDENCIA_SEG", "8"))
# La PRESION HIDRAULICA ALTA se dispara cíclicamente 49-51 s en cada ciclo normal;
# solo cuenta como incidencia real si supera este umbral (override por bit).
UMBRAL_HI_PRESION_SEG = float(os.getenv("UMBRAL_HI_PRESION_SEG", "55"))
UMBRALES_INCIDENCIA = {"hi_presion": UMBRAL_HI_PRESION_SEG}
HTTP_TIMEOUT = float(os.getenv("HTTP_TIMEOUT", "5"))
MODBUS_TIMEOUT = float(os.getenv("MODBUS_TIMEOUT", "5"))   # timeout de conexión/lectura Modbus
RECONEXION_SEG = float(os.getenv("RECONEXION_SEG", "5"))   # espera entre reintentos de connect()


def umbral_de(bit: str) -> float:
    """Umbral de debounce en segundos para un bit de incidencia (override por bit)."""
    return UMBRALES_INCIDENCIA.get(bit, UMBRAL_INCIDENCIA_SEG)

COLA_DB = os.getenv("COLA_DB", os.path.join(os.path.dirname(__file__), "cola_eventos.db"))

# ---------- MAPA DE REGISTROS ----------
# Holding Registers (4x / función 03) — Words
REG_COUNTER = 100       # LW-100  → CW-2  (piezas producidas)
REG_PROCESS_NO = 101    # LW-101  → CW-1  (paso actual del ciclo)
REG_HORA_META = 102     # LW-102  → DW-1139 (palabra simple — ver nota histórica)

# Coils (0x / función 01) — Bits
BIT_AUTO = 100           # LB-100 → MW_Bit-121
BIT_MANUAL = 101         # LB-101 → MW_Bit-120
BIT_EMS = 102            # LB-102 → PW_Bit-58
BIT_HYD_EOCR = 103       # LB-103 → PW_Bit-41
BIT_HP_EOCR = 104        # LB-104 → PW_Bit-42
BIT_LOW_PRESION = 105    # LB-105 → PW_Bit-4C
BIT_HI_PRESION = 106     # LB-106 → PW_Bit-4D

# Mapa bit → etiqueta legible de incidencia
INCIDENCIAS = {
    "ems":         "PARO DE EMERGENCIA",
    "hyd_eocr":    "FALLA MOTOR HIDRAULICO (EOCR)",
    "hp_eocr":     "FALLA MOTOR HP (EOCR)",
    "low_presion": "PRESION HIDRAULICA BAJA",
    "hi_presion":  "PRESION HIDRAULICA ALTA",
}


# ════════════════════════════════════════════════════════════════════
# Cola local SQLite (resiliencia ante caídas de red)
# ════════════════════════════════════════════════════════════════════

def init_cola() -> sqlite3.Connection:
    conn = sqlite3.connect(COLA_DB)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS cola_pendiente ("
        " id INTEGER PRIMARY KEY AUTOINCREMENT,"
        " payload TEXT NOT NULL,"
        " creado_en TEXT NOT NULL)"
    )
    conn.commit()
    return conn


def encolar(conn: sqlite3.Connection, payload: dict) -> None:
    conn.execute(
        "INSERT INTO cola_pendiente (payload, creado_en) VALUES (?, ?)",
        (json.dumps(payload), datetime.now().isoformat()),
    )
    conn.commit()


def _post(payload: dict) -> bool:
    """Intenta enviar un evento. True si el backend respondió 2xx."""
    try:
        resp = requests.post(
            f"{BACKEND_URL}/maquinas/evento",
            json=payload,
            headers={"X-API-Key": GATEWAY_API_KEY},
            timeout=HTTP_TIMEOUT,
        )
        if resp.status_code // 100 == 2:
            return True
        if resp.status_code == 404:
            print(f"[ERROR] Máquina '{MAQUINA_CODIGO}' no está registrada en el backend. "
                  f"Aplica la migración (siembra SHM-1234VS) o dala de alta en /maquinas.")
        else:
            print(f"[WARN] Backend respondió {resp.status_code}: {resp.text[:120]}")
        return False
    except requests.RequestException as e:
        print(f"[WARN] No se pudo enviar al backend: {e}")
        return False


def flush_cola(conn: sqlite3.Connection) -> None:
    """Reintenta los eventos pendientes en orden FIFO; borra los confirmados."""
    cur = conn.execute("SELECT id, payload FROM cola_pendiente ORDER BY id ASC")
    filas = cur.fetchall()
    for fila_id, payload_json in filas:
        payload = json.loads(payload_json)
        if _post(payload):
            conn.execute("DELETE FROM cola_pendiente WHERE id = ?", (fila_id,))
            conn.commit()
        else:
            # Si falla uno, detenemos el flush para preservar el orden.
            break


def enviar_evento(conn: sqlite3.Connection, tipo_evento: str, *,
                  valor=None, estado=None, metadata=None) -> None:
    payload = {
        "maquina_codigo": MAQUINA_CODIGO,
        "tipo_evento": tipo_evento,
        "valor": valor,
        "estado": estado,
        "operador": OPERADOR,
        "metadata": metadata or {},
    }
    if not _post(payload):
        encolar(conn, payload)
        print(f"[COLA] Evento {tipo_evento} encolado localmente (red caída).")


def enviar_telemetria(counter, process_no, meta_h, estado) -> None:
    """Envía el estado en vivo (paso del ciclo, counter, meta, estado) al backend.

    Es efímera: actualiza el snapshot en vivo para que el dashboard muestre el "Paso"
    cambiando entre piezas. Fire-and-forget — si falla, no se encola (se reenvía en el
    próximo cambio). NO envía incidencias: esas las maneja el debounce con su umbral.
    """
    try:
        requests.post(
            f"{BACKEND_URL}/maquinas/telemetria",
            json={
                "maquina_codigo": MAQUINA_CODIGO,
                "counter": counter,
                "process_no": process_no,
                "meta_h": meta_h,
                "estado": estado,
            },
            headers={"X-API-Key": GATEWAY_API_KEY},
            timeout=2,
        )
    except requests.RequestException:
        pass  # telemetría efímera; se reintenta en el próximo cambio


# ════════════════════════════════════════════════════════════════════
# Lectura Modbus
# ════════════════════════════════════════════════════════════════════

def leer_maquina(client: ModbusTcpClient) -> dict:
    datos = {}

    # --- Holding Registers (COUNTER, PROCESS NO, HORA/META) ---
    try:
        words = client.read_holding_registers(address=REG_COUNTER, count=4, device_id=SLAVE_ID)
    except TypeError:  # pymodbus < 3.7
        words = client.read_holding_registers(address=REG_COUNTER, count=4, slave=SLAVE_ID)
    if words.isError():
        raise ConnectionError(f"Error leyendo holding registers: {words}")

    regs = words.registers
    datos["counter"] = regs[0]      # LW-100
    datos["process_no"] = regs[1]   # LW-101
    datos["hora_meta"] = regs[2]    # LW-102 (palabra simple)

    # --- Coils (estado e incidencias) ---
    try:
        bits = client.read_coils(address=BIT_AUTO, count=7, device_id=SLAVE_ID)
    except TypeError:
        bits = client.read_coils(address=BIT_AUTO, count=7, slave=SLAVE_ID)
    if bits.isError():
        raise ConnectionError(f"Error leyendo coils: {bits}")

    b = bits.bits
    datos["auto"] = b[0]
    datos["manual"] = b[1]
    datos["ems"] = b[2]
    datos["hyd_eocr"] = b[3]
    datos["hp_eocr"] = b[4]
    datos["low_presion"] = b[5]
    datos["hi_presion"] = b[6]
    return datos


def estado_de(datos: dict) -> str:
    return "AUTO" if datos["auto"] else ("MANUAL" if datos["manual"] else "DESCONOCIDO")


def log_valores_crudos(datos: dict) -> None:
    """Imprime una vez los valores leídos para verificar el mapeo Modbus.

    Si counter/process_no/meta salen en 0 o absurdos, el problema es el offset
    de "Mapeando tablas" del MODBUS Server en el HMI, no este script.
    """
    incidencias = [k for k in INCIDENCIAS if datos.get(k)]
    print("[VERIFICACIÓN] Primer ciclo leído del HMI:")
    print(f"    counter={datos['counter']}  process_no={datos['process_no']}  "
          f"meta/h={datos['hora_meta']}")
    print(f"    estado={estado_de(datos)}  auto={datos['auto']} manual={datos['manual']}")
    print(f"    incidencias_activas={incidencias or '—'}")
    print("    (si counter/process_no/meta salen en 0 o absurdos → revisar el mapeo "
          "Modbus del HMI, no el script)\n")


def conectar_con_reintento(client: ModbusTcpClient) -> None:
    """Bloquea hasta lograr conectar al HMI, reintentando con backoff fijo.

    Evita que un arranque del gateway antes de que el HMI esté listo mate el
    proceso (antes hacía `return` al primer fallo).
    """
    while not client.connect():
        print(f"[WARN] No se pudo conectar al HMI {HMI_IP}:{HMI_PORT}. "
              f"Verifica cable/WiFi apagado/Modbus Server. Reintento en {RECONEXION_SEG}s…")
        time.sleep(RECONEXION_SEG)


# ════════════════════════════════════════════════════════════════════
# Loop principal
# ════════════════════════════════════════════════════════════════════

def main():
    if not GATEWAY_API_KEY:
        print("[ERROR] Falta GATEWAY_API_KEY. Define la variable de entorno antes de correr.")
        return

    conn = init_cola()
    print(f"Conectando a HMI {HMI_IP}:{HMI_PORT} ... backend={BACKEND_URL} maquina={MAQUINA_CODIGO}")
    client = ModbusTcpClient(HMI_IP, port=HMI_PORT, timeout=MODBUS_TIMEOUT)
    conectar_con_reintento(client)

    print(f"Conectado. Umbral incidencia: {UMBRAL_INCIDENCIA_SEG}s "
          f"(PRESION ALTA: {UMBRAL_HI_PRESION_SEG}s). Ctrl+C para detener.\n")

    counter_anterior = None
    estado_anterior = None
    tele_anterior = None                             # (process_no, estado, counter) último enviado
    primer_ciclo = True                              # para el log de verificación de mapeo
    incidencia_activa_desde: dict[str, float] = {}   # bit → timestamp en que se activó
    incidencia_reportada: set[str] = set()           # incidencias ya emitidas como INICIO

    try:
        while True:
            flush_cola(conn)  # reintenta pendientes antes de leer

            try:
                datos = leer_maquina(client)
            except (ConnectionError, ModbusException) as e:
                # Cable desconectado, HMI reiniciado o timeout Modbus: el socket queda
                # muerto. Cerramos y reconectamos (fuerza socket fresco y resincroniza el
                # contador de transacciones, lo que limpia los desfases transaction_id).
                print(f"[ERROR] {e} — reconectando en {RECONEXION_SEG}s")
                client.close()
                time.sleep(RECONEXION_SEG)
                conectar_con_reintento(client)
                continue

            if primer_ciclo:
                log_valores_crudos(datos)
                primer_ciclo = False

            ahora = time.monotonic()
            estado = estado_de(datos)

            # --- Telemetría en vivo: "Paso" del ciclo entre piezas ---
            # Se envía solo cuando cambia el paso, el estado o el counter (throttle natural).
            tele_actual = (datos["process_no"], estado, datos["counter"])
            if tele_actual != tele_anterior:
                enviar_telemetria(datos["counter"], datos["process_no"],
                                  datos["hora_meta"], estado)
                tele_anterior = tele_actual

            # --- Flanco de COUNTER → nueva pieza ---
            if counter_anterior is not None and datos["counter"] != counter_anterior:
                enviar_evento(
                    conn, "PIEZA",
                    valor=datos["counter"], estado=estado,
                    metadata={"process_no": datos["process_no"], "meta_h": datos["hora_meta"]},
                )
                print(f">>> PIEZA {counter_anterior} → {datos['counter']}")
            counter_anterior = datos["counter"]

            # --- Cambio de estado AUTO ↔ MANUAL ---
            if estado_anterior is not None and estado != estado_anterior:
                enviar_evento(conn, "CAMBIO_ESTADO", estado=estado,
                              metadata={"process_no": datos["process_no"]})
                print(f">>> CAMBIO ESTADO {estado_anterior} → {estado}")
            estado_anterior = estado

            # --- Incidencias sostenidas (debounce) ---
            for bit, etiqueta in INCIDENCIAS.items():
                if datos[bit]:
                    # bit activo: registra el inicio si es nuevo
                    if bit not in incidencia_activa_desde:
                        incidencia_activa_desde[bit] = ahora
                    # ¿lleva sostenido ≥ umbral (override por bit) y aún no se reportó?
                    elif (bit not in incidencia_reportada
                          and ahora - incidencia_activa_desde[bit] >= umbral_de(bit)):
                        incidencia_reportada.add(bit)
                        enviar_evento(conn, "INCIDENCIA_INICIO", estado=estado,
                                      metadata={"incidencia": etiqueta,
                                                "process_no": datos["process_no"]})
                        print(f">>> INCIDENCIA INICIO: {etiqueta}")
                else:
                    # bit inactivo: si estaba reportada, emite FIN
                    if bit in incidencia_reportada:
                        dur = ahora - incidencia_activa_desde.get(bit, ahora)
                        enviar_evento(conn, "INCIDENCIA_FIN", estado=estado,
                                      metadata={"incidencia": etiqueta,
                                                "duracion_seg": round(dur, 1)})
                        print(f">>> INCIDENCIA FIN: {etiqueta} ({dur:.1f}s)")
                        incidencia_reportada.discard(bit)
                    incidencia_activa_desde.pop(bit, None)

            time.sleep(INTERVALO_SEGUNDOS)

    except KeyboardInterrupt:
        print("\nDetenido por el usuario.")
    finally:
        client.close()
        conn.close()
        print("Conexión cerrada.")


if __name__ == "__main__":
    main()
