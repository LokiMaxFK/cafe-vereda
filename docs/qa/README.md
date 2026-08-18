# Carpeta de verificación previa a la entrega

| Archivo | Para qué sirve |
|---|---|
| `PLAN_QA_ENTREGA.md` | **Empieza aquí.** Plan por funcionalidad (F01–F16) con casillas de avance, tablero de estado y bitácora de hallazgos. Es el único estado compartido entre sesiones. |
| `fichas/_plantilla.html` | Plantilla de la ficha de una funcionalidad (qué hace / qué no hace / resultados / límites). |
| `fichas/FXX-*.html` | Fichas ya redactadas, una por funcionalidad. |
| `generar-pdf.sh` | Convierte una ficha HTML a PDF con Google Chrome headless. Uso: `bash docs/qa/generar-pdf.sh docs/qa/fichas/F01-acceso-y-roles.html` |
| `pdf/` | PDF generados, uno por funcionalidad. Son el entregable para el cliente. |
| `evidencia/` | Capturas de pantalla, nombradas `FXX-NN-descripcion.png`. |

**Si retomas el trabajo (persona o modelo de IA):** lee §0.2 de `PLAN_QA_ENTREGA.md`. En resumen:
busca en el tablero (§0.6) la primera funcionalidad que no esté completada, revisa los hallazgos
abiertos (§0.7), levanta el entorno (§0.3–§0.4) y continúa en el primer paso sin marcar.
