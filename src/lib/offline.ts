import { db, deviceId } from "./db";
import type { PendingOperation } from "../domain/types";

/**
 * Operaciones de insumos. Van una a una a su propia RPC en lugar de al lote de
 * `sync_offline_operations` para que un insumo que falla no bloquee la subida de las ventas.
 */
const INVENTORY_OPERATIONS = [
  "record_inventory_count",
  "record_inventory_movement",
  "create_inventory_item",
  "update_inventory_item",
  "delete_inventory_item"
];

export async function queueOperation(type: string, entityId: string, payload: unknown) {
  const id = crypto.randomUUID();
  const operation: PendingOperation = {
    id,
    idempotencyKey: `${deviceId()}:${id}`,
    deviceId: deviceId(),
    type,
    entityId,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: "pending"
  };
  await db.pendingOperations.add(operation);
  return operation;
}

/**
 * Devuelve a la cola las operaciones que quedaron en "syncing". Ese estado sólo dura lo que tarda
 * la llamada al servidor, pero si la pestaña se cierra o recarga en ese momento la operación queda
 * huérfana: `syncPendingOperations` no la vuelve a mirar y `pendingCount` no la cuenta, de modo que
 * la aplicación anuncia "Todo sincronizado" con una venta sin subir. Reenviarla es seguro porque el
 * servidor descarta el duplicado por `idempotency_key`.
 */
export async function reclaimStalledOperations() {
  return db.pendingOperations.where("status").equals("syncing").modify({ status: "pending" });
}

/**
 * `sync_offline_operations` empieza casteando `entityId` a uuid, así que una operación cuyo id no lo
 * sea no puede entrar jamás: no es un fallo pasajero que merezca reintentarse. Ya no se generan
 * —la demostración tiene su propia base—, pero las instalaciones que mezclaron ambas todavía las
 * arrastran, y sin esto gastan una petición por cada una en cada sincronización.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const canReachServer = (operation: PendingOperation) => UUID.test(operation.entityId);

const describeError = (error: unknown) => {
  const detail = error as { message?: string; code?: string } | null;
  const message = detail?.message?.trim();
  if (!message) return "Error desconocido del servidor.";
  return detail?.code ? `${message} (${detail.code})` : message;
};

export async function syncPendingOperations() {
  const pending = await db.pendingOperations.where("status").anyOf("pending", "review_required").sortBy("createdAt");
  if (!pending.length) return { synced: 0, review: 0 };
  if (!navigator.onLine) return { synced: 0, review: pending.length };

  const { supabase } = await import("./supabase");
  if (!supabase) return { synced: 0, review: pending.length };
  const ids = pending.map((operation) => operation.id);
  await db.pendingOperations.where("id").anyOf(ids).modify({ status: "syncing" });
  const synced: string[] = [];
  const failed: string[] = [];
  const errors = new Map<string, string>();

  const unreachable = pending.filter((operation) => !canReachServer(operation));
  for (const operation of unreachable) {
    failed.push(operation.id);
    errors.set(operation.id, `El servidor no puede aceptar esta operación: «${operation.entityId}» no es un identificador válido.`);
  }
  const usable = pending.filter((operation) => canReachServer(operation));
  const inventory = usable.filter((operation) => INVENTORY_OPERATIONS.includes(operation.type));
  const standard = usable.filter((operation) => !inventory.includes(operation));
  for (const operation of inventory) {
    const payload = operation.payload as Record<string, unknown>;
    let result;
    switch (operation.type) {
      case "record_inventory_count":
        result = await supabase.rpc("record_inventory_count", { p_count_id: payload.id, p_counted_at: payload.countedAt, p_note: payload.note ?? null, p_lines: payload.lines, p_idempotency_key: operation.idempotencyKey });
        break;
      case "record_inventory_movement":
        result = await supabase.rpc("record_inventory_movement", { p_movement_id: payload.id, p_item_id: payload.itemId, p_type: payload.type, p_quantity: payload.quantity, p_note: payload.note, p_recorded_at: payload.recordedAt, p_idempotency_key: operation.idempotencyKey });
        break;
      case "create_inventory_item":
        result = await supabase.rpc("create_inventory_item", { p_id: payload.id, p_name: payload.name, p_unit: payload.unit, p_minimum: payload.minimum, p_tolerance: payload.tolerance, p_idempotency_key: operation.idempotencyKey });
        break;
      case "update_inventory_item":
        result = await supabase.rpc("update_inventory_item", { p_id: payload.id, p_name: payload.name, p_unit: payload.unit, p_minimum: payload.minimum, p_tolerance: payload.tolerance, p_active: payload.active });
        break;
      default:
        // `delete_inventory_item` es idempotente por sí sola: si el insumo ya no está devuelve
        // 'deleted', así que un reenvío de la cola no es un error.
        result = await supabase.rpc("delete_inventory_item", { p_id: payload.id });
        break;
    }
    if (result.error) { failed.push(operation.id); errors.set(operation.id, describeError(result.error)); }
    else synced.push(operation.id);
  }
  if (standard.length) {
    const batch = await supabase.rpc("sync_offline_operations", { p_operations: standard });
    if (!batch.error) synced.push(...standard.map((operation) => operation.id));
    else if (standard.length === 1) {
      failed.push(standard[0].id);
      errors.set(standard[0].id, describeError(batch.error));
    } else {
      // `sync_offline_operations` es una única transacción: si una operación lanza, se revierte el
      // lote entero. Sin este reintento una operación rota para siempre —por ejemplo una orden de la
      // sesión de demostración, cuyo `entityId` no es un uuid— bloquea indefinidamente todas las
      // ventas posteriores, que se quedan en la cola sin que nadie sepa por qué.
      for (const operation of standard) {
        const single = await supabase.rpc("sync_offline_operations", { p_operations: [operation] });
        if (single.error) { failed.push(operation.id); errors.set(operation.id, describeError(single.error)); }
        else synced.push(operation.id);
      }
    }
  }
  if (synced.length) await db.pendingOperations.where("id").anyOf(synced).modify((operation) => {
    operation.status = "synced";
    delete operation.lastError;
  });
  if (failed.length) await db.pendingOperations.where("id").anyOf(failed).modify((operation) => {
    operation.status = operation.attempts >= 2 ? "review_required" : "pending";
    operation.attempts += 1;
    // Sin el motivo, «Hay operaciones por revisar» no da nada con lo que revisar.
    const reason = errors.get(operation.id);
    if (reason) operation.lastError = reason;
  });
  return { synced: synced.length, review: failed.length };
}
