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
