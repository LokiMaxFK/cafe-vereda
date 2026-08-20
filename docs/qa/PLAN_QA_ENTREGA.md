# Plan de verificación previa a la entrega · Vereda Café POS

**Archivo maestro.** Se ejecuta de arriba hacia abajo, una funcionalidad a la vez. Cada paso se marca
en su casilla al terminarlo. Este documento es el único estado compartido: si el trabajo se
interrumpe (se acaban los tokens, cambia el modelo de IA, se retoma mañana), quien continúe sólo
necesita leer este archivo para saber exactamente dónde se quedó.

- **Commit base:** `afaed6f`
- **Fecha de inicio:** 18/08/2026
- **Ejecutor actual:** Claude (Opus 5)

---

## ⏱️ DÓNDE SE QUEDÓ · Estado al 20/08/2026, 01:15

**Lee esto primero. Es el punto exacto de retorno.**

### Qué está hecho

**Pasada A terminada.** Once funcionalidades verificadas en modo demostración (F01 a F11 y F15),
con **12 fichas PDF** de 16 en `docs/qa/pdf/`. La suite pasó de 111 a **156 pruebas en verde**;
lint y build limpios. Los hallazgos abiertos de esta jornada están todos corregidos y verificados
en el navegador (§0.7): **F02-01, F05-01, F06-01, F06-02, F06-03, F07-05, F10-01, F11-01, F15-01**.

### Qué falta, en el orden sugerido

Todo lo pendiente **exige Supabase real (pasada B)**:

1. **F13 · Reportes** — es lo que el dueño mira primero. Cada cifra debe cuadrar con una suma hecha
   a mano.
2. **F12 · Insumos** — conteos, mermas y el consumo teórico que viene de las recetas.
3. **F16 · Offline y sincronización** — la parte unitaria (`F16-U2`, pruebas de `offline.ts`) se
   puede hacer **sin servidor** y el propio plan la califica como la de mayor valor de todo el
   documento; si sólo hay tiempo para una cosa, que sea ésa.
4. **F14 · Personal** — depende de que la Edge Function `manage-staff` esté desplegada (F14-P0).
5. **Casos sueltos de pasada B** que quedaron marcados: F02-P13/P14, F06-C2, F10-P17 a P20,
   F11-P9/P10.
6. **Fichas que faltan:** F12, F13, F14 y F16.

### Estado del entorno en este momento

| Cosa | Estado |
|---|---|
| `.env.local` | **Credenciales reales puestas** (pasada B activa). El respaldo vive en `.env.local.bak` y en `.env.production`, los tres ignorados por git |
| Base local del navegador | **Vaciada** el 20/08 antes de cambiar de entorno. Al entrar con Supabase la app bajará los datos reales |
| Cola de sincronización | **Purgada**: 32 operaciones `pending` de las pruebas en demo que, de no borrarse, se habrían subido a producción (ver hallazgo **F02-02**) |
| Sesión | Cerrada. **El acceso lo escribe el responsable**, nunca el ejecutor de la revisión |
| Servidor | `npm run dev` en el puerto 5173 |

### Antes de retomar, en este orden

1. `npm install` si hace falta, y `npm test && npm run lint` — deben dar **156 en verde**.
2. Decidir la pasada. **Para volver a demostración:**
   `printf 'VITE_SUPABASE_URL=\nVITE_SUPABASE_PUBLISHABLE_KEY=\nVITE_AUTH_EMAIL_DOMAIN=pos.veredacafe.mx\n' > .env.local`
   **Para volver a producción:** `cp .env.local.bak .env.local`. Reiniciar `npm run dev` en ambos casos.
3. **Al pasar de demostración a producción, purgar siempre la cola** antes de reiniciar (§0.8, L6).
4. Pedir el usuario y el PIN al responsable; no escribirlos por cuenta propia.

### Trampas de este entorno que ya costaron tiempo

- **La impresión cuelga el navegador.** Antes de cualquier acción que imprima hay que instalar el
  interceptor de §0.9, y **reinstalarlo después de cada navegación**. Olvidarlo dejó el navegador
  bloqueado una vez y hubo que pedir ayuda para cerrar el diálogo a mano.
- **No hay Docker.** La regla de probar toda migración en local antes de `db push` **no se puede
  cumplir aquí**; si algo requiere SQL nuevo, hay que avisar antes de tocar producción.
- **Node es 20, no 22.** Con credenciales reales `npm test` falla en 2 archivos por falta de
  WebSocket nativo. La suite se corre **en modo demostración**.
- **El redimensionado de ventana está bloqueado.** Para probar pantallas angostas se carga la app en
  un marco de 390 px (así se hizo F03-P9).
- Al hacer clic con el ratón, el primer intento a veces sólo enfoca. Es más fiable accionar los
  botones desde la consola, salvo en el croquis de mesas, que distingue arrastrar de tocar y sí
  necesita un clic real.

### 0.9 Interceptor de impresión (copiar tal cual)

```js
window.__qaPrintDocs=[]; const oc=document.createElement.bind(document); document.createElement=function(t,...r){const el=oc(t,...r); if(String(t).toLowerCase()==='iframe') el.addEventListener('load',()=>{try{const d=el.contentDocument; el.contentWindow.print=()=>window.__qaPrintDocs.push({title:d.title,text:d.body.innerText});}catch(e){}},{once:true}); return el;};
```

Después de imprimir, leer `window.__qaPrintDocs` para ver el papel que habría salido.

---

## 0. Cómo se usa este documento

### 0.1 Protocolo de avance (obligatorio)

1. Se trabaja **una funcionalidad completa a la vez**, en el orden en que aparecen (F01 → F16). El
   orden no es arbitrario: sigue el flujo operativo real del café, de modo que cada funcionalidad
   deja datos que la siguiente necesita.
2. Dentro de una funcionalidad se ejecutan sus pasos en orden: pruebas en navegador → verificación
   de funcionalidades conectadas → pruebas unitarias → ficha PDF.
3. Al terminar cada paso se cambia `- [ ]` por `- [x]` **en este archivo**, con el resultado entre
   paréntesis si hubo algo que anotar. Ejemplo:
   `- [x] P3. Enviar a preparación (OK, pero el botón queda habilitado 1s de más)`
4. Al terminar la funcionalidad completa se actualiza su fila en el **Tablero de estado** (§0.6) y se
   registra cualquier hallazgo en §0.7 (Bitácora de hallazgos).
5. Si un paso falla: se anota el fallo en §0.7, se marca la casilla con `- [!]` en vez de `- [x]`, y
   **se continúa** con el resto. No se abre una corrección a medias sin avisar al responsable.

### 0.2 Protocolo de relevo entre modelos de IA

Quien retome el trabajo debe, en este orden:

1. Leer §0.6 (tablero) para ver la primera funcionalidad que no esté `Completada`.
2. Leer §0.7 (bitácora) para conocer los hallazgos abiertos.
3. Leer §0.3 y §0.4 para levantar el entorno.
4. Retomar en el primer paso sin marcar de esa funcionalidad. **No repetir** las funcionalidades ya
   marcadas como completadas: sus PDF en `docs/qa/pdf/` son la prueba de que se hicieron.

### 0.3 Entorno de pruebas

```bash
npm install          # sólo si node_modules no está al día
npm run dev          # servidor en http://localhost:5173
```

Credenciales:

| Modo | Usuario gerente | PIN | Usuario barista | PIN |
|---|---|---|---|---|
| Demostración (sin Supabase) | `gerente` | `2468` | `ana` | `1234` |
| Supabase real | el que exista en `staff_profiles` | el real | ídem | el real |

### 0.4 Los dos modos de prueba — decisión importante

`.env.local` **tiene credenciales reales de Supabase**, así que `npm run dev` hoy escribe en la base
de datos de producción. Eso obliga a separar las pruebas en dos pasadas:

**Pasada A — Modo demostración (segura, sin tocar datos reales).**
Cubre todo el flujo de interfaz y la lógica local (IndexedDB). Para activarla:

```bash
cp .env.local .env.local.bak            # respaldo
printf 'VITE_SUPABASE_URL=\nVITE_SUPABASE_PUBLISHABLE_KEY=\nVITE_AUTH_EMAIL_DOMAIN=pos.veredacafe.mx\n' > .env.local
# reiniciar npm run dev
```

Con las variables vacías, `isSupabaseConfigured` es falso, la app carga los pedidos de ejemplo de
`AppContext.tsx` y `demoMode` queda activo.

**Pasada B — Supabase real (obligatoria sólo donde hay servidor de por medio).**
Restaurar con `mv .env.local.bak .env.local` y reiniciar. Sólo son válidas en esta pasada las
funcionalidades marcadas con **[Requiere B]**: folio de servidor, arqueo de caja (RPC), personal
(Edge Function `manage-staff`), recetas de insumos, reportes con datos reales y sincronización.

**Higiene de datos en la pasada B:** todo pedido de prueba se crea *para llevar* con nombre de
cliente con el prefijo `QA-18AGO-…`, y todo insumo/producto de prueba lleva el mismo prefijo. Al
final, §0.8 lista lo que hay que limpiar o dejar documentado.

- [x] E1. Respaldo de `.env.local` hecho (`.env.local.bak`) y pasada A activada
- [x] E2. `npm run dev` levanta sin errores en consola (Vite 6.4.3, puerto 5173)
- [x] E3. `npm test` en verde antes de empezar (línea base: **64 pruebas, 8 archivos**)
- [x] E4. `npm run lint` sin errores antes de empezar
- [x] E5. `npm run build` compila sin errores (sólo aviso de tamaño de bundle: 786 kB)

> **Nota de entorno (19/08) — máquina distinta.** La revisión se retomó en otra máquina. Diferencias
> comprobadas: **no existía `.env.local.bak`** (se recreó desde `.env.local`, que llegó con las
> credenciales reales puestas; `.env.production` guarda las mismas y es la copia que sobrevive);
> **Node es 20.20.2**, no 22, así que con credenciales reales `npm test` falla en 2 archivos por
> falta de WebSocket nativo (`@supabase/realtime-js`) — **en modo demostración la suite pasa
> completa**, que es como debe correrse; **no hay Docker**, de modo que la regla de probar una
> migración SQL en local antes de `db push` **no se puede cumplir en esta máquina**: si hace falta
> una migración nueva, hay que avisar antes de tocar producción. El CLI de Supabase sí está
> autenticado y el proyecto `cafeteria-vereda` (`ppgykmpkaviszlmrnijq`) aparece como `linked`.
> Línea base reconfirmada el 19/08: **111 pruebas en verde**, lint limpio.
>
> **Nota de entorno (18/08).** El navegador de pruebas ya tenía datos reales cacheados en IndexedDB
> (13 pedidos, folios #1001–#1023) de una sesión anterior contra Supabase. Se verificó que **todo
> estaba sincronizado** (0 operaciones pendientes), así que no hay riesgo de pérdida. No se pudo
> limpiar la base local (acción bloqueada por permisos del entorno), de modo que en la pasada A
> **no se cargan los pedidos de demostración**: se opera sobre esos datos cacheados. No afecta a
> F01; para F02–F08 hay que tenerlo en cuenta al contar pedidos y folios. Si se quiere partir de
> cero, borrar los datos del sitio `localhost:5173` desde Chrome (Configuración → Privacidad →
> Datos de sitios).

### 0.5 Cómo se genera cada PDF

Cada funcionalidad produce una ficha de una o dos páginas que responde: **qué hace**, **qué no
hace**, **qué se probó**, **qué quedó pendiente**.

```bash
cp docs/qa/fichas/_plantilla.html docs/qa/fichas/F01-acceso-y-roles.html
# editar el HTML con los resultados reales
bash docs/qa/generar-pdf.sh docs/qa/fichas/F01-acceso-y-roles.html
# → docs/qa/pdf/F01-acceso-y-roles.pdf
```

El script usa Google Chrome en modo headless (ya verificado que funciona en esta máquina); no
requiere instalar nada. Las capturas de pantalla de evidencia se guardan en `docs/qa/evidencia/`
con el nombre `FXX-NN-descripcion.png`.

### 0.6 Tablero de estado

| ID | Funcionalidad | Rutas | Pasada | Estado | PDF |
|---|---|---|---|---|---|
| F01 | Acceso, roles y sesión | `/` | A | ✅ Completada (2 correcciones aplicadas) | [F01](pdf/F01-acceso-y-roles.pdf) |
| F02 | Nuevo pedido y folio | `/venta/nueva` | A + B | ⚠️ Pasada A completa (1 corrección); faltan P13-P14 [Requiere B] | [F02](pdf/F02-nuevo-pedido.pdf) |
| F03 | Salón y vista de mesas | `/salon` | A | ✅ Completada | [F03](pdf/F03-salon.pdf) |
| F04 | Comanda y envío a preparación | `/venta/:id` | A | ✅ Completada (3 correcciones aplicadas) | [F04](pdf/F04-comanda.pdf) |
| F05 | Preparación (barra) | `/preparacion` | A | ✅ Completada (1 corrección aplicada) | [F05](pdf/F05-preparacion.pdf) |
| F06 | Pedidos y entrega | `/pedidos` | A | ⚠️ Pasada A completa (3 correcciones); falta C2 [Requiere B] | [F06](pdf/F06-pedidos.pdf) |
| F07 | Cobro, descuento y ticket | `/cobros`, `/venta/:id` | A | ✅ Completada (4 correcciones aplicadas) | [F07](pdf/F07-cobro.pdf) |
| F08 | Cancelación y reversión | `/venta/:id` | A + B | ✅ Completada (2 correcciones aplicadas) | [F08](pdf/F08-cancelacion-y-reversion.pdf) |
| F09 | Caja y arqueo | `/caja` | B | ✅ Completada | [F09](pdf/F09-caja.pdf) |
| F10 | Catálogo | `/catalogo` | A + B | ⚠️ Pasada A completa (1 corrección); faltan P17-P20 [Requiere B] | [F10](pdf/F10-catalogo.pdf) |
| F11 | Mesas (gestión) | `/mesas` | A + B | ⚠️ Pasada A completa (1 corrección); faltan P9-P10 [Requiere B] | [F11](pdf/F11-mesas.pdf) |
| F12 | Insumos | `/insumos` | B | ⬜ Pendiente | — |
| F13 | Reportes | `/reportes` | B | ⬜ Pendiente | — |
| F14 | Personal | `/personal` | B | ⬜ Pendiente | — |
| F15 | Configuración e impresión | `/configuracion` | A | ⚠️ Completada salvo impresión en papel real (1 corrección alta) | [F15](pdf/F15-impresion.pdf) |
| F16 | Offline y sincronización | transversal | A + B | ⬜ Pendiente | — |

Estados posibles: ⬜ Pendiente · 🟡 En curso · ✅ Completada · ⚠️ Completada con hallazgos.

### 0.7 Bitácora de hallazgos

> Se llena durante la ejecución. Formato: `FXX-NN | severidad | descripción | archivo:línea | acción`

| # | Sev. | Descripción | Ubicación | Acción |
|---|---|---|---|---|
| F01-01 | **Alta** | El formulario de acceso venía precargado con `gerente` / `2468`. A diferencia del recuadro de ayuda, esos valores **no** dependían de `demoMode`, así que en producción el login abría con usuario y PIN escritos. | `src/pages/LoginPage.tsx:12-15` | ✅ **Corregido** 18/08: campos vacíos fuera de modo demostración. Verificado con Supabase configurado |
| F01-02 | Baja | El aviso «Necesitas conexión para cambiar de usuario.» **nunca se retiraba**: una vez mostrado quedaba fijo el resto de la sesión, incluso al recuperar la conexión. | `src/layout/ProtectedLayout.tsx:10-17,47` | ✅ **Corregido** 18/08: se limpia solo a los 6 s y se reinicia en cada intento. Verificado |
| F01-03 | ~~Baja~~ | ~~Colisión de usuarios por acentos~~. **Descartado:** el alta de personal (`PeoplePage.tsx:89`) aplica el mismo filtro de caracteres, así que ningún usuario guardado contiene acentos ni espacios y la colisión no puede producirse. | `src/lib/supabase.ts:17` | Sin acción. Cubierto por prueba de idempotencia |
| F08-01 | **Alta** | **El importe de las incidencias de cancelación no incluye los extras.** El servidor calcula `precio_base × cantidad` e ignora los modificadores. Verificado en producción: una línea de 2 Matcha con Bebida vegetal que vale **$210** quedó registrada como **$180** ($30 menos). Afecta igual a la cancelación de cuenta completa ($186 registrados frente a $201 reales). | `sync_offline_operations`, presente en **todas** las migraciones desde `20260813023800_initial_pos.sql:487` | ✅ **Corregido y aplicado a producción** 18/08 vía migración `20260818140000_incident_amount_includes_modifiers.sql`. Probada antes con un Supabase local (Docker): $180→$210 con un extra, $258 en cancelación de cuenta con renglón cancelado excluido. Confirmada en remoto con `supabase migration list` |
| F08-02 | Media | **Las cancelaciones de artículo no se ven en ninguna pantalla.** La tabla `incidents` las registra correctamente, pero `incidents` no se consulta en ningún punto del frontend: Reportes sólo muestra cancelaciones de cuenta completa. El registro existe y es auditable en base de datos, pero la gerencia no puede consultarlo desde la aplicación. | `src/pages/ReportsPage.tsx` (no consulta `incidents`) | ✅ **Corregido** 18/08 (vía Codex): Reportes consulta y muestra las incidencias del periodo con folio, tipo, motivo, importe y fecha |
| F04-01 | **Alta** | La comanda de cocina **no imprimía los extras** de cada línea (el ticket del cliente sí). Se cobraba «Bebida vegetal» +$15 y la barra recibía «2 × Matcha · Frío», así que se prepararía con leche normal. | `src/lib/printing.ts:41` | ✅ **Corregido** 18/08 + 7 pruebas nuevas de comanda. Verificado leyendo la comanda generada |
| F04-02 | **Alta** | La cola de Preparación mostraba sólo nombre y variante: **ni extras ni la nota de preparación**. La indicación «sin azúcar, poco hielo» no llegaba al barista por ninguna vía. | `src/pages/PreparationPage.tsx` | ✅ **Corregido** 18/08. Verificado en pantalla |
| F04-03 | Media | El motivo de cancelación se guardaba pero **no se mostraba** ni en la línea ni en la incidencia impresa. Choca con el requisito de que toda cancelación quede registrada. | `src/lib/printing.ts:41`, `src/pages/SalePage.tsx` | ✅ **Corregido** 18/08: imprime `MOTIVO:` y la línea lo muestra. Verificado |
| F04-04 | Baja | La comanda lleva la hora de impresión, no la del envío: al reimprimir aparece la hora de la reimpresión. | `src/lib/printing.ts:39` | Documentado en la ficha. Sin acción |
| F04-05 | Baja | Si la impresión falla o se cancela, el envío queda registrado igual y no hay aviso ni reintento. | `src/pages/SalePage.tsx` | Documentado; la salida es reimprimir a mano |
| F04-06 | ~~Info~~ → Media | En «Nuevo Pedido» la categoría seleccionada por defecto es la primera, que hoy está vacía (`America&Kevin`), así que la pantalla abre en blanco. **Causa identificada el 19/08: no era higiene de catálogo**, sino que el orden de las categorías se perdía al pasar por IndexedDB y quedaba alfabetizado por el identificador interno. | `src/components/ProductPicker.tsx` + datos | ✅ **Corregido** 19/08 junto con **F02-01**, que documenta el defecto y el arreglo. Queda por confirmar en la pasada B de F10 que en producción el menú abre en la categoría que la gerencia puso primera |
| F01-04 | Info | Cancelar una cuenta **no** exige rol gerente (sólo motivo); un barista puede hacerlo. Descuento y reversión sí exigen gerencia. | `src/pages/SalePage.tsx:129` | ✅ **Resuelto 18/08 (cliente):** es el comportamiento deseado — cualquiera puede cancelar, **a condición de que toda cancelación quede registrada**. Esa trazabilidad pasa a ser requisito verificable en F08 |
| F07-01 | **Alta** | El cobro acepta efectivo mayor al saldo, no muestra ni separa el cambio y guarda todo el importe como pago. `/caja` suma ese importe bruto, por lo que si se devuelve cambio el esperado del turno queda inflado (ej.: total $100, recibe $120, devuelve $20 y Caja espera $120). | `src/pages/SalePage.tsx:165`, `src/state/AppContext.tsx:372-379`, `src/pages/CashPage.tsx:181-191` | ✅ **Corregido** 18/08 (vía Codex): el pago aplicado se topa al saldo y el modal muestra el cambio a devolver |
| F07-02 | **Alta** | Todas las cifras MXN se formatean sin decimales. Un total de $100.01 se presenta como $100 y un saldo de $0.01 como $0, aunque la regla de cierre sí sigue considerando el centavo; la pantalla puede indicar visualmente cero y mantener la cuenta abierta. | `src/domain/money.ts:3`, usos en `ReadyToChargePage.tsx`, `SalePage.tsx`, `CashPage.tsx`, `ReportsPage.tsx` y `printing.ts` | ✅ **Corregido** 18/08 (vía Codex): el formateador MXN común muestra siempre dos decimales |
| F07-03 | **Alta** | El ticket de cobro omite el motivo del descuento y todas las propinas. Sólo imprime el importe del descuento y el importe de cada pago, aunque ambos datos sí quedan guardados en la orden. Incumple el contenido exigido para F07-P12. | `src/lib/printing.ts:51-63` | ✅ **Corregido** 18/08 (vía Codex): el ticket imprime el motivo escapado y las propinas positivas con la misma redacción de Cobro |
| F07-04 | Baja | En una venta cerrada la acción de ticket sí reimprime, pero el botón dice sólo «Ticket»; no cambia a «Reimprimir» como pide F07-P13, por lo que no deja claro que se generará una segunda copia. | `src/pages/SalePage.tsx:131` | ✅ **Corregido** 18/08 (vía Codex): la acción visible de una venta cerrada ahora dice «Reimprimir» |
| F09-01 | **Alta** | Caja y Reportes no delimitan el efectivo con el mismo evento: Caja suma pagos creados desde la apertura y excluye según el estado actual de la orden; Reportes atribuye cobros y reversiones por `closed_at` y `reversed_at`. Una reversión durante el turno actual de una venta cobrada antes de abrirlo resta en Reportes, pero no reduce el esperado de Caja. Por ello el corte no siempre puede conciliarse con Reportes para el mismo rango horario. | `src/pages/CashPage.tsx:186`, `src/pages/ReportsPage.tsx:74-109`, `src/domain/reports.ts:205-229,273-316`, `supabase/migrations/20260818120000_reverse_sale_and_cash_reversal_fix.sql:211-216` | ✅ **Corregido** 18/08 (vía Codex): Caja aclara que el esperado es efectivo físico del turno y explica la divergencia por reversiones de turnos anteriores; fórmulas intactas |
| ~~F09-02~~ | ~~Media~~ | ~~"Registrar retiro" no está realmente deshabilitado sin nota.~~ **Retractado 18/08: falso positivo de la prueba, no un defecto.** La prueba original hizo `document.querySelectorAll('button').find(...)` sobre toda la página, y hay **dos** botones con el texto "Registrar retiro": el del encabezado (sólo abre el modal, nunca deshabilitado) y el del propio modal (el que envía). El `find` sin acotar devolvió el primero, dando un falso "no deshabilitado". Reverificado acotando la consulta a `[role=dialog]`: el botón del modal está correctamente `disabled` sin importe, sigue `disabled` con sólo importe, y se habilita con importe y nota — probado en vivo contra producción, incluyendo un envío real completado sin error. | `src/pages/CashPage.tsx:102` (`disabled={loading \|\| !Number(amount) \|\| !note.trim()}`, ya correcto) | Sin acción: el código estaba bien. Error de metodología de prueba, documentado para que no se repita |
| F08-03 | **Alta** | **Cancelar una cuenta completa con artículos ya despachados/preparados no avisaba a la barra.** A diferencia de cancelar un solo artículo (que sí imprime una comanda de cancelación), `performOrderAction` nunca llamaba a `printCommand`: la cocina se quedaba sin ningún aviso físico de que debía detener o descartar algo que ya estaba preparando. El pedido simplemente desaparecía de la cola de Preparación sin explicación. | `src/pages/SalePage.tsx` (`performOrderAction`) | ✅ **Corregido** 18/08: ahora imprime una comanda «CANCELACIÓN» con el motivo, listando los artículos que ya estaban en la barra. Verificado dos veces en producción real (sin motivo visible primero, luego con `MOTIVO:` en el papel) |
| F08-04 | **Alta** | **La tabla de Incidencias en Reportes (agregada en F08-02) no mostraba quién hizo la cancelación/reversión.** El dato existía (`incidents.created_by`) pero la consulta no lo traía y la tabla no tenía columna de empleado — contradice directamente el requisito confirmado por el cliente de poder responsabilizar a alguien (F01-04). | `src/pages/ReportsPage.tsx` (consulta de incidencias y tabla) | ✅ **Corregido** 18/08: se agregó el join a `staff_profiles` y la columna "Empleado". Verificado en producción real: las 6 incidencias existentes mostraron "Gerente" correctamente tras el cambio |

| F02-01 | Media | **El orden del menú se perdía al recargar y "Nuevo Pedido" abría en una categoría al azar.** El servidor sí guarda el orden en `categories.position` y la consulta lo respeta (`.order("position")`), pero al mapear se descartaba la columna: `Category` era `{id, name}`. Al persistirse en IndexedDB sin ese dato, `db.catalogCategories.toArray()` devolvía las categorías **ordenadas por clave primaria**, es decir por el identificador interno (un UUID en producción). El selector de productos abre en `categories[0]`, así que el barista veía una categoría distinta según el azar del identificador. **Esto es la causa real de F04-06** (abrir en `America&Kevin`, vacía): no era higiene de catálogo. Verificado en vivo: recién sembrado salía "Café" primero; tras recargar salía "Otros" (id `bakery`). | `src/state/AppContext.tsx:153,205,212`, `src/domain/types.ts:19`, `src/components/ProductPicker.tsx:27` | ✅ **Corregido** 19/08: `Category` lleva `position`, se pide y se conserva desde el servidor, y una función pura `sortCategories` (`src/domain/catalog.ts`, **6 pruebas**) ordena por posición con desempate por nombre. Se corrigió además `updateCategory`, cuyo `put` borraba la posición al renombrar. Verificado tras recargar: IndexedDB sigue devolviendo por id (Otros, Almuerzos, Café…) pero la pantalla muestra Café, Frías, Almuerzos… y abre en Café |
| F02-02 | Baja | **La cola de sincronización encola también en modo demostración.** `queueOperation` escribe en `pendingOperations` sin mirar `isSupabaseConfigured`; en demo `syncPendingOperations` sale temprano porque `supabase` es `null` y las operaciones quedan `pending` para siempre (la interfaz muestra "N cambios pendientes" de forma permanente). En producción real no se manifiesta, pero **sí afecta a esta revisión**: todo pedido de prueba creado en pasada A se subiría a producción al restaurar las credenciales para una pasada B. | `src/lib/offline.ts:4,21-27` | Sin corregir por decisión de alcance: en producción siempre hay credenciales. **Mitigación obligatoria del procedimiento de QA:** purgar `pendingOperations` antes de cada cambio de pasada A → B. Anotado en §0.8 (L6) |

| F05-01 | Baja | **La tarjeta "Listos para entregar" contaba artículos que la barra no entrega.** Usaba `order.items.length`, que incluye los renglones **cancelados** y los que aún no se han enviado, así que anunciaba más artículos de los que salen en la charola. Además decía "1 artículos". Reproducido con el pedido #1048: 3 renglones (uno cancelado) anunciados como 3. | `src/pages/PreparationPage.tsx` (aside de listos) | ✅ **Corregido** 20/08: función pura `deliverableItemCount` en `src/domain/order.ts` (**4 pruebas**) que cuenta sólo `prepared`/`dispatched`, más el plural correcto. Verificado en pantalla: "#1048 · 2 artículos" y "#1047 · 1 artículo" |
| F06-01 | Baja | **El ticket que se entrega al cliente imprimía el método de pago en inglés y en crudo:** "CASH", "CARD", "TRANSFER". El modal de cobro mostraba lo mismo ("Cash"), pese a que el botón que el cajero acababa de pulsar decía "Efectivo". Reportes sí lo traducía, con su propio mapa duplicado. Capturado del ticket real de la orden #1047. | `src/lib/printing.ts:61`, `src/pages/SalePage.tsx` (lista de pagos), `src/pages/ReportsPage.tsx:29` | ✅ **Corregido** 20/08: `paymentMethodLabel` único en `src/domain/money.ts`, usado por ticket, cobro y reportes (se eliminó el mapa duplicado). Prueba nueva en `printing.test.ts` para los tres métodos. Verificado reimprimiendo el ticket: ahora dice **EFECTIVO** |
| F06-02 | Baja | **Buscar en Pedidos por lo que muestra la pantalla no encontraba nada.** El campo dice "Folio, mesa o nombre", pero sólo indexaba el identificador interno de la mesa (`t5`), no el destino visible ("Mesa 5"). Escribir "Mesa 5" devolvía **cero resultados y una tabla vacía sin ningún mensaje**, sólo el encabezado flotando. | `src/pages/OrdersPage.tsx` (filtro y tabla) | ✅ **Corregido** 20/08: la búsqueda incluye `orderDestination(order)` y se recortan los espacios; se agregó un estado vacío ("Ningún pedido coincide…"). Verificado: "Mesa 5" encuentra #1047 y una búsqueda sin resultados muestra el mensaje |
| F06-03 | Baja | **La lista de Pedidos parecía desordenada.** Ordenaba por `updatedAt` pero la columna muestra `openedAt`, así que los folios saltaban sin explicación visible (#1047, #1046, #1045, #1043, #1044, #1042…) y no había forma de deducir el criterio. | `src/pages/OrdersPage.tsx` (`sort`) | ✅ **Corregido** 20/08: ordena por `openedAt` descendente, que es la fecha que se ve y coincide con la secuencia de folios. Verificado: la lista queda estrictamente cronológica |
| F07-05 | Baja | **Una venta ya cobrada seguía diciendo que había que cobrarla.** El panel central mostraba siempre el mismo texto —"Orden finalizada, lista para cobrar · Usa el botón «Cobrar» para registrar el pago"— también en ventas `closed`, `cancelled` y `reversed`, donde ese botón ya no existe (en una cerrada dice "Reimprimir"). | `src/pages/SalePage.tsx:146` | ✅ **Corregido** 20/08: `closedStateCopy` da un texto propio a cada estado liquidado. Verificado en la venta #1047: "Venta cobrada · La cuenta ya está pagada y cerrada. Usa «Reimprimir» si el cliente necesita otra copia del ticket." |

| F10-01 | Media | **La tarjeta del selector anunciaba un precio que no se podía pagar.** Mostraba siempre el **precio base** del producto seguido de "+" cuando había presentaciones, sin mirar cuánto cuestan realmente. Basta con que la gerencia cambie el precio de una presentación y no toque el precio base para que la pantalla anuncie una cifra inexistente. Reproducido durante F10-P7/P8: producto con base $50.00 cuya **única** presentación cuesta $99.00 → la tarjeta decía «$50.00+», casi la mitad del precio real, y el "+" sugería opciones más caras cuando no había ninguna otra. Es la cifra que el barista lee en voz alta cuando el cliente pregunta el precio. | `src/components/ProductPicker.tsx:60` | ✅ **Corregido** 20/08: `productDisplayPrice` anuncia la presentación **más barata realmente comprable** y `hasPriceChoices` reserva el "+" para cuando hay más de una opción (`src/domain/catalog.ts`, **5 pruebas**). Verificado en pantalla: el producto pasó a «$99.00» sin "+", y el caso normal quedó intacto (Cappuccino sigue «$70.00+», Espresso «$48.00») |

| F11-01 | Media | **Se podía dar de baja una mesa con la cuenta abierta, sin ningún aviso.** Ni el croquis de `/mesas` distingue una mesa ocupada de una libre, ni el editor mencionaba la cuenta. Reproducido con la Mesa 9 y el pedido #1052 ($48.00, `open`): la baja se aplicó sin protestar y **el pedido desapareció de `/salon`** —donde el equipo trabaja— quedando visible sólo en `/pedidos`. No hay pérdida de datos ni dinero irrecuperable (la cuenta sigue alcanzable y cobrable desde el historial), pero sí riesgo real de que una cuenta viva se quede sin cobrar porque nadie la ve. | `src/pages/TablesPage.tsx` (`toggleActive` y el botón «Quitar mesa») | ✅ **Corregido** 20/08: «Quitar mesa» se deshabilita mientras la mesa tenga una cuenta rastreada y se explica debajo: «Tiene la cuenta #1052 abierta (Mesa 9). Cóbrala o cancélala antes de dar la mesa de baja». Es el mismo patrón que ya usaba el borrado de categorías con productos. **Ojo con el guard:** en la primera versión bloqueaba también «Reactivar mesa», justo la salida para arreglar una mesa ya dada de baja; se acotó a la baja. Verificado en los tres estados: bloqueada con cuenta viva, reactivación libre, y baja permitida en cuanto la cuenta se canceló |

| F15-01 | **Alta** | **En el ticket de 58 mm el método de pago se partía letra por letra.** La vista previa mostraba literalmente `TA` / `RJ` / `ET` / `A` en cuatro renglones: el importe con la propina en la misma línea («$270.00 + $20.00 propina») no dejaba espacio, y el CSS del renglón permite partir por cualquier carácter (`overflow-wrap:anywhere`). El resultado es ilegible en el comprobante que se entrega al cliente. **Transparencia sobre el origen:** lo destapó la corrección **F06-01** —al pasar de «CARD» (4 letras) a «TARJETA» (7) dejó de caber—, pero el defecto ya estaba latente: «TRANSFER», el valor crudo anterior, también se habría partido. | `src/lib/printing.ts` (renglón de pagos y CSS de `.row`) | ✅ **Corregido** 20/08: la propina pasa a su **propio renglón** indentado y el nombre del método no se parte (`white-space:nowrap`). Verificado en la vista previa real a 58 mm y a 80 mm: «TARJETA $270.00» completo y «Propina $20.00» debajo. 3 pruebas nuevas |

Severidades: **Bloqueante** (impide entregar) · **Alta** (rompe un flujo, hay rodeo) · **Media**
(molesta pero no rompe) · **Baja** (cosmético).

### 0.8 Limpieza posterior

- [ ] L1. `mv .env.local.bak .env.local` restaurado
- [ ] L2. Datos `QA-18AGO-*` de Supabase eliminados o documentados como datos de prueba
- [ ] L3. Sesión de caja de prueba cerrada (no dejar un turno abierto)
- [ ] L4. `npm test`, `npm run lint` y `npm run build` en verde al final
- [ ] L5. PDF de las 16 funcionalidades presentes en `docs/qa/pdf/`
- [ ] L6. `pendingOperations` purgado de las operaciones creadas en pasada A antes de volver a
      credenciales reales (ver hallazgo **F02-02**: el modo demostración también encola, y esas
      operaciones se subirían a producción en cuanto Supabase quede configurado)

---

## F01 · Acceso, roles y sesión

**Rutas:** `/` · **Archivos:** `src/pages/LoginPage.tsx`, `src/layout/ProtectedLayout.tsx`,
`src/components/ManagerOnly.tsx`, `src/state/AppContext.tsx` (`login`, `logout`) ·
**Pasada:** A · **Rol:** ambos

Es la primera porque todo lo demás depende de tener sesión y del rol correcto.

### Pruebas en navegador

- [x] F01-P1. Abrir `/` sin sesión: formulario visible; la nota de demostración sólo se muestra en
      modo demo (está condicionada a `demoMode`, correcto).
- [x] F01-P2. Entrar con `gerente` / `2468` → `/inicio` como Jordan Cruz · Gerente, con los tres
      grupos: Operación, Gestión y Administración.
- [x] F01-P3. PIN incorrecto (`gerente` / `0000`) → "Usuario o PIN incorrectos.", no redirige.
- [x] F01-P4. Usuario inexistente (`pedro` / `1234`) → mismo mensaje genérico (no revela si el
      usuario existe), sin errores en consola.
- [x] F01-P5. Recargar con sesión activa → la sesión sobrevive, no vuelve al login.
- [x] F01-P6. Barista `ana` / `1234` → sólo el grupo Operación. **Extra observado:** la tarjeta
      "Venta del día" se sustituye por "Tu turno", así que tampoco se le expone la venta.
- [x] F01-P7. Barista por URL a `/reportes` → redirige a `/inicio` sin mostrar contenido.
- [x] F01-P8. Igual para `/catalogo`, `/mesas`, `/insumos`, `/personal`, `/configuracion` y
      `/configuracion/impresion` (7 de 7 bloqueadas). Ruta inexistente → pantalla de "no encontrado"
      dentro del layout, sin expulsar al usuario.
- [x] F01-P9. Sin sesión, `/caja` → login con `state.from="/caja"`, y **tras entrar aterriza en
      Caja** (el retorno sí está implementado, `LoginPage.tsx:11,22`).
- [x] F01-P10. Sin conexión, cerrar sesión → no cierra y avisa "Necesitas conexión para cambiar de
      usuario." (hallazgo **F01-02**: el aviso es efímero y sale en la esquina opuesta al botón).

### Funcionalidades conectadas a verificar

- [x] F01-C1. `SyncPill` correcto: "Todo sincronizado" con conexión, "0 cambios · Sin conexión" en
      rojo al perderla.
- [x] F01-C2. El rol condiciona acciones: descuento `disabled` para barista y bloque de descuento
      del cobro oculto (`SalePage.tsx:129,144`); "Revertir venta" sólo para gerencia y sólo en
      ventas cerradas. **Pero cancelar cuenta no exige gerencia** → hallazgo F01-04. La verificación
      visual a fondo queda en F07 y F08.

### Pruebas unitarias

`AppContext` no es testeable directamente sin `jsdom` (el proyecto no tiene `jsdom` ni
`@testing-library`, y **no se va a agregar hoy**: instalar dependencias el día de la entrega es
riesgo innecesario). Lo que sí se prueba es la lógica pura extraíble:

- [x] F01-U1. `src/lib/supabase.test.ts` (nuevo, **7 casos**): normalización de mayúsculas y
      espacios, caracteres permitidos (`. _ -`), neutralización de un usuario que intente colar otro
      dominio (`admin@otro.com` no escapa del dominio interno), idempotencia sobre los usuarios ya
      guardados (si se rompiera, nadie podría entrar) y usuario vacío sin validar.
      Suite total: **71 en verde**, lint limpio, build correcto.

### Correcciones aplicadas (18/08)

- [x] F01-F1. `LoginPage.tsx`: los campos de acceso arrancan vacíos fuera de modo demostración
      (hallazgo F01-01). Verificado con un Supabase ficticio: campos vacíos y sin ayuda de
      credenciales; en modo demostración siguen precargados, sin regresión.
- [x] F01-F2. `ProtectedLayout.tsx`: el aviso de cierre de sesión se retira solo a los 6 s y se
      reinicia en cada intento (hallazgo F01-02). Verificado en navegador.

### Ficha PDF

- [x] F01-D1. `docs/qa/fichas/F01-acceso-y-roles.html` redactado
- [x] F01-D2. `docs/qa/pdf/F01-acceso-y-roles.pdf` generado

---

## F02 · Nuevo pedido y asignación de folio

**Rutas:** `/venta/nueva` · **Archivos:** `src/pages/NewOrderPage.tsx`,
`src/components/ProductPicker.tsx`, `AppContext.startOrder` / `reserveFolio` ·
**Pasada:** A **y** B (el folio del servidor sólo existe en B) · **Rol:** ambos

### Pruebas en navegador (pasada A)

> **Pasada A completada (19/08)** en una máquina distinta a la del 18/08. El IndexedDB local traía
> 8 pedidos reales del 16/08 (folios 1000-1014, 7 abiertos) en vez de los datos de demostración;
> las 11 operaciones estaban **todas `synced`**, así que se limpió la caché local con autorización
> del responsable y se partió de los pedidos de ejemplo (folios 1038-1044). Se encontró y corrigió
> un hallazgo real: el orden de las categorías del menú (**F02-01**).

- [x] F02-P1. Desde la barra lateral, **Nuevo Pedido** abre `/venta/nueva` sin la barra lateral
      (es una ruta fuera de `ProtectedLayout`).
- [x] F02-P2. El selector de productos lista las 7 categorías y filtra al escribir (`capp` →
      sólo Cappuccino, encabezado "Resultados").
- [x] F02-P3. Cappuccino → Frío/frappé se agrega a **$90.00**, el precio de la variante, no el
      base de $70.00.
- [x] F02-P4. Repetir la misma selección fusionó la línea: 1 sola línea, cantidad 2, $180.00.
- [x] F02-P5. Cappuccino Frío/frappé **+ Bebida vegetal** creó línea aparte de $105.00.
- [x] F02-P6. Total $285.00 = 2 × $90.00 + 1 × ($90.00 + $15.00). Suma manual correcta.
- [x] F02-P7. **Continuar** deshabilitado con el pedido vacío (los dos botones, el del encabezado
      y el del pie).
- [x] F02-P8. Continuar → modal de destino → Mesa 1 → creó el pedido y navegó a
      `/venta/3fcb2671-…`, cabecera "Mesa 1 · Abierto · Orden #1045".
- [x] F02-P9. Para llevar con nombre `QA-19AGO-01` → pedido #1046 con el nombre en la cabecera.
      El nombre es opcional y el botón no lo exige, coherente con su etiqueta.
- [x] F02-P10. Con ninguna mesa seleccionada, "Crear pedido" está `disabled` — verificado
      **acotando la consulta a `[role=dialog]`**, no sobre toda la página (lección de F09-02). Las
      mesas ocupadas (3 y 6) también salen `disabled`.
- [x] F02-P11. Folio 1045 > 1044, y los siguientes 1046 y 1047: monótono y creciente.
- [x] F02-P12. La flecha de volver regresa a `/salon` y **no** crea pedido: el artículo elegido se
      descarta y el conteo de pedidos no cambia (8 antes y después).

### Pruebas en navegador (pasada B) **[Requiere B]**

- [ ] F02-P13. Crear un pedido con conexión → el folio proviene de la secuencia del servidor
      (`next_order_folio`). Comprobar en la pestaña Red que la RPC se llamó y que el folio impreso
      coincide con el devuelto.
- [ ] F02-P14. Con DevTools en Offline, crear un pedido → asigna folio local provisional y el pedido
      queda en estado pendiente. Al volver la conexión, el servidor lo respeta o lo reasigna
      (se cruza con F16).

### Funcionalidades conectadas a verificar

- [x] F02-C1. La Mesa 1 quedó ocupada en `/salon` de inmediato, con "2 · $285.00", y el propio
      modal de destino la muestra ya `disabled` en el siguiente pedido.
- [x] F02-C2. El pedido para llevar aparece en el riel "PARA LLEVAR" del salón:
      "QA-19AGO-01 · #1046 · Cuenta abierta · 1 min · $48.00".
- [x] F02-C3. Aeropress marcado como **no disponible** en `/catalogo` desapareció del selector de
      `/venta/nueva`. **Comportamiento real a documentar:** el producto no disponible se **oculta**
      por completo, no se muestra atenuado ni deshabilitado. Restaurado al terminar la prueba.

### Pruebas unitarias

- [x] F02-U1. **Ya cubierto, sin necesidad de agregar casos.** `orderItem.test.ts` prueba la fusión
      con los mismos extras en distinto orden ("treats the same modifiers in a different order as
      the same selection"). La segunda mitad de la petición **no aplica**: `mergeOrAddItem` no
      recibe cantidad —`buildOrderItem` fija `quantity: 1`—, así que no hay forma de pasarle 0 ni
      un negativo. La protección equivalente vive en `changeQuantity` (`AppContext.tsx:351`), que
      elimina la línea cuando la cantidad bajaría a 0 o menos, y ya se verificó en pantalla en
      F04-P4.
- [x] F02-U2. `nextLocalFolio` extraída de `AppContext.reserveFolio` a `src/domain/order.ts` junto
      con la constante `FIRST_LOCAL_FOLIO`, y cubierta con **5 casos nuevos** en `order.test.ts`:
      lista vacía, lista desordenada, folios por debajo del mínimo, monotonía sobre cinco
      asignaciones seguidas y **folios no numéricos**. Este último era un defecto latente real: con
      un solo pedido sin folio, `Math.max` devolvía `NaN` y el pedido nuevo nacía sin folio; ahora
      se filtran. Suite total: **122 pruebas en verde**, lint y build limpios.

### Ficha PDF

- [x] F02-D1. `docs/qa/fichas/F02-nuevo-pedido.html` redactado
- [x] F02-D2. `docs/qa/pdf/F02-nuevo-pedido.pdf` generado con Chrome (Skia), revisado visualmente

---

## F03 · Salón y vista de mesas

**Rutas:** `/salon` · **Archivos:** `src/pages/SalonPage.tsx`,
`src/components/TableFloorPlan.tsx`, `src/components/TakeawayRail.tsx`,
`src/components/tableStatusTone.ts` · **Pasada:** A · **Rol:** ambos

### Pruebas en navegador

> **Pasada A completada (19-20/08).**

- [x] F03-P1. El croquis dibuja las 8 mesas activas en su posición y forma (1, 5, 6 y 8 redondas;
      2, 3, 4 y 7 cuadradas), sobre la rejilla del área principal.
- [x] F03-P2. Los cinco tonos se distinguen y coinciden con `tableStatusTone.ts`: libre (claro),
      cuenta abierta (`secondary`, gris cálido), en preparación (`primary`, café), lista
      (`tertiary`, verde) y por cobrar (`error`, rojo). Verificados en vivo los cuatro primeros;
      "por cobrar" se comprobó en la tira de métricas.
- [x] F03-P3. Tocar la Mesa 2 (libre) abre `/venta/nueva` con estado `{type:"table", tableId:"t2"}`
      y el modal de destino ya trae **esa mesa preseleccionada**.
- [x] F03-P4. Tocar la Mesa 3 (ocupada) **no crea otra cuenta**. Comportamiento real a documentar:
      abre un **resumen rápido** (folio, tiempo, líneas, subtotal y total) con dos acciones, "Abrir
      cuenta completa" y "Cancelar pedido"; la primera lleva a `/venta/demo-table-3`, la cuenta
      existente. El conteo de pedidos no cambió.
- [x] F03-P5. Ese mismo resumen muestra el estado ("En preparación", "En mesa") y el tiempo
      transcurrido ("abierta hace 38 min").
- [x] F03-P6. El riel "PARA LLEVAR" lista los pedidos abiertos con nombre, folio, estado, minutos e
      importe, y al tocarlos abre el mismo resumen rápido con acceso a la cuenta.
- [x] F03-P7. Cerradas, canceladas y revertidas no ocupan mesa: con los pedidos de ejemplo, las
      mesas 2 y 4 (que tienen una venta cerrada y una cancelada) salen libres.
- [x] F03-P8. Al dar de baja la Mesa 8 desde `/mesas` desapareció del croquis y el encabezado pasó
      a "3 de 7 mesas libres". Reactivada al terminar.
- [x] F03-P9. **A 390 px no hay desbordamiento horizontal** (`scrollWidth` = `clientWidth` = 375, y
      ningún elemento se sale del viewport). La app cambia a diseño móvil: la barra lateral se
      sustituye por una barra inferior, las métricas se apilan en dos columnas y el croquis pasa a
      una rejilla de tarjetas de 149×112 px, muy por encima del mínimo táctil. **Nota de método:**
      el redimensionado de ventana está bloqueado en esta máquina (Chrome en pantalla completa), así
      que se midió cargando la app en un iframe de 390×844, que dispara las mismas media queries.
      Único detalle: la métrica "Lista para entregar" se recorta a "Lista para entreg…".

### Funcionalidades conectadas a verificar

- [x] F03-C1. Marcar listo la Mesa 5 en `/preparacion` la puso en verde en `/salon` y movió los
      contadores (1 → 2 "Lista para entregar", 2 → 1 "Cuenta abierta"), navegando por el router sin
      recargar la página.
- [x] F03-C2. Al cobrar y cerrar la orden #1047, la Mesa 5 volvió a libre ("5 de 8 mesas libres").
      Verificado en vivo, no sólo por código como en F07-C1.
- [x] F03-C3. Al cancelar la cuenta #1045 con motivo, la Mesa 1 volvió a libre ("6 de 8 mesas
      libres", 0 cuentas abiertas).

### Pruebas unitarias

- [x] F03-U1. Resuelto en `src/domain/order.test.ts` en vez de un archivo nuevo, porque la función
      de tono vive en `domain/order.ts` (`tableStatus`), no en `tableStatusTone.ts` —ese archivo
      sólo tiene los mapas de color, que no tienen lógica que probar. **Hallazgo de contrato, no
      defecto:** `tableStatus` por sí sola **no** distingue `closed`/`cancelled`/`reversed` (cae en
      su rama final y devolvería "open"). Lo que libera la mesa es el filtro `isTracked` que
      `SalonPage.tsx:35` aplica **antes**. Se añadieron 2 casos que prueban el par completo tal como
      lo usa el salón, para dejar escrito cuál de las dos piezas hace el trabajo.

### Ficha PDF

- [x] F03-D1. `docs/qa/fichas/F03-salon.html` redactado
- [x] F03-D2. `docs/qa/pdf/F03-salon.pdf` generado con Chrome (Skia)

---

## F04 · Comanda: captura y envío a preparación

**Rutas:** `/venta/:orderId` · **Archivos:** `src/pages/SalePage.tsx`, `AppContext` (`addItem`,
`changeQuantity`, `dispatchPending`, `cancelCommandedItem`), `src/lib/printing.ts`,
`src/domain/orderItem.ts` · **Pasada:** A · **Rol:** ambos

Es el corazón del sistema. Merece la prueba más larga.

### Pruebas en navegador

- [x] F04-P1. Cabecera con folio #1045, destino QA-18AGO-F04, hora y estado.
- [x] F04-P2. Agregar desde la cuenta: Espresso $48 → total $258, en estado pendiente.
- [x] F04-P3. `+`/`−` sólo en pendientes: 2→3 ($315), 3→2 ($210).
- [x] F04-P4. En cantidad 1 el botón pasa a papelera y elimina la línea.
- [x] F04-P5. Línea enviada sin controles de cantidad; sólo cancelable con motivo.
- [x] F04-P6. Subtotal y total exactos en cada paso (variante $90 + extra $15 = $105).
- [x] F04-P7. Sin pendientes el botón dice "Todo fue comandado" y se deshabilita.
- [x] F04-P8. Envío → estado `preparing`, líneas "Enviado", imprime comanda. **Nota:** sin QZ Tray
      (por diseño) usa el diálogo nativo del navegador, que bloquea la interfaz hasta confirmarlo.
- [x] F04-P9. Segundo lote con id propio (`8efaec45` vs `dbe6775e`) y comanda que trae **sólo la
      línea nueva**. Repetir un producto ya comandado crea línea pendiente aparte, sin tocar la
      enviada.
- [x] F04-P10. Cancelación exige motivo; con sólo espacios sigue deshabilitado; imprime incidencia
      con encabezado CANCELACIÓN y su propio lote (`76ac5c0c`).
- [x] F04-P11. Total baja de $306 a $96 al cancelar.
- [!] F04-P12. El motivo **no se mostraba** en la línea ni en la incidencia → hallazgo **F04-03**,
      corregido y reverificado.
- [x] F04-P13. "Finalizar orden" deshabilitado mientras haya pendientes.
- [x] F04-P14. Menú ⋮ (gerente): Cancelar cuenta + Reimprimir COPIA 1. Sin "Revertir venta"
      (correcto: sólo en ventas cerradas).

### Funcionalidades conectadas a verificar

- [x] F04-C1. Lo enviado aparece en `/preparacion` con su tiempo de espera; lo cancelado desaparece.
- [ ] F04-C2. La mesa cambia a "en preparación" en `/salon` — **pendiente**: el pedido de prueba fue
      para llevar. Verificar en F03 con un pedido de mesa.
- [x] F04-C3. La comanda usa el formato térmico configurado (ancho, tipografía, márgenes).
- [x] F04-C4. Cada cambio encola una operación: el contador pasó de 6 a 12 durante la prueba.

### Correcciones aplicadas (18/08)

- [x] F04-F1. `printing.ts`: la comanda imprime los **extras** de cada línea (hallazgo F04-01).
      Verificado leyendo la comanda generada antes y después.
- [x] F04-F2. `PreparationPage.tsx`: la cola de la barra muestra **extras y nota de preparación**
      (hallazgo F04-02). Verificado en pantalla.
- [x] F04-F3. `printing.ts` + `SalePage.tsx`: el **motivo** aparece en la incidencia impresa y en la
      línea cancelada (hallazgo F04-03). Verificado en ambos.

### Funcionalidad añadida a petición del cliente (18/08): cancelación parcial

Antes sólo podía anularse la línea completa. Ahora se elige cuántas unidades se anulan.

- [x] F04-N1. `orderItem.ts` → `cancelItemUnits`: parte la línea en dos (lo que sigue en barra y lo
      anulado). La parte anulada nace con identificador propio y conserva variante, extras y lote de
      origen; al anular la línea entera se conserva su identificador, como antes.
- [x] F04-N2. `AppContext.cancelCommandedItem` acepta `quantity` y devuelve el artículo anulado, de
      modo que se imprime **sólo la parte anulada**.
- [x] F04-N3. `SalePage`: selector «N de M» con importe a descontar, atajo «Todas» y tope en ambos
      extremos. Se reinicia en 1 al abrir, para no anular de más por inercia.
- [x] F04-N4. **11 pruebas** nuevas en `orderItem.test.ts`. Suite total: **89 en verde**.
- [x] F04-N5. Verificado en navegador: cancelar 1 de 3 deja la línea en 2 ($96) y crea la anulada de
      1 ($48); total $297 → $249; la incidencia imprime «1 × Espresso»; la barra ve 2.
- [x] F04-N6. **Verificado contra Supabase real** el 18/08: la línea partida sincroniza, cada
      anulación genera su incidencia y dos anulaciones sobre la misma línea no se pisan. Detalle en
      F08-P13 a F08-P18. La única salvedad es el importe de la incidencia, que excluye los extras —
      defecto de origen del servidor, no de esta funcionalidad (hallazgo **F08-01**, ya corregido
      y aplicado a producción, ver bitácora §0.7).

### Pruebas unitarias

- [x] F04-U1. `src/lib/printing.test.ts`: **7 casos nuevos de comanda**. El archivo sólo probaba
      tickets de cliente y nunca la comanda de cocina — por eso F04-01 pasó inadvertido. Cubren:
      cantidad + variante + extras + nota; varios extras en una línea; línea sin extras; motivo en
      la comanda de cancelación; marcas COPIA/CANCELACIÓN; escapado de HTML en nombres.
      Suite total: **78 en verde**, lint y build limpios.
- [ ] F04-U2. `src/domain/money.test.ts`: total con líneas canceladas y redondeo a centavos.
      **Pendiente** — se cubre a fondo en F07, donde vive el cálculo de dinero.

### Ficha PDF

- [x] F04-D1. `docs/qa/fichas/F04-comanda.html` redactado
- [x] F04-D2. `docs/qa/pdf/F04-comanda.pdf` generado

---

## F05 · Preparación (vista de barra)

**Rutas:** `/preparacion` · **Archivos:** `src/pages/PreparationPage.tsx`,
`AppContext.markOrderReady` · **Pasada:** A · **Rol:** ambos

### Pruebas en navegador

> **Pasada A completada (20/08).** Se encontró y corrigió un hallazgo real: el conteo de la tarjeta
> de "Listos para entregar" (**F05-01**).

- [x] F05-P1. Lista sólo pedidos con líneas despachadas, **ordenados por antigüedad**: Mesa 3
      (#1042, 43 min) antes que Mesa 5 (#1047, 9 min). El más viejo lleva la etiqueta de tiempo en
      rojo.
- [x] F05-P2. Cada tarjeta trae destino, folio, las líneas del lote con cantidad y variante, y el
      tiempo de espera.
- [x] F05-P3. Marcar listo pasó la línea de `dispatched` a `prepared` y el pedido a `ready`.
- [x] F05-P4. El pedido salió de "Por preparar" y apareció en "Listos para entregar".
- [x] F05-P5. **Comportamiento real documentado:** con dos lotes vivos en el mismo pedido (#1048,
      lotes `697aa7d1` y `d623cd67`), la barra los muestra **juntos en una sola tarjeta, sin
      distinguirlos**, y "Marcar todo listo" marca **todos los lotes a la vez** — no hay forma de
      marcar listo sólo el primero. Los dos pasaron a `prepared` de golpe y el renglón cancelado se
      quedó como estaba. Es defendible, pero conviene que el cliente lo sepa: si la bebida sale
      antes que la comida, el pedido no se marca listo hasta que esté todo lo enviado.
- [x] F05-P6. Se canceló el Cappuccino ya despachado de #1048 y **desapareció de la barra**,
      quedando sólo el Espresso. La incidencia impresa llevó su `MOTIVO:`.
- [x] F05-P7. Vista vacía correcta: "La barra está al día · Las nuevas comandas aparecerán aquí en
      cuanto se envíen", con icono y contador "0 en cola". No es una pantalla en blanco.

### Funcionalidades conectadas a verificar

- [x] F05-C1. La Mesa 5 pasó a verde "Lista para entregar" en `/salon` (mismo caso que F03-C1).
- [x] F05-C2. El pedido listo aparece en `/pedidos` con estado "Listo" y, tras finalizarlo, en
      `/cobros` (F06-C1).
- [x] F05-C3. **Verificado en vivo con el pedido #1049 (`QA-19AGO-02`):** enviado a preparación,
      marcado listo y luego cancelado desde la venta → salió por completo de la barra, que volvió a
      "La barra está al día". La cancelación imprimió su incidencia con motivo, lo que confirma que
      el arreglo de **F08-03** también actúa sobre pedidos en estado `ready`, no sólo `preparing`.

### Pruebas unitarias

- [x] F05-U1. La transición vivía embebida en una línea de `AppContext.markOrderReady`. Se extrajo a
      `markItemsPrepared` en `src/domain/order.ts` (refactor sin cambio de comportamiento) y se
      cubrió con **5 casos**: convierte sólo lo despachado, deja intacto lo `pending`, no revive lo
      `cancelled`, es idempotente y no muta el arreglo recibido. Reverificado en el navegador con el
      pedido #1050, que tenía un Espresso despachado y un Latte pendiente: tras marcar listo, el
      Espresso quedó `prepared` y el Latte siguió `pending`.

### Ficha PDF

- [x] F05-D1. `docs/qa/fichas/F05-preparacion.html` redactado
- [x] F05-D2. `docs/qa/pdf/F05-preparacion.pdf` generado con Chrome (Skia), revisado visualmente

---

## F06 · Pedidos y entrega

**Rutas:** `/pedidos` · **Archivos:** `src/pages/OrdersPage.tsx`, `AppContext.finalizeOrder` ·
**Pasada:** A · **Rol:** ambos

### Pruebas en navegador

> **Pasada A completada (20/08).** Se encontraron y corrigieron tres hallazgos reales: el ticket
> imprimía el método de pago sin traducir (**F06-01**), el buscador no encontraba por el destino que
> muestra la propia tabla y no había estado vacío (**F06-02**), y la lista se ordenaba por un dato
> que no se ve (**F06-03**).

- [x] F06-P1. La pantalla es un **historial**, no sólo pedidos activos: lista abiertos, en
      preparación, listos, cobrados, cancelados y revertidos, cada uno con folio, fecha y hora,
      destino, estado, estado de sincronización, total y acciones (ver / cancelar). Las canceladas
      muestran además su motivo bajo el estado.
- [x] F06-P2. Existen dos filtros y **ambos funcionan**: por estado (con "Listos" quedaron sólo
      #1047 y #1043) y por texto sobre folio, mesa o nombre (con "QA-19" quedó sólo #1046, con
      "1047" sólo esa). No hay agrupaciones.
- [x] F06-P3. El botón de ojo abre la cuenta correspondiente en `/venta/:id`.
- [x] F06-P4. "Finalizar orden" pasó #1047 a `served`; la cabecera cambió a "Lista para cobrar" y el
      botón principal a "Cobrar". No imprime nada en este paso, lo correcto: el ticket sale al
      cobrar.
- [x] F06-P5. Un pedido servido **no puede volver a preparación** y tampoco admite productos: el
      selector de catálogo desaparece y en su lugar sale "Orden finalizada, lista para cobrar · Ya
      no se pueden agregar productos. Usa el botón «Cobrar» para registrar el pago". Esto confirma
      **en pantalla** lo que F07-P14 sólo había verificado leyendo el código.

### Funcionalidades conectadas a verificar

- [x] F06-C1. #1047 apareció en `/cobros` como "Lista para cobrar" por $48.00, y desapareció al
      cobrarse.
- [ ] F06-C2. La migración `20260817162350_order_served_status.sql` respalda este estado en el
      servidor: en pasada B confirmar que el estado `served` viaja y regresa igual (F16).

### Pruebas unitarias

- [x] F06-U1. **Confirmado que faltaba**: los 14 casos no tocaban `served` ni un estado
      desconocido. Se añadieron **2 casos**. Contrato real encontrado y ahora documentado en la
      prueba: `mapRemoteOrder` **no traduce estados**, hace `row.status as Order["status"]`
      (`remoteOrders.ts:62`). Consecuencias: (a) `served` viaja y regresa igual porque el literal
      del servidor y el del dominio coinciden —se prueban los siete estados—; (b) un estado nuevo
      del servidor **no rompe el mapeo, pero entra al modelo sin validar y sin avisar**, y el pedido
      simplemente no encajaría en ningún filtro de pantalla. Es tolerante, no defensivo. No se
      cambió el código: hoy el esquema lo controla este mismo proyecto, y endurecerlo el día de la
      entrega es riesgo innecesario.

### Ficha PDF

- [x] F06-D1. `docs/qa/fichas/F06-pedidos.html` redactado
- [x] F06-D2. `docs/qa/pdf/F06-pedidos.pdf` generado con Chrome (Skia)

---

## F07 · Cobro, descuento, propina y ticket

**Rutas:** `/cobros`, `/venta/:orderId` · **Archivos:** `src/pages/ReadyToChargePage.tsx`,
`src/pages/SalePage.tsx`, `AppContext` (`addPayment`, `closeOrder`, `setDiscount`),
`src/domain/money.ts`, `src/lib/printing.ts` · **Pasada:** A · **Rol:** ambos (descuento sólo gerente)

Es la funcionalidad con más riesgo de dinero. Revisar cada cifra a mano.

### Pruebas en navegador

- [x] F07-P1. `/cobros` filtra por estado `served`, calcula el total correcto y el formateador común
      muestra siempre dos decimales ($100.01 se ve como $100.01) → hallazgo **F07-02** corregido.
- [x] F07-P2. El pago exacto se registra y `closeOrder` cambia a `closed` cuando pagado ≥ total
      (verificado por lectura de código + pruebas de dominio).
- [x] F07-P3. El pago parcial conserva estado `served`; el modal sigue mostrando el saldo y no
      ofrece cierre mientras `balance > 0` (verificado por lectura de código; los centavos tienen
      la salvedad F07-02).
- [x] F07-P4. Un segundo pago puede usar tarjeta; ambos pagos conservan método y al cubrir el saldo
      se habilita el cierre (verificado por lectura de código + suma automatizada de parciales).
- [x] F07-P5. Importe 0 o negativo no llega a persistirse: lo rechazan `registerPayment` y
      `addPayment` con `amount <= 0` (verificado por lectura de código).
- [x] F07-P6. La propina se guarda en el pago y `paidTotal` suma sólo `amount`, no `tip` (verificado
      por prueba automatizada; la omisión de la propina en el ticket es F07-03).
- [x] F07-P7. Si el importe supera el saldo, el modal muestra el cambio y `addPayment` persiste sólo
      el saldo pendiente; Caja ya no suma el efectivo devuelto → hallazgo **F07-01** corregido.
- [x] F07-P8. Gerencia debe indicar motivo; el descuento se resta del subtotal y reduce el total
      (verificado por lectura de código + prueba automatizada).
- [x] F07-P9. `setDiscount` topa el importe con `orderSubtotal` y `orderTotal` nunca baja de 0
      (verificado por pruebas automatizadas).
- [x] F07-P10. `setDiscount` aplica `Math.max(0, amount)` y topa el negativo a 0 (verificado por
      lectura de código).
- [x] F07-P11. Para barista el botón está deshabilitado y el bloque del modal no se renderiza; el
      guard del contexto lanza exactamente "Sólo gerencia puede aplicar descuentos."
      (verificado por lectura de código).
- [x] F07-P12. El ticket incluye folio, líneas, descuento con motivo, total, métodos y propinas →
      hallazgo **F07-03** corregido y cubierto con pruebas unitarias.
- [x] F07-P13. La reimpresión funciona para una venta cerrada y el botón dice «Reimprimir» →
      hallazgo **F07-04** corregido.
- [x] F07-P14. Estados `served` y `closed` quedan fuera de `editableStatuses`: no se renderiza el
      selector ni controles de cantidad (verificado por lectura de código).

### Funcionalidades conectadas a verificar

- [x] F07-C1. Al cerrar, `isTracked` deja fuera la orden `closed`, de modo que `/salon` ya no la
      asocia con la mesa (verificado por lectura de código).
- [x] F07-C2. El pago efectivo queda registrado hasta el saldo pendiente y el cambio no se suma a
      Caja → hallazgo **F07-01** corregido; el arqueo real continúa pendiente para F09.
- [x] F07-C3. En demo `/reportes` usa órdenes locales; el cálculo separa bruta, descuento, neta y
      propina y topa contribuciones de pagos al total (verificado por lectura de código y pruebas de
      reportes; la pantalla con Supabase real queda para F13).
- [x] F07-C4. `printTicket` carga ancho, margen, escala, campos, pie, imagen y QR de la configuración
      local/universal antes de crear el documento (verificado por lectura de código y pruebas de
      impresión; sin impresora física).

### Pruebas unitarias

- [x] F07-U1. `src/domain/money.test.ts` ampliado a **16 casos**: descuento, tope al subtotal,
      líneas canceladas, pagos parciales, propina separada, precisión a centavos, formato MXN y
      tope del pago al saldo. Suite completa: **111 pruebas en verde**.
- [x] F07-U2. Regla de cierre cubierta contra `orderTotal` y `paidTotal`: un centavo por debajo no
      alcanza el umbral; un centavo por encima sí. Sin extraer ni refactorizar `closeOrder`.

### Ficha PDF

- [x] F07-D1. `docs/qa/fichas/F07-cobro.html` redactado originalmente con 4 hallazgos; los cuatro ya
      están corregidos en código. El PDF no se regeneró en esta pasada por alcance.
- [x] F07-D2. `docs/qa/pdf/F07-cobro.pdf` generado.

---

## F08 · Cancelación de cuenta y reversión de venta

**Rutas:** `/venta/:orderId` · **Archivos:** `src/pages/SalePage.tsx`,
`src/components/CancelOrderModal.tsx`, `AppContext` (`cancelOrder`, `reverseSale`),
`src/domain/order.ts` (`cancellableStatuses`) · **Pasada:** A **y** B · **Rol:** gerente para revertir

Los commits recientes tocaron precisamente esto (`Corrige reversión de ventas`,
`order_cancellation_incident`), así que es zona de riesgo conocido.

> **Pasada completada (18/08).** F08-P13 a F08-P18 (cancelación parcial de artículo) ya se habían
> verificado contra producción real durante la pasada de F04. El resto (P1-P12, C1-C4) se completó
> el 18/08: P1-P8 en modo demostración con pedidos nuevos (`QA-F08-*`), sin tocar los pedidos reales
> ya cacheados en el dispositivo; P9-P12 y C1/C2/C4 reutilizando la verificación en producción real
> ya hecha durante la pasada de F09 (misma orden #1080). Se encontraron y corrigieron dos hallazgos
> reales: la cancelación de cuenta no avisaba a la barra (F08-03) y la trazabilidad de "quién" no
> era visible en Reportes (F08-04).

### Pruebas en navegador

> **Requisito confirmado por el cliente (18/08):** cualquier rol puede cancelar una cuenta, **pero
> toda cancelación debe quedar registrada y ser rastreable** (quién, cuándo, qué motivo, qué
> importe). Verificarlo es obligatorio para dar F08 por buena — ver F08-P9 a F08-P12.

- [x] F08-P1. Cancelar una cuenta **abierta**: exige motivo (verificado con motivo vacío
      deshabilitado); pasa a `cancelled` y el motivo queda guardado. Pedido de prueba QA-F08-P1.
- [!] F08-P2. **No se comportaba como se esperaba** → hallazgo nuevo **F08-03**, corregido en esta
      misma pasada: cancelar una cuenta con artículos ya despachados/preparados no imprimía ninguna
      incidencia para la barra (`performOrderAction` nunca llamaba a `printCommand`). Corregido y
      verificado dos veces en el navegador: ahora imprime «CANCELACIÓN» con el motivo.
- [x] F08-P3. Cancelar una cuenta **cerrada** → no se permite: el menú no ofrece la opción
      (`cancellableStatuses` no incluye `closed`), verificado en pantalla sobre una venta real recién
      cobrada.
- [x] F08-P4. Motivo vacío → botón deshabilitado, verificado en pantalla.
- [x] F08-P5. Revertir una venta cerrada como gerente: exige motivo, pasa a `reversed` y el motivo
      queda guardado (`discountReason: "Reversión: ..."`). Verificado con una venta real cerrada y
      cobrada en esta misma pasada.
- [x] F08-P6. **Verificado por código y permisos, no con sesión de barista en vivo** (mismo criterio
      aceptado en F09-P14): el guard de `AppContext.reverseSale` lanza "Sólo gerencia puede revertir
      ventas." para cualquier rol distinto de manager, y el servidor repite la comprobación
      (`if not private.is_manager() then raise exception 'Manager role required'`).
- [x] F08-P7. Revertir una venta **no cerrada** → rechazado: el botón "Revertir venta" sólo se
      renderiza cuando `order.status === "closed"` (confirmado en el código); el dominio repite la
      comprobación.
- [x] F08-P8. Revertir dos veces la misma venta: tras la primera reversión el menú ya no ofrece
      "Revertir venta" (el estado pasó a `reversed`, no `closed`) — verificado en pantalla sobre la
      misma venta de la prueba anterior.

**Cancelación parcial (funcionalidad añadida en F04, verificar contra servidor):**

> **Pasada B ejecutada el 18/08** con sesión real (`gerente`) sobre el pedido de prueba
> `#1045 · QA-18AGO-F04`. Las 23 operaciones encoladas sincronizaron **sin una sola en
> «por revisar»**. Consultas hechas contra la base real importando el cliente de la propia
> aplicación, sin manipular claves.

- [x] F08-P13. Línea partida persistida en el servidor: `order_items` conserva el Espresso de
      **2 unidades `dispatched`** y el de **1 `cancelled`** con su motivo. Confirmado consultando
      `order_items`, no la caché local.
- [x] F08-P14. Cada anulación genera **su propia fila en `incidents`** con el importe de las
      unidades anuladas ($48 por 1 unidad, no $144 por la línea). **Pero** el importe excluye los
      extras → hallazgo **F08-01**, corregido el 18/08 con migración aplicada a producción.
- [x] F08-P15. Segunda anulación sobre la misma línea con motivo distinto: la línea bajó de 2 a 1 y
      quedaron **4 incidencias independientes**; ninguna pisó a la anterior. Es exactamente lo que
      la división de la línea pretendía garantizar.
- [x] F08-P16. Las anulaciones de artículo aparecen en la nueva sección de incidencias de
      `/reportes`, con folio enlazado, tipo, motivo, importe y fecha → hallazgo **F08-02** corregido.
- [x] F08-P17. Folio: el servidor **respetó el folio local 1045** porque seguía libre (los folios más
      altos eran 1063, 1061, 1056), tal como documenta `reserveFolio`.
- [x] F08-P18. Limpieza: pedido #1045 cancelado con motivo `QA - prueba de entrega`; queda como
      registro auditable y fuera de la cola de la barra.

**Trazabilidad de la cancelación (requisito del cliente):**

- [x] F08-P9. Cualquier rol puede cancelar (confirmado desde F01-04, decisión del cliente); el
      motivo queda guardado en `order.cancellationReason` y visible al reabrir la cuenta
      (verificado en F08-P1).
- [x] F08-P10. **Hallazgo real encontrado y corregido en esta pasada → F08-04.** El motivo sí queda
      guardado, pero **quién** lo hizo no se mostraba en ningún lado visible para gerencia: la tabla
      de Incidencias de `/reportes` (agregada en F08-02) no incluía el empleado, aunque el dato ya
      existía en `incidents.created_by`. Se agregó el join a `staff_profiles` y la columna
      "Empleado" — **verificado en producción real**: las 6 incidencias de prueba mostraron
      "Gerente" correctamente. Cuándo ya estaba cubierto por la columna Fecha.
- [x] F08-P11. La cuenta cancelada aparece en `/reportes` → Incidencias, con folio enlazado a
      `/venta/:id`, tipo, motivo, importe y fecha (F08-02); ahora también el empleado (F08-04).
- [x] F08-P12. **[Requiere B]** Confirmado en producción real: la cancelación (`incident_type =
      'order_cancellation'`) y la reversión (`sale_reversal`) generan su fila en `incidents` con
      `created_by`, `created_at`, `reason` y `amount_cents`, visibles tras recargar `/reportes`.

### Funcionalidades conectadas a verificar — **la parte más importante de F08**

- [x] F08-C1. **Verificado en producción real dentro de la pasada de F09** (F09-P9): cobrar $48 en
      efectivo subió el esperado a $998, revertir la venta lo devolvió exacto a $950. La exclusión
      de `reversed`/`cancelled` en `CashPage.tsx` funciona en la práctica, no sólo en el código.
      `cancelled` no se probó explícitamente ahí, pero comparte la misma condición SQL que
      `reversed`, ya confirmada.
- [x] F08-C2. **Verificado en producción real** en esta misma pasada: la reversión de la orden
      #1080 aparece en `/reportes` con `netSales` en negativo para el periodo — visible como
      "Reversiones $48.00" en las métricas y como fila "Reversión de venta" en Incidencias. Cubierto
      también a nivel de cálculo puro por las pruebas de `reports.test.ts` (F08-U2).
- [x] F08-C3. La mesa se libera al cancelar: cubierto por `isTracked`/`trackedStatuses`, que excluye
      `cancelled` y `reversed` — el mismo mecanismo ya verificado para `closed` en F07-C1.
- [x] F08-C4. **[Requiere B] Confirmado en producción real** dentro de la pasada de F09 (F09-P9): la
      migración `20260818120000_reverse_sale_and_cash_reversal_fix.sql` está aplicada y el efecto de
      la reversión sobre el esperado de Caja persistió tras recargar la página.

### Pruebas unitarias

- [x] F08-U1. **Ya cubierto** por `src/domain/order.test.ts`, prueba
      "allows cancelling every live status and refuses settled ones": recorre los 7 estados posibles
      y confirma que `isCancellable` acepta exactamente `open`/`preparing`/`ready`/`served` y
      rechaza `closed`/`reversed`/`cancelled`. No hizo falta agregar nada.
- [x] F08-U2. **Ya cubierto**, y de forma más estricta de lo pedido: `reports.test.ts` línea 34-47
      prueba una venta revertida con `netSales.value` en **-90** (negativo, no sólo "menor") y
      `grossSales.value` en 0 para esa venta; línea 49-55 prueba que una cancelada se cuenta en
      `cancellations.value` sin afectar `grossSales` de la venta cerrada junto a ella (las
      canceladas nunca tienen `closedAt`, así que `closedInRange` las excluye por construcción). No
      hizo falta agregar nada.

### Ficha PDF

- [x] F08-D1. `docs/qa/fichas/F08-cancelacion-y-reversion.html` redactado
- [x] F08-D2. `docs/qa/pdf/F08-cancelacion-y-reversion.pdf` generado

---

## F09 · Caja y arqueo · **[Requiere B]**

**Rutas:** `/caja` · **Archivos:** `src/pages/CashPage.tsx`, RPC `open_cash_session`,
`record_cash_movement`, `close_cash_session` · **Pasada:** B · **Rol:** ambos (verificar restricción)

> **Pasada en vivo completada (18/08).** El 18/08 se hizo la pasada B en vivo contra Supabase real
> con sesión de gerente. Antes de empezar apareció un turno real abierto desde el 17/08 (fondo
> $2,000, esperado $2,476) que no era de esta revisión; el responsable del proyecto confirmó que
> también era de prueba y se cerró con corte administrativo (contado = esperado, sin conteo físico)
> para partir de un estado limpio. A partir de ahí se ejecutaron los 14 casos con turnos y
> movimientos propios, todos con notas prefijadas `QA-F09`, y se dejó Caja sin ningún turno abierto
> al terminar.

### Pruebas en navegador

- [x] F09-P1. Tras cerrar un turno, la pantalla muestra "Sin turno abierto", sin movimientos, y sólo
      ofrece "Abrir turno".
- [x] F09-P2. Abierto con fondo $1,000.00 → turno creado; resumen muestra Fondo $1,000.00, Efectivo
      en ventas $0.00, Retiros $0.00, Esperado $1,000.00.
- [x] F09-P3. Abierto con fondo `0` → permitido; el botón "Abrir turno" no estaba deshabilitado y el
      turno se creó con Fondo $0.00.
- [x] F09-P4. Con un turno abierto, se llamó `open_cash_session` una segunda vez directamente contra
      Supabase (no sólo la interfaz) → rechazado por la propia base de datos:
      `duplicate key value violates unique constraint "one_open_cash_session"`.
- [x] F09-P5. Retiro de $50 con nota "QA-F09 verificacion retiro" → apareció en "Movimientos del
      turno" con `-$50.00` y el esperado bajó de $1,000.00 a $950.00.
- [x] F09-P6. **Corregido tras reverificar** (ver F09-02 retractado en §0.7): el primer intento dio
      falso positivo por consultar `document.querySelectorAll('button')` sin acotar al modal, y
      capturó el botón del encabezado (que sólo abre el modal) en vez del botón de envío. Acotando a
      `[role=dialog]`: deshabilitado sin datos, deshabilitado con sólo importe, habilitado con
      importe y nota — confirmado con un retiro real completado sin error.
- [x] F09-P7. Confirmado en P2/P5/P8: las cuatro métricas (fondo, efectivo en ventas, retiros,
      esperado) se actualizan correctamente en cada paso.
- [x] F09-P8. Se cobró una orden real (#1080, para llevar "QA-F09-caja") por $48.00 en efectivo →
      Efectivo en ventas subió a $48.00 y el esperado a $998.00 ($950 + $48).
- [x] F09-P9. Se revirtió esa misma orden con gerencia → Efectivo en ventas volvió a $0.00 y el
      esperado volvió exactamente a $950.00. El arreglo del commit `20260818120000` sigue vigente.
- [x] F09-P10. Se cerró el turno original (17/08) con contado = esperado ($2,476.00 = $2,476.00) →
      "El conteo coincide exactamente con lo esperado.", diferencia $0.
- [x] F09-P11. Turno de $950.00 esperado cerrado con $900.00 contados → "Faltante de $50.00 respecto
      a lo esperado."
- [x] F09-P12. Turno de $0.00 esperado (abierto con fondo 0) cerrado con $25.00 contados → "Sobrante
      de $25.00 respecto a lo esperado."
- [x] F09-P13. Después de cada cierre la pantalla volvió a "Sin turno abierto" / "Abrir turno"; no
      quedó ningún turno cerrado editable ni turno huérfano al terminar la pasada.
- [x] F09-P14. **Verificado por permisos de base de datos, no por sesión de barista en vivo** (el
      responsable del proyecto decidió que bastaba con esto): `open_cash_session`,
      `record_cash_movement` y `close_cash_session` sólo exigen el rol `authenticated` de Supabase
      (`grant execute ... to authenticated`), sin ninguna comprobación de rol manager/barista dentro
      de las funciones ni RLS adicional. `/caja` está fuera de `ManagerOnly`. Todo indica que un
      barista puede operar caja igual que gerencia.

### Funcionalidades conectadas a verificar

- [x] F09-C1. **Verificado por lectura de código:** la consulta limita los pagos a
      `method = "cash"`; tarjeta y transferencia no entran (`src/pages/CashPage.tsx:181-191`).
- [x] F09-C2. **Verificado por lectura de código:** la pantalla y la RPC vigente excluyen órdenes
      `reversed` y `cancelled` (`src/pages/CashPage.tsx:183-191`,
      `supabase/migrations/20260818120000_reverse_sale_and_cash_reversal_fix.sql:209-216`).
- [x] F09-C3. Caja y Reportes conservan sus delimitaciones legítimamente distintas: efectivo físico
      del turno frente a ingresos netos del día. La interfaz de Caja ahora explica que una reversión
      de una venta cobrada en un turno anterior sólo aparece en Reportes → hallazgo **F09-01**
      aclarado sin cambiar consultas ni fórmulas. El sobrepago de **F07-01** quedó corregido.

### Pruebas unitarias

- [x] F09-U1. `src/domain/cash.ts` extrae el resumen (fondo + ventas efectivo − retiros/ajustes) y
      la diferencia/clasificación del conteo. `src/domain/cash.test.ts`: **6 casos** — turno recién
      abierto, retiros mayores al fondo (el esperado puede ser negativo), ventas efectivo con
      retiros y ajustes, conteo exacto, faltante y sobrante. Suite total: **103 pruebas en verde**.

### Ficha PDF

- [x] F09-D1. `docs/qa/fichas/F09-caja.html` redactado; distingue la revisión estática de los 14
      casos pendientes de sesión real.
- [x] F09-D2. `docs/qa/pdf/F09-caja.pdf` generado y revisado visualmente.

---

## F10 · Catálogo: categorías, productos, variantes, extras y recetas

**Rutas:** `/catalogo` · **Archivos:** `src/pages/CatalogPage.tsx`, `AppContext` (create/update/delete
de producto, extra y categoría, `uploadProductImage`), RPC `replace_inventory_recipe` ·
**Pasada:** A **y** B · **Rol:** sólo gerente

### Pruebas en navegador (pasada A)

> **Pasada A completada (20/08).** Se encontró y corrigió un hallazgo real de precios (**F10-01**).
> Todo lo creado en la prueba (categoría, producto y extra `QA-19AGO-*`) quedó eliminado al final:
> el catálogo volvió a 33 productos, 7 categorías y 3 extras.

- [x] F10-P1. Categoría `QA-19AGO-Cat` creada; aparece en la lista y recibe la **posición 7**, la
      siguiente libre (comportamiento correcto de la corrección F02-01).
- [x] F10-P2. Renombrada a `QA-19AGO-Renombrada` mediante edición en línea. **Conservó su posición**
      — verificación en vivo del segundo arreglo de F02-01, que evitaba que el menú se reordenara al
      renombrar una categoría.
- [x] F10-P3. **Comportamiento real, mejor que el esperado:** no hace falta el mensaje de error con
      el conteo porque **el botón "Eliminar" está deshabilitado** en toda categoría con productos, y
      la propia tarjeta avisa "Mueve o elimina sus productos antes de borrarla". Verificado sobre
      «Café» (11 productos): Eliminar `disabled`; sobre la categoría vacía: habilitado.
- [x] F10-P4. La categoría vacía se eliminó y el total volvió a 7.
- [x] F10-P5. Producto `QA-19AGO Bebida` creado con nombre, categoría (Frías), precio, descripción,
      disponibilidad y bandera de temporada. Aparece **en orden alfabético** entre «Pastel» y
      «Sándwich de pavo» (la lista completa de 34 quedó ordenada).
- [x] F10-P6. Creado con dos presentaciones (Chico $50 / Grande $65); **ambas se ofrecen** en el
      selector del pedido con su precio.
- [x] F10-P7. **Verificado explícitamente, en las dos direcciones.** Con el pedido #1051 ya
      capturado a $65.00 se subió el precio de «Grande» a $99.00: el pedido existente **siguió en
      $65.00** y un pedido nuevo cobró **$99.00**. El precio se congela en la línea al capturarla.
- [x] F10-P8. Quitada la presentación «Chico»: deja de ofrecerse y en el selector sólo queda
      «Grande».
- [x] F10-P9. **Ya verificado en F02-C3:** el producto no disponible desaparece del selector y no se
      puede agregar. Se oculta por completo, no se muestra atenuado.
- [x] F10-P10. Marcar «de temporada» mueve el producto a la pestaña **Temporada** del selector (con
      icono de destello junto al nombre); sigue estando en su categoría.
- [x] F10-P11. Eliminado el producto: desaparece del catálogo (vuelta a 33) **pero el pedido #1051
      lo sigue mostrando** con su nombre, presentación y precio de $65.00, porque la línea guarda su
      propia copia. En el servidor es **baja lógica** (`products.active = false`,
      `AppContext.tsx:481`); en el dispositivo se borra de la caché.
- [x] F10-P12. Extra `QA-19AGO Extra` creado a $12.00, editado a `QA-19AGO Extra editado` y $18.00,
      y eliminado. Los 3 extras originales quedaron intactos.
- [x] F10-P13. PNG válido de 11 KB: sin error, vista previa correcta y, al guardar, la imagen
      persiste y **se muestra en la tarjeta del selector de productos**. En modo demostración se
      guarda como `data:` en el dispositivo; con Supabase iría a Storage.
- [x] F10-P14. Archivo `.txt`: «La imagen debe ser PNG o JPEG.»
- [x] F10-P15. PNG de 3.2 MB: «La imagen no debe pesar más de 2 MB.»
- [x] F10-P16. **Ya cubierto en F01-P8:** el barista no accede a `/catalogo`; la ruta redirige a
      `/inicio` sin mostrar contenido.

### Pruebas en navegador (pasada B) **[Requiere B]**

- [ ] F10-P17. Con conexión, crear producto → confirmar en Red que el `insert` a `products` responde
      201 y que tras recargar el producto sigue ahí.
- [ ] F10-P18. Sin conexión (DevTools Offline) con Supabase configurado, intentar crear producto →
      "Necesitas conexión para modificar el catálogo." El catálogo **no** es offline-first, a
      diferencia de los pedidos. Documentarlo como límite conocido.
- [ ] F10-P19. Editar la **receta de insumos** de un producto/variante → `replace_inventory_recipe`
      responde sin error y la receta persiste tras recargar.
- [ ] F10-P20. Imagen subida a Storage: la URL pública abre en una pestaña nueva.

### Funcionalidades conectadas a verificar

- [ ] F10-C1. Los cambios aparecen en el selector de productos de `/venta/nueva` (F02).
- [ ] F10-C2. Las recetas alimentan el consumo teórico de `/insumos` y `/reportes` (F12, F13).
- [ ] F10-C3. Un producto dado de baja no rompe los reportes históricos (F13).

### Pruebas unitarias

- [x] F10-U1. **No aplica tal como está planteado, y conviene dejarlo escrito.** `inventory.ts` no
      calcula recetas: recibe el consumo teórico ya resuelto (`expected`), y ese dato lo produce
      **el servidor** a partir de `inventory_usage_lines` (`InventoryPage.tsx:91-93`). En el cliente
      no hay lógica de receta por variante que probar. La verificación de que la receta por variante
      alimenta bien el consumo teórico es, por tanto, una prueba **de pasada B**, y queda cubierta
      por F10-P19 y F12-C1.
- [x] F10-U2. Guard extraído de `uploadProductImage` a `productImageError` en `src/domain/catalog.ts`
      (con la constante `PRODUCT_IMAGE_MAX_BYTES`), cubierto con **4 casos**: formatos válidos en el
      límite exacto de 2 MB, tipos rechazados (texto, GIF y tipo vacío), tamaño excedido, y el orden
      de los avisos —un archivo enorme del tipo equivocado se queja primero del formato, que es lo
      accionable. Reverificado en el navegador tras el refactor: subir el PNG de 3.2 MB sigue dando
      «La imagen no debe pesar más de 2 MB.»

### Ficha PDF

- [x] F10-D1. `docs/qa/fichas/F10-catalogo.html` redactado
- [x] F10-D2. `docs/qa/pdf/F10-catalogo.pdf` generado con Chrome (Skia)

---

## F11 · Mesas (gestión del croquis)

**Rutas:** `/mesas` · **Archivos:** `src/pages/TablesPage.tsx`, `AppContext` (`addTable`,
`updateTable`, `nextFreeSlot`) · **Pasada:** A **y** B · **Rol:** sólo gerente

### Pruebas en navegador

> **Pasada A completada (20/08).** Se encontró y corrigió un hallazgo real: se podía dar de baja
> una mesa con la cuenta abierta (**F11-01**). Las 6 mesas de prueba se eliminaron al terminar; el
> croquis volvió a sus 8 mesas originales.

- [x] F11-P1. La mesa nueva recibió el número consecutivo `t9` y se colocó en (44, 12), un hueco
      libre entre las mesas 2 y 3, sin encimarse.
- [x] F11-P2. Seis mesas seguidas (t9 a t14): **cero superposiciones**, comprobado midiendo todas
      las parejas con la misma tolerancia que usa el algoritmo.
- [x] F11-P3. Asientos de 2 a 6: se guarda y se refleja en el croquis.
- [x] F11-P4. Forma cambiada a rectangular: se guarda y la mesa se dibuja más ancha que alta
      (145×97 px).
- [x] F11-P5. Mesa arrastrada de (38, 76) a (65.4, 68.6): la posición **persiste tras recargar**,
      junto con asientos y forma. El arrastre no abre el editor, así que distingue bien mover de
      tocar.
- [x] F11-P6. Mesa libre dada de baja → desaparece de `/salon` y el contador se ajusta (ya
      verificado en F03-P8).
- [x] F11-P7. **Hallazgo real → F11-01.** Se permitía dar de baja una mesa con una cuenta abierta de
      $48.00, sin ningún aviso ni en el croquis ni en el editor. La cuenta **no se pierde** —sigue
      `open` y se alcanza desde `/pedidos`, que conserva su enlace— pero desaparece del salón, que
      es donde el equipo trabaja, con el riesgo real de que nadie llegue a cobrarla. Corregido.
- [x] F11-P8. Reactivar una mesa dada de baja la devuelve al croquis con su posición.
- [ ] F11-P9. **[Requiere B]** Con conexión, los cambios llegan a `cafe_tables` (verificar en Red) y
      persisten tras recargar.
- [ ] F11-P10. **[Requiere B]** Sin conexión: `updateTable` escribe local pero no en el servidor —
      confirmar si queda inconsistencia al reconectar. Nota: a diferencia de los pedidos, las mesas
      **no pasan por la cola de sincronización**. Documentarlo como límite.

### Funcionalidades conectadas a verificar

- [x] F11-C1. Alta, baja y reactivación de mesas se reflejan de inmediato en `/salon` (verificado en F03-P8).
- [x] F11-C2. El selector de `/venta/nueva` sólo ofrece mesas activas y libres: las ocupadas salen `disabled` y las dadas de baja no se dibujan (verificado en F02-P10 y F03-P3).

### Pruebas unitarias

- [x] F11-U1. `nextFreeSlot` extraída de `AppContext.tsx` a `src/domain/tables.ts`, junto con las
      tolerancias y la posición de reserva como constantes con nombre. **6 casos**: primera mesa en
      el inicio de la rejilla, respeto de las tolerancias, mesas inactivas que no ocupan lugar, seis
      mesas seguidas sin encimarse (el mismo caso de F11-P2), croquis lleno que cae en el centro, y
      veinte colocaciones sin salirse del plano. Reverificado en el navegador tras el refactor:
      agregar una mesa da exactamente la misma posición (44, 12) que antes del cambio.

### Ficha PDF

- [x] F11-D1. `docs/qa/fichas/F11-mesas.html` redactado
- [x] F11-D2. `docs/qa/pdf/F11-mesas.pdf` generado con Chrome (Skia)

---

## F12 · Insumos · **[Requiere B]**

**Rutas:** `/insumos` · **Archivos:** `src/pages/InventoryPage.tsx`, `src/domain/inventory.ts`,
RPC `record_inventory_count`, `record_inventory_movement` · **Pasada:** B · **Rol:** sólo gerente

### Pruebas en navegador

- [ ] F12-P1. Crear insumo `QA-18AGO-Leche` con unidad, mínimo y tolerancia.
- [ ] F12-P2. Registrar el **conteo de línea base**; el insumo deja de decir "pendiente de línea
      base".
- [ ] F12-P3. Registrar una **entrada** con nota → aparece en "Últimos registros" con flecha arriba.
- [ ] F12-P4. Registrar una **merma** con nota → aparece con flecha abajo.
- [ ] F12-P5. Entrada/merma sin nota o con cantidad 0 → rechazada.
- [ ] F12-P6. Registrar un segundo conteo → la tabla "Consumo contado vs. receta teórica" ya calcula
      físico, teórico y diferencia.
- [ ] F12-P7. Un insumo con existencia por debajo del mínimo muestra la etiqueta **Reponer** en rojo.
- [ ] F12-P8. Una diferencia fuera de la tolerancia se marca en rojo (`isInventoryVarianceAlert`).
- [ ] F12-P9. Abrir el detalle de un insumo → historial de conteos y movimientos.
- [ ] F12-P10. Con un solo conteo, la fila dice "Falta línea base o segundo conteo" y no inventa
      números.
- [ ] F12-P11. Offline: registrar un conteo sin conexión → queda encolado y se sincroniza al volver
      (a diferencia del catálogo, los insumos **sí** pasan por `offline.ts`). Verificar la
      idempotencia: no debe duplicarse al reintentar (F16).

### Funcionalidades conectadas a verificar

- [ ] F12-C1. El consumo teórico proviene de las recetas de `/catalogo` (F10): vender un producto con
      receta debe aumentar el teórico.
- [ ] F12-C2. **Las ventas no descuentan existencias** — la propia interfaz lo declara. Confirmarlo y
      dejarlo escrito en el PDF como límite deliberado, no como error.
- [ ] F12-C3. El mismo indicador aparece en `/reportes` con los mismos números (F13).

### Pruebas unitarias

- [ ] F12-U1. `src/domain/inventory.test.ts` (8 casos). **Ampliar** con: variación exactamente en el
      límite de la tolerancia (no debe alertar); variación un decimal por encima (sí alerta);
      insumo sin conteos; conteos desordenados en el tiempo.

### Ficha PDF

- [ ] F12-D1. `docs/qa/fichas/F12-insumos.html` redactado
- [ ] F12-D2. `docs/qa/pdf/F12-insumos.pdf` generado

---

## F13 · Reportes · **[Requiere B]**

**Rutas:** `/reportes` · **Archivos:** `src/pages/ReportsPage.tsx`, `src/domain/reports.ts` (444
líneas, el módulo de cálculo más grande) · **Pasada:** B · **Rol:** sólo gerente

Es lo que el cliente va a mirar primero. Cada cifra debe cuadrar con una suma hecha a mano.

### Pruebas en navegador

- [ ] F13-P1. Filtro por rango de fechas: hoy, semana, rango personalizado.
- [ ] F13-P2. Filtro por tipo (mesa / para llevar / todos).
- [ ] F13-P3. Filtro por empleado.
- [ ] F13-P4. **Venta neta del periodo = suma manual** de las ventas cerradas menos reversiones.
      Comprobarlo con lápiz sobre un día con pocas ventas.
- [ ] F13-P5. Métodos de pago: la suma de efectivo + tarjeta + transferencia = venta neta.
- [ ] F13-P6. Ventas por hora: las barras suman el total del periodo.
- [ ] F13-P7. Ventas por día: los tickets y el neto por día cuadran con el detalle.
- [ ] F13-P8. Productos más vendidos / menos vendidos, por unidades y por ingreso: alternar los
      cuatro cruces y verificar que el orden cambia coherentemente.
- [ ] F13-P9. Tabla de detalle auditable: cada fila muestra folio, evento, empleado, tipo, bruta,
      reversión, neta y propina.
- [ ] F13-P10. Paginación del detalle: anterior/siguiente, y los botones se deshabilitan en los
      extremos.
- [ ] F13-P11. El enlace del folio abre la venta correspondiente en `/venta/:id`.
- [ ] F13-P12. Una **venta revertida** aparece con reversión en rojo y neta negativa o neutra.
- [ ] F13-P13. Una **venta cancelada** aparece con su etiqueta y no suma a la venta.
- [ ] F13-P14. Periodo sin datos → estado vacío con mensaje, no ceros confusos ni error.
- [ ] F13-P15. Impresión del reporte: `Cmd+P` — las secciones marcadas `print:hidden` se ocultan y el
      resultado es legible en papel.
- [ ] F13-P16. Rendimiento con el límite de 1000 registros: verificar que la página no se congela.

### Funcionalidades conectadas a verificar

- [ ] F13-C1. Los totales cuadran con el arqueo de `/caja` para el mismo turno (F09) — al menos en
      efectivo.
- [ ] F13-C2. Los descuentos aplicados en F07 se ven reflejados en la venta neta.
- [ ] F13-C3. El indicador de insumos coincide con `/insumos` (F12).
- [ ] F13-C4. Los nombres de empleado provienen de `staff_profiles` (F14).

### Pruebas unitarias

- [ ] F13-U1. `src/domain/reports.test.ts` (11 casos) para 444 líneas de lógica es poco. **Ampliar**
      con: agrupación por día cruzando medianoche; agrupación por hora; ranking de productos con
      empates; periodo vacío; venta revertida **fuera** del rango cuyo cierre sí está dentro (y
      viceversa) — este último es el caso donde más fácil se equivocan los reportes.

### Ficha PDF

- [ ] F13-D1. `docs/qa/fichas/F13-reportes.html` redactado
- [ ] F13-D2. `docs/qa/pdf/F13-reportes.pdf` generado

---

## F14 · Personal · **[Requiere B]**

**Rutas:** `/personal` · **Archivos:** `src/pages/PeoplePage.tsx`, Edge Function
`supabase/functions/manage-staff` · **Pasada:** B · **Rol:** sólo gerente

Depende de una Edge Function desplegada. **Primero verificar que está desplegada**; si no lo está,
todo F14 falla por infraestructura, no por código.

### Pruebas en navegador

- [ ] F14-P0. Confirmar que `manage-staff` está desplegada (`npx supabase functions list`).
- [ ] F14-P1. La lista muestra el personal con usuario, nombre, rol y estado.
- [ ] F14-P2. Crear un empleado `QA-18AGO-user` con rol barista → aparece en la lista.
- [ ] F14-P3. Iniciar sesión con ese usuario nuevo en una ventana de incógnito → entra con permisos
      de barista (cruce con F01).
- [ ] F14-P4. Crear empleado con usuario **duplicado** → error claro, no crea.
- [ ] F14-P5. Crear empleado con PIN inválido (muy corto / no numérico) → validación.
- [ ] F14-P6. **Restablecer PIN** de ese empleado → el PIN viejo deja de funcionar y el nuevo sí.
- [ ] F14-P7. El contador de restablecimientos de PIN (que lee `audit_log`) sube en uno.
- [ ] F14-P8. **Desactivar** al empleado → al intentar entrar, "Este acceso está desactivado."
- [ ] F14-P9. Reactivarlo → vuelve a entrar.
- [ ] F14-P10. Cambiar el rol de barista a gerente → tras volver a entrar, ve el menú de Gestión.
- [ ] F14-P11. Intentar desactivar la **propia** cuenta del gerente conectado → documentar qué pasa
      (si se permite y deja al sistema sin gerente, es un hallazgo **alto**).

### Funcionalidades conectadas a verificar

- [ ] F14-C1. Los nombres aparecen como "empleado que cerró" en `/reportes` (F13).
- [ ] F14-C2. El rol asignado aquí controla `ManagerOnly` y los guards del contexto (F01).
- [ ] F14-C3. El `audit_log` registra los restablecimientos de PIN.

### Pruebas unitarias

- [ ] F14-U1. Sin backend no hay mucho puro que probar. Cubrir la normalización de usuario a email
      interno (compartida con F01-U1) y, si existe, la validación de formato de PIN.

### Ficha PDF

- [ ] F14-D1. `docs/qa/fichas/F14-personal.html` redactado
- [ ] F14-D2. `docs/qa/pdf/F14-personal.pdf` generado

---

## F15 · Configuración e impresión térmica

**Rutas:** `/configuracion`, `/configuracion/impresion` · **Archivos:**
`src/pages/SettingsPage.tsx`, `src/pages/PrinterSettingsPage.tsx`, `src/lib/printerSettings.ts`,
`src/lib/printing.ts`, `src/lib/browserPrinting.ts`, `src/lib/ticketDesign.ts` ·
**Pasada:** A (+ B para persistir el diseño) · **Rol:** sólo gerente

Ver `docs/IMPRESION_TERMICA.md` y la guía de QZ Tray. **Sin impresora física conectada, lo que se
prueba es el respaldo por navegador y que la ausencia de impresora no rompa nada.**

### Pruebas en navegador

> **Pasada A completada (20/08).** Se encontró y corrigió un hallazgo real y grave para el papel de
> 58 mm (**F15-01**). **Cambio de premisa respecto al plan original:** el proyecto **ya no usa QZ
> Tray**; la propia pantalla lo dice ("no requiere QZ Tray, certificados ni servicios locales
> adicionales") e imprime con el diálogo nativo del navegador. Los casos P5 y P6 se leen bajo esa
> premisa.

- [x] F15-P1. `/configuracion` carga y enlaza a impresión con «Configurar y probar».
- [x] F15-P2. Cambiar el ancho de papel reajusta el ancho útil y **la vista previa cambia de
      tamaño**: 58 mm → 48 mm útiles, 80 mm → 72 mm útiles.
- [x] F15-P3. Editar el pie del ticket se refleja **de inmediato en la vista previa**. (Nota de
      método: la vista previa vive dentro de un marco propio, así que hay que leer su documento, no
      el de la página.)
- [x] F15-P4. Tras «Guardar» y recargar, la configuración persiste: pie personalizado, ancho de
      papel y ancho útil. En modo demostración se guarda en el dispositivo
      (`vereda-printer-settings:v3` y `vereda-ticket-design:v1`).
- [x] F15-P5. **Reinterpretado:** no hay QZ Tray que pueda faltar. La impresión local del navegador
      se anuncia como "Lista para imprimir" y el ticket de prueba se generó **sin ningún error** en
      pantalla.
- [x] F15-P6. El respaldo por navegador funciona: genera el documento y lo manda al diálogo del
      sistema. Verificado interceptando la llamada de impresión, sin abrir el diálogo real.
- [x] F15-P7. Ticket de prueba a 58 mm con líneas largas, variante, nota con dos extras y descuento:
      **nada se corta**… salvo el método de pago, que sí se partía → hallazgo **F15-01**, corregido.
- [x] F15-P8. La comanda de cocina se genera aparte y es distinta del ticket: sin importes, con el
      identificador de lote.
- [x] F15-P9. **Cubierto fuera de esta pantalla** (aquí sólo hay botones de ticket y comanda): las
      incidencias de cancelación se capturaron íntegras en F05-P6 y F05-C3, con su encabezado
      «CANCELACIÓN», el artículo retirado y la línea `MOTIVO:`.
- [!] F15-P10. **No verificado: no hay impresora física disponible.** Todo lo anterior se comprobó
      sobre el documento que se manda a imprimir, no sobre papel. Queda como riesgo abierto para la
      entrega — ver la ficha.

### Funcionalidades conectadas a verificar

- [x] F15-C1. La comanda de F04 usa esta configuración: las comandas reales capturadas en F04, F05
      y F08 salieron con el mismo formato y ancho que la vista previa.
- [x] F15-C2. El ticket de F07 usa esta configuración: el ticket reimpreso de la venta #1047 llevó
      el pie configurado («Gracias por caminar con nosotros»).
- [x] F15-C3. La incidencia de F08 usa esta configuración: mismas medidas y tipografía, con los
      bloques «CANCELACIÓN» y `MOTIVO:` propios de la incidencia.

### Pruebas unitarias

- [x] F15-U1. Ampliado con los cuatro casos pedidos: **nombre larguísimo** que debe ajustarse sin
      desbordar los 48 mm útiles; **ticket con descuento con motivo y propina** a la vez; **comanda
      de cancelación** con su motivo y sin ningún importe (la barra no cobra); y **valores por
      defecto** sin configuración guardada. Más los 3 casos de F15-01 y F06-01 sobre la línea de
      pago. `printing.test.ts` pasó de 3 a **19 casos**. Suite total: **156 pruebas en verde**.
      **Detalle encontrado al escribirlas y dejado documentado en la propia prueba:** los dos
      valores por defecto no concuerdan entre sí —la firma toma papel de 80 mm, pero la
      configuración por defecto fija 48 mm útiles—, y gana la configuración. Es la opción
      conservadora (nunca se imprime más ancho del que el papel admite), así que se deja como está.

### Ficha PDF

- [x] F15-D1. `docs/qa/fichas/F15-impresion.html` redactado, con el antes/después del ticket roto
- [x] F15-D2. `docs/qa/pdf/F15-impresion.pdf` generado con Chrome (Skia)

---

## F16 · Offline y sincronización (transversal)

**Archivos:** `src/lib/offline.ts`, `src/lib/db.ts`, `src/lib/remoteOrders.ts`,
`src/components/SyncPill.tsx`, `AppContext` (`forceSync`, `persistOrder`), RPC
`sync_offline_operations` · **Pasada:** A **y** B · **Rol:** ambos

Es la funcionalidad que más se rompe en producción y la que menos se nota en una demo. Va al final
porque necesita datos generados por las anteriores.

### Pruebas en navegador

- [ ] F16-P1. Con conexión, el `SyncPill` dice "Todo sincronizado".
- [ ] F16-P2. Cortar la red (DevTools → Offline) → el indicador pasa a "Sin conexión" con el conteo
      de cambios.
- [ ] F16-P3. Offline: crear un pedido, agregarle productos y enviarlo a preparación → todo funciona
      y el contador de pendientes sube.
- [ ] F16-P4. Offline: recargar la página → los datos siguen ahí (IndexedDB) y la sesión se mantiene.
- [ ] F16-P5. Restaurar la red → sincroniza solo (evento `online` → `forceSync`) y el contador baja a
      cero.
- [ ] F16-P6. **[Requiere B]** Tras sincronizar, recargar y confirmar que el pedido existe en el
      servidor con los mismos importes y el mismo estado.
- [ ] F16-P7. **Idempotencia:** provocar un doble envío (sincronizar dos veces seguidas / recargar a
      medias) → el pedido **no** se duplica. La clave de idempotencia de `offline.ts` es lo que lo
      evita; es la prueba más importante de esta sección.
- [ ] F16-P8. Cobrar un pedido offline y sincronizar → el pago llega una sola vez y el arqueo no se
      duplica (cruce con F09).
- [ ] F16-P9. Provocar un conflicto (modificar el mismo pedido en dos pestañas, una offline) →
      verificar si el estado pasa a `review_required` y cómo se comunica al usuario.
- [ ] F16-P10. Con operaciones en `review_required`, el indicador dice "Hay operaciones por revisar"
      — comprobar si existe alguna manera de resolverlas desde la interfaz. Si no la hay, es un
      límite que debe quedar escrito en el PDF.
- [ ] F16-P11. **[Requiere B]** Tiempo real: con dos ventanas abiertas y sesión iniciada, un cambio
      en una debe reflejarse en la otra por el canal `branch:main` sin recargar.
- [ ] F16-P12. Login offline sin sesión previa → "El primer acceso o cambio de usuario requiere
      conexión." (cruce con F01).

### Funcionalidades conectadas a verificar

- [ ] F16-C1. Los pedidos (F02–F08) son offline-first.
- [ ] F16-C2. Los insumos (F12) también pasan por la cola.
- [ ] F16-C3. El catálogo (F10), las mesas (F11), la caja (F09) y el personal (F14) **exigen
      conexión**. Confirmar los mensajes de cada uno y consolidar la lista en el PDF: es la respuesta
      a "¿qué puedo hacer si se cae el internet?", que el cliente va a preguntar.

### Pruebas unitarias

- [ ] F16-U1. `src/lib/remoteOrders.test.ts` (14 casos) cubre el mapeo. **Confirmar** que hay ida y
      vuelta de todos los estados y de los pagos con propina.
- [ ] F16-U2. `src/lib/offline.ts` no tiene pruebas. Agregar `src/lib/offline.test.ts` con Supabase
      simulado: que una operación exitosa se marque como enviada; que un fallo de red la deje
      pendiente y reintentable; que la clave de idempotencia no cambie entre reintentos; que un
      error del servidor la mande a `review_required`. **Es la prueba unitaria de mayor valor de todo
      el plan** — si sólo alcanza el tiempo para una, que sea ésta.

### Ficha PDF

- [ ] F16-D1. `docs/qa/fichas/F16-offline-y-sincronizacion.html` redactado
- [ ] F16-D2. `docs/qa/pdf/F16-offline-y-sincronizacion.pdf` generado

---

## Cierre

- [ ] Z1. Todas las funcionalidades en ✅ o ⚠️ en el tablero (§0.6)
- [ ] Z2. Bitácora de hallazgos (§0.7) completa, con severidad asignada a cada uno
- [ ] Z3. Los 16 PDF en `docs/qa/pdf/`
- [ ] Z4. Limpieza (§0.8) terminada
- [ ] Z5. Resumen ejecutivo para el cliente: qué está listo, qué tiene límites conocidos y qué quedó
      fuera de alcance (puede armarse concatenando la sección "Qué NO hace" de las 16 fichas)

### Si el tiempo no alcanza para todo

Prioridad, de mayor a menor, pensada para un día de entrega:

1. **F04, F07, F09** — comanda, cobro y caja. Es dinero; un error aquí se ve el primer día.
2. **F16** — offline. Es lo que rompe en producción y no se ve en la demo.
3. **F08, F13** — reversión y reportes. Es lo que el dueño va a revisar.
4. **F01, F02, F03, F05, F06** — el flujo operativo; si algo falla aquí se nota de inmediato y se
   corrige rápido.
5. **F10, F11, F12, F14, F15** — configuración y administración; se usan poco y casi siempre con
   el implementador presente.
