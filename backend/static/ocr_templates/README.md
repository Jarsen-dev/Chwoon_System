# ocr_templates — ejemplos few-shot para OCR de remisiones

Cada subcarpeta es un **tipo de documento** y contiene ejemplos reales ya
etiquetados: la foto (`.jpg|.jpeg|.png`), su JSON correcto (`.json`) y el texto
que Tesseract leyó de esa foto, cacheado en `.txt`. El servicio
`app/services/ocr_remisiones.py` usa el `.txt` para clasificar (similitud de
texto, no visión) y como ejemplo few-shot al pedirle al modelo de texto que
estructure el OCR de una foto nueva en JSON — no se entrena ningún modelo.

Si falta el `.txt`, se genera solo la primera vez que se necesita (OCR sobre
la imagen guardada) y se cachea para las siguientes — no hace falta correr
nada a mano.

## Dos clases de ejemplo

| | `ejemplo_N.*` (curados) | `auto_N.*` (auto-aprendidos) |
|---|---|---|
| Origen | El usuario da de alta un formato nuevo desde la UI | Cada recepción confirmada de un formato **ya conocido** |
| Límite | `MAX_EJEMPLOS_CURADOS` (2) | `MAX_EJEMPLOS_AUTO` (4), rotando FIFO |
| Se borran solos | Nunca | Sí, el más viejo al llegar al límite |
| Se mandan a Ollama | Sí (hasta `MAX_EJEMPLOS_PROMPT`) | No |

Los auto-aprendidos son los que hacen que el clasificador **mejore con el uso**
en vez de quedarse congelado en las 1-2 fotos iniciales. Solo entran al corpus
de clasificación, nunca al prompt: si crecieran el prompt, cada recepción haría
la extracción más lenta y llenaría el contexto del modelo.

No toda foto se aprende — se descarta si su OCR trae menos de
`MIN_CHARS_TEMPLATE` caracteres (foto ilegible) o si es casi idéntica a un
ejemplo que ya existe (misma foto resubida).

## Estructura

```
ocr_templates/
├── departure_sheet/
│   ├── ejemplo_1.jpeg
│   ├── ejemplo_1.json
│   ├── ejemplo_1.txt      ← se autogenera (OCR cacheado)
│   ├── ejemplo_2.jpeg
│   ├── ejemplo_2.json
│   ├── ejemplo_2.txt
│   ├── auto_1.jpg         ← aprendido de una recepción confirmada
│   ├── auto_1.json
│   └── auto_1.txt
└── ipa_remision/
    ├── ejemplo_1.jpeg
    ├── ejemplo_1.json
    └── ejemplo_1.txt
```

Un JSON sin su imagen acompañante se ignora (warning en logs del backend), así
que el sistema funciona aunque falten las fotos — solo que ese tipo no estará
disponible para clasificación/extracción hasta colocarlas.

## Calibración del clasificador

El clasificador vectoriza por **n-gramas de caracteres** (`char_wb`, 3-5), no
por palabras: el texto viene de OCR y un carácter mal leído destruye la palabra
completa como token. Medido sobre las fotos reales, con 20% de ruido de OCR el
acierto pasa de 43% (palabras) a 88% (n-gramas).

`OCR_UMBRAL_SIMILITUD` (default 0.20) es la similitud mínima para aceptar un
tipo. Referencias medidas: verdaderos positivos 0.41-0.76; documentos de formato
ajeno (CFDI, recibo de nómina, carta porte) no pasan de 0.149. Para recalibrar,
ver el log `clasificación TF-IDF` del backend, que imprime score, segundo mejor
tipo y margen.

## Esquema del JSON

```json
{
  "proveedor": "TEXTO TAL COMO APARECE EN LA HOJA",
  "numero_remision": "40069",
  "po": null,
  "fecha": "YYYY-MM-DD",
  "items": [
    { "numero_parte": "MFZ61870525", "cantidad": 5000 }
  ]
}
```

- Campo ilegible/tapado/borroso en la foto → `null` (nunca inventar).
- `items` siempre es lista (soporta múltiples renglones por hoja).

## Agregar un formato nuevo

Normalmente no hace falta tocar esta carpeta: al guardar una remisión de
formato desconocido, la UI de Almacén guarda aquí automáticamente la foto y el
JSON corregido como template nuevo. Manualmente: crear carpeta con el slug del
tipo (`[a-z0-9_]`) y colocar los pares imagen+JSON.
