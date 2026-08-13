export type AppRole = "barista" | "manager";
export type OrderType = "table" | "takeaway";
export type OrderStatus = "open" | "preparing" | "ready" | "closed" | "cancelled" | "reversed";
export type OrderItemStatus = "pending" | "dispatched" | "prepared" | "cancelled";
export type PaymentMethod = "cash" | "card" | "transfer";
export type CashMovementType = "opening" | "withdrawal" | "adjustment" | "closing";
export type InventoryMovementType = "entry" | "daily_consumption" | "waste" | "withdrawal" | "adjustment";
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
}
export interface OrderModifier { id: string; name: string; price: number; }
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
