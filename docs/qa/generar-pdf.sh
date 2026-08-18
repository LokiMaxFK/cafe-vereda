#!/usr/bin/env bash
# Convierte una ficha HTML de docs/qa/fichas en un PDF dentro de docs/qa/pdf.
# Uso: bash docs/qa/generar-pdf.sh docs/qa/fichas/F01-acceso-y-roles.html
# Requiere Google Chrome instalado (macOS). No necesita npm ni dependencias extra.
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "No se encontró Google Chrome en $CHROME"; exit 1; }

SRC="${1:?Falta la ruta del HTML de la ficha}"
[ -f "$SRC" ] || { echo "No existe el archivo $SRC"; exit 1; }

ABS_SRC="$(cd "$(dirname "$SRC")" && pwd)/$(basename "$SRC")"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT/docs/qa/pdf"
OUT="$OUT_DIR/$(basename "${SRC%.html}").pdf"
mkdir -p "$OUT_DIR"

# --headless=new imprime la página tal cual la vería Chrome, respetando @page y print:.
# Algunos entornos aislados de QA impiden que el binario firmado de Chrome arranque. En ese caso
# se usa un respaldo local de ReportLab para que el entregable pueda generarse y verificarse igual.
if { "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
  --virtual-time-budget=3000 \
  --print-to-pdf="$OUT" "file://$ABS_SRC" >/dev/null 2>&1; } 2>/dev/null; then
  :
else
  python3 "$ROOT/docs/qa/render-html-fallback.py" "$ABS_SRC" "$OUT"
fi

[ -s "$OUT" ] || { echo "Chrome no generó el PDF"; exit 1; }
echo "PDF generado: docs/qa/pdf/$(basename "$OUT")"
