import { db, deviceId } from "./db";
import type { PendingOperation } from "../domain/types";

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

export async function syncPendingOperations() {
  const pending = await db.pendingOperations.where("status").anyOf("pending", "review_required").sortBy("createdAt");
  if (!pending.length) return { synced: 0, review: 0 };
  if (!navigator.onLine) return { synced: 0, review: pending.length };

  const { supabase } = await import("./supabase");
  if (!supabase) return { synced: 0, review: pending.length };
  const ids = pending.map((operation) => operation.id);
  await db.pendingOperations.where("id").anyOf(ids).modify({ status: "syncing" });
  const inventory = pending.filter((operation) => operation.type === "record_inventory_count" || operation.type === "record_inventory_movement");
  const standard = pending.filter((operation) => !inventory.includes(operation));
  const synced: string[] = [];
  const failed: string[] = [];
  for (const operation of inventory) {
    const payload = operation.payload as Record<string, unknown>;
    const result = operation.type === "record_inventory_count"
      ? await supabase.rpc("record_inventory_count", { p_count_id: payload.id, p_counted_at: payload.countedAt, p_note: payload.note ?? null, p_lines: payload.lines, p_idempotency_key: operation.idempotencyKey })
      : await supabase.rpc("record_inventory_movement", { p_movement_id: payload.id, p_item_id: payload.itemId, p_type: payload.type, p_quantity: payload.quantity, p_note: payload.note, p_recorded_at: payload.recordedAt, p_idempotency_key: operation.idempotencyKey });
    if (result.error) failed.push(operation.id); else synced.push(operation.id);
  }
  if (standard.length) {
    const { data, error } = await supabase.rpc("sync_offline_operations", { p_operations: standard });
    if (error) failed.push(...standard.map((operation) => operation.id));
    else synced.push(...(Array.isArray(data) ? standard.map((operation) => operation.id) : standard.map((operation) => operation.id)));
  }
  if (synced.length) await db.pendingOperations.where("id").anyOf(synced).modify({ status: "synced" });
  if (failed.length) await db.pendingOperations.where("id").anyOf(failed).modify((operation) => {
    operation.status = operation.attempts >= 2 ? "review_required" : "pending";
    operation.attempts += 1;
  });
  return { synced: synced.length, review: failed.length };
}
