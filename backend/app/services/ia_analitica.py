import numpy as np
from sklearn.ensemble import IsolationForest
from datetime import datetime, timedelta
from typing import List, Dict, Tuple

class IAAnaliticaService:
    """
    Migra toda la lógica de IA de ModuloProduccion:
    - Detección de fraude/doble escaneo
    - Mantenimiento predictivo
    - Proyección de cierre de turno
    - Sugerencia de plan
    """
    
    def __init__(self):
        self.historial_tiempos: Dict[str, List[float]] = {}  # parte -> [segundos entre scans]
        self.ultimo_escaneo: Dict[str, datetime] = {}
        self.gaps_maquina: Dict[str, List[float]] = {}      # maquina -> [segundos entre scans]
        self.tiempos_maquina: Dict[str, datetime] = {}
    
    def registrar_escaneo(self, parte: str, maquina: str, ahora: datetime) -> List[Dict]:
        """
        Retorna alertas detectadas (anomalías)
        Migra: procesar_escaneo() - parte de IA
        """
        alertas = []
        
        # === DETECCIÓN DE FRAUDE/DOBLE ESCANEO ===
        if parte in self.ultimo_escaneo:
            diff_seg = (ahora - self.ultimo_escaneo[parte]).total_seconds()
            
            if parte not in self.historial_tiempos:
                self.historial_tiempos[parte] = []
            self.historial_tiempos[parte].append(diff_seg)
            
            # Limitar a últimos 50
            if len(self.historial_tiempos[parte]) > 50:
                self.historial_tiempos[parte].pop(0)
            
            # Isolation Forest con >= 5 muestras
            if len(self.historial_tiempos[parte]) >= 5:
                X = np.array(self.historial_tiempos[parte]).reshape(-1, 1)
                modelo = IsolationForest(contamination=0.1, random_state=42)
                modelo.fit(X)
                
                prediccion = modelo.predict([[diff_seg]])
                media_normal = np.mean(X)
                
                if prediccion[0] == -1 and diff_seg < (media_normal * 0.3):
                    alertas.append({
                        "tipo": "FRAUDE",
                        "parte": parte,
                        "motivo": f"Escaneo anormalmente rápido ({int(diff_seg)}s vs {int(media_normal)}s normal)",
                        "severidad": "ALTA"
                    })
        
        self.ultimo_escaneo[parte] = ahora
        
        # === MANTENIMIENTO PREDICTIVO ===
        if maquina != 'Sin máquina':
            if maquina in self.tiempos_maquina:
                gap = (ahora - self.tiempos_maquina[maquina]).total_seconds()
                
                if maquina not in self.gaps_maquina:
                    self.gaps_maquina[maquina] = []
                self.gaps_maquina[maquina].append(gap)
                
                if len(self.gaps_maquina[maquina]) > 8:
                    self.gaps_maquina[maquina].pop(0)
                
                # Pendiente de regresión lineal
                if len(self.gaps_maquina[maquina]) >= 5:
                    y = np.array(self.gaps_maquina[maquina])
                    x = np.arange(len(y))
                    pendiente, _ = np.polyfit(x, y, 1)
                    
                    if pendiente > 5:
                        alertas.append({
                            "tipo": "MANTENIMIENTO",
                            "maquina": maquina,
                            "motivo": f"Lentitud progresiva detectada ({pendiente:+.1f}s/ciclo). Posible atasco o fatiga.",
                            "severidad": "MEDIA"
                        })
            
            self.tiempos_maquina[maquina] = ahora
        
        return alertas
    
    def calcular_proyeccion_turno(self, 
                                  produccion_actual: Dict[str, int],
                                  planes: Dict[str, int],
                                  turno: str) -> List[Dict]:
        """
        Migra: actualizar_prediccion()
        Retorna proyección por parte con tiempos estimados
        """
        ahora = datetime.now()
        
        if turno == "DIA":
            inicio = ahora.replace(hour=7, minute=30, second=0)
            fin = ahora.replace(hour=19, minute=30, second=0)
        else:
            hora_actual = ahora.time()
            if hora_actual >= datetime.strptime("19:30", "%H:%M").time():
                inicio = ahora.replace(hour=19, minute=30, second=0)
                fin = (ahora + timedelta(days=1)).replace(hour=7, minute=30, second=0)
            else:
                inicio = (ahora - timedelta(days=1)).replace(hour=19, minute=30, second=0)
                fin = ahora.replace(hour=7, minute=30, second=0)
        
        tiempo_transcurrido = max(0.1, (ahora - inicio).total_seconds() / 3600)
        tiempo_total = (fin - inicio).total_seconds() / 3600
        tiempo_restante = max(0, tiempo_total - tiempo_transcurrido)
        
        proyecciones = []
        alertas_plan = []
        
        for parte, total_actual in produccion_actual.items():
            ritmo = total_actual / tiempo_transcurrido  # piezas/hora
            
            meta = planes.get(parte, "N/A")
            proyeccion = {
                "parte": parte,
                "producidas": total_actual,
                "ritmo_por_hora": int(ritmo),
                "meta_plan": meta,
                "faltan": "N/A",
                "tiempo_estimado": "N/A"
            }
            
            if meta != "N/A":
                faltan = max(0, meta - total_actual)
                proyeccion["faltan"] = faltan
                
                if faltan == 0:
                    proyeccion["tiempo_estimado"] = "✅ Completado"
                elif ritmo > 0:
                    horas_necesarias = faltan / ritmo
                    proyeccion["tiempo_estimado"] = f"{horas_necesarias:.1f} hrs"
                    
                    # Alerta de lentitud
                    if horas_necesarias > tiempo_restante:
                        alertas_plan.append({
                            "parte": parte,
                            "motivo": f"No alcanzará meta: necesita {horas_necesarias:.1f}h, turno termina en {tiempo_restante:.1f}h"
                        })
                else:
                    proyeccion["tiempo_estimado"] = "∞ hrs"
            
            proyecciones.append(proyeccion)
        
        return {"proyecciones": proyecciones, "alertas_plan": alertas_plan}
    
    def sugerir_plan_produccion(self, 
                                historial_df,  # pandas DataFrame
                                paros_df) -> Dict[str, int]:
        """
        Migra: sugerir_plan_ia()
        Usa historial de producción y paros para sugerir metas
        """
        if historial_df.empty:
            return {}
        
        # 1. Producción por día/parte
        prod_diaria = historial_df.groupby([
            historial_df['fecha'].dt.date, 
            'numero_parte', 
            'maquina'
        ])['total_acumulado'].max().reset_index()
        
        # 2. Tiempo de paro por máquina
        if not paros_df.empty:
            paros_diarios = paros_df.groupby([
                paros_df['fecha'].dt.date, 
                'maquina'
            ])['duracion_minutos'].sum().reset_index()
            
            df_merged = prod_diaria.merge(paros_diarios, on=['fecha', 'maquina'], how='left')
            df_merged['duracion_minutos'].fillna(0, inplace=True)
        else:
            df_merged = prod_diaria.copy()
            df_merged['duracion_minutos'] = 0
        
        # 3. Ritmo ajustado por paros
        duracion_turno = 720  # 12 horas en minutos
        df_merged['tiempo_productivo'] = duracion_turno - df_merged['duracion_minutos']
        df_merged['tiempo_productivo'] = df_merged['tiempo_productivo'].apply(lambda x: max(x, 1))
        df_merged['ritmo_por_min'] = df_merged['total_acumulado'] / df_merged['tiempo_productivo']
        
        # 4. Ritmo promedio por parte
        ritmo_promedio = df_merged.groupby('numero_parte')['ritmo_por_min'].mean()
        
        # 5. Meta con factor de seguridad 90%, redondeo a 50
        factor_seguridad = 0.9
        plan_sugerido = {}
        
        for parte, ritmo in ritmo_promedio.items():
            meta = ritmo * duracion_turno * factor_seguridad
            meta_redondeada = int(round(meta / 50)) * 50
            plan_sugerido[parte] = max(50, meta_redondeada)  # mínimo 50
        
        return plan_sugerido