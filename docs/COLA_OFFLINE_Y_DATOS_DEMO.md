# La cola offline y los datos de demostración

> Nota para la siguiente iteración. Documenta un incidente real detectado el **26 de agosto de 2026**,
> el arreglo parcial que ya lleva el código y lo que queda por hacer.

## Qué pasó

Durante **cinco días**, del 21 al 26 de agosto, **ninguna venta llegó al servidor**. La aplicación no
mostró ningún error: sólo el indicador rojo «Hay operaciones por revisar» en la barra lateral, que es
fácil de confundir con un aviso menor y que no lleva a ninguna pantalla donde revisar nada.

El síntoma por el que se descubrió fue otro: al cobrar una cuenta, el inventario no bajaba. La causa
resultó no tener nada que ver con el inventario. La orden nunca llegaba a `closed` en la base, así
que el disparador que descuenta insumos nunca corría.

En la cola había **doce** operaciones, **diez** atascadas. Dos de ellas —dos `cancel_order` del 21 de
agosto— traían `entityId` con los valores `demo-table-3` y `demo-table-6`. Llevaban **51 intentos**.

## Por qué dos operaciones bloqueaban a todas

`public.sync_offline_operations` es **una sola transacción plpgsql**: recorre el arreglo de
operaciones en un `for`, y si cualquiera lanza, se revierte el lote entero. En su primera línea útil
hace `v_entity := (v_operation->>'entityId')::uuid`. Con `demo-table-3` eso revienta con `22P02`
(`invalid input syntax for type uuid`) antes de tocar nada.

Del lado del cliente, `syncPendingOperations` mandaba **todas** las operaciones de órdenes en un solo
lote y, al fallar, las marcaba todas como fallidas:

```js
if (error) failed.push(...standard.map((operation) => operation.id));
```

Eso es correcto respecto a la base —no se guardó nada—, pero **no había reintento individual**. Una
operación rota para siempre condena a todas las que vengan detrás, indefinidamente. Cada venta nueva
entraba al mismo lote envenenado y salía marcada como fallida.

## La causa de raíz: Dexie comparte base entre demo y real

`src/lib/db.ts` abre la base con el nombre `"vereda-pos"` **siempre**, sin importar si la aplicación
corre en modo demostración (sin `VITE_SUPABASE_URL`) o contra el proyecto real. En modo demo las
mesas tienen ids como `demo-table-3` en lugar de UUID.

Una sesión de demostración en la misma máquina y el mismo navegador deja sus operaciones en la misma
cola que la sesión real. En cuanto la aplicación vuelve a modo real, intenta subirlas — y no puede,
porque esas entidades no existen ni pueden existir en la base.

Basta con que alguien abra la demo una vez en la máquina del punto de venta para envenenar la cola.

## Qué ya se arregló

### 26/08/2026 · contener el daño

En `src/lib/offline.ts`:

1. **Reintento individual cuando el lote falla.** Si el lote traía más de una operación, se reenvían
   de una en una: las buenas entran y la rota se aísla. Si el lote traía una sola, no se reenvía —
   ya sabemos que esa es la que falla.
2. **`lastError` en `PendingOperation`.** Se guarda el mensaje y el código que devolvió el servidor,
   y se limpia si la operación acaba entrando. Antes, «Hay operaciones por revisar» no daba nada con
   lo que revisar.

Cubierto por seis casos en `src/lib/offline.test.ts`, bajo
`syncPendingOperations · una operación rota no bloquea a las demás`.

Eso contenía el daño pero no lo evitaba: una operación de demostración seguía entrando a la cola.

### 27/08/2026 · cortar la raíz

3. **Cada modo con su propia base.** `src/lib/db.ts` deriva el nombre de `isSupabaseConfigured`:
   `vereda-pos` contra el proyecto real, `vereda-pos-demo` en demostración. El nombre real no se
   toca, porque las instalaciones existentes ya guardan ahí sus datos. La condición se extrajo a
   `src/lib/environment.ts` para que `db.ts` no tenga que duplicarla —desincronizarlas haría que la
   aplicación real abriera la base de la demostración— ni arrastre la creación del cliente Supabase
   como efecto de importar la base.

   *Verificado:* con la demo levantada aparte, una comanda con mesa deja su `create_order` en
   `vereda-pos-demo` mientras la cola de `vereda-pos` sigue en cero.

4. **La cola aparta lo que el servidor no puede aceptar.** `sync_offline_operations` empieza
   casteando `entityId` a uuid, así que una operación cuyo id no lo sea no entrará jamás: no es un
   fallo pasajero que merezca reintentarse. `syncPendingOperations` las separa antes de enviar nada,
   con un motivo legible. Ya no se generan, pero las instalaciones que mezclaron ambos modos todavía
   las arrastran, y sin esto gastaban una petición por cada una en cada sincronización.

## Lo que queda pendiente

Las dos son de interfaz y se dejaron fuera a propósito el 27/08/2026: con la raíz cortada, el atasco
ya no puede repetirse por esta vía, así que ninguna es urgente. Siguen anotadas porque el día que
falle otra cosa —y algo fallará— la cola volverá a ser una caja negra.

### 1. Una pantalla para revisar la cola atascada

Hoy `lastError` sólo se ve abriendo IndexedDB a mano. Un panel en Ajustes que liste las operaciones
en `review_required` con su tipo, fecha, intentos y motivo, y que permita descartarlas, habría
convertido cinco días de silencio en dos minutos de diagnóstico.

*Criterio de aceptación:* con una operación rota en la cola, el indicador debe llevar a una pantalla
que diga qué operación es y por qué falla.

### 2. Que el indicador rojo pese lo que pesa

«Hay operaciones por revisar» describe un estado en el que **las ventas no se están guardando**. Ese
mensaje merece un tono más alarmante y, probablemente, la antigüedad de la operación más vieja
(«hay ventas sin subir desde hace 5 días» se ignora mucho menos).

## Cómo diagnosticarlo si vuelve a pasar

Con la aplicación abierta y la sesión iniciada, en la consola del navegador:

```js
// 1. Qué hay atascado y por qué
const db = await new Promise((res, rej) => {
  const r = indexedDB.open("vereda-pos");
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const all = await new Promise((res, rej) => {
  const r = db.transaction("pendingOperations", "readonly").objectStore("pendingOperations").getAll();
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
console.table(all.filter(o => o.status !== "synced")
  .map(o => ({ type: o.type, entityId: o.entityId, attempts: o.attempts, lastError: o.lastError })));
```

Si `lastError` viene vacío (operaciones anteriores a este arreglo), reenvía cada una por separado
contra la RPC para que el servidor diga el motivo — enviarlas de una en una es seguro: el servidor
descarta duplicados por `idempotency_key`.

Purga sólo lo que es irrecuperable por definición, filtrando por `entityId` que no sea un UUID:

```js
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const basura = all.filter(o => o.status !== "synced" && !UUID.test(o.entityId));
const tx = db.transaction("pendingOperations", "readwrite");
for (const op of basura) tx.objectStore("pendingOperations").delete(op.id);
```

**No purgues nada cuyo `entityId` sí sea un UUID.** Eso es una venta real que no ha subido, y hay que
averiguar por qué falla antes de tocarla.

## Archivos que intervienen

| Archivo | Papel |
|---|---|
| `src/lib/db.ts` | Nombre de la base Dexie. Aquí vive la causa de raíz. |
| `src/lib/offline.ts` | `queueOperation` y `syncPendingOperations`. Aquí está el arreglo parcial. |
| `src/lib/offline.test.ts` | Doble en memoria de la tabla; cubre el reintento individual. |
| `src/state/AppContext.tsx` | `forceSync`, `pendingCount` y el estado que alimenta el indicador. |
| `src/layout/ProtectedLayout.tsx` | El texto «Hay operaciones por revisar». |
| `supabase/migrations/20260824120000_order_subaccounts.sql` | `sync_offline_operations`, reescrita ocho veces. El cast que revienta está en su línea 148. |
