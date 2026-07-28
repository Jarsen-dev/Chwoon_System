# ocr_templates — ejemplos few-shot para OCR de remisiones

Cada subcarpeta es un **tipo de documento** y contiene 1-2 ejemplos reales ya
etiquetados a mano: la foto (`ejemplo_N.jpg|.jpeg|.png`) y su JSON correcto
(`ejemplo_N.json`). El servicio `app/services/ocr_remisiones.py` los envía a
Ollama como conversación few-shot — no se entrena ningún modelo.

## Estructura

```
ocr_templates/
├── departure_sheet/
│   ├── ejemplo_1.jpg      ← FALTA: colocar foto (hoja con 2 items MCZ65377801/MCZ65381401)
│   ├── ejemplo_1.json
│   ├── ejemplo_2.jpg      ← FALTA: colocar foto (hoja "Counting 1", MCZ62692601 × 750)
│   └── ejemplo_2.json
└── ipa_remision/
    ├── ejemplo_1.jpg      ← FALTA: colocar foto (remisión IPA 40069, MFZ61870525 × 5000)
    └── ejemplo_1.json
```

Un JSON sin su imagen acompañante se ignora (warning en logs del backend), así
que el sistema funciona aunque falten las fotos — solo que ese tipo no estará
disponible para clasificación/extracción hasta colocarlas.

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
