# Plan de verificación previa a la entrega · Vereda Café POS

**Archivo maestro.** Se ejecuta de arriba hacia abajo, una funcionalidad a la vez. Cada paso se marca
en su casilla al terminarlo. Este documento es el único estado compartido: si el trabajo se
interrumpe (se acaban los tokens, cambia el modelo de IA, se retoma mañana), quien continúe sólo
necesita leer este archivo para saber exactamente dónde se quedó.

- **Commit base:** `afaed6f`
- **Fecha de inicio:** 18/08/2026
- **Ejecutor actual:** Claude (Opus 5)

---

## ⏱️ DÓNDE SE QUEDÓ · Estado al 20/08/2026, 23:10

**Lee esto primero. Es el punto exacto de retorno.**

### Qué está hecho

**La revisión está terminada.** Las 16 funcionalidades están en ✅ o ⚠️ en el tablero (§0.6), los
**16 PDF** están en `docs/qa/pdf/`, la limpieza (§0.8) está cerrada con su inventario de lo que quedó
en producción, y el **resumen ejecutivo para el cliente** está redactado al final del documento (Z5).

**Lo que cerró la jornada del 20/08 (tercera sesión, en producción y con el responsable presente):**

- **F14 · Personal** — cerrada. El responsable ejecutó los casos que exigen credencial (P2, P3, P6 a
  P10). Salieron **tres hallazgos**: **F14-02 (Alta)** desactivar un acceso **no lo revoca**,
  F14-03 (restablecer el PIN tampoco cierra sesiones) y F14-04 (no se puede cambiar el rol). Buena
  noticia de seguridad comprobada: un barista **no** puede ascenderse solo, la RLS lo filtra.
  Ficha F14 redactada y generada — **con ella se completan las 16 de 16**.
- **F16 · Offline y sincronización** — cerrada, navegador incluido (P1 a P12 y C1-C3), con pedidos y
  cobros reales. **P11 falló y se corrigió durante la sesión**: el tiempo real **nunca había
  funcionado** (**F16-05, Alta**) porque faltaba una política de `realtime.messages` que las
  migraciones no pueden crear. El responsable la aplicó desde el panel y se verificó de punta a
  punta. Quedó documentada en `docs/DEPLOY_HOSTINGER.md` como paso manual obligatorio.
- **Casos sueltos de pasada B** — todos cerrados: F02-P13/P14, F04-C2, F06-C2, F10-P17 a P20,
  F10-C1/C2/C3, F11-P9/P10, F12-P11, F13-C1 a C4.
- **Correcciones de código con prueba**: **F07-06** (una cuenta pagada podía quedarse sin poder
  cerrarse por el redondeo) y las tres unitarias pendientes: **F16-U1**, **F04-U2** y **F13-U1**.
- **Suite de 180 → 196 pruebas en verde**, lint y build limpios. Sólo creció.

### Qué falta

**Nada de la revisión.** Lo que queda son **decisiones del responsable**, no trabajo de verificación:

1. **7 hallazgos abiertos**, todos con el arreglo ya analizado en §0.7 — dos de severidad **Alta**:
   **F08-05** (cancelar desde Pedidos o Salón no avisa a la barra) y **F14-02** (desactivar no
   revoca). Los demás son Media: F11-02, F14-03, F14-04, F14-05, F16-04.
2. **F14-P11 sigue excluido y sin verificar** por decisión expresa: qué pasa si el único gerente se
   desactiva a sí mismo. La interfaz lo impide (`disabled={isSelf}`); **no se comprobó el servidor**.
   Es el único riesgo del entregable que nadie ha mirado.
3. **F15-P10** (impresión en papel real) sigue sin poderse hacer: no hay impresora térmica.

### Estado del entorno al cerrar

| Cosa | Estado |
|---|---|
| `.env.local` | **Modo demostración**. Las credenciales reales siguen en `.env.local.bak`, `.env.production` y `.env.local.prod-recibido`, **los tres ignorados por git** (recomprobado) |
| Servidores | **Ninguno levantado.** Se pararon los de los puertos 5174, 5175 y 5176 |
| Navegador | Pestañas cerradas. La caché de demostración de `localhost:5173` quedó **intacta** |
| Cola de sincronización | En 0 en el origen 5173. *Ojo:* en el origen **5175** quedó una operación en `review_required`, creada a propósito para F16-P9/P10. Es un puerto de desarrollo desechable y no afecta a nada; si molesta, basta con vaciar los datos de ese sitio |
| Turno de caja | **Ninguno abierto** |
| Datos QA en producción | Declarados uno a uno en **§0.8 L8** |
| Repositorio | Cambios **sin confirmar**. Modificados: `money.ts`, `SalePage.tsx`, `AppContext.tsx`, 3 archivos de prueba, el plan, la ficha y el PDF de F16 y `DEPLOY_HOSTINGER.md`. Nuevos: ficha y PDF de F14 |

### Antes de retomar, en este orden

1. `npm test && npm run lint && npm run build` — deben dar **196 en verde**, lint y build limpios.
2. Decidir la pasada (§0.4). Para producción: `cp .env.local.bak .env.local` y reiniciar `npm run dev`.
3. Si se retoma para **corregir** los hallazgos abiertos, empezar por los dos de severidad Alta,
   **F08-05** y **F14-02**, que ya tienen el arreglo descrito en §0.7.

### Trampas de este entorno que ya costaron tiempo

- **Node.** En esta máquina `node` es el 20.20.2 de nvm, que **no trae WebSocket nativo** y hace
  fallar dos suites. Hay un **26.4.0 en Homebrew**: se usó `export PATH=/opt/homebrew/bin:$PATH`
  para todo. Compruébalo con `node -v` antes de dar por bueno un fallo de pruebas.
- **La impresión cuelga el navegador.** Instalar el interceptor de §0.9 antes de cualquier acción que
  imprima, y **reinstalarlo después de cada recarga** (las navegaciones por el enrutador interno,
  con `history.pushState` + `popstate`, **sí lo conservan** — es la forma barata de moverse).
- **El primer clic a veces sólo enfoca.** Pasa con botones y con el croquis. Si un modal no abre,
  vuelve a pulsar antes de buscar una causa más rara.
- **Los avisos desplazan el diseño.** Al cortar la red aparece una franja roja en `/mesas` que baja
  el croquis unos 66 px; los clics por coordenada dejan de acertar. Toma una captura antes.
- **No hay Docker ni CLI de Supabase** en esta máquina. Pero **no hacen falta para aplicar SQL**: el
  editor SQL del panel sirve, y así se aplicó la corrección de F16-05.
- **`import.meta` no funciona** en el ejecutor de JavaScript del navegador. Para saber si Supabase
  está configurado, importar `isSupabaseConfigured` desde `/src/lib/supabase.ts`.
- **Simular el corte de red:** la aplicación se apoya enteramente en `navigator.onLine` y en los
  eventos `online`/`offline`, así que basta redefinir la propiedad y despachar el evento — **y
  además** bloquear el `fetch` a `supabase.co`, para que ningún camino que ignore la bandera dé un
  aprobado falso. **No sobrevive a una recarga**, así que hay que reinstalarlo.
- **Cuidado con los falsos hallazgos.** Dos que estuvieron a punto de colarse en esta jornada:
  llamar a `syncPendingOperations()` directamente **no** actualiza el indicador de la interfaz
  (eso lo hace `forceSync`), y las claves de idempotencia **comparten prefijo a propósito** porque
  son `${deviceId}:${id}`. Ninguna de las dos cosas es un defecto.

> **Nota de entorno (20/08, cuarta máquina).** Diferente de la del traspaso anterior: aquí el
> navegador llegó **limpio** —sin los 25 pedidos ni la sesión de gerente que describía la nota
> previa— y **Node es 20.20.2**, no 22. La pasada de producción se levantó en el puerto **5174** en
> vez del 5173, a propósito: un origen nuevo tiene su propio IndexedDB vacío, así que producción
> arrancó limpia **sin borrar** la caché de demostración. Es un truco que conviene repetir.

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
| F02 | Nuevo pedido y folio | `/venta/nueva` | A + B | ✅ Completada (A y B; 1 corrección) | [F02](pdf/F02-nuevo-pedido.pdf) |
| F03 | Salón y vista de mesas | `/salon` | A | ✅ Completada | [F03](pdf/F03-salon.pdf) |
| F04 | Comanda y envío a preparación | `/venta/:id` | A | ✅ Completada (3 correcciones aplicadas) | [F04](pdf/F04-comanda.pdf) |
| F05 | Preparación (barra) | `/preparacion` | A | ✅ Completada (1 corrección aplicada) | [F05](pdf/F05-preparacion.pdf) |
| F06 | Pedidos y entrega | `/pedidos` | A + B | ✅ Completada (A y B; 3 correcciones) | [F06](pdf/F06-pedidos.pdf) |
| F07 | Cobro, descuento y ticket | `/cobros`, `/venta/:id` | A | ✅ Completada (4 correcciones aplicadas) | [F07](pdf/F07-cobro.pdf) |
| F08 | Cancelación y reversión | `/venta/:id`, `/pedidos`, `/salon` | A + B | ⚠️ Completada con hallazgos (2 correcciones; **F08-05 Alta abierta**, hallada el 20/08) | [F08](pdf/F08-cancelacion-y-reversion.pdf) |
| F09 | Caja y arqueo | `/caja` | B | ✅ Completada | [F09](pdf/F09-caja.pdf) |
| F10 | Catálogo | `/catalogo` | A + B | ✅ Completada (A y B; 1 corrección) | [F10](pdf/F10-catalogo.pdf) |
| F11 | Mesas (gestión) | `/mesas` | A + B | ⚠️ Completada con hallazgos (1 corrección; **F11-02 abierta**) | [F11](pdf/F11-mesas.pdf) |
| F12 | Insumos | `/insumos` | B | ⚠️ Completada, offline incluido (4 correcciones) | [F12](pdf/F12-insumos.pdf) |
| F13 | Reportes | `/reportes` | B | ⚠️ Completada (1 corrección; P16 y C1 no verificables a fondo por falta de volumen y de turno de caja) | [F13](pdf/F13-reportes.pdf) |
| F14 | Personal | `/personal` | B | ⚠️ Completada con hallazgos (1 corrección; **F14-02 Alta abierta**, F14-03 y F14-04 abiertas); P11 excluido y sin verificar | [F14](pdf/F14-personal.pdf) |
| F15 | Configuración e impresión | `/configuracion` | A | ⚠️ Completada salvo impresión en papel real (1 corrección alta) | [F15](pdf/F15-impresion.pdf) |
| F16 | Offline y sincronización | transversal | A + B | ⚠️ Completada, navegador incluido (2 correcciones altas: F16-01 y **F16-05**; F16-02, F16-03 y **F16-04** abiertas) | [F16](pdf/F16-offline-y-sincronizacion.pdf) |

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
| F07-06 | Media | **Una cuenta pagada podía quedarse sin poder cerrarse, con la pantalla anunciando «Saldo pendiente $0.00».** `money.ts` no redondeaba en ningún punto, así que un total corriente como 3 × $10.05 valía en realidad `30.150000000000002`. El cajero teclea los `$30.15` que ve, `applyPaymentCap` los acepta, y queda un saldo residual de `3.55e-15`. `SalePage.tsx:188` decide con `balance > 0` si enseña el botón «Cerrar e imprimir ticket», de modo que **el botón nunca aparece**; y `closeOrder` (`AppContext.tsx:370`) comparaba la suma cruda de pagos contra el total y hacía `return` en silencio, sin aviso ninguno. La única salida era pulsar «Saldo exacto», que escribía `8.881784197001252e-16` en el campo de importe —porque el botón y el marcador usaban `String(balance)` sin formatear— y registrar un pago de esa cifra. Medido por fuerza bruta sobre precios de dos decimales entre $10 y $300, cantidades de 1 a 10 y extras habituales: **10.3 % de las combinaciones sin descuento alguno** caen en el caso (35 901 de 348 060), y con descuento sube al 12 %. Es la misma familia que F07-02, pero del lado de la comparación en vez del formato. | `src/domain/money.ts` (sin redondeo), `src/state/AppContext.tsx:370`, `src/pages/SalePage.tsx:188` | ✅ **Corregido** 20/08: `roundToCents()` cuadra al centavo todo lo que sale de `money.ts`; `closeOrder` compara con `paidTotal` en vez de una suma cruda propia; «Saldo exacto» y el marcador usan `toFixed(2)`. **6 pruebas de regresión** en `money.test.ts`, comprobadas fallando sin la corrección. **Alcance real medido contra el catálogo de producción (20/08), que es lo que fija la severidad:** los **37 precios y los 5 extras son pesos enteros**, así que por la vía de los artículos el fallo **no era alcanzable hoy** — multiplicar y sumar enteros no deja residuo. Tampoco lo disparan los descuentos de porcentaje redondo (5, 10, 15, 20, 25, 30 y 50 % sobre subtotales enteros): **0 de 980**, porque dan cuartos y medios, que sí son exactos en binario. La única vía viva es un descuento **tecleado con centavos sueltos** (el campo es `type=\"number\"` libre, sin `step`): «que quede en $27.99» → descuento $2.01 → total `27.990000000000002`. De esos, **15.15 % atoran la cuenta** (644 596 de 4 255 200). Por eso queda en **Media** y no en Alta. **Pasa a Alta en cuanto entre al catálogo un solo precio con centavos** que no sea de media unidad: con $45.90, dos unidades ya dan `137.70000000000002`. La corrección se deja aplicada por eso mismo — es la clase de fallo que aparece el día que el café ajusta un precio, no el día de la entrega. |
| F09-01 | **Alta** | Caja y Reportes no delimitan el efectivo con el mismo evento: Caja suma pagos creados desde la apertura y excluye según el estado actual de la orden; Reportes atribuye cobros y reversiones por `closed_at` y `reversed_at`. Una reversión durante el turno actual de una venta cobrada antes de abrirlo resta en Reportes, pero no reduce el esperado de Caja. Por ello el corte no siempre puede conciliarse con Reportes para el mismo rango horario. | `src/pages/CashPage.tsx:186`, `src/pages/ReportsPage.tsx:74-109`, `src/domain/reports.ts:205-229,273-316`, `supabase/migrations/20260818120000_reverse_sale_and_cash_reversal_fix.sql:211-216` | ✅ **Corregido** 18/08 (vía Codex): Caja aclara que el esperado es efectivo físico del turno y explica la divergencia por reversiones de turnos anteriores; fórmulas intactas |
| ~~F09-02~~ | ~~Media~~ | ~~"Registrar retiro" no está realmente deshabilitado sin nota.~~ **Retractado 18/08: falso positivo de la prueba, no un defecto.** La prueba original hizo `document.querySelectorAll('button').find(...)` sobre toda la página, y hay **dos** botones con el texto "Registrar retiro": el del encabezado (sólo abre el modal, nunca deshabilitado) y el del propio modal (el que envía). El `find` sin acotar devolvió el primero, dando un falso "no deshabilitado". Reverificado acotando la consulta a `[role=dialog]`: el botón del modal está correctamente `disabled` sin importe, sigue `disabled` con sólo importe, y se habilita con importe y nota — probado en vivo contra producción, incluyendo un envío real completado sin error. | `src/pages/CashPage.tsx:102` (`disabled={loading \|\| !Number(amount) \|\| !note.trim()}`, ya correcto) | Sin acción: el código estaba bien. Error de metodología de prueba, documentado para que no se repita |
| F08-03 | **Alta** | **Cancelar una cuenta completa con artículos ya despachados/preparados no avisaba a la barra.** A diferencia de cancelar un solo artículo (que sí imprime una comanda de cancelación), `performOrderAction` nunca llamaba a `printCommand`: la cocina se quedaba sin ningún aviso físico de que debía detener o descartar algo que ya estaba preparando. El pedido simplemente desaparecía de la cola de Preparación sin explicación. | `src/pages/SalePage.tsx` (`performOrderAction`) | ✅ **Corregido** 18/08: ahora imprime una comanda «CANCELACIÓN» con el motivo, listando los artículos que ya estaban en la barra. Verificado dos veces en producción real (sin motivo visible primero, luego con `MOTIVO:` en el papel) |
| F08-05 | **Alta** | **La corrección de F08-03 sólo cubre una de las tres formas de cancelar una cuenta: desde las otras dos, la barra sigue sin enterarse.** F08-03 añadió la impresión de la comanda de cancelación en `SalePage.tsx:140-142`, dentro de la pantalla de la venta (`/venta/:id`), y ahí funciona. Pero cancelar una cuenta completa **también** se puede hacer desde el listado de **Pedidos** (`OrdersPage.tsx:5`) y desde la **vista previa del Salón** (`OrderPreviewModal.tsx:77`), y las dos usan `CancelOrderModal`, que llama a `cancelOrder(order.id, reason)` y **no llama a `printCommand` en ningún momento** (`CancelOrderModal.tsx:13-22`). Verificado en producción el 20/08 con el interceptor de impresión de §0.9 activo: al cancelar desde `/pedidos` la orden #1085 —que tenía su renglón ya **despachado a la barra**— la orden quedó `cancelled` con su motivo en el servidor y **no se generó ninguna comanda de cancelación** (`__qaPrintDocs` vacío, con el interceptor demostradamente funcionando: había capturado comandas y tickets minutos antes en la misma sesión). **Consecuencia idéntica a la que F08-03 vino a resolver:** la cocina sigue preparando algo que ya se canceló y el pedido simplemente desaparece de su cola. Y son justo los dos caminos más naturales para gerencia, que cancela repasando la sala o el historial, no entrando a la venta. | `src/components/CancelOrderModal.tsx:13-22`, usado desde `src/pages/OrdersPage.tsx:5` y `src/components/OrderPreviewModal.tsx:77` | ⚠️ **Abierto.** No se corrige en esta pasada por la regla de no abrir correcciones a medias sin avisar. El arreglo es pequeño y **sin SQL**: mover la impresión de la comanda de cancelación a `cancelOrder` (o llamar a `printCommand(order, itemsEnBarra, 0, true)` desde `CancelOrderModal`, como ya hace `SalePage`), de modo que quede cubierta cualquiera que sea la puerta de entrada |
| F08-04 | **Alta** | **La tabla de Incidencias en Reportes (agregada en F08-02) no mostraba quién hizo la cancelación/reversión.** El dato existía (`incidents.created_by`) pero la consulta no lo traía y la tabla no tenía columna de empleado — contradice directamente el requisito confirmado por el cliente de poder responsabilizar a alguien (F01-04). | `src/pages/ReportsPage.tsx` (consulta de incidencias y tabla) | ✅ **Corregido** 18/08: se agregó el join a `staff_profiles` y la columna "Empleado". Verificado en producción real: las 6 incidencias existentes mostraron "Gerente" correctamente tras el cambio |

| F02-01 | Media | **El orden del menú se perdía al recargar y "Nuevo Pedido" abría en una categoría al azar.** El servidor sí guarda el orden en `categories.position` y la consulta lo respeta (`.order("position")`), pero al mapear se descartaba la columna: `Category` era `{id, name}`. Al persistirse en IndexedDB sin ese dato, `db.catalogCategories.toArray()` devolvía las categorías **ordenadas por clave primaria**, es decir por el identificador interno (un UUID en producción). El selector de productos abre en `categories[0]`, así que el barista veía una categoría distinta según el azar del identificador. **Esto es la causa real de F04-06** (abrir en `America&Kevin`, vacía): no era higiene de catálogo. Verificado en vivo: recién sembrado salía "Café" primero; tras recargar salía "Otros" (id `bakery`). | `src/state/AppContext.tsx:153,205,212`, `src/domain/types.ts:19`, `src/components/ProductPicker.tsx:27` | ✅ **Corregido** 19/08: `Category` lleva `position`, se pide y se conserva desde el servidor, y una función pura `sortCategories` (`src/domain/catalog.ts`, **6 pruebas**) ordena por posición con desempate por nombre. Se corrigió además `updateCategory`, cuyo `put` borraba la posición al renombrar. Verificado tras recargar: IndexedDB sigue devolviendo por id (Otros, Almuerzos, Café…) pero la pantalla muestra Café, Frías, Almuerzos… y abre en Café |
| F02-02 | Baja | **La cola de sincronización encola también en modo demostración.** `queueOperation` escribe en `pendingOperations` sin mirar `isSupabaseConfigured`; en demo `syncPendingOperations` sale temprano porque `supabase` es `null` y las operaciones quedan `pending` para siempre (la interfaz muestra "N cambios pendientes" de forma permanente). En producción real no se manifiesta, pero **sí afecta a esta revisión**: todo pedido de prueba creado en pasada A se subiría a producción al restaurar las credenciales para una pasada B. | `src/lib/offline.ts:4,21-27` | Sin corregir por decisión de alcance: en producción siempre hay credenciales. **Mitigación obligatoria del procedimiento de QA:** purgar `pendingOperations` antes de cada cambio de pasada A → B. Anotado en §0.8 (L6) |

| F05-01 | Baja | **La tarjeta "Listos para entregar" contaba artículos que la barra no entrega.** Usaba `order.items.length`, que incluye los renglones **cancelados** y los que aún no se han enviado, así que anunciaba más artículos de los que salen en la charola. Además decía "1 artículos". Reproducido con el pedido #1048: 3 renglones (uno cancelado) anunciados como 3. | `src/pages/PreparationPage.tsx` (aside de listos) | ✅ **Corregido** 20/08: función pura `deliverableItemCount` en `src/domain/order.ts` (**4 pruebas**) que cuenta sólo `prepared`/`dispatched`, más el plural correcto. Verificado en pantalla: "#1048 · 2 artículos" y "#1047 · 1 artículo" |
| F06-01 | Baja | **El ticket que se entrega al cliente imprimía el método de pago en inglés y en crudo:** "CASH", "CARD", "TRANSFER". El modal de cobro mostraba lo mismo ("Cash"), pese a que el botón que el cajero acababa de pulsar decía "Efectivo". Reportes sí lo traducía, con su propio mapa duplicado. Capturado del ticket real de la orden #1047. | `src/lib/printing.ts:61`, `src/pages/SalePage.tsx` (lista de pagos), `src/pages/ReportsPage.tsx:29` | ✅ **Corregido** 20/08: `paymentMethodLabel` único en `src/domain/money.ts`, usado por ticket, cobro y reportes (se eliminó el mapa duplicado). Prueba nueva en `printing.test.ts` para los tres métodos. Verificado reimprimiendo el ticket: ahora dice **EFECTIVO** |
| F06-02 | Baja | **Buscar en Pedidos por lo que muestra la pantalla no encontraba nada.** El campo dice "Folio, mesa o nombre", pero sólo indexaba el identificador interno de la mesa (`t5`), no el destino visible ("Mesa 5"). Escribir "Mesa 5" devolvía **cero resultados y una tabla vacía sin ningún mensaje**, sólo el encabezado flotando. | `src/pages/OrdersPage.tsx` (filtro y tabla) | ✅ **Corregido** 20/08: la búsqueda incluye `orderDestination(order)` y se recortan los espacios; se agregó un estado vacío ("Ningún pedido coincide…"). Verificado: "Mesa 5" encuentra #1047 y una búsqueda sin resultados muestra el mensaje |
| F06-03 | Baja | **La lista de Pedidos parecía desordenada.** Ordenaba por `updatedAt` pero la columna muestra `openedAt`, así que los folios saltaban sin explicación visible (#1047, #1046, #1045, #1043, #1044, #1042…) y no había forma de deducir el criterio. | `src/pages/OrdersPage.tsx` (`sort`) | ✅ **Corregido** 20/08: ordena por `openedAt` descendente, que es la fecha que se ve y coincide con la secuencia de folios. Verificado: la lista queda estrictamente cronológica |
| F07-05 | Baja | **Una venta ya cobrada seguía diciendo que había que cobrarla.** El panel central mostraba siempre el mismo texto —"Orden finalizada, lista para cobrar · Usa el botón «Cobrar» para registrar el pago"— también en ventas `closed`, `cancelled` y `reversed`, donde ese botón ya no existe (en una cerrada dice "Reimprimir"). | `src/pages/SalePage.tsx:146` | ✅ **Corregido** 20/08: `closedStateCopy` da un texto propio a cada estado liquidado. Verificado en la venta #1047: "Venta cobrada · La cuenta ya está pagada y cerrada. Usa «Reimprimir» si el cliente necesita otra copia del ticket." |

| F10-01 | Media | **La tarjeta del selector anunciaba un precio que no se podía pagar.** Mostraba siempre el **precio base** del producto seguido de "+" cuando había presentaciones, sin mirar cuánto cuestan realmente. Basta con que la gerencia cambie el precio de una presentación y no toque el precio base para que la pantalla anuncie una cifra inexistente. Reproducido durante F10-P7/P8: producto con base $50.00 cuya **única** presentación cuesta $99.00 → la tarjeta decía «$50.00+», casi la mitad del precio real, y el "+" sugería opciones más caras cuando no había ninguna otra. Es la cifra que el barista lee en voz alta cuando el cliente pregunta el precio. | `src/components/ProductPicker.tsx:60` | ✅ **Corregido** 20/08: `productDisplayPrice` anuncia la presentación **más barata realmente comprable** y `hasPriceChoices` reserva el "+" para cuando hay más de una opción (`src/domain/catalog.ts`, **5 pruebas**). Verificado en pantalla: el producto pasó a «$99.00» sin "+", y el caso normal quedó intacto (Cappuccino sigue «$70.00+», Espresso «$48.00») |

| F11-02 | Media | **El aviso de la pantalla de Mesas promete que los cambios se guardarán al reconectar, y lo que ocurre es que se tiran.** Sin conexión, `/mesas` muestra en rojo: «Sin conexión: los cambios se ven aquí pero **no se guardarán hasta reconectar**.» — que en español se lee como *se guardarán cuando reconectes*. Es falso: las mesas **no pasan por la cola de sincronización** (a diferencia de los pedidos), así que `updateTable` sólo escribe en el dispositivo y, al volver la conexión, **la descarga remota pisa el valor local y el cambio desaparece sin ningún aviso**. Verificado en producción el 20/08: con la Mesa 8 en 3 lugares se editó sin conexión a 5, la cola se quedó en **0 operaciones**, y al reconectar el dispositivo volvió solo a 3. **Lo tranquilizador:** no queda inconsistencia entre dispositivo y servidor —gana el servidor— así que no hay corrupción ni datos divergentes. **Lo que sí ocurre:** quien reacomode el croquis del salón durante un corte de internet pierde el trabajo entero y no se entera. | `src/pages/TablesPage.tsx:51` (el texto), `src/state/AppContext.tsx:405` (`updateTable`) | ⚠️ **Abierto.** Corrección pequeña y sin SQL: cambiar el texto por uno que diga la verdad —del estilo «Sin conexión: puedes ver el croquis, pero **no se pueden guardar cambios**; vuelve a intentarlo al recuperar la conexión»— y, mejor todavía, deshabilitar el guardado mientras no haya conexión, como ya hacen Catálogo y Caja |
| F11-01 | Media | **Se podía dar de baja una mesa con la cuenta abierta, sin ningún aviso.** Ni el croquis de `/mesas` distingue una mesa ocupada de una libre, ni el editor mencionaba la cuenta. Reproducido con la Mesa 9 y el pedido #1052 ($48.00, `open`): la baja se aplicó sin protestar y **el pedido desapareció de `/salon`** —donde el equipo trabaja— quedando visible sólo en `/pedidos`. No hay pérdida de datos ni dinero irrecuperable (la cuenta sigue alcanzable y cobrable desde el historial), pero sí riesgo real de que una cuenta viva se quede sin cobrar porque nadie la ve. | `src/pages/TablesPage.tsx` (`toggleActive` y el botón «Quitar mesa») | ✅ **Corregido** 20/08: «Quitar mesa» se deshabilita mientras la mesa tenga una cuenta rastreada y se explica debajo: «Tiene la cuenta #1052 abierta (Mesa 9). Cóbrala o cancélala antes de dar la mesa de baja». Es el mismo patrón que ya usaba el borrado de categorías con productos. **Ojo con el guard:** en la primera versión bloqueaba también «Reactivar mesa», justo la salida para arreglar una mesa ya dada de baja; se acotó a la baja. Verificado en los tres estados: bloqueada con cuenta viva, reactivación libre, y baja permitida en cuanto la cuenta se canceló |

| F15-01 | **Alta** | **En el ticket de 58 mm el método de pago se partía letra por letra.** La vista previa mostraba literalmente `TA` / `RJ` / `ET` / `A` en cuatro renglones: el importe con la propina en la misma línea («$270.00 + $20.00 propina») no dejaba espacio, y el CSS del renglón permite partir por cualquier carácter (`overflow-wrap:anywhere`). El resultado es ilegible en el comprobante que se entrega al cliente. **Transparencia sobre el origen:** lo destapó la corrección **F06-01** —al pasar de «CARD» (4 letras) a «TARJETA» (7) dejó de caber—, pero el defecto ya estaba latente: «TRANSFER», el valor crudo anterior, también se habría partido. | `src/lib/printing.ts` (renglón de pagos y CSS de `.row`) | ✅ **Corregido** 20/08: la propina pasa a su **propio renglón** indentado y el nombre del método no se parte (`white-space:nowrap`). Verificado en la vista previa real a 58 mm y a 80 mm: «TARJETA $270.00» completo y «Propina $20.00» debajo. 3 pruebas nuevas |

| F16-05 | **Alta** | **El tiempo real nunca ha funcionado en producción: falta una política que la propia migración avisa que hay que aplicar a mano, y no se aplicó.** La aplicación abre el canal como **privado** — `client.channel("branch:main", { config: { private: true } })` (`AppContext.tsx:252`) — y un canal privado de Supabase Realtime exige una política sobre `realtime.messages` que autorice el tema. Esa política **está comentada** en la migración inicial, con la nota de que `realtime.messages` pertenece a `supabase_realtime_admin`, que el rol de migraciones no puede crearla y que hay que **aplicarla a mano desde el editor SQL del panel** (`20260813023800_initial_pos.sql:594-599`). Nunca se hizo. **Aislado sin ambigüedad el 20/08:** un canal genérico se suscribe bien (`SUBSCRIBED`), y sobre **el mismo tema `branch:main`**, `private: false` devuelve `SUBSCRIBED` mientras `private: true` —como lo abre la aplicación— no responde nunca. Los disparadores del servidor sí publican (`realtime.broadcast_changes` sobre `orders`, `order_items`, `cafe_tables` y el catálogo): los mensajes salen y **nadie los puede recibir**. **Qué significa para el café:** ninguna pantalla se entera sola de nada. La barra no ve entrar una comanda nueva hasta que alguien recarga; el salón no ve que una mesa se liberó; quien cobra no ve que la barra terminó un plato. Todo el equipo trabaja con datos viejos sin ningún aviso de que lo son, porque el indicador sigue diciendo «Todo sincronizado». Es la clase de fallo que en una demostración con un solo dispositivo no se nota y en un turno con tres tabletas se nota todo el rato. | `src/state/AppContext.tsx:252`, `supabase/migrations/20260813023800_initial_pos.sql:594-599` | ✅ **Corregido y verificado el 20/08.** El responsable aplicó la política desde el editor SQL del panel y se comprobó en el acto: el canal privado pasó de no responder a `SUBSCRIBED`, el canal de la aplicación a **`joined`** en las dos ventanas, y un cambio hecho por gerencia apareció solo en la sesión del barista, sin recargar (ver F16-P11). **La sentencia aplicada fue una sola**, la que la propia migración dejaba escrita: `create policy "authenticated receive branch broadcasts" on realtime.messages for select to authenticated using ((select realtime.topic()) = 'branch:main');` Fue **aditiva y de riesgo mínimo**: esa tabla rechazaba a todo el mundo, así que sólo podía pasar de «nadie recibe» a «los autenticados reciben». No hizo falta Docker ni CLI, ni se tocó ninguna política existente. **Se revierte con** `drop policy "authenticated receive branch broadcasts" on realtime.messages;`. **Pendiente para la entrega:** esta política **no vive en `supabase/migrations/`** —no puede, por el dueño de la tabla— así que **un despliegue en un proyecto Supabase nuevo volverá a nacer sin tiempo real**. Debe quedar escrito en la guía de despliegue como paso manual obligatorio |
| F16-01 | **Alta** | **Una sincronización interrumpida abandona las operaciones para siempre, y la app dice que todo está bien.** `syncPendingOperations` marca el lote como `syncing` (`offline.ts:29`) *antes* de llamar al servidor. Si la pestaña se cierra, se recarga o la llamada lanza una excepción en esa ventana —`forceSync` no tiene `try/catch`, así que la excepción sale como rechazo no capturado— las operaciones se quedan en `syncing` de forma permanente: la consulta de reintento sólo mira `pending`/`review_required` (`offline.ts:22`), el arranque no las rescata y `pendingCount` tampoco las cuenta (`AppContext.tsx:161,234`). Resultado: la venta nunca sube al servidor y el indicador anuncia **«Todo sincronizado»**. Es el peor modo de fallo posible en una tableta de café con wifi inestable, porque es silencioso. Reproducido en vivo: con 28 pendientes, poner una en `syncing` dejó la consulta de la app contando 27. | `src/lib/offline.ts:22,29`, `src/state/AppContext.tsx:161,234` | ✅ **Corregido** 20/08: `reclaimStalledOperations()` devuelve a `pending` todo lo que quedó en `syncing`, y se llama en la hidratación de `AppContext` antes de contar. Reenviar es seguro porque el servidor descarta el duplicado por `idempotency_key` (`on conflict (idempotency_key) do nothing`). Verificado en el navegador: la operación atrapada volvió a `pending` **con su clave intacta** y el contador pasó de 27 a 28. Cubierto por 3 pruebas nuevas en `offline.test.ts` |
| F16-02 | Baja | **El resultado por operación que devuelve el servidor se descarta.** `sync_offline_operations` devuelve un arreglo `{id, status, duplicate}` por operación, pero el cliente hace `Array.isArray(data) ? A : B` con **las dos ramas idénticas** (`offline.ts:44`): marca `synced` todo el lote mirando sólo si hubo error de transporte. Hoy es inocuo porque cualquier rechazo del servidor lanza excepción y aborta la transacción entera, así que no existe el éxito parcial; pero el día que la RPC informe un rechazo por operación, el cliente lo dará por enviado. | `src/lib/offline.ts:44` | Documentado, **sin corregir por alcance** (endurecerlo el día de la entrega es riesgo innecesario). Anotado como deuda en la ficha de F16 |
| F16-03 | Media | **Una sola operación inválida bloquea toda la cola del dispositivo.** `sync_offline_operations` procesa el lote en **una transacción**: si una operación lanza (`Manager role required`, `Reason required`…), aborta el lote completo y el cliente marca como fallidas **todas** las operaciones, incluidas las sanas. Tras 3 intentos el lote entero cae en `review_required`, y **no hay ninguna forma de resolverlo desde la interfaz** (lo que F16-P10 anticipaba como límite). Bloqueo de cabeza de línea clásico. | `supabase/migrations/20260818140000_incident_amount_includes_modifiers.sql:16-190`, `src/lib/offline.ts:41-45` | Documentado como **límite conocido**; requiere migración SQL para aislar el fallo por operación y no hay Docker para probarla (regla 4). Debe quedar escrito en la ficha de F16 y avisarse al cliente |

| F16-04 | Media | **Un pedido tomado sin conexión puede acabar con un folio distinto del que lleva impreso la comanda que está en la barra.** Sin conexión no se puede reservar de la secuencia, así que `reserveFolio` cae a un consecutivo local, `Math.max(folios locales) + 1` (`AppContext.tsx:299-303`). Si ese número ya está ocupado al sincronizar, el servidor **lo descarta y asigna uno de la secuencia** — lo cual está bien resuelto y **no bloquea la cola** (`coalesce(v_folio, nextval(...))`, `20260818130000_server_assigned_folio.sql:82-86`). El problema es que **nadie se entera**: `sync_offline_operations` sólo devuelve `{id,status,duplicate}` por operación y el cliente ni eso mira (F16-02), así que el dispositivo sigue enseñando el folio viejo hasta que una recarga completa vuelve a bajar la orden. **Y el papel no se corrige nunca.** Verificado en producción el 20/08 forzando el choque: una orden creada con folio 1000 (ya ocupado) se guardó como **1084**; el dispositivo siguió mostrando 1000 y sólo se corrigió al recargar entero. **Cuándo muerde de verdad:** si se cae el internet, **todas** las tabletas del café quedan sin conexión a la vez y todas calculan el mismo folio siguiente; al volver la línea, una se lo queda y **el resto son reasignadas**, de modo que sus comandas de papel apuntan a números que pertenecen a otras órdenes. El barista que busque el #1000 de su comanda encontrará una orden ajena. No se pierde ningún dato y hay salida —buscar por nombre del pedido— pero conviene decírselo al cliente. | `src/state/AppContext.tsx:294-303`, `supabase/migrations/20260818130000_server_assigned_folio.sql:78-86` | ⚠️ **Abierto.** No se corrige en esta pasada. La salida limpia es que el servidor devuelva el folio definitivo por operación y el cliente lo aplique — que es exactamente lo que **F16-02** ya pedía habilitar |
| F13-01 | Media | **El «Ticket promedio» no cuadraba con ninguna división posible de lo que la pantalla muestra.** La tarjeta «Ventas» presenta la venta **neta** ($443.00) y «Tickets cobrados» 9, pero el promedio se calcula sobre la **bruta**: `gross / tickets` = $539.00 ÷ 9 = **$59.89**. El dueño que haga la división evidente —$443 ÷ 9 = $49.22— obtiene otra cifra y nada en pantalla explica la diferencia. Es precisamente el requisito de F13: *cada cifra debe cuadrar con una suma hecha a mano*. El cálculo en sí **es el correcto** (numerador y denominador comparten la base «ventas cerradas del periodo»; mezclar la neta con el conteo de tickets sería peor), así que el defecto es de presentación, no de aritmética. | `src/domain/reports.ts:355`, `src/pages/ReportsPage.tsx:332` | ✅ **Corregido** 20/08: la etiqueta pasa a **«Ticket promedio (bruto)»** (y «Contribución promedio (bruta)» al filtrar por método). Con eso la cifra queda reconciliable con lo que ya está en pantalla: ($443.00 neta + $96.00 reversiones) ÷ 9 = $59.89. **Fórmula intacta**, mismo criterio que se usó en F09-01. No se tocó `detail` porque lleva `truncate` y el texto se habría cortado. Verificado en el navegador: la etiqueta entra en una línea |
| F13-02 | Media | **El reporte impreso se queda sin la trazabilidad de cancelaciones y reversiones.** Al imprimir (`Guardar PDF` y `Cmd+P` son el mismo camino: `window.print()` de la ventana principal) se ocultan por `print:hidden` el **Detalle auditable**, las **Incidencias** y el indicador de **Insumos**. Que el detalle no salga es defendible —está paginado y en papel saldría sólo la primera página, engañando—, pero **Incidencias no está paginada**: se muestra entera (7 registros con empleado, motivo, importe y fecha) y aun así no se imprime. Choca con el requisito que el propio cliente confirmó en F01-04 y que motivó F08-02 y F08-04: poder responsabilizar a alguien de cada cancelación. Quien imprima el reporte para archivarlo o revisarlo no lleva ese dato en el papel. | `src/pages/ReportsPage.tsx` (bloques con `print:hidden`) | **Sin corregir por alcance**, documentado como límite conocido: cambiar qué entra en el papel el día de la entrega puede romper la maquetación impresa, que no se puede probar sin impresora (ver F15-P10). **Salida disponible mientras tanto: «Exportar CSV», que sí incluye el detalle completo.** Debe quedar escrito en la ficha de F13 y decírselo al cliente |
| F13-03 | Baja | **Las incidencias anteriores al 18/08 conservan el importe subestimado.** La migración de **F08-01** corrigió el cálculo hacia adelante, pero **no rellenó hacia atrás**: en la tabla de Incidencias siguen las filas viejas con los importes de antes ($180.00 en la anulación de 2 Matcha que valía $210.00; $186.00 en la cancelación de cuenta que valía $201.00). Son registros de prueba del 18/08 a las 10:17, anteriores a la migración de las 14:00. | `incidents` (filas históricas), migración `20260818140000` | Sin acción: **no es una regresión**, es historia previa al arreglo, y son datos de QA. Se documenta para que nadie lo lea como un defecto vivo. El histórico real del cliente empieza en la entrega, ya con el cálculo corregido |

| F12-01 | Baja | **Botón muerto: con una cantidad negativa, «Guardar» se dejaba pulsar y no pasaba absolutamente nada.** La condición del botón era `!Number(quantity)`, que frena el `0` pero **deja pasar los negativos**, así que con −3 el botón quedaba habilitado (y el conteo, con `quantity === ""`, aceptaba hasta −5). **Rectificación importante sobre la primera lectura de este hallazgo:** *no* hay corrupción de datos ni riesgo para el indicador. El valor nunca llega a guardarse, porque hay dos defensas más abajo: el propio manejador ya devuelve temprano (`saveMovement`: `value <= 0 \|\| !note.trim()`; `saveCount`: `value < 0`, `InventoryPage.tsx:124,133`) y la base repite la regla (`inventory_movements.quantity check (quantity > 0)`, `note check (length(trim(note)) > 0)`, `inventory_count_lines.quantity check (quantity >= 0)`). El defecto real es de interfaz y de confianza: quien administra pulsa un botón habilitado, no ocurre nada, **no aparece ningún aviso** y no tiene forma de saber por qué. El `min="0.001"` del campo tampoco ayuda: es decorativo, porque estos modales no envían formulario. | `src/pages/InventoryPage.tsx:170,171` | ✅ **Corregido** 20/08: `!(Number(quantity) > 0)` en el movimiento (bloquea negativo, cero y `NaN`) y `!(Number(quantity) >= 0)` en el conteo (bloquea negativo y `NaN`, **permite el 0**, que es una lectura legítima: contaste y no había). Ahora el botón refleja lo que el manejador va a hacer. Verificado en el navegador en las seis combinaciones, sin guardar ningún valor inválido en producción |
| F12-02 | Media | **La tabla «Consumo contado vs. receta teórica» no compara nada durante los primeros 30 días de operación.** La línea base se tomaba con `atOrBefore(counts, item, start)`, es decir **el último conteo anterior al inicio de la ventana**, y la ventana es fija de 30 días (`InventoryPage.tsx:117`). Los conteos hechos *dentro* del periodo no servían de línea base: sólo el más reciente contaba, como cierre. Consecuencia en la entrega: un café que empieza a contar hoy verá **«Falta línea base o segundo conteo» en todos sus insumos durante un mes entero**, por muchos conteos que haga — y el mensaje le pide justamente lo que ya hizo. Reproducido en vivo: con dos conteos reales (10 L y 10.5 L) la fila seguía vacía. | `src/domain/inventory.ts:26-28,41-48` | ✅ **Corregido** 20/08: si no hay conteo anterior a la ventana se usa como línea base el **primer conteo dentro** de ella (`firstWithin`), conservando la preferencia por el anterior cuando existe, de modo que el comportamiento ya probado no cambia. Verificado en producción: la fila pasó a «Con dos conteos comparables» con físico 0.5 L, y **destapó una variación real que estaba oculta**: `Lechuga`, +1.5 pza fuera de tolerancia. 4 pruebas de regresión |
| F12-03 | Baja | **La etiqueta de la fila mentía cuando sólo había un conteo.** Se decidía con `row.openingAt && row.closingAt`, pero con un único conteo ambas fechas apuntan a **la misma** lectura: la fila anunciaba «Con dos conteos comparables» mientras el físico y la diferencia mostraban "—". Apareció al verificar F12-02 en el navegador, **como efecto secundario de esa misma corrección** (antes esos insumos ni siquiera llegaban a tener `openingAt`). | `src/pages/InventoryPage.tsx:168` | ✅ **Corregido** 20/08 en la misma pasada: la etiqueta se decide por `row.physical !== undefined`, que es la condición que de verdad gobierna si hay comparación. Verificado: 0 filas incoherentes sobre los 8 insumos reales |

| F14-01 | Baja | **El error más probable de la pantalla de personal salía en inglés y hablaba de algo que el usuario nunca escribió.** Al intentar dar de alta un usuario que ya existe, la interfaz mostraba el mensaje crudo de Supabase Auth: *«A user with this email address has already been registered»*. La app fabrica un correo interno a partir del usuario (`VITE_AUTH_EMAIL_DOMAIN`), así que quien administra el personal —que sólo teclea un nombre de usuario— no tiene forma de relacionar ese texto con lo que hizo. `invokeError` devolvía el mensaje del servidor tal cual. Reproducido en producción intentando crear `gerente` de nuevo: **no se creó nada** (el rechazo funciona), pero el aviso era inservible. | `src/pages/PeoplePage.tsx:21-33` (`invokeError`) | ✅ **Corregido** 20/08: nueva función `readableError` que traduce los mensajes conocidos de Supabase Auth al vocabulario de la pantalla — «Ya existe un acceso con ese usuario. Elige otro nombre de usuario.» Se aplica en los tres puntos por los que pasa un error de la función (alta, restablecimiento de PIN y fallo de red), así que no hace falta **redesplegar la Edge Function** el día de la entrega. Verificado en vivo con el mismo caso |

| F14-05 | Media | **Sin conexión, la pantalla de Personal escupe un error técnico en inglés.** `PeoplePage.tsx` **no comprueba la conexión en ningún punto** —no menciona `navigator.onLine` ni una sola vez, a diferencia de Catálogo, Caja y Mesas, que sí tienen mensajes propios en español—, así que la llamada a la Edge Function falla y el error crudo llega a la pantalla: se lee literalmente **«TypeError: Failed to fetch»** donde debería estar la lista del personal, en una pantalla por lo demás enteramente en español. El botón «Crear acceso» sigue habilitado, de modo que se puede rellenar el formulario entero —incluido fijar un PIN— para que al final no ocurra nada explicable. Lo único que avisa es el indicador de la barra lateral, que dice «Sin conexión» pero no relaciona una cosa con la otra. Es la misma familia que **F14-01**, que se corrigió para el caso del usuario duplicado y dejó este camino sin cubrir. Encontrado al consolidar F16-C3. | `src/pages/PeoplePage.tsx` (sin ninguna comprobación de conexión) | ⚠️ **Abierto.** Corrección pequeña y sin SQL: comprobar `navigator.onLine` como ya hacen Catálogo y Caja, y traducir el fallo de red a un mensaje del estilo «Necesitas conexión a internet para administrar el personal.» |
| F14-02 | **Alta** | **Desactivar un acceso no lo revoca: sólo impide entrar de nuevo.** La comprobación de `active` vive en **un único sitio**, `AppContext.tsx:278`, dentro del inicio de sesión (`if (profileError || !profile?.active) throw new Error("Este acceso está desactivado.")`). Nada la revalida al restaurar la sesión, ni antes de ninguna operación. Verificado en producción el 20/08 sobre `@qa-20ago-user`: se dejó su sesión abierta, gerencia lo desactivó (`active: false` confirmado en `staff_profiles`, «Personal activo» bajó de 2 a 1) y esa sesión **siguió funcionando entera** — leyó pedidos, **reservó el folio 1083 de la secuencia del servidor** (`next_order_folio`) y el RPC `sync_offline_operations` le aceptó el lote. **Recargando la página entera sigue dentro**, con todo su menú operativo y la tarjeta anunciando «Sesión validada». Tampoco lo tapa el servidor: una inserción sonda en `orders` fue rechazada con `22P02` (valor de enum inválido) y **no** con `42501` (violación de RLS), lo que prueba que la escritura pasó el control de acceso y sólo la frenó el tipo de dato. Consecuencia para el café: si se despide a alguien y se desactiva su acceso, **cualquier tableta donde ya estuviera dentro sigue tomando pedidos y cobrando**, y el único remedio real es cerrar la sesión en ese dispositivo o invalidar el token desde Supabase. Mismo patrón, más leve, en **F14-03**. **Causa raíz localizada el 20/08:** el servidor decide quién eres a partir del **token**, no de la tabla. `private.current_role()` lee `auth.jwt() -> 'app_metadata' ->> 'role'`, y **`active` no viaja en el token** (comprobado descodificando el JWT: lleva `role`, no lleva `active`). Ninguna política consulta `staff_profiles.active`. Por eso desactivar en la tabla no tiene ningún efecto sobre una sesión ya emitida. | `src/state/AppContext.tsx:278` (único chequeo), `private.current_role()` en `20260813023800_initial_pos.sql:267`, políticas RLS | ⚠️ **Abierto por decisión expresa del responsable el 20/08**, que prefirió no tocar producción durante la revisión. **El análisis del arreglo ya está hecho, para que quien lo retome no lo repita.** Son tres piezas, de menos a más riesgo: **(1) Cliente** — revalidar `active` al restaurar la sesión y en cada sincronización. TypeScript puro, con pruebas unitarias, riesgo cero; cubre la tableta olvidada, que es el caso real. **(2) Guardas en los RPC** — un `if not active then raise` al principio de `sync_offline_operations`, `next_order_folio`, `close_order`, `reverse_sale`, `open_cash_session`, `record_cash_movement` y `dispatch_order_items`. Riesgo bajo: son `create or replace function` sueltas, cada una revertible por separado volviendo a pegar su definición anterior desde `supabase/migrations/`. Cubre **todas las escrituras operativas**, porque la aplicación es *offline-first* y encola todo por esos RPC. **(3) Políticas RLS** — añadir `and private.is_active()` a las ~40 políticas repartidas en 10 migraciones. Es lo único hermético frente a quien llame a la API a mano, y **el único paso de riesgo alto**: un fallo deja al café entero sin poder operar, y sin Docker no se puede ensayar la migración en local antes (regla 8). **No hace falta Docker ni el CLI para aplicar (1) y (2):** basta el editor SQL del panel de Supabase |
| F14-03 | Media | **Restablecer el PIN tampoco cierra la sesión que el empleado ya tuviera abierta.** Misma causa que F14-02: el PIN sólo se comprueba al entrar. Verificado el 20/08 dejando a propósito la pestaña del barista dentro durante el restablecimiento — su token siguió siendo válido contra el servidor. Es menos grave que F14-02 porque restablecer un PIN suele responder a un olvido, no a una baja; pero si se restablece **porque el PIN se comprometió**, quien lo conociera y ya estuviera dentro no sale. | `src/state/AppContext.tsx:278`, `supabase/functions/manage-staff/index.ts:93` | ⚠️ **Abierto.** Se resuelve con lo mismo que F14-02 |
| F14-04 | Media | **No hay forma de cambiar el rol de un empleado desde la aplicación.** El selector de rol existe **sólo en el formulario de alta** (`PeoplePage.tsx:107-108`); la tarjeta de un empleado ya creado ofrece únicamente «Restablecer PIN» y «Desactivar acceso». Y no es que falte el botón: la Edge Function **sólo acepta dos acciones**, `create` y `reset_pin` — cualquier otra responde `400 · «Acción desconocida.»` (`manage-staff/index.ts:53,93,112`). Quien se dio de alta como barista se queda barista. Ascender a alguien obliga a crear un acceso nuevo con rol gerente y desactivar el viejo, lo que le cambia el usuario y parte su historial de auditoría en dos. **Rectificación del 20/08, importante:** al comprobarlo se vio que la columna es escribible por gerencia, y de ahí se dedujo que bastaba con exponer el control en la tarjeta. **Eso era falso y habría sido peor que no tener la funcionalidad.** El rol vive en **dos sitios independientes**: la columna `staff_profiles.role`, que es la que pinta la interfaz, y `app_metadata.role` del usuario de Auth, que es **la única que mira el servidor** — `private.current_role()` lo lee de `auth.jwt() -> 'app_metadata' ->> 'role'` (`20260813023800_initial_pos.sql:267`), y de ahí cuelgan las ~40 políticas que usan `private.is_manager()`. La Edge Function las escribe **las dos** al dar de alta (`manage-staff/index.ts:69,75`). Escribir sólo la columna produciría un **ascenso a medias**: la persona aparecería como gerente en la lista y vería el menú de Gestión (el cliente lee la tabla), pero cada comprobación del servidor la seguiría tratando como barista. El arreglo correcto es **añadir la acción a la Edge Function**, que es quien puede tocar `app_metadata`. **Y no abre ningún agujero:** se comprobó que un barista **no** puede ascenderse solo (la RLS le devuelve 0 filas y sólo le deja leer su propia fila). | `src/pages/PeoplePage.tsx:107-108,154-166`, `supabase/functions/manage-staff/index.ts:56-75` | ⚠️ **Abierto por decisión del responsable el 20/08.** Es una funcionalidad que falta, no un defecto de una existente. Debe decírsele al cliente. El arreglo va en la Edge Function (una acción `update_role` que escriba `app_metadata` **y** la columna), no sólo en la pantalla — ver la rectificación de arriba |
| F12-04 | Media | **No había forma de retirar un insumo de la vista: la baja lógica sólo la respetaba una de las tres zonas de la pantalla.** `createInventoryAnalysis` filtra por `item.active`, pero la lista «Existencia contada», los dos selectores de los modales y el panel «Últimos registros» recorrían `items`/`movements` **sin mirar `active`**. Un insumo que el café deja de manejar seguía apareciendo —con su existencia, ofreciéndose para nuevos conteos y con sus movimientos en el panel lateral— y el único sitio donde desaparecía era la tabla de análisis, lo que además resulta desconcertante. **Se descubrió al intentar limpiar los datos de esta revisión** (§0.8 L2): al dar de baja `QA-20AGO-Leche` desapareció de la tabla pero siguió en las otras tres zonas. | `src/pages/InventoryPage.tsx:165,166,170,171` | ✅ **Corregido** 20/08: memos `activeItems` y `activeMovements` alimentan la lista, los dos selectores y los últimos registros; `items` completo se conserva para resolver el **nombre de los movimientos históricos** y para el detalle, que deben seguir siendo consultables. Verificado en producción: el insumo dado de baja desapareció de las tres zonas y los 7 reales quedaron intactos |

- [x] L8. **Inventario de lo que esta pasada dejó en producción, declarado sin adornos.**
      **Pedidos (4, todos cerrados o cancelados, ninguna cuenta abierta):** #1082 `QA-F16-offline`
      cobrado $63.00 por transferencia · #1084 `QA-F16-choque` cancelado · #1085 (Mesa 8) cancelado ·
      #1086 `QA-F10-C2` cobrado $30.15 por transferencia con descuento de $7.35. **Suman $93.15 a la
      venta del día**, todos identificables por su nombre `QA-`.
      **Catálogo:** producto `QA-20AGO-F10 producto` y extra `QA-20AGO-F10 sonda`, ambos con **baja
      lógica** (`active: false`), invisibles para el equipo. La receta asociada queda con ellos.
      **Personal:** `@qa-20ago-user`, dado de baja.
      **Insumos:** un conteo nuevo de 9.5 L sobre `QA-20AGO-Leche`, que sigue dado de baja. Los
      conteos son **inmutables por diseño** y no se pueden borrar; por eso se contó sobre el insumo
      de prueba y no sobre uno real del café.
      **Mesas:** la Mesa 8 se editó y se **devolvió a sus 2 lugares originales**.
      **Huecos en la numeración de folios:** el **1083** se consumió de la secuencia sin llegar a
      crear pedido (durante la prueba de F14-02). No falta ningún dato; sólo hay un salto.
      **Auditoría:** `audit_log` conserva `create_staff` y `reset_pin` del acceso de prueba, y las
      incidencias de las dos cancelaciones. Es correcto que así sea: son el rastro que hace
      auditable la operación.

Severidades: **Bloqueante** (impide entregar) · **Alta** (rompe un flujo, hay rodeo) · **Media**
(molesta pero no rompe) · **Baja** (cosmético).

### 0.8 Limpieza posterior

- [x] L1. **`.env.local` devuelto a modo demostración** al cerrar la sesión del 20/08, según la regla.
      Las credenciales reales siguen en `.env.local.bak`, `.env.production` y
      `.env.local.prod-recibido`, **los tres ignorados por git** (recomprobado con `git check-ignore`).
      Los servidores de desarrollo levantados para la pasada (puertos 5174, 5175 y 5176) quedaron
      parados.
- [x] L2. **Resuelto el 20/08 con baja lógica, y por el camino salió el hallazgo F12-04.**
      Lo creado en la pasada B fue: el insumo `QA-20AGO-Leche`, sus 2 conteos (10 L y 10.5 L) y sus
      2 movimientos (entrada +2 L, merma 1 L). No se creó ningún pedido, pago ni turno de caja, y
      **no se guardó ningún valor inválido** (los negativos de F12-01 se probaron sólo contra el
      estado del botón).
      **El borrado físico no es posible desde la aplicación, y está bien que así sea:** la RLS
      responde `permission denied` en `inventory_counts` e `inventory_count_lines`, y las claves
      foráneas son `on delete restrict`. El inventario es **inmutable por diseño**, que es lo que
      hace que los conteos sirvan como prueba. Se intentó, se rechazó y **no se perdió ni un dato**.
      La salida correcta es la que usa la propia aplicación para los productos: **baja lógica**
      (`active = false`), aplicada al insumo. Tras ella desaparece de la lista de existencias, de los
      selectores de conteo y movimiento, del panel de últimos registros y de la tabla de análisis —
      esto último **sólo funciona gracias a la corrección F12-04**, que se descubrió justo aquí.
      Queda invisible para el equipo del café y auditable en la base. Si aun así se quiere borrar de
      raíz, hay que hacerlo con la clave de servicio desde el panel de Supabase, en orden:
      `inventory_count_lines` → `inventory_counts` → `inventory_movements` → `inventory_items`.
- [x] L3. **No hay ningún turno de caja abierto** (`cash_sessions` con `closed_at is null` devuelve
      cero filas). Durante esta pasada no se abrió ninguno: los dos cobros de prueba se hicieron
      **por transferencia**, precisamente para no tocar el arqueo de efectivo del café.
- [x] L4. **En verde al cerrar: 196 pruebas, 13 archivos; lint sin advertencias; build sin errores.**
      La suite creció de 180 a 196 (+16: 2 de mapeo remoto, 6 de redondeo al centavo, 8 de reportes),
      y **sólo creció**: no se quitó ni se relajó ninguna.
- [x] L5. **Las 16 de 16 están en `docs/qa/pdf/`.** F14 se redactó y generó el 20/08, en cuanto el
      responsable cerró los casos que exigen crear una credencial y entrar con ella.
- [x] L7. **Hecho al cerrar: `@qa-20ago-user` quedó `active: false`.** Es una credencial real creada en producción
      para F14-P2. Ya se comprobó en P8/P9 que desactivar y reactivar funcionan, así que la baja
      lógica es la salida correcta (el borrado físico no procede: partiría el rastro de `audit_log`,
      que conserva su `create_staff` y su `reset_pin`). **Ojo con F14-02:** desactivarlo no cierra
      sesiones abiertas — hay que cerrar además la sesión de la pestaña del puerto 5175.
      *Efecto secundario a declarar:* durante F14-02 se consumió el **folio 1083** de la secuencia
      del servidor sin llegar a crear ningún pedido, así que quedará un hueco en la numeración. No
      se creó ninguna orden, ningún pago ni ningún turno de caja.
- [x] L6. **Cumplido, y sin necesidad de purgar nada.** Antes de cambiar a producción se comprobó la
      cola en el navegador: estaba en **0 operaciones**, y los 7 pedidos que había en la base local
      eran todos del sembrado de demostración (identificadores `demo-*`), no datos reales. Además, la
      pasada de producción se levantó en **un origen nuevo** (puerto 5174), cuyo IndexedDB nace
      vacío, de modo que **no existía ninguna operación de demostración que pudiera subirse**. La
      caché de demostración del 5173 quedó intacta y no hubo que borrar nada.

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

- [x] F02-P13. **Verificado el 20/08 con un pedido real.** El folio más alto en el servidor era 1084;
      al crear la orden **con conexión** se asignó el **1085**, es decir de `next_order_folio()`
      (`order_folio_seq`) y no de un cálculo local. La orden nació ya `synced` y estaba en el
      servidor en el acto, con su mesa.
      (`next_order_folio`). Comprobar en la pestaña Red que la RPC se llamó y que el folio impreso
      coincide con el devuelto.
- [x] F02-P14. **Verificado en F16-P3, y con una consecuencia que no estaba prevista.** Sin conexión
      se asignó el folio local provisional **1082** (`Math.max(folios locales) + 1`), el pedido quedó
      encolado y al reconectar subió entero y correcto. **Pero** si ese número provisional ya está
      ocupado, el servidor asigna otro de la secuencia y **el dispositivo no se entera hasta recargar,
      mientras la comanda de papel conserva el viejo** → hallazgo **F16-04**. Comprobado forzando el
      choque: una orden con folio 1000 se guardó como 1084. Original: 
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
- [x] F04-C2. **Verificado el 20/08 con un pedido de mesa real** (#1085 en la Mesa 8, que estaba
      libre). Tras enviarlo a la barra, `/salon` muestra en la vista de lista **«Mesa 8 · 2 lugares ·
      #1085 · En preparación · $48.00»**, el croquis la pinta con el color de preparación y el
      marcador de cabecera pasa a «3 En preparación» y «1 de 8 mesas libres». La comanda salió con
      «MESA 8». *Nota original: 
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
- [x] F04-U2. **Hecho el 20/08, y el redondeo destapó el hallazgo F07-06 (Alta).** La mitad del caso
      —el total con líneas canceladas— ya la cubría F07. La otra mitad, el redondeo a centavos, no la
      cubría nadie: `money.ts` **no redondeaba en ningún punto**, así que 3 × $10.05 daba
      `30.150000000000002` mientras la pantalla anunciaba `$30.15`. Añadidos **6 casos** de regresión
      en `src/domain/money.test.ts` (comprobado que los 6 fallan sin la corrección y pasan con ella).
      Suite: **188 en verde**, lint y build limpios.

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
- [x] F06-C2. **Confirmado el 20/08 en los tres puntos a la vez.** Al finalizar la orden #1085, el
      estado es `served` **en el modelo local**, `served` **en la columna cruda de la tabla del
      servidor**, y `served` **después de volver a bajarlo y pasarlo por `mapRemoteOrder`**. La
      migración `20260817162350_order_served_status.sql` lo respalda y el mapeo no lo traduce ni lo
      pierde. Cubierto además por la prueba unitaria que recorre los 7 estados (F16-U1).

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

- [x] F10-P17. **Verificado el 20/08.** Creado `QA-20AGO-F10 producto` a **$37.50** en la categoría
      Café. En la red, el `POST` a una tabla de catálogo responde **201** y el `PATCH` **204**;
      tras recargar la página entera el producto **sigue ahí**, con su precio y disponible, y el
      contador del catálogo pasó de 21 a 22. *De paso se observó algo bueno: tras cada escritura
      llegan los `GET` de refresco (200), que es el **tiempo real ya corregido** (F16-05) disparando
      la recarga de datos.*
- [x] F10-P18. **Verificado, mensaje exacto.** Sin conexión y con Supabase configurado, al intentar
      crear un producto sale **«Necesitas conexión para modificar el catálogo.»**, **no se crea
      nada** y el catálogo se queda en 22. Confirmado como límite: el catálogo **no** es
      *offline-first*, a diferencia de los pedidos. Queda escrito en el PDF de F16-C3.
- [x] F10-P19. **Verificado en las dos mitades.** Se asignó al producto de prueba una receta base de
      **0.25 L de «Bebida de almendra»**: la RPC `replace_inventory_recipe` respondió **200** sin
      error, y en el servidor quedaron la fila de `inventory_recipes` y su línea con `quantity 0.25`.
      **Tras recargar la página entera**, al reabrir «Configurar recetas» el modal vuelve a mostrar
      «Bebida de almendra (L) · 0.25».
- [x] F10-P20. **Verificado.** La URL pública de Storage de un producto con imagen
      (`/storage/v1/object/public/product-images/…`) **abre en una pestaña nueva y muestra la
      imagen** (1280×854). No hizo falta subir nada nuevo: ya había un producto con imagen en
      Storage.

### Funcionalidades conectadas a verificar

- [x] F10-C1. **Verificado.** El producto recién creado aparece en el selector de `/venta/nueva`
      con su precio $37.50 y su descripción, y se encuentra escribiendo en el buscador.
- [x] F10-C2. **Verificado de punta a punta, no por inferencia.** Se vendió el producto de prueba
      (orden #1086) y se marcó listo en la barra. **Detalle que conviene dejar escrito:** el consumo
      teórico **no se registra al despachar, sino al marcar el renglón como `prepared`** — el
      disparador `capture_recipe_usage` sale temprano si el estado no es ése
      (`20260817210000_inventory_counting_and_recipes.sql:120`). Al marcarlo listo se creó el evento
      («QA-20AGO-F10 producto», cantidad 1) con su línea **«Bebida de almendra 0.25»**, es decir
      `receta × cantidad`. Y en `/insumos`, la tabla «Consumo contado vs. receta teórica» muestra la
      fila **«Bebida de almendra · TEÓRICO 0.25 L»**.
- [x] F10-C3. **Verificado con el caso completo.** Se dio de baja el producto de prueba **después**
      de haberlo vendido (orden #1086). En el servidor queda `active: false`, desaparece de la caché
      local y el catálogo vuelve de 22 a 21 — pero **Reportes sigue mostrando la venta intacta**:
      $93.15, 2 tickets, la orden #1086 y el nombre del producto, sin errores ni `NaN`. Aguanta
      porque el renglón guarda su propia copia del nombre y el precio (ya visto en F10-P11).
      *Observación: la eliminación **no pide confirmación** antes de aplicarse; es el comportamiento
      ya documentado en F10-P11.*

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
- [x] F11-P9. **Verificado el 20/08.** Se cambiaron los lugares de la Mesa 8 de 2 a 3: en la red, el
      `PATCH` a `cafe_tables` responde **204**, el servidor devuelve `seats: 3` y **tras recargar la
      página entera el cambio sigue**. *De paso quedó confirmada en pantalla la corrección **F11-01**:
      el botón «Quitar mesa» aparece **deshabilitado** con el aviso «Tiene la cuenta #1085 abierta
      (Mesa 8). Cóbrala o cancélala antes de dar la mesa de baja.»*
- [!] F11-P10. **Respondida la pregunta del caso, y con un hallazgo: F11-02.** Confirmado que las
      mesas **no pasan por la cola**: al editar sin conexión, el dispositivo mostró el valor nuevo
      (5 lugares) y la cola siguió en **0 operaciones**. **¿Queda inconsistencia al reconectar? No.**
      La descarga remota pisa el valor local y todo vuelve a coincidir (dispositivo 3, servidor 3).
      **Pero el precio es que el cambio se pierde en silencio**, y el aviso de la pantalla promete lo
      contrario → **F11-02**.

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

> **Pasada B completada (20/08)** contra Supabase real con sesión de gerente. Se creó el insumo
> `QA-20AGO-Leche` (L, mínimo 8, **tolerancia 0.5** — elegida a propósito para poder probar el límite
> exacto) y sobre él se ejecutó el ciclo entero. **Dos hallazgos reales: F12-01 y F12-02.**

- [x] F12-P1. Insumo `QA-20AGO-Leche` creado (unidad L, mínimo 8, tolerancia 0.5). Confirmado en
      `inventory_items` del servidor, no sólo en pantalla. El botón «Crear insumo» nace
      deshabilitado con el formulario vacío.
- [x] F12-P2. Conteo de línea base de **10 L** con nota `QA-20AGO linea base`. La fila dejó de decir
      "pendiente de línea base" y pasó a "contado 20/08/26, 12:56 p.m. · 10 L". Verificado en
      `inventory_count_lines`.
- [x] F12-P3. Entrada de **+2 L** con nota → aparece en "Últimos registros" como
      «QA-20AGO-Leche +2 L · Entrada · QA-20AGO compra proveedor», con la flecha hacia arriba.
- [x] F12-P4. Merma de **1 L** con nota → aparece como «−1 L · Merma · QA-20AGO merma», flecha abajo.
- [!] F12-P5. **Hallazgo menor → F12-01.** Lo que el caso pedía sí se cumple (cantidad 0 y nota vacía
      o de sólo espacios quedan rechazadas), **pero con una cantidad negativa el botón quedaba
      habilitado**: al pulsarlo no ocurría nada ni se mostraba aviso alguno. Comprobado después que
      el dato **nunca podía llegar a guardarse** —el manejador ya retornaba temprano y la base tiene
      sus propios `check`—, así que era un botón muerto, no un riesgo de datos. Corregido y
      reverificado en las seis combinaciones.
- [x] F12-P6. **Sólo pasa gracias a la corrección de F12-02.** Con los dos conteos (10 L y 10.5 L),
      la tabla calcula: entradas 2 L, mermas 1 L, **físico 0.5 L**, teórico 0 L, diferencia +0.5 L.
      Cuadra con la suma manual: 10 + 2 − 10.5 − 1 = **0.5**. Antes del arreglo la fila seguía
      diciendo "Falta línea base o segundo conteo" pese a tener los dos conteos.
- [x] F12-P7. `Lechuga` (1 pza contada, mínimo 2) muestra la etiqueta **Reponer**, con
      `bg-error-container` y color calculado `rgb(147, 0, 10)` — rojo, como pide el caso.
- [x] F12-P8. **Verificado en el límite exacto, que es donde se rompen estas reglas.** Con tolerancia
      0.5 y variación de exactamente 0.5, la diferencia **no** se marca en rojo (`0.5 > 0.5` es
      falso). Y con datos reales sí alerta: `Lechuga` da físico 2 pza contra 0.5 pza teórico,
      diferencia **+1.5 pza en rojo** con tolerancia ±0.
- [x] F12-P9. El detalle del insumo abre con «CONSUMO ENTRE CONTEOS» (desde, hasta, días, entradas,
      mermas, consumo físico) e «HISTORIAL». El primer periodo se rotula «Línea base» con "—" en
      consumo, sin inventar un número.
- [x] F12-P10. Con un solo conteo la fila dice "Falta línea base o segundo conteo" y deja físico y
      diferencia en "—". Verificado sobre los 6 insumos que están en ese estado.
- [x] F12-P11. **Verificado el 20/08 con un conteo real.** Sin conexión se registró un conteo de
      **9.5 L** con nota: quedó encolado como `record_inventory_count` en estado **`pending`**, y al
      restaurar la red pasó a **`synced` con 0 reintentos** y apareció en el servidor
      (`inventory_counts` + `inventory_count_lines`) con su cantidad y su nota.
      *Se contó sobre el insumo de prueba `QA-20AGO-Leche` —reactivado para el caso y devuelto a
      baja lógica al terminar— **precisamente porque los conteos son inmutables por diseño y no se
      pueden borrar** (§0.8 L2): contar un insumo real habría dejado una lectura falsa permanente en
      el análisis de varianza del café.*
      *Nota de método: las claves de idempotencia comparten los primeros caracteres porque el formato
      es `${deviceId}:${id}` (`offline.ts:8`) — el prefijo es el dispositivo, no un duplicado. Se
      comprobó para descartar un falso hallazgo.*
      Original: queda encolado y se sincroniza al volver
      (a diferencia del catálogo, los insumos **sí** pasan por `offline.ts`). Verificar la
      idempotencia: no debe duplicarse al reintentar (F16). **Pendiente**, se cruza con F16-P3/P7.

### Funcionalidades conectadas a verificar

- [x] F12-C1. **Confirmado con datos reales:** `Lechuga` tiene un consumo teórico de **0.5 pza**
      distinto de cero, que sólo puede venir de las recetas de `/catalogo` resueltas por el servidor
      en `inventory_usage_lines`. El resto de insumos, sin receta o sin ventas, dan 0.
- [x] F12-C2. Confirmado: la propia pantalla lo declara arriba — «Los conteos son la existencia
      física. Las recetas sólo generan indicadores y **nunca descuentan stock**» — y la tabla lo
      repite. Es un límite **deliberado**, no un error, y así debe ir en la ficha.
- [x] F12-C3. El mismo bloque aparece en `/reportes` ("Consumo físico vs. receta teórica") con los
      mismos 7 insumos y la misma leyenda. **Diferencia legítima a documentar:** Reportes lo calcula
      sobre el **periodo elegido en el filtro** y `/insumos` sobre una ventana fija de **30 días**,
      así que las cifras no tienen por qué coincidir salvo que se elijan los mismos días.

### Pruebas unitarias

- [x] F12-U1. `src/domain/inventory.test.ts` ampliado de 8 a **16 casos**. Lo pedido: variación
      **exactamente en el límite** de la tolerancia (no alerta), un decimal por encima (sí alerta),
      la misma prueba **por debajo** con variación negativa (−0.6 también alerta: se comprueba que
      usa el valor absoluto), e insumo sin conteos (ni físico ni variación, y no alerta). Más 4 casos
      de regresión de **F12-02**: compara dos conteos hechos dentro de la ventana, cuenta sólo los
      movimientos ocurridos entre ellos (no los anteriores), sigue sin comparar con un único conteo,
      y **da preferencia al conteo anterior a la ventana cuando existe** (para no cambiar el
      comportamiento que ya funcionaba). Suite total: **180 pruebas en verde**.

### Ficha PDF

- [x] F12-D1. `docs/qa/fichas/F12-insumos.html` redactado
- [x] F12-D2. `docs/qa/pdf/F12-insumos.pdf` generado con Chrome (Skia)

---

## F13 · Reportes · **[Requiere B]**

**Rutas:** `/reportes` · **Archivos:** `src/pages/ReportsPage.tsx`, `src/domain/reports.ts` (444
líneas, el módulo de cálculo más grande) · **Pasada:** B · **Rol:** sólo gerente

Es lo que el cliente va a mirar primero. Cada cifra debe cuadrar con una suma hecha a mano.

### Pruebas en navegador

> **Pasada B completada (20/08)** contra Supabase real con sesión de gerente. **Método:** se eligió
> el **18/08** por ser el único día con la mezcla difícil (7 cobros, 2 reversiones, 1 cancelación) y
> se recalcularon **todas** las cifras a mano, leyendo las filas crudas de `orders`, `order_items` y
> `payments` con una implementación propia — **sin importar `reports.ts`**, para no caer en un
> razonamiento circular. Referencia manual del día: bruta **$539.00**, reversiones **$96.00**, neta
> **$443.00**, 9 tickets, propinas **$10.00**, descuentos **$8.00**, 1 cancelación, efectivo
> **$388.00**, tarjeta **$0.00**, transferencia **$55.00**. Se encontró un hallazgo real: el ticket
> promedio no era reconciliable (**F13-01**).

- [x] F13-P1. Los presets funcionan y el rango personalizado también: «Hoy» (20/08, sin datos) y
      `2026-08-18 al 2026-08-18`, que es el que se auditó a mano.
- [x] F13-P2. Filtro por tipo, **cuadrado a mano**: Mesa $200.00 / 3 tickets y Para llevar
      $243.00 / 6 tickets. $200 + $243 = **$443** = el total sin filtrar. Exacto.
- [x] F13-P3. Filtro por empleado, **cuadrado a mano**: Gerente $443.00 / 9 (todo el día lo cerró
      gerencia) y Ana López $0.00 / 0. Coincide con el recálculo por `closed_by`.
- [x] F13-P4. **Venta neta = suma manual.** Pantalla **$443.00** frente a manual **$443.00**
      ($539.00 de 9 ventas cerradas − $96.00 de las 2 reversiones). Exacto al centavo.
- [x] F13-P5. Métodos de pago: efectivo $388.00 + tarjeta $0.00 + transferencia $55.00 = **$443.00**
      = venta neta. Exacto. **Salvedad de contrato a documentar:** la igualdad se cumple porque todas
      las ventas del día quedaron **pagadas por completo**. La bruta usa `orderTotal` (lo que la
      cuenta valía) mientras que el desglose por método usa los pagos topados al total
      (`paymentContributions`), así que una venta cerrada con pago incompleto rompería la igualdad.
      No es un defecto observado, es el contrato: conviene que quede escrito.
- [x] F13-P6. Ventas por hora: 01h $220.00, 02h $135.00, 12h $88.00, 14h $0.00 — **suman $443.00**,
      el total del periodo. Las cuatro horas coinciden exactamente con el recálculo manual sobre
      `closed_at`/`reversed_at` en zona `America/Mexico_City`. La hora 14h queda en $0.00 porque la
      #1080 se cobró y se revirtió dentro de la misma hora: correcto, no es un hueco.
- [x] F13-P7. Ventas por día: `18/08 · 9 tickets · $443.00`, idéntico al detalle y a la suma manual.
- [x] F13-P8. Los cuatro cruces alternan de forma coherente y coinciden con el cálculo manual
      (Espresso 4u/$192, Americano 2u/$110, Pozole Rojo 1u/$100, Chai 1u/$80, Flat White 1u/$65):
      «más/unidades» y «más/ingreso» dan el mismo orden, y «menos» es el inverso. **Comprobación
      cruzada:** el ingreso de productos suma $547.00 = $539.00 de venta bruta + $8.00 de descuento,
      que es justo lo esperado porque el ranking va antes de descuento.
- [x] F13-P9. El detalle trae las 8 columnas pedidas (venta, evento, empleado, tipo, bruta,
      reversión, neta, propina) y **10 registros** = 9 cobros + 1 cancelación. Los eventos combinados
      se etiquetan «Cobro · Reversión».
- [x] F13-P10. `Página 1 de 1` con **Anterior y Siguiente deshabilitados** en ambos extremos, que es
      el comportamiento correcto para un periodo de 10 registros.
- [x] F13-P11. El enlace del folio abre la venta: `#1080` → `/venta/39511e02-…`, con la cabecera
      «Revertido» y el texto «Venta revertida · El cobro se anuló y quedó registrado en Reportes»
      (de paso confirma **F07-05** contra producción real).
- [x] F13-P12. La venta revertida #1080 aparece con **bruta $48.00, reversión −$48.00 y neta $0.00**;
      la reversión se muestra en rojo. Igual la #1056.
- [x] F13-P13. La cancelada #1045 aparece con evento «Cancelación», empleado «—», y **bruta $0.00 /
      neta $0.00**: no suma a la venta pese a que la cuenta valía $201.00. Correcto.
- [x] F13-P14. **Mejor de lo que pedía el caso.** El periodo «Hoy» (sin datos) no se queda en ceros
      confusos: **cada sección trae su propio estado vacío redactado** — «Sin movimientos financieros
      · No hubo cobros ni reversiones en este periodo», «Sin ventas en el periodo», «Sin productos
      cobrados en el periodo», «Sin registros», «Sin incidencias». Ningún error en consola.
- [x] F13-P15. **Verificado por estructura, sin abrir el diálogo** (abrirlo cuelga la automatización,
      §0.9). Se comprobó que «Guardar PDF» y `Cmd+P` son **el mismo camino**: el botón llama a
      `window.print()` de la ventana principal (1 llamada contada con `print` neutralizado), no a un
      marco oculto. Al imprimir se ocultan los controles (filtros y botones) y **tres secciones de
      datos: Detalle auditable, Incidencias e Insumos**; se conservan las métricas, la tendencia, los
      métodos de pago, las ventas por hora, por día y el ranking. Funciona como está programado →
      pero el contenido que se pierde merece aviso: hallazgo **F13-02**.
- [!] F13-P16. **No verificable con los datos actuales.** El tope es de 1000 registros por página de
      consulta y la base real tiene **13 pedidos liquidados en total**, así que no hay forma honesta
      de provocar la condición sin sembrar cientos de pedidos falsos en producción, que es
      justamente lo que la higiene de esta revisión prohíbe. Queda como **riesgo abierto para la
      entrega**: el rendimiento con volumen real de meses no está medido. Lo que sí se comprobó es
      que la consulta **pagina de verdad** (`fetchPage` itera en bloques de `PAGE_SIZE` hasta agotar),
      así que el tope de 1000 no trunca en silencio.

### Funcionalidades conectadas a verificar

- [!] F13-C1. **Sólo verificable de forma trivial hoy, y conviene decirlo así.** Lo que sí queda
      comprobado y es sustantivo: **la suma de métodos cuadra al centavo con la venta neta** —
      Efectivo $0.00 + Tarjeta $0.00 + Transferencia $93.15 = **$93.15**, que es exactamente la cifra
      de «Ventas». Lo que **no** se pudo ejercitar a fondo: `/caja` **no tiene ningún turno abierto**
      y los dos cobros de la jornada se hicieron **por transferencia** (deliberadamente, para no
      alterar el arqueo real del café), así que el cruce en efectivo se cumple con $0 en ambos lados
      y no prueba gran cosa. Hacerlo de verdad exigiría abrir un turno y cobrar en efectivo, lo que
      dejaría un turno abierto en producción contra la regla de limpieza L3. **La discrepancia real
      entre Caja y Reportes ya está documentada y es un hallazgo aparte: F09-01**, que delimita el
      efectivo por eventos distintos en cada pantalla.
- [x] F13-C2. **Verificado cuadrando a mano.** Con dos ventas cobradas hoy —#1082 por $63.00 y
      #1086 por $37.50 con un descuento de **$7.35**— Reportes muestra «Descuentos **$7.35**»,
      «Tickets cobrados **2**» y «Ventas **$93.15**», que es exactamente `63.00 + (37.50 − 7.35)`.
      El descuento se refleja en la venta neta.
      **Aclaración de vocabulario que debe ir al PDF:** en esta aplicación «bruto» significa *antes
      de reversiones*, **no** antes de descuentos — el `orderTotal` de `reports.ts:216` ya resta el
      descuento. Al cuadrar a mano el «Ticket promedio (bruto)» ($46.58 = 93.15 ÷ 2) parece no
      encajar si uno entiende «bruto» como *antes de descuentos* ($100.50 ÷ 2 = $50.25). **No es un
      defecto** y la fórmula es coherente con el código, pero el dueño de un café puede leerlo en el
      otro sentido; conviene decirlo explícitamente en la ficha. Relacionado con **F13-01**.
- [x] F13-C3. **Coincide, comprobado con un dato nuevo creado a propósito.** Tras vender el producto
      con receta, `/insumos` muestra «Bebida de almendra · TEÓRICO **0.25 L**» y Reportes, en su
      tabla «Consumo físico vs. receta teórica», muestra **la misma cifra**.
      **Diferencia legítima que conviene dejar escrita para que nadie la marque como fallo:**
      `Lechuga` aparece con 0.5 en `/insumos` y con 0 en Reportes. No es un descuadre — `/insumos`
      usa una ventana fija de **30 días** y Reportes está filtrado al periodo elegido («Hoy»),
      mientras ese consumo es del 18/08.
- [x] F13-C4. **Verificado en vivo, con una prueba que no existía antes.** El filtro «Empleado» de
      Reportes ofrece ahora **«Ana López», «Gerente» y «QA 20 agosto»** — este último es el acceso
      creado durante F14-P2, así que los nombres salen de `staff_profiles` y se actualizan solos, no
      son un literal.

### Pruebas unitarias

- [x] F13-U1. **Ampliado el 20/08: de 11 a 19 casos.** Se revisó primero qué faltaba de verdad —la
      agrupación por hora y por día ya tenían 2 casos cada una— y se añadieron **8** sobre los huecos
      reales:
      · **Cruce de medianoche (2).** Es el de más valor. La zona horaria del reporte es
      `America/Mexico_City` (UTC−6 todo el año), así que la medianoche local son las **06:00 UTC**.
      Dos ventas cerradas a las `05:30Z` y `06:30Z` caen **el mismo día en UTC** y deben quedar en
      **días locales distintos** (16 y 17) y en las horas 23 y 0. Agrupar por UTC sumaría el cierre
      de una noche al día siguiente.
      · **Empates en el ranking (3).** No hay desempate implementado: `sortProducts` se apoya en que
      el `sort` de JavaScript es **estable** (normativo desde ES2019), así que dos productos con la
      misma cantidad conservan el orden de entrada. Queda fijado por prueba para que nadie lo cambie
      sin darse cuenta. Cubre también el recorte por límite.
      · **Periodo vacío (1).** Sin ventas, el ticket promedio debe ser **0 y no `NaN`** —que en
      pantalla saldría como «$NaN»—, las filas vacías y los tres métodos de pago a cero.
      · **Reversión dentro o fuera del rango (2), el caso que el propio plan señalaba como el más
      fácil de equivocar.** Cerrada dentro y revertida después → cuenta entera aquí (bruta 180,
      1 ticket, reversiones 0). Cerrada antes y revertida dentro → **resta aquí sin sumar ticket**
      (bruta 0, 0 tickets, reversiones 180, neta **−180**). Es la mecánica que subyace a **F09-01**.
      Suite total: **196 en verde**, lint y build limpios.

### Ficha PDF

- [x] F13-D1. `docs/qa/fichas/F13-reportes.html` redactado
- [x] F13-D2. `docs/qa/pdf/F13-reportes.pdf` generado con Chrome (Skia), revisado visualmente

---

## F14 · Personal · **[Requiere B]**

**Rutas:** `/personal` · **Archivos:** `src/pages/PeoplePage.tsx`, Edge Function
`supabase/functions/manage-staff` · **Pasada:** B · **Rol:** sólo gerente

Depende de una Edge Function desplegada. **Primero verificar que está desplegada**; si no lo está,
todo F14 falla por infraestructura, no por código.

### Pruebas en navegador

- [x] F14-P0. **Confirmado el 20/08:** `manage-staff` está desplegada y `ACTIVE` (versión 3,
      `verify_jwt: true`), junto con `qz-sign`. **F14 no está bloqueada por infraestructura.**
> **Pasada B parcial (20/08).** Se verificó todo lo que **no exige crear una credencial ni
> autenticarse con ella**. Los casos restantes (P2, P3, P6-P10) dependen de dar de alta un acceso con
> PIN y luego entrar con él: por la regla 9 de esta revisión, **eso lo hace el responsable**, no el
> ejecutor. **P11 se excluyó por decisión del responsable** (ver abajo). Un hallazgo real: **F14-01**.
> Nada de lo probado alteró el personal existente: al terminar seguían sólo `gerente` (activo,
> manager) y `ana` (desactivada, barista), idénticos al inicio.

- [x] F14-P0. **Confirmado el 20/08:** `manage-staff` está desplegada y `ACTIVE` (versión 3,
      `verify_jwt: true`), junto con `qz-sign`. **F14 no está bloqueada por infraestructura.**
- [x] F14-P1. La lista muestra las cuatro columnas pedidas: `Gerente / @gerente / Gerente / Activo`
      y `Ana López / @ana / Barista / Desactivado`, más las métricas «Personal activo 1»,
      «Gerentes 1» y «PIN restablecido 0».
- [x] F14-P2. **Hecho por el responsable el 20/08.** Se creó `QA 20 agosto` / `@qa-20ago-user` /
      Barista / Activo. **Ojo con el nombre:** el plan pedía `QA-20AGO-user`, pero el campo aplica
      `toLowerCase()` y filtra a `[a-z0-9._-]` (`PeoplePage.tsx:105`), así que el usuario real es
      **`qa-20ago-user`** en minúsculas. No es un defecto: el recuadro de ayuda lo advierte
      («Minúsculas, números, puntos y guiones.») y es lo que evita la colisión por acentos de
      F01-03. Verificado en las dos capas: aparece en la lista con sus cuatro columnas, «Personal
      activo» sube de 1 a **2**, «Gerentes» se queda en **1** (correcto: es barista) y «PIN
      restablecido» sigue en **0**; y en el servidor, `staff_profiles` devuelve la fila con
      `role: barista`, `active: true`.
- [x] F14-P3. **Hecho por el responsable el 20/08.** Entró como `@qa-20ago-user` y la aplicación lo
      recibió como **Barista** («Tu turno · QA 20 agosto», tarjeta de sesión «QA 20 agosto ·
      Barista»). La barra lateral muestra **sólo la sección «Operación»**: la de «Gestión» no
      aparece. Comprobado además que el límite no es cosmético — tecleando la ruta a mano,
      `/personal`, `/catalogo`, `/mesas`, `/reportes`, `/insumos` y `/configuracion` **redirigen las
      seis a `/inicio`**, mientras `/caja` y `/cobros` sí abren, que es justo lo que ofrece su menú.
      Y con el token de esa misma sesión de barista, la Edge Function `manage-staff` responde
      **403 · «Sólo gerencia puede administrar personal.»**
      *En vez de una ventana de incógnito se usó un segundo servidor de desarrollo en el puerto
      5175: otro origen, así que la sesión de gerencia del 5174 no se toca y ambas quedan
      verificables desde fuera. Mismo efecto, y permite comprobar las dos sesiones a la vez.*
- [!] F14-P4. **Hallazgo real → F14-01.** No crea el duplicado (verificado: el personal siguió
      intacto), **pero el aviso no era claro**: devolvía el error crudo de Supabase Auth,
      *«A user with this email address has already been registered»* — en inglés, en una pantalla
      enteramente en español, y hablando de un **correo** que quien administra nunca escribió, porque
      lo que teclea es un usuario. Corregido y reverificado: ahora dice «Ya existe un acceso con ese
      usuario. Elige otro nombre de usuario.»
- [x] F14-P5. **Validación correcta y en dos capas.** El PIN no numérico es **imposible por
      construcción**: `PinField` filtra al teclear (`replace(/\D/g, "")`) y recorta a 8 dígitos, así
      que no se pueden escribir letras. El PIN corto lo rechaza el servidor con mensaje claro:
      probado con `123` → «El PIN debe ser numérico, de 6 a 8 dígitos.» y **nada creado** en
      `staff_profiles`. El formulario vacío lo frena la validación nativa del navegador (`required`),
      que es por lo que el botón puede estar habilitado sin peligro.
- [x] F14-P6. **Hecho por el responsable el 20/08. Se comporta como debe.** Tras restablecer el PIN
      desde la tarjeta del empleado, el intento con el PIN viejo se rechaza con **«Usuario o PIN
      incorrectos.»** —mensaje genérico, que es lo correcto: no delata si el usuario existe— y el PIN
      nuevo entra sin problema (sesión validada a las 03:40:21, rol `barista`).
      **Observación de seguridad que el caso no pedía y conviene conocer → F14-02:** el
      restablecimiento **no cierra la sesión que el empleado ya tuviera abierta**. Se dejó a
      propósito la pestaña B dentro durante el restablecimiento y el token siguió siendo válido
      contra el servidor.
- [x] F14-P7. **Verificado el 20/08.** La tarjeta «PIN restablecido» pasó de **0 a 1** al terminar
      P6, sin recargar. Contrastado con la fuente y no sólo con la pantalla: `audit_log` trae las dos
      filas nuevas —`create_staff` y `reset_pin`— sobre la misma `entity_id`
      (`91862ddd-…` = `@qa-20ago-user`), las dos con el `actor_id` de la sesión de gerencia, que es
      lo que permite responsabilizar a alguien.
- [!] F14-P8. **El caso, tal como está escrito, pasa: el mensaje es exactamente «Este acceso está
      desactivado.»** Pero al probarlo de más salió **F14-02 (Alta)**: desactivar **no cierra la
      sesión que el empleado ya tuviera abierta**. Se dejó a propósito la pestaña B dentro mientras
      gerencia desactivaba; con `active: false` ya confirmado en `staff_profiles`, esa sesión siguió
      leyendo pedidos, **reservó el folio 1083** de la secuencia real y recargando la página entera
      **seguía dentro**. Tampoco lo tapa el servidor. Marcado `[!]` por ese hallazgo, no por el
      mensaje. *(Se probó sobre `@qa-20ago-user`, no sobre `ana`, que es una persona real.)*
- [x] F14-P9. **Verificado el 20/08.** Al reactivar desde la tarjeta, `active` vuelve a `true` en
      `staff_profiles` y «Personal activo» sube otra vez de 1 a **2**. El responsable entró de nuevo
      con el mismo PIN sin ningún problema (sesión validada a las 03:46:54), otra vez como **barista**
      y sin menú de «Gestión». La reactivación no cambia el rol ni pide PIN nuevo.
- [!] F14-P10. **No se puede ejecutar: la aplicación no permite cambiar el rol de nadie → hallazgo
      F14-04 (Media).** Comprobado en las dos capas y en vivo, no sólo leyendo el código. En la
      interfaz, el selector de rol existe **sólo en el formulario de alta**; la tarjeta de un
      empleado ya creado ofrece únicamente «Restablecer PIN» y «Desactivar acceso». Y en el
      servidor, la Edge Function respondió `400 · «Acción desconocida.»` a las cuatro variantes
      probadas (`update_role`, `set_role`, `update`, `change_role`), porque sólo admite `create` y
      `reset_pin`.
      **Hallazgo de seguridad de signo contrario, y es una buena noticia:** al comprobar si la
      columna `role` se podía escribir saltándose la función, resultó que **la gerencia sí puede**
      actualizarla directamente sobre `staff_profiles` (es la misma vía por la que el propio botón
      de desactivar escribe, `PeoplePage.tsx:200`). Eso obligaba a preguntar lo evidente: **¿puede
      un barista ascenderse solo?** **No.** Probado desde la sesión real del barista, la RLS lo
      filtra: la actualización de su propio `role` a `manager` devuelve **0 filas cambiadas**,
      desactivar al gerente devuelve **0 filas**, y de `staff_profiles` **sólo alcanza a leer su
      propia fila**. El estado del personal quedó intacto tras las pruebas (comprobado). *El rol del
      usuario de prueba se cambió y se devolvió a `barista` en el acto durante esta comprobación.*
- [ ] F14-P11. Intentar desactivar la **propia** cuenta del gerente conectado.
      **Excluido a propósito el 20/08 por decisión del responsable:** si el sistema lo permite, deja
      al negocio sin ningún acceso de gerencia y habría que recuperarlo desde Supabase. Queda como
      **riesgo abierto, no verificado**, y debe decírsele al cliente.

### Funcionalidades conectadas a verificar

- [x] F14-C1. **Verificado en F13:** la columna «Empleado» del detalle auditable y de la tabla de
      Incidencias muestra «Gerente», y el filtro por empleado ofrece «Ana López» y «Gerente» — los
      nombres salen de `staff_profiles`, no de un literal.
- [x] F14-C2. **Verificado por código el 20/08 y reverificado con una sesión real de barista en
      F14-P3** (redirección en las seis rutas de gestión y 403 de la Edge Function con su propio
      token). En las dos capas. En el cliente, `/personal` vive dentro de
      `ManagerOnly` (ya comprobado en F01-P8: el barista es redirigido). En el servidor, la Edge
      Function repite la comprobación antes de cualquier acción y responde **403** con «Sólo gerencia
      puede administrar personal.» (`manage-staff/index.ts:43`), de modo que no basta con saltarse la
      interfaz.
- [x] F14-C3. `audit_log` es legible desde la sesión de gerencia y la Edge Function escribe en él
      con `action: "reset_pin"` (`manage-staff/index.ts:104`). La comprobación de que **sube en uno**
      queda en F14-P7, que depende de P6.

### Pruebas unitarias

- [x] F14-U1. **No hace falta añadir nada, y conviene dejar escrito por qué.** La normalización de
      usuario a correo interno ya está cubierta por los **7 casos de `supabase.test.ts`** (F01-U1),
      que incluyen el caso de seguridad de que un usuario no pueda escaparse del dominio interno. Y
      la validación de formato de PIN **no vive en el cliente**: el campo impide teclear no-dígitos y
      la regla real (`/^\d{6,8}$/`) está en la Edge Function, que es código Deno fuera del alcance de
      esta suite de Vitest. Duplicar ahí una expresión regular que no se ejecuta daría una falsa
      sensación de cobertura.

### Ficha PDF

- [x] F14-D1. `docs/qa/fichas/F14-personal.html` redactado el 20/08, partiendo de `_plantilla.html`
- [x] F14-D2. `docs/qa/pdf/F14-personal.pdf` generado con Chrome (3 páginas, las mismas que F13 y
      F16) y **revisado visualmente** en el navegador. **Con esto están las 16 de 16.**

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

- [x] F16-P1. **Verificado el 20/08 en producción.** Con conexión, la barra lateral dice «Todo
      sincronizado» y la pastilla de cabecera «Sincronizado». *(Son dos indicadores distintos:
      `ProtectedLayout.tsx:38` y `SyncPill.tsx:7`. Ambos coherentes.)*
- [x] F16-P2. **Verificado.** Al cortar, la barra lateral pasa a «**0 cambios · Sin conexión**» y la
      pastilla a «Sin conexión». *Método: la aplicación se apoya enteramente en `navigator.onLine` y
      en los eventos `online`/`offline` (30 usos en `AppContext`), así que se replicó exactamente eso
      y **además** se bloqueó el tráfico real a `supabase.co`, para que ningún camino que ignore la
      bandera pudiera colarse y dar un aprobado falso.*
- [x] F16-P3. **Verificado con un pedido real.** Sin conexión se creó `QA-F16-offline` (para llevar),
      se le añadió 1 × Espresso $48 + extra «Carga extra» $15 y nota de preparación, y se envió a la
      barra. El catálogo se sirvió de IndexedDB **con las categorías en su orden correcto** (Café
      primero: la corrección de F02-01 aguanta también sin conexión). Quedó `preparing`, el renglón
      `dispatched` con su lote, y **dos operaciones encoladas** (`create_order` y
      `dispatch_order_items`). La comanda salió íntegra, con el extra y la nota — es decir, las
      correcciones **F04-01 y F04-02 también funcionan sin conexión**.
- [x] F16-P4. **Verificado.** Tras recargar la página entera, la **sesión de gerente sigue abierta**
      y el pedido sigue ahí con su folio, su estado `preparing` y sus renglones. *Salvedad de método:
      la bandera `navigator.onLine` no sobrevive a una recarga con las herramientas disponibles, así
      que la recarga se hizo con conectividad. Lo que el caso comprueba de fondo —que reiniciar el
      dispositivo no pierde ni los datos ni la sesión— sí quedó comprobado.*
- [x] F16-P5. **Verificado, y por la vía que pide el caso.** Se restauró la red **sin recargar**: el
      evento `online` disparó `forceSync` solo, las dos operaciones pasaron de `pending` a `synced` y
      el pedido quedó `synced`. Contador a cero.
- [x] F16-P6. **Verificado contra el servidor, campo a campo.** Bajando la orden con
      `REMOTE_ORDER_SELECT` y pasándola por `mapRemoteOrder`, coinciden **folio (1082), estado
      (`preparing`), total ($63.00), nombre, el renglón con su precio, el extra con su importe, la
      nota, el estado del renglón (`dispatched`) y el identificador del lote**. La ida y vuelta es
      fiel.
- [x] F16-P7. **La prueba más importante de la sección, y la pasa.** Se devolvieron al estado
      `pending` las dos operaciones **ya sincronizadas**, conservando su clave de idempotencia, y se
      forzó la cola **dos veces seguidas**. Resultado: el pedido **no se duplicó** —sigue habiendo 1
      pedido, 1 folio y 1 renglón— y `offline_operations` conserva exactamente **2 filas**. El
      `on conflict (idempotency_key) do nothing` del servidor hace su trabajo. *De paso queda
      confirmado en vivo **F16-02**: el servidor marcó las operaciones como duplicadas y el cliente
      informó `{synced:2}` igualmente, porque descarta el resultado por operación.*
- [x] F16-P8. **Verificado con un cobro real.** Se finalizó `QA-F16-offline`, se cortó la red y se
      cobró sin conexión: saldo a $0.00, ticket impreso correctamente (con «TRANSFERENCIA» en
      español —corrección F06-01— más el extra y la nota), orden `closed` en local y **dos
      operaciones encoladas**. Al restaurar la red quedó en el servidor **exactamente un pago** de
      $63.00, la orden `closed` y la cola en 0. Sin duplicación.
      *Se cobró por **transferencia**, no en efectivo, a propósito: así el cobro de prueba no altera
      el arqueo de caja real del café. El cruce con F09 queda cubierto por el lado que importa, que
      es la no duplicación del pago.*
- [x] F16-P9. **Verificado con un conflicto reproducible.** En vez de dos ediciones simultáneas (que
      el servidor resuelve por *upsert*, sin conflicto real), se provocó el caso que sí falla: una
      operación que **el servidor rechaza lanzando excepción** — un `apply_discount` encolado desde
      la sesión de un **barista**, cuando el descuento está reservado a gerencia. La secuencia es
      exactamente la diseñada: intento 1 → `pending` (1 intento contado), intento 2 → `pending` (2),
      **intento 3 → `review_required`**. Después sigue reintentando y sigue fallando.
- [x] F16-P10. **Comprobado en pantalla, y confirma el límite. El indicador acierta; la salida no
      existe.** Con la operación en `review_required`, la barra lateral dice exactamente **«Hay
      operaciones por revisar»** (`ProtectedLayout.tsx:38`). Pero **no hay ninguna forma de
      resolverlo desde la interfaz**: ni botón de reintentar, descartar o revisar, ni pantalla de
      operaciones pendientes (`/operaciones`, `/sincronizacion` y `/pendientes` no existen), ni una
      sola línea que explique al usuario qué debe hacer. El aviso es un callejón sin salida. Esto
      **verifica en pantalla el límite que F16-03 sólo tenía documentado por lectura de código**, y
      queda escrito en el PDF.
      *Aviso de método: al forzar la cola llamando directamente a `syncPendingOperations()` el
      indicador seguía diciendo «Todo sincronizado», porque quien actualiza el estado de React es
      `forceSync`. **Eso era artefacto de la prueba, no un defecto**; disparando la sincronización
      por la vía de la aplicación, la etiqueta es la correcta. Se deja anotado para que nadie lo
      apunte como hallazgo al repetir la prueba.*
- [x] F16-P11. **Falló, se corrigió durante la sesión y quedó verificado. Ver hallazgo F16-05
      (Alta).** *Primer intento:* con las dos ventanas abiertas y sesión en ambas, el canal
      `realtime:branch:main` **nunca llegaba a `joined`** —ciclaba entre `errored` y `joining` con el
      socket abierto—, en las dos sesiones, gerente y barista, así que no era cuestión de rol.
      Causa: faltaba la política de `realtime.messages` que la propia migración avisa de aplicar a
      mano. *Tras aplicarla el responsable:* el canal pasa a **`joined`** en ambas ventanas y la
      propagación funciona. **Prueba de punta a punta:** desde la ventana de **gerencia** se canceló
      la orden #1084 con motivo; la ventana del **barista**, sin tocarla y **sin recargar**
      (`performance` sigue marcando la navegación original, no una recarga), pasó a mostrar
      «Cancelado» **y el motivo**. Cruza los dos roles y las dos direcciones.
- [x] F16-P12. **Verificado, y se comporta mejor de lo que pedía el caso.** Sin sesión previa y sin
      conexión, la pantalla de acceso **avisa antes de dejar intentarlo** —«Sin conexión. Sólo una
      sesión que ya estaba abierta puede continuar operando.»— y además **deshabilita el botón
      "Entrar"** (comprobado: `disabled === true`). El mensaje que cita el plan, «El primer acceso o
      cambio de usuario requiere conexión.», es el de la excepción interna
      (`AppContext.tsx:273`) y no llega a verse nunca, porque no se puede ni pulsar el botón.

### Funcionalidades conectadas a verificar

- [x] F16-C1. **Demostrado de punta a punta, no por lectura.** Sin conexión se hizo el ciclo
      completo sobre un pedido real: crearlo, añadirle producto con extra y nota, enviarlo a
      preparación (con su comanda impresa), finalizarlo, **cobrarlo** e imprimir el ticket. Todo
      funcionó, todo quedó encolado, y al volver la conexión todo subió una sola vez y sin
      duplicados (P3, P5, P6, P7 y P8).
- [x] F16-C2. **Confirmado.** El conteo y el movimiento de insumos se encolan con
      `queueOperation("record_inventory_count"…)` y `queueOperation("record_inventory_movement"…)`
      (`InventoryPage.tsx:133,142`), y viajan por **su propia RPC** con clave de idempotencia
      (`offline.ts:48-49`). La condición es `if (supabase)`, **no** `navigator.onLine`, así que
      encolan correctamente sin conexión. Cubierto además por 2 casos de `offline.test.ts`, uno de
      ellos comprobando que **un insumo que falla no arrastra al lote de pedidos**. Cruza con
      F12-P11.
- [x] F16-C3. **Consolidado. Tres de las cuatro avisan bien; la cuarta no → hallazgo F14-05.**
      · **Catálogo:** bloquea y explica, con mensaje propio por cada cosa — «Necesitas conexión para
      modificar el catálogo / los extras / las categorías.» (`AppContext.tsx:419-543`).
      · **Caja:** bloquea y explica, por acción — «Necesitas conexión a internet para abrir un turno
      / registrar un retiro / hacer el corte.» (`CashPage.tsx:200,210,222`).
      · **Mesas:** **no bloquea, avisa** — «Sin conexión: los cambios se ven aquí pero no se
      guardarán hasta reconectar.» (`TablesPage.tsx:51`). Es un comportamiento distinto de los otros
      dos y hay que contarlo tal cual al cliente. Cruza con F11-P10.
      · **Personal:** **no comprueba la conexión en ningún punto** —`PeoplePage.tsx` no menciona
      `navigator.onLine` ni una vez— y sin conexión **escupe `TypeError: Failed to fetch` en
      pantalla**. Ver **F14-05**.

### Pruebas unitarias

- [x] F16-U1. **Confirmado el 20/08, con dos huecos cerrados.** `src/lib/remoteOrders.test.ts` tenía
      **16** casos, no 14. El mapeo está **completo frente al modelo local**: `Order` no guarda
      `closedAt` ni `reversedAt`, así que no hay ningún campo del servidor que se pierda, y
      `REMOTE_ORDER_SELECT` pide explícitamente los lotes de despacho. La ida y vuelta de los **7
      estados de orden** y de la **propina** ya estaba cubierta. Faltaban dos casts sin prueba, de la
      misma naturaleza que el estado de orden (que sí la tenía, precisamente por eso): el **estado
      del renglón** (sólo se ejercitaban `prepared` y `cancelled` de los cuatro) y el **método de
      pago** (sólo `cash` de los tres). Añadidos **2 casos** que recorren los cuatro estados de
      renglón y los tres métodos con propina. Suite: **182 en verde**, lint y build limpios.
- [x] F16-U2. **Hecha el 20/08 y rentable de inmediato: destapó el hallazgo F16-01 (Alta).**
      `src/lib/offline.test.ts` nuevo, **16 casos**, con un doble en memoria de la tabla Dexie y
      Supabase simulado (sin IndexedDB ni navegador). Cubre lo pedido —operación aceptada → `synced`;
      fallo de red → sigue `pending` y reintentable con el intento contado; la clave de idempotencia
      **no cambia entre reintentos** (se comprueba sobre lo que se envía, no sólo sobre lo guardado);
      tercer fallo → `review_required`— y además: la cola se envía en orden de creación, sin conexión
      y en modo demostración nada se marca falsamente como enviado, una operación en `review_required`
      se reintenta y puede recuperarse sola, los insumos viajan por su propia RPC con la clave, y un
      insumo que falla **no arrastra al lote de pedidos**. Los 3 últimos casos son la regresión de
      **F16-01**: uno de ellos deja escrito que, antes del arreglo, `syncPendingOperations` devuelve
      `{synced:0, review:0}` ante una operación atrapada en `syncing` — es decir, la da por
      inexistente. Suite total: **172 pruebas en verde**, lint y build limpios.

### Ficha PDF

- [x] F16-D1. `docs/qa/fichas/F16-offline-y-sincronizacion.html` redactado
- [x] F16-D2. `docs/qa/pdf/F16-offline-y-sincronizacion.pdf` generado con Chrome (Skia)

---

## Cierre

- [x] Z1. **Las 16 funcionalidades están en ✅ o ⚠️.** Ninguna queda en ⬜ ni en 🟡.
- [x] Z2. **Bitácora completa, con severidad en cada entrada. 50 hallazgos** a lo largo de las tres
      jornadas, contados sobre el propio documento:
      · **34 corregidos y verificados** (los 7 de esta jornada: F07-06, F16-05, F16-01 ya venía,
      más los de pasadas anteriores).
      · **7 abiertos**, todos con su análisis del arreglo escrito: **F08-05** (Alta), **F14-02**
      (Alta), F11-02, F14-03, F14-04, F14-05 y F16-04 (Media). Los de F14 quedaron abiertos **por
      decisión expresa del responsable**; F08-05 y F11-02 se hallaron al final y no se abrió
      corrección para no dejarla a medias sin avisar.
      · **9 documentados sin acción**: límites conocidos que van al PDF (F02-02, F04-04, F04-05,
      F13-02, F13-03, F16-02, F16-03) y **2 retractados tras comprobarlos** — F01-03, descartado
      porque la colisión no puede producirse, y F09-02, que era un falso positivo de la prueba.
- [x] Z3. **Los 16 PDF están en `docs/qa/pdf/`.** El de F14 se redactó el 20/08 y el de F16 se
      regeneró con los resultados de navegador.
- [x] Z4. **Limpieza terminada** (§0.8, L1 a L8), con el inventario de lo que quedó en producción
      declarado en L8.
- [x] Z5. **Resumen ejecutivo redactado**, abajo.

### Z5 · Resumen ejecutivo para el cliente

*Redactado el 20/08/2026, al terminar la revisión. Escrito para leerse sin conocer el código.*

**Qué se revisó.** Las 16 funcionalidades del punto de venta, una por una, contra la base real del
café: acceso y roles, toma de pedidos, salón, comanda, barra, entrega, cobro, cancelación y
reversión, caja, catálogo, mesas, insumos, reportes, personal, impresión y trabajo sin internet.
Cada una tiene su ficha en PDF con lo que hace, lo que **no** hace y sus límites. Son 16 fichas.

**Qué está listo para entregar.** El flujo diario completo funciona y está verificado con dinero
real: tomar un pedido, mandarlo a la barra con su comanda, marcarlo listo, entregarlo, cobrarlo con
descuento o propina, imprimir el ticket y verlo reflejado en los reportes. Cuadra al centavo. La
operación **sigue funcionando sin internet** —se probó tomando y cobrando un pedido con la red
cortada— y al volver la conexión todo sube una sola vez, sin duplicarse. Los permisos se respetan en
la aplicación **y en el servidor**: un barista no puede administrar personal ni ascenderse solo, ni
saltándose la pantalla.

**Lo que esta jornada encontró y arregló.** Dos cosas serias que no se veían:

1. **El trabajo en equipo en tiempo real nunca había funcionado.** Faltaba un permiso en la base de
   datos que hay que aplicar a mano y que se quedó sin aplicar desde el principio. El efecto era
   invisible con un solo dispositivo y constante con varios: la barra no veía entrar comandas
   nuevas, el salón no veía liberarse mesas, y nadie se enteraba de que estaba mirando datos viejos.
   **Corregido y verificado durante la revisión.** Queda anotado en la guía de despliegue, porque un
   servidor nuevo volvería a nacer sin él si se olvida.
2. **Una cuenta pagada podía quedarse sin poder cerrarse.** Por cómo se redondeaban los importes, en
   ciertos totales la pantalla anunciaba «pendiente $0.00» y el botón de cerrar no aparecía. Con los
   precios actuales del café —todos en pesos enteros— no llegaba a ocurrir, pero habría empezado a
   ocurrir el día que se pusiera un precio con centavos. **Corregido, con pruebas que lo impiden en
   el futuro.**

**Lo que hay que decidir antes de abrir al público.** Dos asuntos, ninguno bloqueante, los dos
documentados con el arreglo ya analizado:

- **Dar de baja a un empleado no lo echa de la aplicación.** Le impide volver a entrar, pero si su
  tableta ya estaba dentro, sigue tomando pedidos y cobrando. Si se despide a alguien, **hay que
  cerrar la sesión en su dispositivo**, no basta con desactivarlo. (F14-02)
- **Cancelar una cuenta desde el listado de Pedidos o desde el Salón no avisa a la barra.** Si se
  cancela desde la pantalla de la propia venta, sí sale la comanda de cancelación; desde los otros
  dos caminos, la cocina puede seguir preparando algo ya cancelado. (F08-05)

**Límites conocidos, que conviene saber de antemano.**

- **Sin internet se puede vender, pero no configurar.** Pedidos, cobros y conteos de insumos
  funcionan sin conexión y se guardan solos al volver. Catálogo, caja y personal **exigen conexión**
  y lo avisan. Las mesas son el caso raro: dejan editar y **el cambio se pierde al reconectar**,
  cosa que el aviso no dice bien (F11-02).
- **Si se cae el internet con varias tabletas**, los pedidos que se tomen pueden acabar con un folio
  distinto del que lleva impreso su comanda de papel. No se pierde ningún pedido; se localiza por el
  nombre de la cuenta. (F16-04)
- **No se puede cambiar el rol de un empleado** desde la aplicación: hay que crear un acceso nuevo.
  (F14-04)
- **El reporte impreso no incluye** el detalle auditable ni la tabla de incidencias; para llevarse
  el detalle hay que usar «Exportar CSV». (F13-02)
- **Si una operación se queda «por revisar»**, la aplicación lo avisa pero **no ofrece manera de
  resolverlo**; hace falta apoyo técnico. (F16-03)
- **El inventario es inmutable a propósito**: los conteos no se pueden borrar, sólo dar de baja el
  insumo. Es lo que hace que sirvan como prueba.

**Qué quedó fuera de alcance, y por qué.**

- **Impresión en papel real.** Todo se verificó sobre el contenido generado, pero no había impresora
  térmica disponible. (F15-P10)
- **Desactivar la propia cuenta del único gerente.** Excluido por decisión del responsable: si el
  sistema lo permitiera, el negocio se quedaría sin acceso de gerencia. La interfaz sí lo impide;
  **no se comprobó si el servidor también**. Es el único riesgo que queda sin verificar. (F14-P11)
- **Volumen alto de datos.** El tope de 1000 registros por página de reportes no se pudo ejercitar
  con los datos actuales. (F13-P16)
- **Cuadre del efectivo contra caja.** Los cobros de prueba se hicieron por transferencia para no
  alterar el arqueo real, así que el cruce en efectivo quedó comprobado sólo de forma trivial. La
  diferencia de criterio entre Caja y Reportes está documentada aparte. (F13-C1, F09-01)

---

### Si el tiempo no alcanza para todo

Prioridad, de mayor a menor, pensada para un día de entrega:

1. **F04, F07, F09** — comanda, cobro y caja. Es dinero; un error aquí se ve el primer día.
2. **F16** — offline. Es lo que rompe en producción y no se ve en la demo.
3. **F08, F13** — reversión y reportes. Es lo que el dueño va a revisar.
4. **F01, F02, F03, F05, F06** — el flujo operativo; si algo falla aquí se nota de inmediato y se
   corrige rápido.
5. **F10, F11, F12, F14, F15** — configuración y administración; se usan poco y casi siempre con
   el implementador presente.
