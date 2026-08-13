import { Badge } from "../../design-system/react";
import type { OrderStatus, SyncStatus } from "../domain/types";

const orderLabel: Record<OrderStatus, string> = { open: "Abierto", preparing: "En preparación", ready: "Listo", closed: "Cobrado", cancelled: "Cancelado", reversed: "Revertido" };
const syncLabel: Record<SyncStatus, string> = { pending: "Pendiente", syncing: "Sincronizando", synced: "Sincronizado", review_required: "Revisar" };

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={status === "ready" || status === "closed" ? "success" : status === "cancelled" || status === "reversed" ? "danger" : status === "preparing" ? "primary" : "neutral"}>{orderLabel[status]}</Badge>;
}

export function SyncStatusBadge({ status }: { status: SyncStatus }) {
  return <Badge tone={status === "synced" ? "success" : status === "review_required" ? "danger" : "neutral"}>{syncLabel[status]}</Badge>;
}
