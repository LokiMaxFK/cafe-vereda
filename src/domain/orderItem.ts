import type { OrderItem, Product } from "./types";

export interface OrderItemInput {
  product: Product;
  variantId?: string;
  modifiers?: OrderItem["modifiers"];
  notes?: string;
}

export function buildOrderItem({ product, variantId, modifiers = [], notes }: OrderItemInput): OrderItem {
  const variant = product.variants?.find((item) => item.id === variantId);
  return { id: crypto.randomUUID(), productId: product.id, name: product.name, quantity: 1, unitPrice: variant?.price ?? product.price, variant: variant?.name, modifiers, notes: notes?.trim() || undefined, status: "pending" };
}

function sameSelection(item: OrderItem, { product, variantId, modifiers = [], notes }: OrderItemInput): boolean {
  if (item.productId !== product.id) return false;
  const variant = product.variants?.find((candidate) => candidate.id === variantId);
  if ((item.variant ?? "") !== (variant?.name ?? "")) return false;
  if ((item.notes ?? "") !== (notes?.trim() ?? "")) return false;
  const itemMods = [...item.modifiers.map((modifier) => modifier.id)].sort().join(",");
  const inputMods = [...modifiers.map((modifier) => modifier.id)].sort().join(",");
  return itemMods === inputMods;
}

export function mergeOrAddItem(items: OrderItem[], input: OrderItemInput): OrderItem[] {
  const index = items.findIndex((item) => item.status === "pending" && sameSelection(item, input));
  if (index === -1) return [...items, buildOrderItem(input)];
  return items.map((item, position) => position === index ? { ...item, quantity: item.quantity + 1 } : item);
}

/** Estados de un artículo que ya salió a la barra y por tanto sólo puede anularse con motivo. */
export const cancellableItemStatuses: OrderItem["status"][] = ["dispatched", "prepared"];

export interface CancelUnitsResult {
  items: OrderItem[];
  /** Sólo la parte anulada: es lo que se imprime en la comanda de cancelación. */
  cancelled: OrderItem;
}

/**
 * Anula `quantity` unidades de un artículo ya comandado.
 *
 * Cuando se anula la línea completa se conserva su identificador, para que la incidencia y el lote
 * del servidor sigan apuntando al mismo artículo. Cuando se anula sólo una parte, la línea se parte
 * en dos: la original se queda con lo que sí se prepara y la parte anulada nace como un artículo
 * propio. Así cada anulación tiene su propio identificador, su propio motivo y su propio importe,
 * y el servidor puede registrar una incidencia por cada una sin pisar la anterior.
 */
export function cancelItemUnits(
  items: OrderItem[],
  itemId: string,
  quantity: number,
  reason: string,
  cancellationBatchId: string,
  cancelledItemId: string
): CancelUnitsResult | null {
  const item = items.find((candidate) => candidate.id === itemId);
  const motive = reason.trim();
  if (!item || !motive) return null;
  if (!cancellableItemStatuses.includes(item.status)) return null;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > item.quantity) return null;

  if (quantity === item.quantity) {
    const cancelled: OrderItem = { ...item, status: "cancelled", cancellationReason: motive, cancellationBatchId };
    return { items: items.map((candidate) => candidate.id === itemId ? cancelled : candidate), cancelled };
  }

  const cancelled: OrderItem = { ...item, id: cancelledItemId, quantity, status: "cancelled", cancellationReason: motive, cancellationBatchId };
  return {
    items: items.flatMap((candidate) => candidate.id === itemId ? [{ ...candidate, quantity: candidate.quantity - quantity }, cancelled] : [candidate]),
    cancelled
  };
}
