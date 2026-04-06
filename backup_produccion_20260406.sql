--
-- PostgreSQL database dump
--

\restrict 0iSp2fSPFG92RbrdPooVL4mB9P97lWHnggPtA26oKu94l73xl5iOtSNaOLYCdeP

-- Dumped from database version 15.17
-- Dumped by pg_dump version 15.17

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: anomalias; Type: TABLE; Schema: public; Owner: planta_user
--

CREATE TABLE public.anomalias (
    id integer NOT NULL,
    fecha character varying(20),
    hora character varying(20),
    numero_parte character varying(50),
    motivo character varying(500),
    tipo character varying(50),
    created_at timestamp without time zone
);


ALTER TABLE public.anomalias OWNER TO planta_user;

--
-- Name: anomalias_id_seq; Type: SEQUENCE; Schema: public; Owner: planta_user
--

CREATE SEQUENCE public.anomalias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.anomalias_id_seq OWNER TO planta_user;

--
-- Name: anomalias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: planta_user
--

ALTER SEQUENCE public.anomalias_id_seq OWNED BY public.anomalias.id;


--
-- Name: cola_impresion; Type: TABLE; Schema: public; Owner: planta_user
--

CREATE TABLE public.cola_impresion (
    id integer NOT NULL,
    codigo_inventario character varying(50) NOT NULL,
    cantidad_etiquetas integer NOT NULL,
    turno character varying(20) NOT NULL,
    estado character varying(20),
    created_at timestamp without time zone
);


ALTER TABLE public.cola_impresion OWNER TO planta_user;

--
-- Name: cola_impresion_id_seq; Type: SEQUENCE; Schema: public; Owner: planta_user
--

CREATE SEQUENCE public.cola_impresion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.cola_impresion_id_seq OWNER TO planta_user;

--
-- Name: cola_impresion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: planta_user
--

ALTER SEQUENCE public.cola_impresion_id_seq OWNED BY public.cola_impresion.id;


--
-- Name: contador_carritos; Type: TABLE; Schema: public; Owner: planta_user
--

CREATE TABLE public.contador_carritos (
    id integer NOT NULL,
    numero_parte character varying NOT NULL,
    turno_hora character varying NOT NULL,
    count integer NOT NULL,
    updated_at timestamp without time zone
);


ALTER TABLE public.contador_carritos OWNER TO planta_user;

--
-- Name: contador_carritos_id_seq; Type: SEQUENCE; Schema: public; Owner: planta_user
--

CREATE SEQUENCE public.contador_carritos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.contador_carritos_id_seq OWNER TO planta_user;

--
-- Name: contador_carritos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: planta_user
--

ALTER SEQUENCE public.contador_carritos_id_seq OWNED BY public.contador_carritos.id;


--
-- Name: inventario_planta; Type: TABLE; Schema: public; Owner: planta_user
--

CREATE TABLE public.inventario_planta (
    codigo character varying(50) NOT NULL,
    descripcion character varying(100) NOT NULL,
    linea character varying(50) NOT NULL,
    tipo character varying(20) NOT NULL,
    qtu integer NOT NULL,
    linea_lg character varying(20) NOT NULL,
    ayuda_visual character varying(255)
);


ALTER TABLE public.inventario_planta OWNER TO planta_user;

--
-- Name: partes; Type: TABLE; Schema: public; Owner: planta_user
--

CREATE TABLE public.partes (
    id integer NOT NULL,
    numero_parte character varying(50),
    descripcion character varying(200),
    linea character varying(50),
    id_interno character varying(50),
    cantidad_por_etiqueta character varying(10),
    cliente_lg character varying(50),
    ayuda_visual character varying(500),
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


ALTER TABLE public.partes OWNER TO planta_user;

--
-- Name: partes_id_seq; Type: SEQUENCE; Schema: public; Owner: planta_user
--

CREATE SEQUENCE public.partes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.partes_id_seq OWNER TO planta_user;

--
-- Name: partes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: planta_user
--

ALTER SEQUENCE public.partes_id_seq OWNED BY public.partes.id;


--
-- Name: planes_produccion; Type: TABLE; Schema: public; Owner: planta_user
--

CREATE TABLE public.planes_produccion (
    id integer NOT NULL,
    numero_parte character varying(50),
    meta_piezas integer,
    turno_objetivo character varying(10),
    estado character varying(20),
    created_at timestamp without time zone
);


ALTER TABLE public.planes_produccion OWNER TO planta_user;

--
-- Name: planes_produccion_id_seq; Type: SEQUENCE; Schema: public; Owner: planta_user
--

CREATE SEQUENCE public.planes_produccion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.planes_produccion_id_seq OWNER TO planta_user;

--
-- Name: planes_produccion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: planta_user
--

ALTER SEQUENCE public.planes_produccion_id_seq OWNED BY public.planes_produccion.id;


--
-- Name: registros_paros; Type: TABLE; Schema: public; Owner: planta_user
--

CREATE TABLE public.registros_paros (
    id integer NOT NULL,
    fecha character varying(20),
    hora_inicio character varying(10),
    hora_fin character varying(10),
    duracion_minutos double precision,
    maquina character varying(50),
    motivo character varying(100),
    comentario character varying(500),
    created_at timestamp without time zone
);


ALTER TABLE public.registros_paros OWNER TO planta_user;

--
-- Name: registros_paros_id_seq; Type: SEQUENCE; Schema: public; Owner: planta_user
--

CREATE SEQUENCE public.registros_paros_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.registros_paros_id_seq OWNER TO planta_user;

--
-- Name: registros_paros_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: planta_user
--

ALTER SEQUENCE public.registros_paros_id_seq OWNED BY public.registros_paros.id;


--
-- Name: registros_produccion; Type: TABLE; Schema: public; Owner: planta_user
--

CREATE TABLE public.registros_produccion (
    id integer NOT NULL,
    fecha character varying(20),
    hora character varying(20),
    turno character varying(10),
    maquina character varying(50),
    numero_parte character varying(50),
    descripcion character varying(200),
    carrito_numero integer,
    qty_bolsa integer,
    total_acumulado integer,
    created_at timestamp without time zone
);


ALTER TABLE public.registros_produccion OWNER TO planta_user;

--
-- Name: registros_produccion_id_seq; Type: SEQUENCE; Schema: public; Owner: planta_user
--

CREATE SEQUENCE public.registros_produccion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.registros_produccion_id_seq OWNER TO planta_user;

--
-- Name: registros_produccion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: planta_user
--

ALTER SEQUENCE public.registros_produccion_id_seq OWNED BY public.registros_produccion.id;


--
-- Name: anomalias id; Type: DEFAULT; Schema: public; Owner: planta_user
--

ALTER TABLE ONLY public.anomalias ALTER COLUMN id SET DEFAULT nextval('public.anomalias_id_seq'::regclass);


--
-- Name: cola_impresion id; Type: DEFAULT; Schema: public; Owner: planta_user
--

ALTER TABLE ONLY public.cola_impresion ALTER COLUMN id SET DEFAULT nextval('public.cola_impresion_id_seq'::regclass);


--
-- Name: contador_carritos id; Type: DEFAULT; Schema: public; Owner: planta_user
--

ALTER TABLE ONLY public.contador_carritos ALTER COLUMN id SET DEFAULT nextval('public.contador_carritos_id_seq'::regclass);


--
-- Name: partes id; Type: DEFAULT; Schema: public; Owner: planta_user
--

ALTER TABLE ONLY public.partes ALTER COLUMN id SET DEFAULT nextval('public.partes_id_seq'::regclass);


--
-- Name: planes_produccion id; Type: DEFAULT; Schema: public; Owner: planta_user
--

ALTER TABLE ONLY public.planes_produccion ALTER COLUMN id SET DEFAULT nextval('public.planes_produccion_id_seq'::regclass);


--
-- Name: registros_paros id; Type: DEFAULT; Schema: public; Owner: planta_user
--

ALTER TABLE ONLY public.registros_paros ALTER COLUMN id SET DEFAULT nextval('public.registros_paros_id_seq'::regclass);


--
-- Name: registros_produccion id; Type: DEFAULT; Schema: public; Owner: planta_user
--

ALTER TABLE ONLY public.registros_produccion ALTER COLUMN id SET DEFAULT nextval('public.registros_produccion_id_seq'::regclass);


--
-- Data for Name: anomalias; Type: TABLE DATA; Schema: public; Owner: planta_user
--

COPY public.anomalias (id, fecha, hora, numero_parte, motivo, tipo, created_at) FROM stdin;
\.


--
-- Data for Name: cola_impresion; Type: TABLE DATA; Schema: public; Owner: planta_user
--

COPY public.cola_impresion (id, codigo_inventario, cantidad_etiquetas, turno, estado, created_at) FROM stdin;
1	5208JJ1024A	4	Día	generado	2026-04-06 21:17:33.464362
2	5208JJ1024A	4	Día	generado	2026-04-06 21:17:47.728997
3	5208JJ1024A	16	Día	pendiente	2026-04-06 21:24:07.255199
4	MCZ60014601	25	Noche	pendiente	2026-04-06 21:24:07.255279
5	MAL62484101	19	Día	pendiente	2026-04-06 21:24:07.255302
6	MAL62524101	21	Día	pendiente	2026-04-06 21:24:07.255319
7	MAL62524201	27	Noche	pendiente	2026-04-06 21:24:07.255335
8	OMEGA 2M	24	Noche	pendiente	2026-04-06 21:24:07.255354
9	OMEGA 6M	28	Noche	pendiente	2026-04-06 21:24:07.255371
10	8001139797	18	Noche	pendiente	2026-04-06 21:24:07.255388
11	8001047798	32	Noche	pendiente	2026-04-06 21:24:07.255403
\.


--
-- Data for Name: contador_carritos; Type: TABLE DATA; Schema: public; Owner: planta_user
--

COPY public.contador_carritos (id, numero_parte, turno_hora, count, updated_at) FROM stdin;
1	5208JJ1024A	N	8	2026-04-06 21:17:48.786817
\.


--
-- Data for Name: inventario_planta; Type: TABLE DATA; Schema: public; Owner: planta_user
--

COPY public.inventario_planta (codigo, descripcion, linea, tipo, qtu, linea_lg, ayuda_visual) FROM stdin;
5208JJ1024A	DUCT R/L	maquina 01	assy	45	R1	
MCZ60014601	DUCT U/R	maquina 02	assy	45	R1	
MAL62484101	BARRIER INS C	maquina 03	assy	45	R1	
MAL62524101	BARRIER INS C	maquina 04	assy	45	R1	
MAL62524201	BARRIER INS C	maquina 05	assy	45	R1	
OMEGA 2M	MFZ63765502	maquina 07	Packing	45	R1	
OMEGA 6M	MFZ64356801	maquina 08	Packing	45	R1	
RAPTOR2, RAPTOR 4	3920JL2047B	maquina 09	Packing	45	R2	
RAPTOR, QUANTUM B	MFZ62834301	maquina 10	Packing	45	R2	
8001139797	Flip Mullion Insulation up 914	maquina 12	Assy	77	BOSCH	
8001139801	Flip Mullion Insulation bottom914	maquina 12	Assy	45	BOSCH	
8001197448	EPS glass shelves fixation KFD94 bottom	maquina 13	Packing	45	BOSCH	
8001259203	INSULATION	maquina 14	Packing	45	BOSCH	
8001047798	EPS rear corner pads FDBM KFN86	maquina 15	Packing	45	BOSCH	
\.


--
-- Data for Name: partes; Type: TABLE DATA; Schema: public; Owner: planta_user
--

COPY public.partes (id, numero_parte, descripcion, linea, id_interno, cantidad_por_etiqueta, cliente_lg, ayuda_visual, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: planes_produccion; Type: TABLE DATA; Schema: public; Owner: planta_user
--

COPY public.planes_produccion (id, numero_parte, meta_piezas, turno_objetivo, estado, created_at) FROM stdin;
2	5208JJ1024A	700	Día	pendiente	2026-04-06 21:24:07.152496
3	MCZ60014601	1120	Noche	pendiente	2026-04-06 21:24:07.153949
4	MAL62484101	840	Día	pendiente	2026-04-06 21:24:07.154998
5	MAL62524101	910	Día	pendiente	2026-04-06 21:24:07.156034
6	MAL62524201	1190	Noche	pendiente	2026-04-06 21:24:07.157037
7	OMEGA 2M	1050	Noche	pendiente	2026-04-06 21:24:07.158029
8	OMEGA 6M	1260	Noche	pendiente	2026-04-06 21:24:07.159002
9	8001139797	1330	Noche	pendiente	2026-04-06 21:24:07.159946
10	8001047798	1400	Noche	pendiente	2026-04-06 21:24:07.160876
\.


--
-- Data for Name: registros_paros; Type: TABLE DATA; Schema: public; Owner: planta_user
--

COPY public.registros_paros (id, fecha, hora_inicio, hora_fin, duracion_minutos, maquina, motivo, comentario, created_at) FROM stdin;
\.


--
-- Data for Name: registros_produccion; Type: TABLE DATA; Schema: public; Owner: planta_user
--

COPY public.registros_produccion (id, fecha, hora, turno, maquina, numero_parte, descripcion, carrito_numero, qty_bolsa, total_acumulado, created_at) FROM stdin;
1	2026-04-06	21:18:56	NOCHE	maquina 01	5208JJ1024A	DUCT R/L	30	45	45	2026-04-06 21:18:56.475092
\.


--
-- Name: anomalias_id_seq; Type: SEQUENCE SET; Schema: public; Owner: planta_user
--

SELECT pg_catalog.setval('public.anomalias_id_seq', 1, false);


--
-- Name: cola_impresion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: planta_user
--

SELECT pg_catalog.setval('public.cola_impresion_id_seq', 11, true);


--
-- Name: contador_carritos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: planta_user
--

SELECT pg_catalog.setval('public.contador_carritos_id_seq', 1, true);


--
-- Name: partes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: planta_user
--

SELECT pg_catalog.setval('public.partes_id_seq', 1, false);


--
-- Name: planes_produccion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: planta_user
--

SELECT pg_catalog.setval('public.planes_produccion_id_seq', 10, true);


--
-- Name: registros_paros_id_seq; Type: SEQUENCE SET; Schema: public; Owner: planta_user
--

SELECT pg_catalog.setval('public.registros_paros_id_seq', 1, false);


--
-- Name: registros_produccion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: planta_user
--

SELECT pg_catalog.setval('public.registros_produccion_id_seq', 1, true);


--
-- Name: anomalias anomalias_pkey; Type: CONSTRAINT; Schema: public; Owner: planta_user
--

ALTER TABLE ONLY public.anomalias
    ADD CONSTRAINT anomalias_pkey PRIMARY KEY (id);


--
-- Name: cola_impresion cola_impresion_pkey; Type: CONSTRAINT; Schema: public; Owner: planta_user
--

ALTER TABLE ONLY public.cola_impresion
    ADD CONSTRAINT cola_impresion_pkey PRIMARY KEY (id);


--
-- Name: contador_carritos contador_carritos_pkey; Type: CONSTRAINT; Schema: public; Owner: planta_user
--

ALTER TABLE ONLY public.contador_carritos
    ADD CONSTRAINT contador_carritos_pkey PRIMARY KEY (id);


--
-- Name: inventario_planta inventario_planta_pkey; Type: CONSTRAINT; Schema: public; Owner: planta_user
--

ALTER TABLE ONLY public.inventario_planta
    ADD CONSTRAINT inventario_planta_pkey PRIMARY KEY (codigo);


--
-- Name: partes partes_pkey; Type: CONSTRAINT; Schema: public; Owner: planta_user
--

ALTER TABLE ONLY public.partes
    ADD CONSTRAINT partes_pkey PRIMARY KEY (id);


--
-- Name: planes_produccion planes_produccion_pkey; Type: CONSTRAINT; Schema: public; Owner: planta_user
--

ALTER TABLE ONLY public.planes_produccion
    ADD CONSTRAINT planes_produccion_pkey PRIMARY KEY (id);


--
-- Name: registros_paros registros_paros_pkey; Type: CONSTRAINT; Schema: public; Owner: planta_user
--

ALTER TABLE ONLY public.registros_paros
    ADD CONSTRAINT registros_paros_pkey PRIMARY KEY (id);


--
-- Name: registros_produccion registros_produccion_pkey; Type: CONSTRAINT; Schema: public; Owner: planta_user
--

ALTER TABLE ONLY public.registros_produccion
    ADD CONSTRAINT registros_produccion_pkey PRIMARY KEY (id);


--
-- Name: ix_cola_impresion_id; Type: INDEX; Schema: public; Owner: planta_user
--

CREATE INDEX ix_cola_impresion_id ON public.cola_impresion USING btree (id);


--
-- Name: ix_contador_carritos_id; Type: INDEX; Schema: public; Owner: planta_user
--

CREATE INDEX ix_contador_carritos_id ON public.contador_carritos USING btree (id);


--
-- Name: ix_contador_carritos_numero_parte; Type: INDEX; Schema: public; Owner: planta_user
--

CREATE UNIQUE INDEX ix_contador_carritos_numero_parte ON public.contador_carritos USING btree (numero_parte);


--
-- Name: ix_partes_id; Type: INDEX; Schema: public; Owner: planta_user
--

CREATE INDEX ix_partes_id ON public.partes USING btree (id);


--
-- Name: ix_partes_numero_parte; Type: INDEX; Schema: public; Owner: planta_user
--

CREATE UNIQUE INDEX ix_partes_numero_parte ON public.partes USING btree (numero_parte);


--
-- Name: cola_impresion cola_impresion_codigo_inventario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: planta_user
--

ALTER TABLE ONLY public.cola_impresion
    ADD CONSTRAINT cola_impresion_codigo_inventario_fkey FOREIGN KEY (codigo_inventario) REFERENCES public.inventario_planta(codigo);


--
-- PostgreSQL database dump complete
--

\unrestrict 0iSp2fSPFG92RbrdPooVL4mB9P97lWHnggPtA26oKu94l73xl5iOtSNaOLYCdeP

