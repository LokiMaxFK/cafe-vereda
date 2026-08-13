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
  const { data, error } = await supabase.rpc("sync_offline_operations", { p_operations: pending });
  if (error) {
    await db.pendingOperations.where("id").anyOf(ids).modify((operation) => {
      operation.status = operation.attempts >= 2 ? "review_required" : "pending";
      operation.attempts += 1;
    });
    return { synced: 0, review: pending.length };
  }
  await db.pendingOperations.where("id").anyOf(ids).modify({ status: "synced" });
  return { synced: Array.isArray(data) ? data.length : pending.length, review: 0 };
}
