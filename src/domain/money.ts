import type { Order, OrderItem, PaymentMethod } from "./types";

export const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Nombre del método de pago en español. Reportes ya lo traducía por su cuenta, pero el ticket del
 * cliente y el modal de cobro imprimían el valor crudo de la base ("CASH", "CARD", "TRANSFER").
 */
export const paymentMethodLabel: Record<PaymentMethod, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia" };

/**
 * Cuadra un importe al centavo.
 *
 * El dinero se calcula aquí con números de punto flotante, donde una multiplicación tan corriente
 * como 3 × $10.05 devuelve 30.150000000000002. Ese residuo no se ve por ningún lado —la pantalla
 * redondea a dos decimales— pero sí pesa en las comparaciones: era lo que dejaba una cuenta ya
 * pagada sin poder cerrarse, anunciando "Saldo pendiente $0.00" y escondiendo el botón de cerrar
 * (hallazgo F07-06). Todo importe que salga de este módulo pasa por aquí, de modo que lo que se
 * compara es siempre lo mismo que se enseña.
 */
export function roundToCents(amount: number) {
  return Math.round(amount * 100) / 100;
}

export function itemTotal(item: OrderItem) {
  return roundToCents(item.quantity * (item.unitPrice + item.modifiers.reduce((sum, modifier) => sum + modifier.price, 0)));
}

export function orderSubtotal(order: Pick<Order, "items">) {
  return roundToCents(order.items.filter((item) => item.status !== "cancelled").reduce((sum, item) => sum + itemTotal(item), 0));
}

export function orderTotal(order: Pick<Order, "items" | "discount">) {
  return Math.max(0, roundToCents(orderSubtotal(order) - order.discount));
}

export function paidTotal(order: Pick<Order, "payments">) {
  return roundToCents(order.payments.reduce((sum, payment) => sum + payment.amount, 0));
}

export function applyPaymentCap(amount: number, balance: number) {
  return roundToCents(Math.min(amount, Math.max(0, balance)));
}
