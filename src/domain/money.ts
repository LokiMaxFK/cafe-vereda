import type { Order, OrderItem, PaymentMethod } from "./types";

export const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Nombre del método de pago en español. Reportes ya lo traducía por su cuenta, pero el ticket del
 * cliente y el modal de cobro imprimían el valor crudo de la base ("CASH", "CARD", "TRANSFER").
 */
export const paymentMethodLabel: Record<PaymentMethod, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia" };

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

export function applyPaymentCap(amount: number, balance: number) {
  return Math.min(amount, Math.max(0, balance));
}
