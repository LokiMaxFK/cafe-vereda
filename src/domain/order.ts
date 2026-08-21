import type { Order, OrderItem } from "./types";

export type TableStatus = "free" | "open" | "preparing" | "ready" | "billing";

export const trackedStatuses: Order["status"][] = ["open", "preparing", "ready", "served"];

export function isTracked(order: Order) {
  return trackedStatuses.includes(order.status);
}

/** Estados desde los que una cuenta todavía se puede cancelar (coincide con la política RLS "staff update open orders"). */
export const cancellableStatuses: Order["status"][] = ["open", "preparing", "ready", "served"];

export function isCancellable(order: Pick<Order, "status">) {
  return cancellableStatuses.includes(order.status);
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
