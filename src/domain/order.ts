import type { Order } from "./types";

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
