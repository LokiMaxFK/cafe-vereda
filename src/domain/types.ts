export type AppRole = "barista" | "manager";
export type OrderType = "table" | "takeaway";
export type OrderStatus = "open" | "preparing" | "ready" | "served" | "closed" | "cancelled" | "reversed";
export type OrderItemStatus = "pending" | "dispatched" | "prepared" | "cancelled";
export type PaymentMethod = "cash" | "card" | "transfer";
export type CashMovementType = "opening" | "withdrawal" | "adjustment" | "closing";
export type InventoryMovementType = "entry" | "daily_consumption" | "waste" | "withdrawal" | "adjustment";
export type InventoryUnit = "g" | "kg" | "ml" | "L" | "pza" | "paquete" | "bolsa";
export type SyncStatus = "pending" | "syncing" | "synced" | "review_required";
/**
 * Estado del canal de tiempo real. `down` significa que el POS dejó de recibir los cambios de
 * otras estaciones: la barra no ve entrar una comanda, el salón no ve liberarse una mesa. El
 * caso típico es que falte la política de `realtime.messages` (ver docs/DEPLOY_HOSTINGER.md).
 */
export type LiveStatus = "connecting" | "live" | "down";
/** Cómo se repartió una cuenta entre varias personas. Sin valor, la cuenta se cobra entera. */
export type SplitMode = "even" | "items";

export interface StaffSession {
  id: string;
  username: string;
  name: string;
  role: AppRole;
  validatedAt: string;
}

export interface Category { id: string; name: string; position: number; }
export interface ProductVariant { id: string; name: string; price: number; }
export interface Product {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  variants?: ProductVariant[];
  available: boolean;
  seasonal: boolean;
  imageUrl?: string;
}
export interface OrderModifier { id: string; name: string; price: number; }
export interface CatalogExtra extends OrderModifier {
  active: boolean;
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
/**
 * `received` es el efectivo que entregó el cliente, que puede superar a `amount`: `amount` se
 * limita al saldo (`applyPaymentCap`) porque es lo que se queda en el cajón, y la diferencia
 * entre ambos es el cambio. Sólo aplica a pagos en efectivo.
 *
 * `subaccountId` dice de quién es el pago cuando la cuenta se dividió entre varias personas.
 */
export interface Payment { id: string; method: PaymentMethod; amount: number; tip: number; received?: number; createdAt: string; subaccountId?: string; }

/** Una de las personas entre las que se reparte una cuenta. Su importe no se guarda: se deriva. */
export interface OrderSubaccount {
  id: string;
  label: string;
  position: number;
}

/**
 * Unidades de un renglón que pertenecen a una persona. Vive fuera de `OrderItem` porque una misma
 * línea de tres cafés puede repartirse entre tres personas, y porque `OrderItem` viaja tal cual a
 * las comandas inmutables de la barra, donde el reparto no pinta nada.
 */
export interface OrderItemShare {
  itemId: string;
  subaccountId: string;
  units: number;
}
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
  cancellationReason?: string;
  splitMode?: SplitMode;
  subaccounts?: OrderSubaccount[];
  itemShares?: OrderItemShare[];
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
/**
 * `signedQuantity` es la cantidad con el signo que aporta a la existencia: positiva para entradas y
 * para los ajustes que compensan una venta revertida, negativa para mermas y consumo. Es opcional
 * porque los movimientos capturados a mano lo derivan del tipo; los que escribe el servidor al
 * cerrar una venta sí lo traen.
 */
export interface InventoryMovement {
  id: string;
  itemId: string;
  type: "entry" | "waste" | "daily_consumption" | "adjustment";
  quantity: number;
  signedQuantity?: number;
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
/** `unit` sólo recuerda en qué unidad se capturó; `quantity` va siempre en la unidad del insumo. */
export interface RecipeLine { inventoryItemId: string; quantity: number; unit?: InventoryUnit; }
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
  /** Último motivo por el que el servidor la rechazó. Se limpia al sincronizar. */
  lastError?: string;
}
