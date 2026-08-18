import Dexie, { type EntityTable } from "dexie";
import type { CafeTable, CatalogExtra, Category, InventoryCount, InventoryItem, InventoryMovement, Order, PendingOperation, Product, StaffSession } from "../domain/types";

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

  constructor() {
    super("vereda-pos");
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
      catalogExtras: "id, active, *productIds",
      cafeTables: "id, number",
      sessions: "id, username, validatedAt",
      inventoryItems: "id, name, active",
      inventoryCounts: "id, countedAt",
      inventoryMovements: "id, itemId, recordedAt"
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
