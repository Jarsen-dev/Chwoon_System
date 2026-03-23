import tkinter as tk
from tkinter import ttk, messagebox, filedialog, simpledialog
from datetime import datetime, timedelta
import csv
import os
import io 
import pandas as pd
import numpy as np 
from sklearn.ensemble import IsolationForest 
import threading 
import math

# --- LIBRERÍAS PARA EL CORREO AUTOMÁTICO ---
import smtplib
from email.message import EmailMessage
import mimetypes

# Librerías para la gráfica
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg

class ModuloProduccion:
    def __init__(self, parent, part_data, app=None):
        self.window = tk.Toplevel(parent)
        self.window.title("Control de Producción y Reportes Inteligentes")
        self.window.geometry("1150x800") 
        self.window.configure(bg="#f4f6f9")
        
        self.part_data = part_data 
        self.app = app
        self.archivo_log = "registro_produccion.csv"
        self.archivo_anomalias = "registro_anomalias.csv" 
        self.archivo_plan = "plan_produccion.csv" # <-- NUEVO: Archivo para guardar el plan
        self.archivo_paros = "registro_paros.csv"
        
        # Diccionarios para persistencia
        self.conteos_por_parte = {} 
        self.piezas_por_parte = {}  
        
        # Variables para controlar el Auto-Enter
        self.scan_timer = None
        
        # Variables para IA Analítica (Detección de Fraude)
        self.ultimo_escaneo_parte = {}     
        self.historial_tiempos_parte = {}  
        
        # Variables: MANTENIMIENTO PREDICTIVO
        self.tiempos_por_maquina = {}
        self.gaps_por_maquina = {}

        # --- NUEVAS VARIABLES: PLAN DE PRODUCCIÓN ---
        self.plan_produccion = {} # Guarda {Numero_Parte: Meta}
        self.alertas_plan_enviadas = set() # Evita spam de alertas por lentitud
        
        self._preparar_archivo()
        self._cargar_estado_actual() 
        self._cargar_plan() # <-- NUEVO: Cargar el plan al abrir el sistema
        
        self._crear_interfaz()
        
        # Cargar historial de anomalías
        self._cargar_anomalias()
        
        # Dibujar gráfica y proyección inicial al abrir
        self.actualizar_tabla_plan() # <-- NUEVO: Pintar el plan recuperado
        self.actualizar_grafica() 
        self.actualizar_prediccion()
        
        self.ent_qr.focus_set()

    def obtener_turno(self):
        ahora = datetime.now().time()
        inicio_dia = ahora.replace(hour=7, minute=30, second=0, microsecond=0)
        fin_dia = ahora.replace(hour=19, minute=30, second=0, microsecond=0)
        return "DIA" if inicio_dia <= ahora <= fin_dia else "NOCHE"

    def _cargar_estado_actual(self):
        if not os.path.exists(self.archivo_log):
            return

        turno_actual = self.obtener_turno()
        fecha_actual = datetime.now().strftime("%Y-%m-%d")
        
        try:
            with open(self.archivo_log, mode='r', encoding='utf-8') as f:
                reader = csv.reader(f)
                next(reader) 
                for fila in reader:
                    if len(fila) >= 9:
                        f_log, t_log, c_log, p_log, qty_log, tot_log = fila[0], fila[2], fila[6], fila[4], fila[7], fila[8]
                        if f_log == fecha_actual and t_log == turno_actual:
                            self.conteos_por_parte[p_log] = int(c_log)
                            self.piezas_por_parte[p_log] = int(tot_log)
        except Exception as e:
            print(f"Error recuperando historial: {e}")

    # --- NUEVA FUNCIÓN: RECUPERAR EL PLAN DE PRODUCCIÓN ---
    def _cargar_plan(self):
        if not os.path.exists(self.archivo_plan):
            return
        try:
            with open(self.archivo_plan, mode='r', encoding='utf-8') as f:
                reader = csv.reader(f)
                next(reader) # Saltar encabezado
                for fila in reader:
                    if len(fila) >= 2:
                        parte = fila[0]
                        meta = int(fila[1])
                        self.plan_produccion[parte] = meta
        except Exception as e:
            print(f"Error recuperando plan de producción: {e}")

    # --- NUEVA FUNCIÓN: GUARDAR EL PLAN EN DISCO ---
    def guardar_plan(self):
        try:
            with open(self.archivo_plan, mode='w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(['Numero_Parte', 'Meta'])
                for parte, meta in self.plan_produccion.items():
                    writer.writerow([parte, meta])
        except Exception as e:
            print(f"Error guardando plan de producción: {e}")

    def _preparar_archivo(self):
        if not os.path.exists(self.archivo_log):
            with open(self.archivo_log, mode='w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(['Fecha', 'Hora', 'Turno', 'Máquina', 'Número de Parte', 'Descripción', 'Carrito', 'QTY', 'Total_Prod_Parte'])
                
        if not os.path.exists(self.archivo_anomalias):
            with open(self.archivo_anomalias, mode='w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(['Fecha', 'Hora', 'Número de Parte', 'Motivo de Alerta'])
        
        self._preparar_archivo_paros()

    def _crear_interfaz(self):
        header = tk.Frame(self.window, bg="#2c3e50", pady=10)
        header.pack(fill="x")
        self.lbl_turno = tk.Label(header, text=f"TURNO ACTUAL: {self.obtener_turno()}", 
                                 fg="white", bg="#2c3e50", font=("Arial", 14, "bold"))
        self.lbl_turno.pack()

        main_container = tk.Frame(self.window, bg="#f4f6f9")
        main_container.pack(fill="both", expand=True, padx=15, pady=15)

        style = ttk.Style()
        style.configure("TNotebook.Tab", font=("Arial", 12, "bold"), padding=[10, 5])
        
        self.notebook = ttk.Notebook(main_container)
        self.notebook.pack(fill="both", expand=True)

        # ==========================================
        # PESTAÑA 1: Escáner y Tabla
        # ==========================================
        self.tab_escaner = tk.Frame(self.notebook, bg="#ffffff", bd=1, relief="ridge", padx=20, pady=20)
        self.notebook.add(self.tab_escaner, text="📷 Captura")

        tk.Label(self.tab_escaner, text="ESCANEE EL CÓDIGO DEL CARRITO", font=("Arial", 12, "bold"), bg="#ffffff", fg="#34495e").pack(pady=(5, 5))
        
        self.qr_var = tk.StringVar()
        self.ent_qr = tk.Entry(self.tab_escaner, textvariable=self.qr_var, font=("Arial", 26), width=30, justify="center", bd=2, relief="solid")
        self.ent_qr.pack(pady=10)
        
        self.ent_qr.bind('<Return>', self.procesar_escaneo) 
        self.ent_qr.bind('<KeyRelease>', self.iniciar_auto_enter) 

        # --- SE AGREGAN COLUMNAS META Y FALTAN ---
        self.tree = ttk.Treeview(self.tab_escaner, columns=("H", "M", "P", "C", "Q", "T", "META", "FALTAN"), show="headings", height=12)
        self.tree.heading("H", text="Hora")
        self.tree.heading("M", text="Máquina")
        self.tree.heading("P", text="N° Parte")
        self.tree.heading("C", text="Carrito")
        self.tree.heading("Q", text="QTY")
        self.tree.heading("T", text="Total")
        self.tree.heading("META", text="Meta Plan")
        self.tree.heading("FALTAN", text="Faltan")
        
        self.tree.column("H", width=80, anchor="center")
        self.tree.column("M", width=100, anchor="center")
        self.tree.column("P", width=140, anchor="center")
        self.tree.column("C", width=70, anchor="center")
        self.tree.column("Q", width=60, anchor="center")
        self.tree.column("T", width=80, anchor="center")
        self.tree.column("META", width=80, anchor="center")
        self.tree.column("FALTAN", width=80, anchor="center")
        
        self.tree.pack(pady=15, fill="both", expand=True)

        frame_botones = tk.Frame(self.tab_escaner, bg="#ffffff")
        frame_botones.pack(pady=5)

        btn_reporte = tk.Button(frame_botones, text="📊 Exportar Excel (Manual)", 
                                font=("Arial", 12, "bold"), bg="#27ae60", fg="white", 
                                cursor="hand2", padx=20, pady=8, command=self.generar_reporte)
        btn_reporte.pack(side="left", padx=10)

        btn_correo = tk.Button(frame_botones, text="📧 Enviar Reporte por Correo", 
                                font=("Arial", 12, "bold"), bg="#c0392b", fg="white", 
                                cursor="hand2", padx=20, pady=8, command=self.enviar_correo)
        btn_correo.pack(side="left", padx=10)

        btn_paro = tk.Button(frame_botones, text="🛑 Registrar Paro",
                             font=("Arial", 12, "bold"), bg="#f39c12", fg="white",
                             cursor="hand2", padx=20, pady=8, command=self.registrar_paro)
        btn_paro.pack(side="left", padx=10)

        # ==========================================
        # PESTAÑA NUEVA: Plan de Producción
        # ==========================================
        self.tab_plan = tk.Frame(self.notebook, bg="#ffffff", bd=1, relief="ridge", padx=20, pady=20)
        self.notebook.add(self.tab_plan, text="📋 Plan Prod.")

        tk.Label(self.tab_plan, text="GESTOR DE PLAN DE PRODUCCIÓN", font=("Arial", 16, "bold"), bg="#ffffff", fg="#2980b9").pack(pady=(0, 10))
        
        frame_btn_plan = tk.Frame(self.tab_plan, bg="#ffffff")
        frame_btn_plan.pack(fill="x", pady=5)
        
        btn_importar_plan = tk.Button(frame_btn_plan, text="📥 Importar de Excel", font=("Arial", 10, "bold"), bg="#8e44ad", fg="white", cursor="hand2", command=self.importar_plan)
        btn_importar_plan.pack(side="left", padx=5)

        btn_exportar_plan = tk.Button(frame_btn_plan, text="📤 Exportar a Excel", font=("Arial", 10, "bold"), bg="#16a085", fg="white", cursor="hand2", command=self.exportar_plan_excel)
        btn_exportar_plan.pack(side="left", padx=5)
        
        # --- NUEVOS BOTONES DE EDICIÓN DE PLAN ---
        btn_agregar_manual = tk.Button(frame_btn_plan, text="➕ Agregar/Editar Manual", font=("Arial", 10, "bold"), bg="#2980b9", fg="white", cursor="hand2", command=self.editar_plan_manual)
        btn_agregar_manual.pack(side="left", padx=5)

        btn_eliminar_plan = tk.Button(frame_btn_plan, text="🗑️ Eliminar Selección", font=("Arial", 10, "bold"), bg="#e74c3c", fg="white", cursor="hand2", command=self.eliminar_parte_plan)
        btn_eliminar_plan.pack(side="left", padx=5)

        btn_sugerir_plan = tk.Button(frame_btn_plan, text="🤖 Sugerir Plan por IA", font=("Arial", 10, "bold"), bg="#3498db", fg="white", cursor="hand2", command=self.sugerir_plan_ia)
        btn_sugerir_plan.pack(side="left", padx=15)
        
        tk.Label(frame_btn_plan, text="(Doble clic en la tabla para editar una meta)", font=("Arial", 9, "italic"), bg="#ffffff", fg="#7f8c8d").pack(side="left", padx=10)

        # Tabla de Cola de Producción
        self.tree_plan = ttk.Treeview(self.tab_plan, columns=("P", "D", "M", "META", "PROD", "FAL", "EST"), show="headings", height=15)
        self.tree_plan.heading("P", text="Número de Parte")
        self.tree_plan.heading("D", text="Descripción")
        self.tree_plan.heading("M", text="Máquina Asignada")
        self.tree_plan.heading("META", text="Meta")
        self.tree_plan.heading("PROD", text="Producido")
        self.tree_plan.heading("FAL", text="Faltan")
        self.tree_plan.heading("EST", text="Estado / Alerta")

        self.tree_plan.column("P", width=120, anchor="center")
        self.tree_plan.column("D", width=250, anchor="w")
        self.tree_plan.column("M", width=100, anchor="center")
        self.tree_plan.column("META", width=80, anchor="center")
        self.tree_plan.column("PROD", width=80, anchor="center")
        self.tree_plan.column("FAL", width=80, anchor="center")
        self.tree_plan.column("EST", width=150, anchor="center")

        self.tree_plan.pack(fill="both", expand=True, pady=10)
        
        # --- EVENTO DE DOBLE CLIC PARA EDITAR ---
        self.tree_plan.bind("<Double-1>", self.editar_meta_arbol)

        # ==========================================
        # PESTAÑA 2: Dashboard Visual (Gráfica)
        # ==========================================
        self.tab_dashboard = tk.Frame(self.notebook, bg="#ffffff", bd=1, relief="ridge", padx=20, pady=20)
        self.notebook.add(self.tab_dashboard, text="📈 Dashboard")

        tk.Label(self.tab_dashboard, text="RESUMEN DE PRODUCCIÓN DEL TURNO", font=("Arial", 14, "bold"), bg="#ffffff", fg="#2980b9").pack(pady=(5, 5))

        self.fig, self.ax = plt.subplots(figsize=(8, 4.5), dpi=100)
        self.fig.patch.set_facecolor('#ffffff')
        self.ax.set_facecolor('#f8f9fa')
        
        self.canvas = FigureCanvasTkAgg(self.fig, master=self.tab_dashboard)
        self.canvas.get_tk_widget().pack(fill="both", expand=True)

        # ==========================================
        # PESTAÑA 3: Predicción IA (AHORA CON SUBMENÚS)
        # ==========================================
        self.tab_prediccion = tk.Frame(self.notebook, bg="#ffffff", bd=1, relief="ridge", padx=10, pady=10)
        self.notebook.add(self.tab_prediccion, text="🤖 Predicción IA")

        tk.Label(self.tab_prediccion, text="INTELIGENCIA ARTIFICIAL APLICADA A PLANTA", font=("Arial", 16, "bold"), bg="#ffffff", fg="#2c3e50").pack(pady=(0, 10))

        style_sub = ttk.Style()
        style_sub.configure("Sub.TNotebook.Tab", font=("Arial", 11, "bold"), padding=[15, 5])
        self.notebook_ia = ttk.Notebook(self.tab_prediccion, style="Sub.TNotebook")
        self.notebook_ia.pack(fill="both", expand=True)

        # --- SUB-PESTAÑA 3.1: PROYECCIÓN DE TURNO ---
        self.subtab_proyeccion = tk.Frame(self.notebook_ia, bg="#fef9e7", padx=20, pady=20)
        self.notebook_ia.add(self.subtab_proyeccion, text="📊 Proyección y Tiempos")

        self.lbl_titulo_proyeccion = tk.Label(self.subtab_proyeccion, text=f"PROYECTANDO CIERRE DEL TURNO: {self.obtener_turno()}", font=("Arial", 14, "bold"), bg="#fef9e7", fg="#2980b9")
        self.lbl_titulo_proyeccion.pack(pady=(0, 5))

        self.lbl_prediccion_status = tk.Label(self.subtab_proyeccion, text="⏳ Esperando datos para calcular la proyección...", font=("Arial", 12, "bold"), bg="#fef9e7", fg="#d35400")
        self.lbl_prediccion_status.pack(pady=(0, 10))

        # --- SE AGREGAN COLUMNAS DE TIEMPO Y META A LA PREDICCIÓN ---
        self.tree_pred = ttk.Treeview(self.subtab_proyeccion, columns=("P", "A", "R", "M", "F", "T"), show="headings", height=10)
        self.tree_pred.heading("P", text="N° Parte")
        self.tree_pred.heading("A", text="Producidas")
        self.tree_pred.heading("R", text="Ritmo (Pz/Hr)")
        self.tree_pred.heading("M", text="Meta Plan")
        self.tree_pred.heading("F", text="Faltan")
        self.tree_pred.heading("T", text="Tiempo Estimado (Fin)")

        self.tree_pred.column("P", width=120, anchor="center")
        self.tree_pred.column("A", width=80, anchor="center")
        self.tree_pred.column("R", width=100, anchor="center")
        self.tree_pred.column("M", width=80, anchor="center")
        self.tree_pred.column("F", width=80, anchor="center")
        self.tree_pred.column("T", width=150, anchor="center")

        self.tree_pred.pack(fill="both", expand=True)
        
        # --- SUB-PESTAÑA 3.2: MANTENIMIENTO PREDICTIVO ---
        self.subtab_salud = tk.Frame(self.notebook_ia, bg="#f5eef8", padx=20, pady=20)
        self.notebook_ia.add(self.subtab_salud, text="⚙️ Salud de Máquinas")

        tk.Label(self.subtab_salud, text="MANTENIMIENTO PREDICTIVO Y DETECCIÓN DE FATIGA", font=("Arial", 14, "bold"), bg="#f5eef8", fg="#8e44ad").pack(pady=(0, 10))
        
        self.tree_salud = ttk.Treeview(self.subtab_salud, columns=("M", "U", "T", "E"), show="headings", height=10)
        self.tree_salud.heading("M", text="Máquina")
        self.tree_salud.heading("U", text="Último Ciclo (segundos)")
        self.tree_salud.heading("T", text="Tendencia Matemática")
        self.tree_salud.heading("E", text="Estado / Diagnóstico")
        
        self.tree_salud.column("M", width=150, anchor="center")
        self.tree_salud.column("U", width=150, anchor="center")
        self.tree_salud.column("T", width=150, anchor="center")
        self.tree_salud.column("E", width=250, anchor="center")
        
        self.tree_salud.pack(fill="both", expand=True)

        tk.Label(self.subtab_salud, text="* La IA necesita al menos 5 registros continuos de la misma máquina para detectar la tendencia de desgaste.", 
                 font=("Arial", 10, "italic"), bg="#f5eef8", fg="#7f8c8d").pack(pady=10)

        # ==========================================
        # PESTAÑA 4: Anomalías y Fraude 
        # ==========================================
        self.tab_anomalias = tk.Frame(self.notebook, bg="#ffffff", bd=1, relief="ridge", padx=20, pady=20)
        self.notebook.add(self.tab_anomalias, text="🚨 Anomalías")
        
        tk.Label(self.tab_anomalias, text="REGISTRO DE ALERTAS Y POSIBLE FRAUDE (IA ANALÍTICA)", font=("Arial", 16, "bold"), bg="#ffffff", fg="#c0392b").pack(pady=(10, 10))
        
        frame_tabla_anom = tk.Frame(self.tab_anomalias, bg="#ffffff")
        frame_tabla_anom.pack(fill="both", expand=True, pady=10)

        self.tree_anomalias = ttk.Treeview(frame_tabla_anom, columns=("F", "H", "P", "M"), show="headings", height=10)
        self.tree_anomalias.heading("F", text="Fecha")
        self.tree_anomalias.heading("H", text="Hora")
        self.tree_anomalias.heading("P", text="Número de Parte")
        self.tree_anomalias.heading("M", text="Motivo de Alerta")

        self.tree_anomalias.column("F", width=120, anchor="center")
        self.tree_anomalias.column("H", width=120, anchor="center")
        self.tree_anomalias.column("P", width=180, anchor="center")
        self.tree_anomalias.column("M", width=400, anchor="w")

        self.tree_anomalias.pack(fill="both", expand=True)

        # ==========================================
        # PESTAÑA 5: Chatbot Analista (GEMINI AI)
        # ==========================================
        self.tab_chat = tk.Frame(self.notebook, bg="#ffffff", bd=1, relief="ridge", padx=20, pady=20)
        self.notebook.add(self.tab_chat, text="💬 Chatbot")

        tk.Label(self.tab_chat, text="CHATBOT ANALISTA DE PRODUCCIÓN (IA)", font=("Arial", 16, "bold"), bg="#ffffff", fg="#2980b9").pack(pady=(0, 10))

        frame_api = tk.Frame(self.tab_chat, bg="#ffffff")
        frame_api.pack(fill="x", pady=5)
        tk.Label(frame_api, text="API Key de Gemini:", font=("Arial", 10, "bold"), bg="#ffffff").pack(side="left")
        self.ent_api_key = tk.Entry(frame_api, font=("Arial", 10), width=45, show="*")
        self.ent_api_key.pack(side="left", padx=10)
        tk.Label(frame_api, text="(Obtén una gratis en aistudio.google.com)", font=("Arial", 9, "italic"), bg="#ffffff", fg="#7f8c8d").pack(side="left")

        self.txt_chat = tk.Text(self.tab_chat, font=("Arial", 11), wrap="word", bg="#f8f9fa", bd=2, relief="groove")
        self.txt_chat.pack(fill="both", expand=True, pady=10)
        
        mensaje_inicial = "🤖 Asistente IA: ¡Hola! Soy tu analista de datos. Ingresa tu API Key arriba y hazme cualquier pregunta sobre la producción de hoy. \n\n*NOTA ESPECIAL:* Si me pides generar una hoja de cálculo sobre cálculos específicos, generaré el Excel para ti automáticamente.\n\n"
        self.txt_chat.insert(tk.END, mensaje_inicial)
        self.txt_chat.config(state=tk.DISABLED)

        frame_input_chat = tk.Frame(self.tab_chat, bg="#ffffff")
        frame_input_chat.pack(fill="x", pady=5)
        
        self.ent_pregunta = tk.Entry(frame_input_chat, font=("Arial", 14), bd=2, relief="solid")
        self.ent_pregunta.pack(side="left", fill="x", expand=True, padx=(0, 10))
        self.ent_pregunta.bind('<Return>', lambda event: self.enviar_pregunta_chat())
        
        btn_enviar_chat = tk.Button(frame_input_chat, text="Preguntar 🚀", font=("Arial", 12, "bold"), bg="#3498db", fg="white", cursor="hand2", padx=15, command=self.enviar_pregunta_chat)
        btn_enviar_chat.pack(side="right")

    def _ask_turno_dialog_for_plan(self):
        """Muestra un diálogo simple para seleccionar el turno para todo el plan."""
        dialog = tk.Toplevel(self.window)
        dialog.title("Seleccionar Turno")
        dialog.transient(self.window)
        dialog.grab_set()
        dialog.resizable(False, False)

        result = tk.StringVar()

        ttk.Label(dialog, text="Seleccione el turno para el plan de producción importado:").pack(padx=20, pady=10)
        
        combo = ttk.Combobox(dialog, values=["Día", "Noche"], state="readonly", width=15)
        combo.pack(padx=20, pady=5)
        combo.set("Día")

        def on_ok():
            result.set(combo.get())
            dialog.destroy()

        def on_cancel():
            result.set("")
            dialog.destroy()

        button_frame = ttk.Frame(dialog)
        button_frame.pack(padx=20, pady=(10, 15))
        ttk.Button(button_frame, text="Aceptar", command=on_ok).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Cancelar", command=on_cancel).pack(side=tk.LEFT, padx=5)
        
        dialog.protocol("WM_DELETE_WINDOW", on_cancel)
        
        # Centrar el diálogo
        self.window.update_idletasks()
        x = self.window.winfo_x() + (self.window.winfo_width() - dialog.winfo_reqwidth()) / 2
        y = self.window.winfo_y() + (self.window.winfo_height() - dialog.winfo_reqheight()) / 2
        dialog.geometry(f"+{int(x)}+{int(y)}")

        dialog.wait_window(dialog)
        return result.get()

    # --- LÓGICAS DE PLAN DE PRODUCCIÓN (NUEVAS Y ACTUALIZADAS) ---
    def importar_plan(self):
        archivo = filedialog.askopenfilename(title="Seleccionar Archivo de Plan", filetypes=[("Excel files", "*.xlsx *.xls"), ("CSV files", "*.csv")])
        if not archivo: return
        
        try:
            if archivo.endswith('.csv'):
                df = pd.read_csv(archivo)
            else:
                df = pd.read_excel(archivo)

            # Usar un diccionario temporal para el plan recién importado
            plan_importado = {}
            
            # Buscar columnas compatibles
            col_parte = next((col for col in df.columns if 'parte' in col.lower() or 'numero' in col.lower()), df.columns[0])
            col_meta = next((col for col in df.columns if 'meta' in col.lower() or 'plan' in col.lower() or 'cantidad' in col.lower()), df.columns[1])
            
            df.dropna(subset=[col_parte, col_meta], inplace=True)

            for _, row in df.iterrows():
                parte = str(row[col_parte]).strip().upper()
                try:
                    meta = int(row[col_meta])
                    if parte and meta > 0:
                        plan_importado[parte] = meta
                except (ValueError, TypeError):
                    continue
            
            if not plan_importado:
                messagebox.showwarning("Plan Vacío", "El archivo no contenía datos de plan válidos o las metas no eran positivas.", parent=self.window)
                return

            # Preguntar por el turno
            turno = self._ask_turno_dialog_for_plan()
            if not turno:
                messagebox.showinfo("Cancelado", "La importación del plan fue cancelada. No se han añadido etiquetas a la cola.", parent=self.window)
                return

            # Proceder a actualizar el plan principal y la cola de impresión
            self.plan_produccion.update(plan_importado)
            
            items_for_queue = []
            for parte, meta in plan_importado.items():
                part_info = self.part_data.get(parte)
                if part_info:
                    try:
                        qtu = int(part_info.get('qtu', '1'))
                        if qtu <= 0: qtu = 1
                    except (ValueError, TypeError):
                        qtu = 1
                    
                    num_labels = math.ceil(meta / qtu)
                    if num_labels > 0:
                        items_for_queue.append({'part_number': parte, 'quantity': int(num_labels), 'turno': turno})

            if hasattr(self, 'app') and self.app and items_for_queue:
                self.app.add_list_to_print_queue(items_for_queue)
            
            self.guardar_plan()
            self.actualizar_tabla_plan()
            self.actualizar_prediccion() 
            messagebox.showinfo("Éxito", f"Plan de producción importado y actualizado correctamente.", parent=self.window)
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo importar el archivo:\n{e}", parent=self.window)

    def editar_plan_manual(self):
        parte = simpledialog.askstring("Agregar/Editar Plan", "Ingrese el Número de Parte:", parent=self.window)
        if not parte: return
        parte = parte.strip().upper()
        
        meta_actual = self.plan_produccion.get(parte, "")
        meta_str = simpledialog.askstring("Definir Meta", f"Ingrese la meta para la pieza {parte}:", parent=self.window, initialvalue=str(meta_actual))
        
        if not meta_str or not meta_str.isdigit():
            messagebox.showwarning("Error", "La meta ingresada no es válida. Debe ser un número entero.")
            return
            
        self.plan_produccion[parte] = int(meta_str)
        self.guardar_plan()
        self.actualizar_tabla_plan()
        self.actualizar_prediccion()

    def editar_meta_arbol(self, event):
        """Se ejecuta al hacer doble clic en la tabla del plan"""
        seleccion = self.tree_plan.selection()
        if not seleccion: return
        
        valores = self.tree_plan.item(seleccion[0], 'values')
        parte = valores[0]
        
        meta_actual = self.plan_produccion.get(parte, 0)
        meta_str = simpledialog.askstring("Editar Meta", f"Modificar meta para {parte}:", parent=self.window, initialvalue=str(meta_actual))
        
        if meta_str and meta_str.isdigit():
            self.plan_produccion[parte] = int(meta_str)
            self.guardar_plan()
            self.actualizar_tabla_plan()
            self.actualizar_prediccion()

    def eliminar_parte_plan(self):
        seleccion = self.tree_plan.selection()
        if not seleccion:
            messagebox.showinfo("Aviso", "Seleccione un registro de la tabla para eliminarlo.")
            return
            
        valores = self.tree_plan.item(seleccion[0], 'values')
        parte = valores[0]
        
        if messagebox.askyesno("Confirmar Eliminación", f"¿Desea eliminar la pieza {parte} del Plan de Producción actual?"):
            if parte in self.plan_produccion:
                del self.plan_produccion[parte]
                self.guardar_plan()
                self.actualizar_tabla_plan()
                self.actualizar_prediccion()

    def sugerir_plan_ia(self):
        try:
            if not os.path.exists(self.archivo_log) or os.path.getsize(self.archivo_log) == 0:
                messagebox.showwarning("Sin Datos", "No hay suficiente historial de producción para hacer una sugerencia.")
                return

            df_prod = pd.read_csv(self.archivo_log, parse_dates=['Fecha'])
            
            if not os.path.exists(self.archivo_paros) or os.path.getsize(self.archivo_paros) == 0:
                df_paros = pd.DataFrame(columns=['Fecha', 'Máquina', 'Duracion_Minutos'])
            else:
                df_paros = pd.read_csv(self.archivo_paros, parse_dates=['Fecha'])

            # 1. Calcular producción total por día y por parte
            prod_diaria = df_prod.groupby([df_prod['Fecha'].dt.date, 'Número de Parte', 'Máquina'])['Total_Prod_Parte'].max().reset_index()

            # 2. Calcular tiempo de paro total por día y por máquina
            paros_diarios = df_paros.groupby([df_paros['Fecha'].dt.date, 'Máquina'])['Duracion_Minutos'].sum().reset_index()

            # 3. Unir los datos de producción y paros
            df_merged = pd.merge(prod_diaria, paros_diarios, on=['Fecha', 'Máquina'], how='left')
            df_merged['Duracion_Minutos'].fillna(0, inplace=True)

            # 4. Calcular el ritmo de producción ajustado por paros
            # Asumimos un turno de 12 horas = 720 minutos
            duracion_turno_minutos = 720
            df_merged['Tiempo_Productivo_Minutos'] = duracion_turno_minutos - df_merged['Duracion_Minutos']
            # Evitar división por cero o por tiempo negativo
            df_merged['Tiempo_Productivo_Minutos'] = df_merged['Tiempo_Productivo_Minutos'].apply(lambda x: max(x, 1))
            df_merged['Ritmo_Pz_Por_Min'] = df_merged['Total_Prod_Parte'] / df_merged['Tiempo_Productivo_Minutos']

            # 5. Calcular el ritmo promedio para cada número de parte
            ritmo_promedio = df_merged.groupby('Número de Parte')['Ritmo_Pz_Por_Min'].mean().reset_index()

            # 6. Generar el plan sugerido
            # Proyectamos la meta para un turno completo, con un factor de seguridad del 90%
            factor_seguridad = 0.9
            ritmo_promedio['Meta_Sugerida'] = ritmo_promedio['Ritmo_Pz_Por_Min'] * duracion_turno_minutos * factor_seguridad
            
            # Redondear a un número "razonable" (múltiplo de 50)
            ritmo_promedio['Meta_Sugerida'] = ritmo_promedio['Meta_Sugerida'].apply(lambda x: int(round(x / 50)) * 50)

            plan_sugerido = dict(zip(ritmo_promedio['Número de Parte'], ritmo_promedio['Meta_Sugerida']))

            if not plan_sugerido:
                messagebox.showinfo("IA: Plan no generado", "No se pudo generar un plan. Revise que los datos de producción y las máquinas asignadas sean consistentes.")
                return

            # 7. Mostrar el plan al usuario y pedir confirmación
            msg_confirmacion = "La IA analizó el historial y sugiere el siguiente plan:\n\n"
            for parte, meta in plan_sugerido.items():
                msg_confirmacion += f"• {parte}: {meta} piezas\n"
            msg_confirmacion += "\n¿Desea aplicar este plan?"

            if messagebox.askyesno("IA: Plan de Producción Sugerido", msg_confirmacion):
                self.plan_produccion = plan_sugerido
                self.guardar_plan()
                self.actualizar_tabla_plan()
                self.actualizar_prediccion()
                messagebox.showinfo("Éxito", "El plan de producción sugerido por la IA ha sido aplicado.")

        except Exception as e:
            messagebox.showerror("Error en IA", f"Ocurrió un error al generar la sugerencia:\n{e}")

    def exportar_plan_excel(self):
        """Exporta la vista actual del plan de producción a un archivo Excel."""
        if not self.tree_plan.get_children():
            messagebox.showinfo("Sin Datos", "No hay datos en el plan de producción para exportar.", parent=self.window)
            return

        fecha_hoy = datetime.now().strftime("%Y-%m-%d")
        ruta_guardado = filedialog.asksaveasfilename(
            defaultextension=".xlsx",
            filetypes=[("Archivos de Excel", "*.xlsx")],
            initialfile=f"Plan_Produccion_{fecha_hoy}.xlsx",
            parent=self.window
        )
        if not ruta_guardado:
            return

        try:
            datos = []
            columnas = [self.tree_plan.heading(col)["text"] for col in self.tree_plan["columns"]]
            
            for item in self.tree_plan.get_children():
                datos.append(self.tree_plan.item(item)["values"])
            
            df = pd.DataFrame(datos, columns=columnas)

            with pd.ExcelWriter(ruta_guardado, engine='openpyxl') as writer:
                df.to_excel(writer, index=False, sheet_name='Plan de Producción')
                worksheet = writer.sheets['Plan de Producción']
                for i, col_name in enumerate(df.columns):
                    # Usamos el nombre de la columna para el ancho
                    column_letter = chr(65 + i)
                    max_len = max(df[col_name].astype(str).map(len).max(), len(col_name)) + 4
                    worksheet.column_dimensions[column_letter].width = max_len

            messagebox.showinfo("Éxito", f"El plan de producción ha sido exportado exitosamente a:\n{ruta_guardado}", parent=self.window)
        except Exception as e:
            messagebox.showerror("Error", f"Ocurrió un error al exportar el plan:\n{e}", parent=self.window)

    def actualizar_tabla_plan(self):
        for item in self.tree_plan.get_children():
            self.tree_plan.delete(item)
            
        for parte, meta in self.plan_produccion.items():
            info = self.part_data.get(parte, {})
            desc = info.get('descripcion', 'Sin registrar en Base')
            maq = info.get('linea', 'N/A')
            
            producido = self.piezas_por_parte.get(parte, 0)
            faltan = max(0, meta - producido)
            
            if producido >= meta and meta > 0:
                estado = "✅ COMPLETO"
            elif producido > 0:
                estado = "🔄 EN PROCESO"
            else:
                estado = "⏸️ EN COLA"
                
            self.tree_plan.insert("", tk.END, values=(parte, desc, maq, meta, producido, faltan, estado))

    # --- LÓGICA DE AUTO-ENTER ---
    def iniciar_auto_enter(self, event):
        if event.keysym == 'Return':
            return
        if self.scan_timer is not None:
            self.window.after_cancel(self.scan_timer)
        self.scan_timer = self.window.after(400, self.ejecutar_auto_enter)

    def ejecutar_auto_enter(self):
        if self.qr_var.get().strip():
            self.procesar_escaneo(None)

    def procesar_escaneo(self, event):
        codigo = self.ent_qr.get().strip().upper()
        self.ent_qr.delete(0, tk.END)

        if not codigo: return

        if codigo in self.part_data:
            ahora = datetime.now()
            turno_ahora = self.obtener_turno()
            
            if hasattr(self, 'ultimo_turno') and self.ultimo_turno != turno_ahora:
                self.conteos_por_parte.clear()
                self.piezas_por_parte.clear()
                self.historial_tiempos_parte.clear()
                self.ultimo_escaneo_parte.clear()
                self.alertas_plan_enviadas.clear()
                self.tree.delete(*self.tree.get_children()) 
            self.ultimo_turno = turno_ahora

            info = self.part_data[codigo]
            descripcion = info.get('descripcion', 'Sin descripción')
            maquina = info.get('linea', 'Sin máquina')
            qty_bolsa = int(info.get('qtu', 0))
            
            nuevo_carrito = self.conteos_por_parte.get(codigo, 0) + 1
            nuevo_total_parte = self.piezas_por_parte.get(codigo, 0) + qty_bolsa
            
            self.conteos_por_parte[codigo] = nuevo_carrito
            self.piezas_por_parte[codigo] = nuevo_total_parte
            
            # --- CÁLCULO DE META Y FALTANTES PARA LA TABLA ---
            meta_plan = self.plan_produccion.get(codigo, "N/A")
            faltan_plan = max(0, meta_plan - nuevo_total_parte) if meta_plan != "N/A" else "N/A"

            fecha, hora = ahora.strftime("%Y-%m-%d"), ahora.strftime("%H:%M:%S")

            with open(self.archivo_log, mode='a', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow([fecha, hora, turno_ahora, maquina, codigo, descripcion, nuevo_carrito, qty_bolsa, nuevo_total_parte])
            
            self.tree.insert("", 0, values=(hora, maquina, codigo, nuevo_carrito, qty_bolsa, nuevo_total_parte, meta_plan, faltan_plan))
            self.lbl_turno.config(text=f"TURNO ACTUAL: {turno_ahora}")
            
            self.actualizar_grafica()
            self.actualizar_tabla_plan() # Actualizar la cola de producción
            self.actualizar_prediccion() # Esto también calcula alertas de lentitud
            
            # --- DETECCIÓN DE ANOMALÍAS ---
            if codigo in self.ultimo_escaneo_parte:
                diff_segundos = (ahora - self.ultimo_escaneo_parte[codigo]).total_seconds()
                
                if codigo not in self.historial_tiempos_parte:
                    self.historial_tiempos_parte[codigo] = []
                self.historial_tiempos_parte[codigo].append(diff_segundos)
                
                # Limitar el historial a los últimos 50 escaneos para optimizar RAM
                # y evitar que el entrenamiento de IsolationForest congele la interfaz
                if len(self.historial_tiempos_parte[codigo]) > 50:
                    self.historial_tiempos_parte[codigo].pop(0)
                
                if len(self.historial_tiempos_parte[codigo]) >= 5:
                    try:
                        X = np.array(self.historial_tiempos_parte[codigo]).reshape(-1, 1)
                        modelo = IsolationForest(contamination=0.1, random_state=42)
                        modelo.fit(X)
                        
                        prediccion = modelo.predict([[diff_segundos]])
                        media_normal = np.mean(X)
                        
                        if prediccion[0] == -1 and diff_segundos < (media_normal * 0.3):
                            motivo = f"IA Detectó Anomalía: Escaneo inusualmente rápido ({int(diff_segundos)} seg). Tiempo normal: {int(media_normal)} seg."
                            self.registrar_anomalia(fecha, hora, codigo, motivo)
                            messagebox.showwarning("🚨 ALERTA DE IA: FRAUDE O DOBLE ESCANEO", 
                                                   f"Se ha detectado una anomalía en el ritmo de producción para la pieza {codigo}.\n\n{motivo}\n\nRevisar cámara o auditoría de línea.")
                    except Exception as e:
                        print(f"Error procesando IA de anomalías: {e}")
                        
            self.ultimo_escaneo_parte[codigo] = ahora
            
            # --- MANTENIMIENTO PREDICTIVO POR MÁQUINA ---
            if maquina != 'Sin máquina':
                if maquina in self.tiempos_por_maquina:
                    gap_maquina = (ahora - self.tiempos_por_maquina[maquina]).total_seconds()
                    
                    if maquina not in self.gaps_por_maquina:
                        self.gaps_por_maquina[maquina] = []
                    
                    self.gaps_por_maquina[maquina].append(gap_maquina)
                    if len(self.gaps_por_maquina[maquina]) > 8:
                        self.gaps_por_maquina[maquina].pop(0)
                        
                    if len(self.gaps_por_maquina[maquina]) >= 5:
                        y = np.array(self.gaps_por_maquina[maquina])
                        x = np.arange(len(y))
                        pendiente, _ = np.polyfit(x, y, 1)
                        
                        if pendiente > 5: 
                            motivo = f"Lentitud progresiva detectada en {maquina}. Posible atasco o fatiga mecánica."
                            self.registrar_anomalia(fecha, hora, "MANTENIMIENTO", motivo)
                            messagebox.showwarning("⚙️ ALERTA PREDICTIVA DE MÁQUINA", 
                                                f"La {maquina} está perdiendo velocidad de manera constante y progresiva.\n\nEl sistema sugiere revisarla antes de que ocurra un paro total o cuello de botella.")
                            
                self.tiempos_por_maquina[maquina] = ahora
                self.actualizar_salud_maquinas()
            
            self.ent_qr.focus_set()
            
        else:
            messagebox.showwarning("No Encontrado", f"El código {codigo} no existe.")
            self.ent_qr.focus_set()

    def _preparar_archivo_paros(self):
        if not os.path.exists(self.archivo_paros):
            with open(self.archivo_paros, mode='w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(['Fecha', 'Hora_Inicio', 'Hora_Fin', 'Duracion_Minutos', 'Máquina', 'Motivo', 'Comentario'])

    def registrar_paro(self):
        dialog = DialogoParo(self.window, self.part_data)
        self.window.wait_window(dialog.top)
        if dialog.resultado:
            self._guardar_paro(dialog.resultado)

    def _guardar_paro(self, data):
        ahora = datetime.now()
        fecha = ahora.strftime("%Y-%m-%d")
        
        try:
            with open(self.archivo_paros, mode='a', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow([fecha, data['inicio'], data['fin'], data['duracion'], data['maquina'], data['motivo'], data['comentario']])
            messagebox.showinfo("Éxito", "El paro de producción ha sido registrado correctamente.")
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo guardar el registro de paro:\n{e}")

    def registrar_anomalia(self, fecha, hora, parte, motivo):
        with open(self.archivo_anomalias, mode='a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([fecha, hora, parte, motivo])
        self.tree_anomalias.insert("", 0, values=(fecha, hora, parte, motivo))

class DialogoParo:
    def __init__(self, parent, part_data):
        self.top = tk.Toplevel(parent)
        self.top.title("Registrar Paro de Producción")
        self.top.transient(parent)
        self.top.grab_set()
        
        self.part_data = part_data
        self.resultado = None

        tk.Label(self.top, text="Máquina:", font=("Arial", 10, "bold")).grid(row=0, column=0, padx=10, pady=5, sticky="w")
        
        maquinas = sorted(list(set(info.get('linea', 'N/A') for info in self.part_data.values() if info.get('linea'))))
        self.combo_maquina = ttk.Combobox(self.top, values=maquinas, state="readonly")
        self.combo_maquina.grid(row=0, column=1, padx=10, pady=5, sticky="ew")
        if maquinas:
            self.combo_maquina.set(maquinas[0])

        tk.Label(self.top, text="Motivo del Paro:", font=("Arial", 10, "bold")).grid(row=1, column=0, padx=10, pady=5, sticky="w")
        
        motivos = ["Mantenimiento", "Cambio de Molde", "Falta de Material", "Otro"]
        self.combo_motivo = ttk.Combobox(self.top, values=motivos, state="readonly")
        self.combo_motivo.grid(row=1, column=1, padx=10, pady=5, sticky="ew")
        self.combo_motivo.set(motivos[0])

        tk.Label(self.top, text="Hora de Inicio:", font=("Arial", 10, "bold")).grid(row=2, column=0, padx=10, pady=5, sticky="w")
        self.ent_hora_inicio = ttk.Entry(self.top)
        self.ent_hora_inicio.grid(row=2, column=1, padx=10, pady=5, sticky="ew")
        self.ent_hora_inicio.insert(0, (datetime.now() - timedelta(minutes=10)).strftime("%H:%M"))

        tk.Label(self.top, text="Hora de Fin:", font=("Arial", 10, "bold")).grid(row=3, column=0, padx=10, pady=5, sticky="w")
        self.ent_hora_fin = ttk.Entry(self.top)
        self.ent_hora_fin.grid(row=3, column=1, padx=10, pady=5, sticky="ew")
        self.ent_hora_fin.insert(0, datetime.now().strftime("%H:%M"))

        tk.Label(self.top, text="Comentario (Opcional):", font=("Arial", 10, "bold")).grid(row=4, column=0, padx=10, pady=5, sticky="w")
        self.ent_comentario = ttk.Entry(self.top, width=40)
        self.ent_comentario.grid(row=4, column=1, padx=10, pady=5, sticky="ew")

        btn_frame = tk.Frame(self.top)
        btn_frame.grid(row=5, column=0, columnspan=2, pady=10)

        tk.Button(btn_frame, text="Aceptar", command=self.aceptar).pack(side="left", padx=10)
        tk.Button(btn_frame, text="Cancelar", command=self.cancelar).pack(side="left", padx=10)

    def aceptar(self):
        maquina = self.combo_maquina.get()
        motivo = self.combo_motivo.get()
        h_inicio_str = self.ent_hora_inicio.get()
        h_fin_str = self.ent_hora_fin.get()
        comentario = self.ent_comentario.get().strip()

        if not maquina or not motivo:
            messagebox.showwarning("Campos Requeridos", "Debe seleccionar una máquina y un motivo.", parent=self.top)
            return

        try:
            h_inicio = datetime.strptime(h_inicio_str, "%H:%M")
            h_fin = datetime.strptime(h_fin_str, "%H:%M")
            duracion = (h_fin - h_inicio).total_seconds() / 60
            if duracion < 0:
                messagebox.showwarning("Error de Tiempo", "La hora de fin no puede ser anterior a la hora de inicio.", parent=self.top)
                return
        except ValueError:
            messagebox.showwarning("Formato Incorrecto", "El formato de la hora debe ser HH:MM (ej. 14:30).", parent=self.top)
            return

        self.resultado = {
            "maquina": maquina,
            "motivo": motivo,
            "inicio": h_inicio_str,
            "fin": h_fin_str,
            "duracion": round(duracion, 2),
            "comentario": comentario
        }
        self.top.destroy()

    def cancelar(self):
        self.resultado = None
        self.top.destroy()


    def _cargar_anomalias(self):
        if not os.path.exists(self.archivo_anomalias): return
        try:
            with open(self.archivo_anomalias, mode='r', encoding='utf-8') as f:
                reader = list(csv.reader(f))
                if len(reader) > 1:
                    for fila in reader[1:]:
                        if len(fila) >= 4:
                            self.tree_anomalias.insert("", 0, values=(fila[0], fila[1], fila[2], fila[3]))
        except Exception as e:
            pass

    def actualizar_prediccion(self):
        ahora = datetime.now()
        turno_actual = self.obtener_turno()
        
        self.lbl_titulo_proyeccion.config(text=f"PROYECTANDO CIERRE DEL TURNO: {turno_actual}")
        
        if turno_actual == "DIA":
            inicio_turno = ahora.replace(hour=7, minute=30, second=0, microsecond=0)
            fin_turno = ahora.replace(hour=19, minute=30, second=0, microsecond=0)
        else:
            hora_actual = ahora.time()
            hora_limite = datetime.strptime("19:30", "%H:%M").time()
            if hora_actual >= hora_limite:
                inicio_turno = ahora.replace(hour=19, minute=30, second=0, microsecond=0)
                fin_turno = (ahora + timedelta(days=1)).replace(hour=7, minute=30, second=0, microsecond=0)
            else:
                inicio_turno = (ahora - timedelta(days=1)).replace(hour=19, minute=30, second=0, microsecond=0)
                fin_turno = ahora.replace(hour=7, minute=30, second=0, microsecond=0)

        tiempo_transcurrido_horas = (ahora - inicio_turno).total_seconds() / 3600.0
        tiempo_total_turno_horas = (fin_turno - inicio_turno).total_seconds() / 3600.0
        horas_restantes_turno = max(0, tiempo_total_turno_horas - tiempo_transcurrido_horas)
        
        for item in self.tree_pred.get_children():
            self.tree_pred.delete(item)
            
        if tiempo_transcurrido_horas > 0 and self.piezas_por_parte:
            self.lbl_prediccion_status.config(text="🔥 PROYECCIONES CALCULADAS CORRECTAMENTE", fg="#27ae60")
            for parte, total_actual in self.piezas_por_parte.items():
                ritmo_por_hora = total_actual / tiempo_transcurrido_horas
                
                meta_plan = self.plan_produccion.get(parte, "N/A")
                if meta_plan != "N/A":
                    faltan = max(0, meta_plan - total_actual)
                    if faltan == 0:
                        tiempo_est_txt = "✅ Completado"
                    elif ritmo_por_hora > 0:
                        horas_estimadas = faltan / ritmo_por_hora
                        tiempo_est_txt = f"{horas_estimadas:.1f} hrs"
                        
                        # --- ALERTA DE LENTITUD SEGÚN PLAN ---
                        if horas_estimadas > horas_restantes_turno and parte not in self.alertas_plan_enviadas:
                            motivo = f"Producción Lenta: Ritmo actual ({int(ritmo_por_hora)} pz/h). Faltan {faltan} pz, tomará {horas_estimadas:.1f}h, pero al turno solo le quedan {horas_restantes_turno:.1f}h."
                            self.registrar_anomalia(ahora.strftime("%Y-%m-%d"), ahora.strftime("%H:%M:%S"), parte, motivo)
                            self.alertas_plan_enviadas.add(parte)
                            messagebox.showwarning("⚠️ ALERTA DE PRODUCCIÓN LENTA", f"El número de parte {parte} no alcanzará a cumplir su meta de {meta_plan} piezas antes del cierre de turno si continúan a este ritmo.")
                    else:
                        tiempo_est_txt = "∞ hrs"
                else:
                    faltan = "N/A"
                    tiempo_est_txt = "N/A"
                
                self.tree_pred.insert("", tk.END, values=(parte, total_actual, int(ritmo_por_hora), meta_plan, faltan, tiempo_est_txt))
        else:
            self.lbl_prediccion_status.config(text="⏳ Escanea más carritos para calcular la proyección...", fg="#d35400")

    def actualizar_salud_maquinas(self):
        for item in self.tree_salud.get_children():
            self.tree_salud.delete(item)
            
        for maq, gaps in self.gaps_por_maquina.items():
            if len(gaps) >= 5:
                y = np.array(gaps)
                x = np.arange(len(y))
                pendiente, _ = np.polyfit(x, y, 1)
                
                ultimo_gap = int(gaps[-1])
                tendencia = f"{pendiente:+.1f} seg/ciclo"
                
                if pendiente > 5:
                    estado = "🔴 RIESGO (Atasco/Fatiga)"
                elif pendiente > 2:
                    estado = "🟡 Perdiendo Velocidad"
                elif pendiente < -2:
                    estado = "🔵 Acelerando"
                else:
                    estado = "🟢 Estable"
                    
                self.tree_salud.insert("", tk.END, values=(maq, ultimo_gap, tendencia, estado))

    def actualizar_grafica(self):
        self.ax.clear() 
        if not self.piezas_por_parte:
            self.ax.text(0.5, 0.5, "Aún no hay producción en este turno", horizontalalignment='center', verticalalignment='center', color='gray', fontsize=12)
            self.ax.set_xticks([])
            self.ax.set_yticks([])
        else:
            partes = list(self.piezas_por_parte.keys())
            cantidades = list(self.piezas_por_parte.values())
            barras = self.ax.bar(partes, cantidades, color='#3498db', edgecolor='#2980b9')
            self.ax.set_ylabel('Total de Piezas', fontweight='bold', color='#2c3e50')
            self.ax.tick_params(axis='x', rotation=45, labelcolor='#2c3e50') 
            self.ax.grid(axis='y', linestyle='--', alpha=0.7)
            for barra in barras:
                altura = barra.get_height()
                self.ax.annotate(f'{altura}', xy=(barra.get_x() + barra.get_width() / 2, altura), xytext=(0, 3), textcoords="offset points", ha='center', va='bottom', fontweight='bold', color='#e74c3c')
        self.fig.tight_layout()
        self.canvas.draw()

    # =========================================================
    # ENVIAR REPORTE AUTOMÁTICO POR CORREO
    # =========================================================
    def enviar_correo(self):
        if not os.path.exists(self.archivo_log):
            messagebox.showwarning("Sin datos", "Aún no hay registros de producción para enviar.")
            return

        REMITENTE_EMAIL = "tucorreo@gmail.com"          
        REMITENTE_PASSWORD = "abcd efgh ijkl mnop"      
        
        if REMITENTE_EMAIL == "tucorreo@gmail.com":
            messagebox.showinfo("Configuración Faltante", "Para que el envío automático funcione, abre el código y coloca tu correo de Gmail y tu 'Contraseña de Aplicación'.")
            return

        destinatario = simpledialog.askstring("Enviar Correo", "Ingresa el correo del Gerente / Supervisor:\n(Ej: jefe@empresa.com)", parent=self.window)
        if not destinatario:
            return

        try:
            df = pd.read_csv(self.archivo_log)
            fecha_hoy = datetime.now().strftime("%Y-%m-%d")
            turno_actual = self.obtener_turno()
            df_hoy = df[(df['Fecha'] == fecha_hoy) & (df['Turno'] == turno_actual)]
            
            if df_hoy.empty:
                messagebox.showinfo("Sin Datos", "No hay producción registrada en este turno todavía.")
                return

            total_piezas = df_hoy['QTY'].sum()
            resumen_maquinas = df_hoy.groupby('Máquina')['QTY'].sum()

            nombre_excel = f"Reporte_{turno_actual}_{fecha_hoy}.xlsx"
            with pd.ExcelWriter(nombre_excel, engine='openpyxl') as writer:
                df_hoy.to_excel(writer, index=False, sheet_name='Producción')

            msg = EmailMessage()
            msg['Subject'] = f"📊 Reporte de Producción - {fecha_hoy} (Turno {turno_actual})"
            msg['From'] = REMITENTE_EMAIL
            msg['To'] = destinatario
            
            cuerpo = f"Estimado equipo,\n\nAdjunto se envía el reporte de producción del día de hoy ({fecha_hoy}), Turno {turno_actual}.\n\n"
            cuerpo += "--- RESUMEN RÁPIDO ---\n"
            for maquina, qty in resumen_maquinas.items():
                cuerpo += f"• Máquina {maquina}: {qty} piezas\n"
            cuerpo += f"\nTOTAL PRODUCIDO: {total_piezas} piezas\n\n"
            cuerpo += "Saludos,\nSistema Automatizado de Control."
            
            msg.set_content(cuerpo)

            with open(nombre_excel, 'rb') as f:
                datos_excel = f.read()
                msg.add_attachment(datos_excel, maintype='application', subtype='vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename=nombre_excel)

            def enviar_en_hilo():
                try:
                    server = smtplib.SMTP('smtp.gmail.com', 587)
                    server.starttls()
                    server.login(REMITENTE_EMAIL, REMITENTE_PASSWORD)
                    server.send_message(msg)
                    server.quit()
                    
                    if os.path.exists(nombre_excel):
                        os.remove(nombre_excel)
                        
                    self.window.after(0, lambda: messagebox.showinfo("Éxito", "¡El reporte y el archivo Excel fueron enviados por correo exitosamente!"))
                except Exception as e:
                    self.window.after(0, lambda: messagebox.showerror("Error de Envío", f"No se pudo enviar el correo.\nRevisa tu contraseña de aplicación o conexión a internet.\n\nDetalle: {e}"))

            threading.Thread(target=enviar_en_hilo, daemon=True).start()
            messagebox.showinfo("Enviando...", "Enviando el reporte en segundo plano. Te avisaré cuando termine.")

        except Exception as e:
            messagebox.showerror("Error General", f"Hubo un problema procesando los datos:\n{e}")

    def generar_reporte(self):
        if not os.path.exists(self.archivo_log):
            return
        fecha_hoy = datetime.now().strftime("%Y-%m-%d")
        ruta_guardado = filedialog.asksaveasfilename(defaultextension=".xlsx", filetypes=[("Archivos de Excel", "*.xlsx")], initialfile=f"Produccion_{fecha_hoy}.xlsx")
        if not ruta_guardado: return
        try:
            df = pd.read_csv(self.archivo_log)
            with pd.ExcelWriter(ruta_guardado, engine='openpyxl') as writer:
                df.to_excel(writer, index=False, sheet_name='Producción')
                worksheet = writer.sheets['Producción']
                for i, col in enumerate(df.columns):
                    worksheet.column_dimensions[chr(65 + i)].width = max(df[col].astype(str).map(len).max(), len(str(col))) + 4
            messagebox.showinfo("Éxito", f"Reporte guardado exitosamente.")
            self.ent_qr.focus_set()
        except Exception as e:
            messagebox.showerror("Error", f"Hubo un problema:\n{e}")

    def _guardar_excel_custom(self, datos_csv):
        fecha_hoy = datetime.now().strftime("%Y-%m-%d")
        ruta_guardado = filedialog.asksaveasfilename(defaultextension=".xlsx", filetypes=[("Archivos de Excel", "*.xlsx")], initialfile=f"Analisis_IA_{fecha_hoy}.xlsx")
        if not ruta_guardado: return
        try:
            df = pd.read_csv(io.StringIO(datos_csv))
            with pd.ExcelWriter(ruta_guardado, engine='openpyxl') as writer:
                df.to_excel(writer, index=False, sheet_name='Análisis')
                worksheet = writer.sheets['Análisis']
                for i, col in enumerate(df.columns):
                    worksheet.column_dimensions[chr(65 + i)].width = max(df[col].astype(str).map(len).max(), len(str(col))) + 4
            messagebox.showinfo("Éxito", "Análisis guardado.")
        except Exception as e:
            messagebox.showerror("Error", str(e))

    def enviar_pregunta_chat(self):
        pregunta = self.ent_pregunta.get().strip()
        api_key = self.ent_api_key.get().strip()
        if not pregunta or not api_key: return
        self.txt_chat.config(state=tk.NORMAL)
        self.txt_chat.insert(tk.END, f"🧑‍💼 Tú: {pregunta}\n🤖 IA: Analizando...\n")
        self.txt_chat.config(state=tk.DISABLED)
        self.txt_chat.yview(tk.END)
        self.ent_pregunta.delete(0, tk.END)
        threading.Thread(target=self._consultar_gemini_api, args=(pregunta, api_key), daemon=True).start()

    def _consultar_gemini_api(self, pregunta, api_key):
        try:
            from google import genai
            df_prod = pd.read_csv(self.archivo_log) if os.path.exists(self.archivo_log) else None
            if df_prod is not None:
                resumen_maquinas = df_prod.groupby('Máquina')['QTY'].sum().to_string()
                resumen_partes = df_prod.groupby('Número de Parte')['QTY'].sum().to_string()
                total_general = df_prod['QTY'].sum()
                recientes = df_prod.tail(15).to_string(index=False)
            else:
                resumen_maquinas = resumen_partes = recientes = "Sin datos"
                total_general = 0

            # Darle contexto a la IA sobre los planes vigentes
            contexto_plan = "\n".join([f"Parte: {p}, Meta: {m}" for p, m in self.plan_produccion.items()])

            prompt = f"""
            Eres un asistente de Inteligencia Artificial para un Gerente de Planta. Responde directo.
            REGLAS IMPORTANTES:
            1. Si te piden Excel de TUS cálculos, envuelve un CSV en [INICIO_DATOS_EXCEL] y [FIN_DATOS_EXCEL].
            2. Si piden reporte general, incluye: [COMANDO_EXPORTAR_EXCEL]
            
            -- RESUMEN TOTAL --
            Total de piezas producidas hoy: {total_general}
            -- PRODUCCIÓN POR MÁQUINA --
            {resumen_maquinas}
            -- PRODUCCIÓN POR NÚMERO DE PARTE --
            {resumen_partes}
            -- PLANES DE PRODUCCIÓN ACTIVOS --
            {contexto_plan if contexto_plan else "Sin plan de producción cargado"}
            -- ÚLTIMOS 15 MOVIMIENTOS --
            {recientes}
            
            Pregunta del Gerente: {pregunta}
            """
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
            respuesta_final = response.text
        except Exception as e:
            respuesta_final = f"Error: {e}"
        self.window.after(0, self._actualizar_chat_visual, respuesta_final)

    def _actualizar_chat_visual(self, respuesta):
        self.txt_chat.config(state=tk.NORMAL)
        datos_custom_csv = None
        respuesta_visible = respuesta
        if "[INICIO_DATOS_EXCEL]" in respuesta_visible and "[FIN_DATOS_EXCEL]" in respuesta_visible:
            inicio = respuesta_visible.find("[INICIO_DATOS_EXCEL]") + len("[INICIO_DATOS_EXCEL]")
            fin = respuesta_visible.find("[FIN_DATOS_EXCEL]")
            datos_custom_csv = respuesta_visible[inicio:fin].strip()
            respuesta_visible = respuesta_visible[:respuesta_visible.find("[INICIO_DATOS_EXCEL]")] + respuesta_visible[fin + len("[FIN_DATOS_EXCEL]"):]
        
        activar_excel_general = False
        if "[COMANDO_EXPORTAR_EXCEL]" in respuesta_visible:
            activar_excel_general = True
            respuesta_visible = respuesta_visible.replace("[COMANDO_EXPORTAR_EXCEL]", "")
        
        contenido_actual = self.txt_chat.get("1.0", tk.END).split("\n")
        texto_limpio = "\n".join(contenido_actual[:-2])
        self.txt_chat.delete("1.0", tk.END)
        self.txt_chat.insert(tk.END, texto_limpio + f"🤖 IA: {respuesta_visible.strip()}\n\n")
        self.txt_chat.config(state=tk.DISABLED)
        self.txt_chat.yview(tk.END)
        
        if datos_custom_csv: self._guardar_excel_custom(datos_custom_csv)
        elif activar_excel_general: self.generar_reporte()