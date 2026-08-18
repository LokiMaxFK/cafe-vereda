import type { Order, OrderItem, PaymentMethod } from "../domain/types";

/**
 * Traducción de las filas que devuelve Supabase al modelo local de órdenes.
 *
 * Vive aparte del contexto porque es la frontera de sincronización: aquí es donde un campo
 * mal mapeado se convierte, sin ruido, en información perdida en todos los dispositivos.
 */

type Row = Record<string, unknown>;

interface BatchLink {
  batch_id?: string;
  dispatch_batches?: { batch_type?: string } | null;
}

const text = (value: unknown) => (value ? String(value) : undefined);
const cents = (value: unknown) => Number(value ?? 0) / 100;

/**
 * La pertenencia a un lote vive en dispatch_batch_items, no en order_items: un lote sin
 * batch_type explícito es una comanda normal ('command' es el default de la columna).
 */
export function batchIdOfType(links: BatchLink[] | null | undefined, type: "command" | "cancellation") {
  return (links ?? []).find((link) => (link.dispatch_batches?.batch_type ?? "command") === type)?.batch_id;
}

export function mapRemoteOrderItem(item: Row): OrderItem {
  const links = item.dispatch_batch_items as BatchLink[] | null;
  return {
    id: String(item.id),
    productId: String(item.product_id ?? ""),
    name: String(item.product_name),
    quantity: Number(item.quantity),
    unitPrice: cents(item.unit_price_cents),
    variant: text(item.variant_name),
    modifiers: Array.isArray(item.modifiers)
      ? (item.modifiers as Array<{ id?: string; name?: string; price?: number }>).map((modifier) => ({
          id: modifier.id ?? crypto.randomUUID(),
          name: modifier.name ?? "Extra",
          price: cents(modifier.price)
        }))
      : [],
    notes: text(item.notes),
    cancellationReason: text(item.cancellation_reason),
    status: item.status as OrderItem["status"],
    dispatchBatchId: batchIdOfType(links, "command"),
    cancellationBatchId: batchIdOfType(links, "cancellation")
  };
}

export function mapRemoteOrder(row: Row): Order {
  const table = row.cafe_tables as { number?: number } | null;
  const items = (row.order_items as Row[] | null) ?? [];
  const payments = (row.payments as Row[] | null) ?? [];
  return {
    id: String(row.id),
    folio: Number(row.folio),
    type: row.order_type as Order["type"],
    tableId: table?.number ? `t${table.number}` : undefined,
    customerName: text(row.customer_name),
    status: row.status as Order["status"],
    discount: cents(row.discount_cents),
    discountReason: text(row.discount_reason),
    cancellationReason: text(row.cancellation_reason),
    openedBy: String(row.opened_by),
    openedAt: String(row.opened_at),
    updatedAt: String(row.updated_at),
    syncStatus: "synced",
    items: items.map(mapRemoteOrderItem),
    payments: payments.map((payment) => ({
      id: String(payment.id),
      method: payment.method as PaymentMethod,
      amount: cents(payment.amount_cents),
      tip: cents(payment.tip_cents),
      createdAt: String(payment.created_at)
    }))
  };
}

/** Columnas y relaciones que `mapRemoteOrder` necesita para no perder información. */
export const REMOTE_ORDER_SELECT =
  "*, cafe_tables(number), order_items(*, dispatch_batch_items(batch_id, dispatch_batches(batch_type))), payments(*)";
