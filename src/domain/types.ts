export type AppRole = "barista" | "manager";
export type OrderType = "table" | "takeaway";
export type OrderStatus = "open" | "preparing" | "ready" | "served" | "closed" | "cancelled" | "reversed";
export type OrderItemStatus = "pending" | "dispatched" | "prepared" | "cancelled";
export type PaymentMethod = "cash" | "card" | "transfer";
export type CashMovementType = "opening" | "withdrawal" | "adjustment" | "closing";
export type InventoryMovementType = "entry" | "daily_consumption" | "waste" | "withdrawal" | "adjustment";
export type InventoryUnit = "g" | "kg" | "ml" | "L" | "pza" | "paquete" | "bolsa";
export type SyncStatus = "pending" | "syncing" | "synced" | "review_required";

export interface StaffSession {
  id: string;
  username: string;
  name: string;
  role: AppRole;
  validatedAt: string;
}

export interface Category { id: string; name: string; }
export interface ProductVariant { id: string; name: string; price: number; }
export interface Product {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  variants?: ProductVariant[];
  available: boolean;
  schedule?: string;
  modifierIds?: string[];
}
export interface OrderModifier { id: string; name: string; price: number; }
export interface CatalogExtra extends OrderModifier {
  active: boolean;
  productIds: string[];
}
export interface OrderItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  variant?: string;
  modifiers: OrderModifier[];
  notes?: string;
  cancellationReason?: string;
  status: OrderItemStatus;
  dispatchBatchId?: string;
  cancellationBatchId?: string;
}
export interface Payment { id: string; method: PaymentMethod; amount: number; tip: number; createdAt: string; }
export interface Order {
  id: string;
  folio: number;
  type: OrderType;
  tableId?: string;
  customerName?: string;
  status: OrderStatus;
  items: OrderItem[];
  payments: Payment[];
  discount: number;
  discountReason?: string;
  openedBy: string;
  openedAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}
export interface CafeTable {
  id: string;
  number: number;
  seats: number;
  shape: "round" | "square" | "rectangular";
  x: number;
  y: number;
  active: boolean;
}
export interface CashMovement {
  id: string;
  cashSessionId: string;
  type: CashMovementType;
  amount: number;
  note?: string;
  recordedBy: string;
  createdAt: string;
}
export interface CashSession {
  id: string;
  openedBy: string;
  openingFund: number;
  openedAt: string;
  closedBy?: string;
  closedAt?: string;
  countedCash?: number;
  expectedCash?: number;
  difference?: number;
}
export interface InventoryItem {
  id: string;
  name: string;
  unit: InventoryUnit;
  minimum: number;
  tolerance: number;
  active: boolean;
  updatedAt?: string;
}
export interface InventoryMovement {
  id: string;
  itemId: string;
  type: "entry" | "waste";
  quantity: number;
  note: string;
  recordedAt: string;
  recordedBy?: string;
}
export interface InventoryCountLine { itemId: string; quantity: number; }
export interface InventoryCount {
  id: string;
  countedAt: string;
  note?: string;
  recordedBy?: string;
  lines: InventoryCountLine[];
}
export interface RecipeLine { inventoryItemId: string; quantity: number; }
export interface InventoryRecipe {
  id: string;
  productId: string;
  variantName?: string;
  active: boolean;
  lines: RecipeLine[];
}
export interface PendingOperation {
  id: string;
  idempotencyKey: string;
  deviceId: string;
  type: string;
  entityId: string;
  payload: unknown;
  createdAt: string;
  attempts: number;
  status: SyncStatus;
}
