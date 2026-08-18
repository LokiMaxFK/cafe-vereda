# Plan de verificación previa a la entrega · Vereda Café POS

**Archivo maestro.** Se ejecuta de arriba hacia abajo, una funcionalidad a la vez. Cada paso se marca
en su casilla al terminarlo. Este documento es el único estado compartido: si el trabajo se
interrumpe (se acaban los tokens, cambia el modelo de IA, se retoma mañana), quien continúe sólo
necesita leer este archivo para saber exactamente dónde se quedó.

- **Commit base:** `afaed6f`
- **Fecha de inicio:** 18/08/2026
- **Ejecutor actual:** Claude (Opus 5)

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
| F02 | Nuevo pedido y folio | `/venta/nueva` | A + B | ⬜ Pendiente | — |
| F03 | Salón y vista de mesas | `/salon` | A | ⬜ Pendiente | — |
| F04 | Comanda y envío a preparación | `/venta/:id` | A | ✅ Completada (3 correcciones aplicadas) | [F04](pdf/F04-comanda.pdf) |
| F05 | Preparación (barra) | `/preparacion` | A | ⬜ Pendiente | — |
| F06 | Pedidos y entrega | `/pedidos` | A | ⬜ Pendiente | — |
| F07 | Cobro, descuento y ticket | `/cobros`, `/venta/:id` | A | ⚠️ Completada con hallazgos | [F07](pdf/F07-cobro.pdf) |
| F08 | Cancelación y reversión | `/venta/:id` | A + B | ⬜ Pendiente | — |
| F09 | Caja y arqueo | `/caja` | B | 🟡 En curso — falta pasada B en vivo | [F09](pdf/F09-caja.pdf) |
| F10 | Catálogo | `/catalogo` | A + B | ⬜ Pendiente | — |
| F11 | Mesas (gestión) | `/mesas` | A + B | ⬜ Pendiente | — |
| F12 | Insumos | `/insumos` | B | ⬜ Pendiente | — |
| F13 | Reportes | `/reportes` | B | ⬜ Pendiente | — |
| F14 | Personal | `/personal` | B | ⬜ Pendiente | — |
| F15 | Configuración e impresión | `/configuracion` | A | ⬜ Pendiente | — |
| F16 | Offline y sincronización | transversal | A + B | ⬜ Pendiente | — |

Estados posibles: ⬜ Pendiente · 🟡 En curso · ✅ Completada · ⚠️ Completada con hallazgos.

### 0.7 Bitácora de hallazgos

> Se llena durante la ejecución. Formato: `FXX-NN | severidad | descripción | archivo:línea | acción`

| # | Sev. | Descripción | Ubicación | Acción |
|---|---|---|---|---|
| F01-01 | **Alta** | El formulario de acceso venía precargado con `gerente` / `2468`. A diferencia del recuadro de ayuda, esos valores **no** dependían de `demoMode`, así que en producción el login abría con usuario y PIN escritos. | `src/pages/LoginPage.tsx:12-15` | ✅ **Corregido** 18/08: campos vacíos fuera de modo demostración. Verificado con Supabase configurado |
| F01-02 | Baja | El aviso «Necesitas conexión para cambiar de usuario.» **nunca se retiraba**: una vez mostrado quedaba fijo el resto de la sesión, incluso al recuperar la conexión. | `src/layout/ProtectedLayout.tsx:10-17,47` | ✅ **Corregido** 18/08: se limpia solo a los 6 s y se reinicia en cada intento. Verificado |
| F01-03 | ~~Baja~~ | ~~Colisión de usuarios por acentos~~. **Descartado:** el alta de personal (`PeoplePage.tsx:89`) aplica el mismo filtro de caracteres, así que ningún usuario guardado contiene acentos ni espacios y la colisión no puede producirse. | `src/lib/supabase.ts:17` | Sin acción. Cubierto por prueba de idempotencia |
| F08-01 | **Alta** | **El importe de las incidencias de cancelación no incluye los extras.** El servidor calcula `precio_base × cantidad` e ignora los modificadores. Verificado en producción: una línea de 2 Matcha con Bebida vegetal que vale **$210** quedó registrada como **$180** ($30 menos). Afecta igual a la cancelación de cuenta completa ($186 registrados frente a $201 reales). | `sync_offline_operations`, presente en **todas** las migraciones desde `20260813023800_initial_pos.sql:487` | **Defecto de origen, no introducido hoy.** Corregirlo exige una migración nueva sobre producción. **Pendiente de tu decisión** |
| F08-02 | Media | **Las cancelaciones de artículo no se ven en ninguna pantalla.** La tabla `incidents` las registra correctamente, pero `incidents` no se consulta en ningún punto del frontend: Reportes sólo muestra cancelaciones de cuenta completa. El registro existe y es auditable en base de datos, pero la gerencia no puede consultarlo desde la aplicación. | `src/pages/ReportsPage.tsx` (no consulta `incidents`) | ✅ **Corregido** 18/08 (vía Codex): Reportes consulta y muestra las incidencias del periodo con folio, tipo, motivo, importe y fecha |
| F04-01 | **Alta** | La comanda de cocina **no imprimía los extras** de cada línea (el ticket del cliente sí). Se cobraba «Bebida vegetal» +$15 y la barra recibía «2 × Matcha · Frío», así que se prepararía con leche normal. | `src/lib/printing.ts:41` | ✅ **Corregido** 18/08 + 7 pruebas nuevas de comanda. Verificado leyendo la comanda generada |
| F04-02 | **Alta** | La cola de Preparación mostraba sólo nombre y variante: **ni extras ni la nota de preparación**. La indicación «sin azúcar, poco hielo» no llegaba al barista por ninguna vía. | `src/pages/PreparationPage.tsx` | ✅ **Corregido** 18/08. Verificado en pantalla |
| F04-03 | Media | El motivo de cancelación se guardaba pero **no se mostraba** ni en la línea ni en la incidencia impresa. Choca con el requisito de que toda cancelación quede registrada. | `src/lib/printing.ts:41`, `src/pages/SalePage.tsx` | ✅ **Corregido** 18/08: imprime `MOTIVO:` y la línea lo muestra. Verificado |
| F04-04 | Baja | La comanda lleva la hora de impresión, no la del envío: al reimprimir aparece la hora de la reimpresión. | `src/lib/printing.ts:39` | Documentado en la ficha. Sin acción |
| F04-05 | Baja | Si la impresión falla o se cancela, el envío queda registrado igual y no hay aviso ni reintento. | `src/pages/SalePage.tsx` | Documentado; la salida es reimprimir a mano |
| F04-06 | Info | En «Nuevo Pedido» la categoría seleccionada por defecto es la primera, que hoy está vacía (`America&Kevin`), así que la pantalla abre en blanco. | `src/components/ProductPicker.tsx` + datos | Revisar en F10: puede ser higiene de catálogo (categorías de prueba en producción) |
| F01-04 | Info | Cancelar una cuenta **no** exige rol gerente (sólo motivo); un barista puede hacerlo. Descuento y reversión sí exigen gerencia. | `src/pages/SalePage.tsx:129` | ✅ **Resuelto 18/08 (cliente):** es el comportamiento deseado — cualquiera puede cancelar, **a condición de que toda cancelación quede registrada**. Esa trazabilidad pasa a ser requisito verificable en F08 |
| F07-01 | **Alta** | El cobro acepta efectivo mayor al saldo, no muestra ni separa el cambio y guarda todo el importe como pago. `/caja` suma ese importe bruto, por lo que si se devuelve cambio el esperado del turno queda inflado (ej.: total $100, recibe $120, devuelve $20 y Caja espera $120). | `src/pages/SalePage.tsx:165`, `src/state/AppContext.tsx:372-379`, `src/pages/CashPage.tsx:181-191` | ✅ **Corregido** 18/08 (vía Codex): el pago aplicado se topa al saldo y el modal muestra el cambio a devolver |
| F07-02 | **Alta** | Todas las cifras MXN se formatean sin decimales. Un total de $100.01 se presenta como $100 y un saldo de $0.01 como $0, aunque la regla de cierre sí sigue considerando el centavo; la pantalla puede indicar visualmente cero y mantener la cuenta abierta. | `src/domain/money.ts:3`, usos en `ReadyToChargePage.tsx`, `SalePage.tsx`, `CashPage.tsx`, `ReportsPage.tsx` y `printing.ts` | ✅ **Corregido** 18/08 (vía Codex): el formateador MXN común muestra siempre dos decimales |
| F07-03 | **Alta** | El ticket de cobro omite el motivo del descuento y todas las propinas. Sólo imprime el importe del descuento y el importe de cada pago, aunque ambos datos sí quedan guardados en la orden. Incumple el contenido exigido para F07-P12. | `src/lib/printing.ts:51-63` | ✅ **Corregido** 18/08 (vía Codex): el ticket imprime el motivo escapado y las propinas positivas con la misma redacción de Cobro |
| F07-04 | Baja | En una venta cerrada la acción de ticket sí reimprime, pero el botón dice sólo «Ticket»; no cambia a «Reimprimir» como pide F07-P13, por lo que no deja claro que se generará una segunda copia. | `src/pages/SalePage.tsx:131` | ✅ **Corregido** 18/08 (vía Codex): la acción visible de una venta cerrada ahora dice «Reimprimir» |
| F09-01 | **Alta** | Caja y Reportes no delimitan el efectivo con el mismo evento: Caja suma pagos creados desde la apertura y excluye según el estado actual de la orden; Reportes atribuye cobros y reversiones por `closed_at` y `reversed_at`. Una reversión durante el turno actual de una venta cobrada antes de abrirlo resta en Reportes, pero no reduce el esperado de Caja. Por ello el corte no siempre puede conciliarse con Reportes para el mismo rango horario. | `src/pages/CashPage.tsx:186`, `src/pages/ReportsPage.tsx:74-109`, `src/domain/reports.ts:205-229,273-316`, `supabase/migrations/20260818120000_reverse_sale_and_cash_reversal_fix.sql:211-216` | ✅ **Corregido** 18/08 (vía Codex): Caja aclara que el esperado es efectivo físico del turno y explica la divergencia por reversiones de turnos anteriores; fórmulas intactas |

Severidades: **Bloqueante** (impide entregar) · **Alta** (rompe un flujo, hay rodeo) · **Media**
(molesta pero no rompe) · **Baja** (cosmético).

### 0.8 Limpieza posterior

- [ ] L1. `mv .env.local.bak .env.local` restaurado
- [ ] L2. Datos `QA-18AGO-*` de Supabase eliminados o documentados como datos de prueba
- [ ] L3. Sesión de caja de prueba cerrada (no dejar un turno abierto)
- [ ] L4. `npm test`, `npm run lint` y `npm run build` en verde al final
- [ ] L5. PDF de las 16 funcionalidades presentes en `docs/qa/pdf/`

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

- [ ] F02-P1. Desde la barra lateral, **Nuevo Pedido** abre `/venta/nueva` sin la barra lateral
      (es una ruta fuera de `ProtectedLayout`).
- [ ] F02-P2. El selector de productos lista las categorías del catálogo y filtra al escribir.
- [ ] F02-P3. Agregar un producto **con variante** (ej. Cappuccino → Frío/frappé): se agrega con el
      precio de la variante, no el base.
- [ ] F02-P4. Agregar el **mismo** producto con la misma variante y los mismos extras → se fusiona en
      una sola línea con cantidad 2 (`mergeOrAddItem`), no dos líneas.
- [ ] F02-P5. Agregar el mismo producto con **distinto** extra → sí crea línea separada.
- [ ] F02-P6. El total del panel derecho coincide con la suma manual de líneas + extras.
- [ ] F02-P7. **Continuar** está deshabilitado con el pedido vacío.
- [ ] F02-P8. Continuar → modal de destino: elegir **Mesa** y seleccionar una mesa libre → crea el
      pedido y navega a `/venta/:id`.
- [ ] F02-P9. Repetir eligiendo **Para llevar** con nombre `QA-18AGO-01` → crea el pedido con ese
      nombre visible.
- [ ] F02-P10. En destino Mesa, con ninguna mesa seleccionada, el botón de confirmar está
      deshabilitado.
- [ ] F02-P11. El folio del pedido nuevo es mayor que el folio más alto existente (en demo: > 1044).
- [ ] F02-P12. El botón de volver (flecha) regresa a `/salon` sin crear pedido.

### Pruebas en navegador (pasada B) **[Requiere B]**

- [ ] F02-P13. Crear un pedido con conexión → el folio proviene de la secuencia del servidor
      (`next_order_folio`). Comprobar en la pestaña Red que la RPC se llamó y que el folio impreso
      coincide con el devuelto.
- [ ] F02-P14. Con DevTools en Offline, crear un pedido → asigna folio local provisional y el pedido
      queda en estado pendiente. Al volver la conexión, el servidor lo respeta o lo reasigna
      (se cruza con F16).

### Funcionalidades conectadas a verificar

- [ ] F02-C1. La mesa elegida aparece ocupada en `/salon` inmediatamente (F03).
- [ ] F02-C2. El pedido para llevar aparece en el riel de "para llevar" del salón (F03).
- [ ] F02-C3. El catálogo mostrado es el mismo que gestiona `/catalogo`: un producto marcado como no
      disponible en F10 no debe poder agregarse aquí.

### Pruebas unitarias

- [ ] F02-U1. `src/domain/orderItem.test.ts` ya cubre `mergeOrAddItem` (12 casos). **Revisar** que
      incluya: fusión con extras en distinto orden, y que cantidad 0 o negativa no cree línea. Si
      falta, agregar los casos.
- [ ] F02-U2. Prueba nueva para la regla de folio local: `Math.max(1044, ...folios) + 1` debe ser
      monótona incluso si la lista viene desordenada o vacía. Extraer la función de `AppContext` a
      `src/domain/order.ts` si hace falta para poder probarla (cambio pequeño y de bajo riesgo).

### Ficha PDF

- [ ] F02-D1. `docs/qa/fichas/F02-nuevo-pedido.html` redactado
- [ ] F02-D2. `docs/qa/pdf/F02-nuevo-pedido.pdf` generado

---

## F03 · Salón y vista de mesas

**Rutas:** `/salon` · **Archivos:** `src/pages/SalonPage.tsx`,
`src/components/TableFloorPlan.tsx`, `src/components/TakeawayRail.tsx`,
`src/components/tableStatusTone.ts` · **Pasada:** A · **Rol:** ambos

### Pruebas en navegador

- [ ] F03-P1. El croquis dibuja todas las mesas activas en la posición y forma configuradas.
- [ ] F03-P2. Los colores por estado son distinguibles y correctos: libre, abierta, en preparación,
      lista, servida. Contrastar con `tableStatusTone.ts`.
- [ ] F03-P3. Tocar una mesa **libre** → inicia el flujo de pedido nuevo para esa mesa.
- [ ] F03-P4. Tocar una mesa **ocupada** → abre la cuenta existente en `/venta/:id`, no crea otra.
- [ ] F03-P5. Una mesa con pedido en preparación muestra el estado y el tiempo transcurrido si
      aplica.
- [ ] F03-P6. El riel de "para llevar" lista los pedidos abiertos con su nombre de cliente y permite
      abrirlos.
- [ ] F03-P7. Los pedidos cerrados, cancelados y revertidos **no** aparecen ocupando mesa.
- [ ] F03-P8. Mesas desactivadas en F11 no se dibujan.
- [ ] F03-P9. Comprobar en pantalla angosta (DevTools, 390×844, iPhone): el croquis sigue siendo
      usable y no desborda horizontalmente. Es un POS que probablemente se use en tablet.

### Funcionalidades conectadas a verificar

- [ ] F03-C1. Cambios de estado hechos en `/preparacion` (F05) se reflejan aquí sin recargar.
- [ ] F03-C2. Al cobrar y cerrar un pedido (F07), la mesa vuelve a libre.
- [ ] F03-C3. Al cancelar una cuenta (F08), la mesa vuelve a libre.

### Pruebas unitarias

- [ ] F03-U1. `src/components/tableStatusTone.test.ts` (nuevo): la función de tono devuelve el estado
      correcto para cada `status` de pedido, incluyendo mesa sin pedido y pedido en estado
      `reversed`/`cancelled` (que no deben pintar la mesa como ocupada).

### Ficha PDF

- [ ] F03-D1. `docs/qa/fichas/F03-salon.html` redactado
- [ ] F03-D2. `docs/qa/pdf/F03-salon.pdf` generado

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
      defecto de origen del servidor, no de esta funcionalidad (hallazgo **F08-01**).

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

- [ ] F05-P1. Lista sólo los pedidos con líneas despachadas, ordenados por antigüedad.
- [ ] F05-P2. Cada tarjeta muestra folio, destino, líneas del lote y tiempo de espera.
- [ ] F05-P3. Marcar listo → todas las líneas despachadas pasan a preparadas y el pedido a `ready`.
- [ ] F05-P4. El pedido desaparece de esta vista al marcarse listo.
- [ ] F05-P5. Un pedido con dos lotes (F04-P9) se comporta correctamente: verificar si marca listo
      todo o sólo el lote, y **documentar cuál es el comportamiento real**.
- [ ] F05-P6. Las líneas canceladas no aparecen en la barra.
- [ ] F05-P7. Vista vacía: mensaje claro, no pantalla en blanco.

### Funcionalidades conectadas a verificar

- [ ] F05-C1. La mesa pasa a estado "listo" en `/salon` (F03).
- [ ] F05-C2. El pedido aparece en `/pedidos` como entregable (F06).
- [ ] F05-C3. Si un pedido listo se cancela desde la venta, sale de esta vista (F08).

### Pruebas unitarias

- [ ] F05-U1. En `src/domain/order.test.ts`: la transición `preparing → ready` sólo convierte
      `dispatched → prepared` y deja intactas las líneas `pending` y `cancelled`.

### Ficha PDF

- [ ] F05-D1. `docs/qa/fichas/F05-preparacion.html` redactado
- [ ] F05-D2. `docs/qa/pdf/F05-preparacion.pdf` generado

---

## F06 · Pedidos y entrega

**Rutas:** `/pedidos` · **Archivos:** `src/pages/OrdersPage.tsx`, `AppContext.finalizeOrder` ·
**Pasada:** A · **Rol:** ambos

### Pruebas en navegador

- [ ] F06-P1. Lista los pedidos activos con su estado (abierto, en preparación, listo, servido).
- [ ] F06-P2. Filtros/agrupaciones disponibles funcionan (verificar cuáles existen realmente).
- [ ] F06-P3. Abrir un pedido desde la lista lleva a su cuenta.
- [ ] F06-P4. Marcar servido desde la cuenta → estado `served`, y el pedido queda listo para cobro.
- [ ] F06-P5. Un pedido servido ya no puede volver a preparación (o documentar si sí se puede).

### Funcionalidades conectadas a verificar

- [ ] F06-C1. El pedido servido aparece en `/cobros` (F07).
- [ ] F06-C2. La migración `20260817162350_order_served_status.sql` respalda este estado en el
      servidor: en pasada B confirmar que el estado `served` viaja y regresa igual (F16).

### Pruebas unitarias

- [ ] F06-U1. `src/lib/remoteOrders.test.ts` (14 casos) ya mapea pedidos remotos. **Confirmar** que
      cubre `served` en ambos sentidos y que un estado desconocido del servidor no rompe el mapeo.

### Ficha PDF

- [ ] F06-D1. `docs/qa/fichas/F06-pedidos.html` redactado
- [ ] F06-D2. `docs/qa/pdf/F06-pedidos.pdf` generado

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

### Pruebas en navegador

> **Requisito confirmado por el cliente (18/08):** cualquier rol puede cancelar una cuenta, **pero
> toda cancelación debe quedar registrada y ser rastreable** (quién, cuándo, qué motivo, qué
> importe). Verificarlo es obligatorio para dar F08 por buena — ver F08-P9 a F08-P12.

- [ ] F08-P1. Cancelar una cuenta **abierta** (sin envíos): exige motivo, pasa a `cancelled`.
- [ ] F08-P2. Cancelar una cuenta **en preparación**: exige motivo y debe imprimir incidencia para
      la barra.
- [ ] F08-P3. Intentar cancelar una cuenta **cerrada** → no debe permitirse (no está en
      `cancellableStatuses`).
- [ ] F08-P4. Motivo vacío o sólo espacios → botón deshabilitado.
- [ ] F08-P5. **Revertir** una venta cerrada como gerente: exige motivo, pasa a `reversed` y el
      motivo queda registrado.
- [ ] F08-P6. Revertir como barista → rechazado con "Sólo gerencia puede revertir ventas."
- [ ] F08-P7. Revertir una venta **no cerrada** → rechazado.
- [ ] F08-P8. Revertir dos veces la misma venta → la segunda no debe duplicar el efecto.

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
      extras → hallazgo **F08-01**.
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

- [ ] F08-P9. Cancelar como **barista** → se permite, y el motivo queda guardado y visible en la
      cuenta al reabrirla.
- [ ] F08-P10. La cancelación identifica **quién** la hizo y **cuándo**, no sólo el motivo. Si hoy
      sólo se guarda el motivo, es un hallazgo que hay que reportar: el requisito del cliente exige
      poder responsabilizar a alguien.
- [ ] F08-P11. La cuenta cancelada aparece en `/reportes` con su etiqueta, su motivo y su importe,
      y es localizable por folio (F13).
- [ ] F08-P12. **[Requiere B]** La cancelación llega al servidor y sobrevive a la recarga:
      `order_cancellation_incident` / `audit_log` conservan el registro. Confirmar qué columnas se
      llenan realmente.

### Funcionalidades conectadas a verificar — **la parte más importante de F08**

- [ ] F08-C1. `/caja`: el efectivo de una venta revertida **se descuenta** del esperado del turno.
      La consulta de `CashPage.tsx:185` excluye explícitamente pedidos `reversed` y `cancelled` —
      verificar que se cumple en la práctica (F09).
- [ ] F08-C2. `/reportes`: la venta revertida aparece con importe de reversión y neta negativa o
      neutralizada, no como venta normal (F13).
- [ ] F08-C3. `/salon`: la mesa se libera al cancelar (F03).
- [ ] F08-C4. **[Requiere B]** La migración `20260818120000_reverse_sale_and_cash_reversal_fix.sql`
      aplica en el servidor: hacer una reversión con conexión y confirmar que el estado persiste
      tras recargar.

### Pruebas unitarias

- [ ] F08-U1. `src/domain/order.test.ts`: `cancellableStatuses` — verificar la lista completa y que
      cada estado no cancelable sea rechazado.
- [ ] F08-U2. `src/domain/reports.test.ts` (11 casos): confirmar que hay un caso de venta revertida
      que resta de la venta neta y otro de venta cancelada que no suma. Si no existe, agregarlo:
      es el cálculo del que dependen los números que ve el cliente.

### Ficha PDF

- [ ] F08-D1. `docs/qa/fichas/F08-cancelacion-y-reversion.html` redactado
- [ ] F08-D2. `docs/qa/pdf/F08-cancelacion-y-reversion.pdf` generado

---

## F09 · Caja y arqueo · **[Requiere B]**

**Rutas:** `/caja` · **Archivos:** `src/pages/CashPage.tsx`, RPC `open_cash_session`,
`record_cash_movement`, `close_cash_session` · **Pasada:** B · **Rol:** ambos (verificar restricción)

> **Nota de alcance (18/08, vía Codex).** Esta pasada cubrió sólo la parte verificable por lectura
> de código. La verificación en vivo contra Supabase real (F09-P1 a F09-P14) requiere una sesión
> humana autenticada y queda pendiente — no se puede automatizar sin exponer credenciales de
> producción. Caja no funciona en modo demostración: depende por completo de RPC de Supabase.

### Pruebas en navegador

- [ ] F09-P1. Sin turno abierto: la pantalla ofrece **Abrir caja** y no muestra movimientos.
- [ ] F09-P2. Abrir caja con fondo inicial $1,000 → se crea el turno; verificar en la pestaña Red
      que `open_cash_session` respondió sin error.
- [ ] F09-P3. Abrir caja con fondo `0` → permitido (el botón sólo se bloquea con el campo vacío).
- [ ] F09-P4. Intentar abrir un **segundo** turno con uno ya abierto → debe rechazarse.
- [ ] F09-P5. Registrar un **retiro de efectivo** con nota: exige importe y nota; aparece en
      "Movimientos del turno" con signo negativo.
- [ ] F09-P6. Retiro sin nota o con importe 0 → botón deshabilitado.
- [ ] F09-P7. El resumen muestra fondo inicial, ventas en efectivo del turno, retiros y **esperado**.
- [ ] F09-P8. Cobrar una venta en efectivo (F07) y volver a `/caja` → el esperado sube por ese
      importe.
- [ ] F09-P9. Revertir esa venta (F08) y volver → el esperado **baja** de nuevo. Este es el caso que
      arregló el commit `20260818120000`; comprobarlo explícitamente.
- [ ] F09-P10. Cerrar caja con efectivo contado **igual** al esperado → diferencia $0.
- [ ] F09-P11. Cerrar caja con contado **menor** → faltante correctamente señalado.
- [ ] F09-P12. Cerrar caja con contado **mayor** → sobrante correctamente señalado.
- [ ] F09-P13. Tras cerrar, la pantalla vuelve a ofrecer abrir turno y el turno cerrado no se puede
      modificar.
- [ ] F09-P14. Verificar el rol: ¿un barista puede abrir/cerrar caja? Documentar el comportamiento
      real (la ruta `/caja` **no** está dentro de `ManagerOnly`, así que se espera que sí).

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

- [ ] F10-P1. Crear categoría con nombre `QA-18AGO-Cat` → aparece en la lista y en el selector de
      productos.
- [ ] F10-P2. Renombrar la categoría → se refleja en los productos que la usan.
- [ ] F10-P3. Borrar una categoría **con productos** → error explícito con el conteo ("Hay N
      producto(s) en esta categoría…").
- [ ] F10-P4. Borrar una categoría vacía → desaparece.
- [ ] F10-P5. Crear producto con nombre, descripción, precio y categoría → aparece ordenado
      alfabéticamente.
- [ ] F10-P6. Crear producto **con variantes** (ej. Caliente $50 / Frío $60) → ambas seleccionables
      en el pedido.
- [ ] F10-P7. Editar un producto: cambiar precio → el precio nuevo aplica a pedidos **nuevos**, y los
      pedidos ya capturados conservan el precio original. Verificar explícitamente.
- [ ] F10-P8. Quitar una variante existente → deja de ofrecerse.
- [ ] F10-P9. Marcar producto como **no disponible** → no se puede agregar a un pedido (F02-C3).
- [ ] F10-P10. Marcar producto como **de temporada** → verificar qué cambia visualmente.
- [ ] F10-P11. Eliminar producto → baja lógica; desaparece del catálogo pero los pedidos históricos
      lo siguen mostrando (F13).
- [ ] F10-P12. Crear, editar y eliminar un **extra** (modificador) con precio.
- [ ] F10-P13. Subir imagen de producto: PNG válido < 2 MB → se muestra.
- [ ] F10-P14. Subir un archivo que **no** sea PNG/JPEG → "La imagen debe ser PNG o JPEG."
- [ ] F10-P15. Subir una imagen > 2 MB → "La imagen no debe pesar más de 2 MB."
- [ ] F10-P16. Como barista, `/catalogo` no es accesible (ya cubierto en F01-P8, confirmar aquí).

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

- [ ] F10-U1. `src/domain/inventory.test.ts` (8 casos) cubre recetas. **Confirmar** que hay un caso de
      receta por variante y uno de producto sin receta.
- [ ] F10-U2. Validación de imagen (tipo y tamaño): extraer el guard de `uploadProductImage` a una
      función pura y probar los tres caminos (válida, tipo inválido, tamaño excedido).

### Ficha PDF

- [ ] F10-D1. `docs/qa/fichas/F10-catalogo.html` redactado
- [ ] F10-D2. `docs/qa/pdf/F10-catalogo.pdf` generado

---

## F11 · Mesas (gestión del croquis)

**Rutas:** `/mesas` · **Archivos:** `src/pages/TablesPage.tsx`, `AppContext` (`addTable`,
`updateTable`, `nextFreeSlot`) · **Pasada:** A **y** B · **Rol:** sólo gerente

### Pruebas en navegador

- [ ] F11-P1. Agregar mesa → recibe el siguiente número consecutivo y se coloca en un hueco libre,
      no encimada sobre otra (`nextFreeSlot`).
- [ ] F11-P2. Agregar cinco mesas seguidas → ninguna se superpone.
- [ ] F11-P3. Cambiar el número de asientos de una mesa → se refleja en el croquis y en `/salon`.
- [ ] F11-P4. Cambiar la forma (cuadrada / redonda) → se refleja.
- [ ] F11-P5. Mover una mesa (arrastrar o editar x/y) → la posición persiste al recargar.
- [ ] F11-P6. Desactivar una mesa **libre** → desaparece de `/salon`.
- [ ] F11-P7. Intentar desactivar una mesa **ocupada** → documentar qué pasa (¿se permite?, ¿qué
      ocurre con la cuenta abierta?). Si se permite y la cuenta queda huérfana, es un hallazgo.
- [ ] F11-P8. Reactivar una mesa desactivada → vuelve al croquis con su posición.
- [ ] F11-P9. **[Requiere B]** Con conexión, los cambios llegan a `cafe_tables` (verificar en Red) y
      persisten tras recargar.
- [ ] F11-P10. **[Requiere B]** Sin conexión: `updateTable` escribe local pero no en el servidor —
      confirmar si queda inconsistencia al reconectar. Nota: a diferencia de los pedidos, las mesas
      **no pasan por la cola de sincronización**. Documentarlo como límite.

### Funcionalidades conectadas a verificar

- [ ] F11-C1. El croquis de `/salon` refleja los cambios (F03).
- [ ] F11-C2. El selector de mesa de `/venta/nueva` sólo ofrece mesas activas y libres (F02).

### Pruebas unitarias

- [ ] F11-U1. `nextFreeSlot`: extraer de `AppContext.tsx` a `src/domain/tables.ts` y probar que con
      el croquis lleno devuelve el centro, que respeta las tolerancias, y que ignora mesas
      inactivas.

### Ficha PDF

- [ ] F11-D1. `docs/qa/fichas/F11-mesas.html` redactado
- [ ] F11-D2. `docs/qa/pdf/F11-mesas.pdf` generado

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

- [ ] F15-P1. `/configuracion` carga y enlaza a impresión.
- [ ] F15-P2. `/configuracion/impresion`: cambiar ancho de papel (58 mm) → la vista previa se
      reajusta.
- [ ] F15-P3. Editar encabezado, pie y datos del negocio → la vista previa refleja los cambios.
- [ ] F15-P4. Recargar → la configuración persiste (`printerSettings` en local, `ticketDesign` en
      `branch_settings` con Supabase).
- [ ] F15-P5. Prueba de impresión **sin QZ Tray instalado** → mensaje de error entendible, la
      aplicación no se rompe ni se queda colgada.
- [ ] F15-P6. Respaldo por navegador (`browserPrinting.ts`): se abre el diálogo de impresión del
      sistema con el ticket formateado.
- [ ] F15-P7. Vista previa del ticket con un pedido real: líneas largas, extras, descuento con
      motivo — verificar que nada se corta a 58 mm.
- [ ] F15-P8. Vista previa de la **comanda** de cocina (distinta del ticket de cobro).
- [ ] F15-P9. Vista previa de la **incidencia de cancelación**.
- [ ] F15-P10. **[Si hay impresora física disponible]** Impresión real de ticket, comanda e
      incidencia. Si no la hay, **anotarlo en el PDF como no verificado** — es información que el
      cliente necesita.

### Funcionalidades conectadas a verificar

- [ ] F15-C1. La comanda de F04 usa esta configuración.
- [ ] F15-C2. El ticket de F07 usa esta configuración.
- [ ] F15-C3. La incidencia de F08 usa esta configuración.

### Pruebas unitarias

- [ ] F15-U1. `src/lib/printing.test.ts` (3 casos) y `printerSettings.test.ts` (2 casos) son escasos.
      **Ampliar** con: truncado/ajuste de nombres largos al ancho de papel; ticket con descuento y
      propina; comanda con líneas canceladas; valores por defecto cuando no hay configuración
      guardada.

### Ficha PDF

- [ ] F15-D1. `docs/qa/fichas/F15-impresion.html` redactado
- [ ] F15-D2. `docs/qa/pdf/F15-impresion.pdf` generado

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
