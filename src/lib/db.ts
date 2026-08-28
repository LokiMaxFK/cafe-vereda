import Dexie, { type EntityTable } from "dexie";
import type { CafeTable, CashSession, CatalogExtra, Category, InventoryCount, InventoryItem, InventoryMovement, Order, PendingOperation, Product, StaffSession } from "../domain/types";
import { isSupabaseConfigured } from "./environment";

/**
 * La demostración vive en su propia base. Compartirla con la real dejaba sus comandas —cuyas mesas
 * tienen ids como `demo-table-3` en lugar de uuid— en la misma cola de sincronización, y bastaba con
 * abrir la demo una vez en la estación para que el servidor rechazara ese lote y, con él, todas las
 * ventas posteriores. Ocurrió: cinco días sin subir una sola venta (docs/COLA_OFFLINE_Y_DATOS_DEMO.md).
 *
 * El nombre real se mantiene: las instalaciones existentes ya guardan ahí sus datos.
 */
export const DATABASE_NAME = isSupabaseConfigured ? "vereda-pos" : "vereda-pos-demo";

class VeredaDatabase extends Dexie {
  orders!: EntityTable<Order, "id">;
  pendingOperations!: EntityTable<PendingOperation, "id">;
  catalog!: EntityTable<Product, "id">;
  catalogCategories!: EntityTable<Category, "id">;
  catalogExtras!: EntityTable<CatalogExtra, "id">;
  cafeTables!: EntityTable<CafeTable, "id">;
  sessions!: EntityTable<StaffSession, "id">;
  inventoryItems!: EntityTable<InventoryItem, "id">;
  inventoryCounts!: EntityTable<InventoryCount, "id">;
  inventoryMovements!: EntityTable<InventoryMovement, "id">;
  /** Copia del turno de caja abierto: sin ella un arranque sin conexión no sabría si se puede pedir. */
  cashSessions!: EntityTable<CashSession, "id">;

  constructor() {
    super(DATABASE_NAME);
    this.version(1).stores({
      orders: "id, folio, status, tableId, openedBy, updatedAt, syncStatus",
      pendingOperations: "id, idempotencyKey, deviceId, entityId, createdAt, status",
      catalog: "id, categoryId, available",
      cafeTables: "id, number",
      sessions: "id, username, validatedAt"
    });
    this.version(2).stores({
      orders: "id, folio, status, tableId, openedBy, updatedAt, syncStatus",
      pendingOperations: "id, idempotencyKey, deviceId, entityId, createdAt, status",
      catalog: "id, categoryId, available",
      catalogCategories: "id, name",
      catalogExtras: "id, active, *productIds",
      cafeTables: "id, number",
      sessions: "id, username, validatedAt"
    });
    this.version(3).stores({
      orders: "id, folio, status, tableId, openedBy, updatedAt, syncStatus",
      pendingOperations: "id, idempotencyKey, deviceId, entityId, createdAt, status",
      catalog: "id, categoryId, available",
      catalogCategories: "id, name",
      catalogExtras: "id, active",
      cafeTables: "id, number",
      sessions: "id, username, validatedAt",
      inventoryItems: "id, name, active",
      inventoryCounts: "id, countedAt",
      inventoryMovements: "id, itemId, recordedAt"
    });
    this.version(4).stores({
      orders: "id, folio, status, tableId, openedBy, updatedAt, syncStatus",
      pendingOperations: "id, idempotencyKey, deviceId, entityId, createdAt, status",
      catalog: "id, categoryId, available",
      catalogCategories: "id, name",
      catalogExtras: "id, active",
      cafeTables: "id, number",
      sessions: "id, username, validatedAt",
      inventoryItems: "id, name, active",
      inventoryCounts: "id, countedAt",
      inventoryMovements: "id, itemId, recordedAt",
      cashSessions: "id, openedAt"
    });
  }
}

export const db = new VeredaDatabase();

export function deviceId() {
  const key = "vereda-device-id";
  const stored = localStorage.getItem(key);
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}
