import { orderTotal, paidTotal } from "./money";
import type { Order, OrderItem } from "./types";

export type TableStatus = "free" | "open" | "preparing" | "ready" | "billing";

export const trackedStatuses: Order["status"][] = ["open", "preparing", "ready", "served"];

export function isTracked(order: Order) {
  return trackedStatuses.includes(order.status);
}

/**
 * Una cuenta 'open' sin un solo artículo activo y sin cobros nunca llegó a ser comanda: es un
 * borrador que quedó a medias —una mesa que se tocó por error, o un pedido al que se le quitó el
 * último producto—. No ocupa la mesa ni cuenta como cuenta abierta, y se descarta en cuanto se
 * detecta. La versión antigua del salón abría la cuenta al tocar la mesa, así que las instalaciones
 * viejas arrastran varias de estas colgando de mesas que en realidad están libres.
 */
export function isEmptyDraft(order: Pick<Order, "status" | "items" | "payments">) {
  return order.status === "open"
    && order.payments.length === 0
    && order.items.every((item) => item.status === "cancelled");
}

/** Una cuenta viva que además ocupa su mesa: descarta los borradores vacíos. */
export function occupiesFloor(order: Order) {
  return isTracked(order) && !isEmptyDraft(order);
}

/** Minutos que un borrador vacío puede seguir abierto antes de darse por abandonado y cancelarse solo. */
export const ABANDONED_DRAFT_MINUTES = 10;

/**
 * Un borrador vacío que lleva abierto más de `ABANDONED_DRAFT_MINUTES`. El margen evita cancelar
 * la cuenta recién creada que otra estación todavía está armando.
 */
export function isAbandonedDraft(order: Pick<Order, "status" | "items" | "payments" | "openedAt">, now = Date.now()) {
  return isEmptyDraft(order) && now - new Date(order.openedAt).getTime() >= ABANDONED_DRAFT_MINUTES * 60_000;
}

/** Estados desde los que una cuenta todavía se puede cancelar (coincide con la política RLS "staff update open orders"). */
export const cancellableStatuses: Order["status"][] = ["open", "preparing", "ready", "served"];

export function isCancellable(order: Pick<Order, "status">) {
  return cancellableStatuses.includes(order.status);
}

/**
 * Estados desde los que una cuenta se puede finalizar. Sin esta comprobación, una cuenta cancelada
 * volvía a 'served' y desde ahí se cobraba: la pantalla de venta ofrecía «Finalizar orden» a todo
 * lo que no fuera 'closed' ni 'served', cancelaciones y reversiones incluidas.
 */
export const finalizableStatuses: Order["status"][] = ["open", "preparing", "ready"];

export function isFinalizable(order: Pick<Order, "status">) {
  return finalizableStatuses.includes(order.status);
}

/** Una cuenta sólo se cobra ya finalizada: antes de eso la barra todavía puede cambiarla. */
export const chargeableStatuses: Order["status"][] = ["served"];

export function isChargeable(order: Pick<Order, "status">) {
  return chargeableStatuses.includes(order.status);
}

/** Una cuenta se cierra cuando es cobrable y está cubierta; el servidor exige lo mismo. */
export function isClosable(order: Order) {
  return isChargeable(order) && paidTotal(order) >= orderTotal(order);
}

/** Primer folio que puede asignar el dispositivo cuando no hay servidor que lo reparta. */
export const FIRST_LOCAL_FOLIO = 1045;

/**
 * Folio provisional para trabajar sin conexión: el siguiente al más alto que conoce el dispositivo,
 * nunca por debajo de `FIRST_LOCAL_FOLIO`. Se ignoran los folios no numéricos —un solo pedido mal
 * formado bastaba para que `Math.max` devolviera `NaN` y el pedido naciera sin folio.
 */
export function nextLocalFolio(folios: number[]): number {
  const usable = folios.filter((folio) => Number.isFinite(folio));
  return Math.max(FIRST_LOCAL_FOLIO - 1, ...usable) + 1;
}

/**
 * Artículos que la barra va a entregar de verdad. Contar `items.length` incluía los renglones
 * **cancelados** y los que todavía no se han enviado, así que la tarjeta de "Listos para entregar"
 * podía anunciar más artículos de los que salen en la charola.
 */
export function deliverableItemCount(items: Pick<OrderItem, "status">[]): number {
  return items.filter((item) => item.status === "prepared" || item.status === "dispatched").length;
}

/**
 * Paso `preparing → ready` de la barra: sólo lo que salió a preparar pasa a preparado. Los
 * renglones que aún no se han enviado y los cancelados se quedan como están; marcarlos daría por
 * hecho algo que la barra nunca recibió.
 */
export function markItemsPrepared<T extends Pick<OrderItem, "status">>(items: T[]): T[] {
  return items.map((item) => item.status === "dispatched" ? { ...item, status: "prepared" as const } : item);
}

/**
 * Renglones que ya salieron a la barra y que, al cancelar la cuenta entera, hay que avisar en papel.
 *
 * Un artículo despachado o preparado sigue ocupando a la cocina aunque la cuenta se cancele: sin
 * ese aviso físico nadie se entera de que debe detenerse, y el pedido simplemente desaparece de su
 * cola. Los que aún no se han enviado no hace falta avisarlos —la barra nunca los vio— y los ya
 * cancelados tampoco.
 *
 * Vive aquí, y no en la pantalla, porque la regla no depende de por dónde se cancele: una cuenta se
 * puede cancelar desde la venta, desde el listado de Pedidos y desde la vista previa del Salón
 * (hallazgo F08-05, en el que dos de esos tres caminos no avisaban).
 */
export function barItemsForCancellation(items: OrderItem[], reason: string): OrderItem[] {
  return items
    .filter((item) => item.status === "dispatched" || item.status === "prepared")
    .map((item) => ({ ...item, cancellationReason: reason.trim() }));
}

export function orderDestination(order: Pick<Order, "type" | "tableId" | "customerName">) {
  return order.type === "table" ? `Mesa ${order.tableId?.replace("t", "")}` : order.customerName || "Para llevar";
}

export function elapsedMinutes(iso: string, now = Date.now()) {
  return Math.max(1, Math.round((now - new Date(iso).getTime()) / 60_000));
}

export function tableStatus(order?: Pick<Order, "status">): TableStatus {
  if (!order) return "free";
  if (order.status === "served") return "billing";
  if (order.status === "ready") return "ready";
  if (order.status === "preparing") return "preparing";
  return "open";
}
