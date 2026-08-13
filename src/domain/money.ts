import type { Order, OrderItem } from "./types";

export const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

export function itemTotal(item: OrderItem) {
  return item.quantity * (item.unitPrice + item.modifiers.reduce((sum, modifier) => sum + modifier.price, 0));
}

export function orderSubtotal(order: Pick<Order, "items">) {
  return order.items.filter((item) => item.status !== "cancelled").reduce((sum, item) => sum + itemTotal(item), 0);
}

export function orderTotal(order: Pick<Order, "items" | "discount">) {
  return Math.max(0, orderSubtotal(order) - order.discount);
}

export function paidTotal(order: Pick<Order, "payments">) {
  return order.payments.reduce((sum, payment) => sum + payment.amount, 0);
}
