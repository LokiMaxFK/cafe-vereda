import type { LiveStatus, SyncStatus } from "./types";

export interface ConnectionBadge {
  label: string;
  tone: "success" | "danger" | "neutral";
}

/**
 * Resume el estado de conexión en una sola insignia para la barra lateral. El orden importa:
 *
 * 1. Sin conexión tapa todo lo demás.
 * 2. Una sincronización en curso o unas operaciones por revisar hablan de la cola de subida.
 * 3. Un canal de tiempo real caído se avisa aunque la cola esté al día. Era el punto ciego
 *    F16-05: el `.subscribe()` no miraba el estado, así que si la suscripción fallaba —casi
 *    siempre por la política de `realtime.messages` que no crean las migraciones— el POS se
 *    quedaba sin ver los cambios de otras estaciones mientras la barra decía «Todo sincronizado».
 */
export function connectionBadge(input: {
  online: boolean;
  syncStatus: SyncStatus;
  pendingCount: number;
  liveStatus: LiveStatus;
}): ConnectionBadge {
  const { online, syncStatus, pendingCount, liveStatus } = input;
  if (!online) return { label: `${pendingCount} cambios · Sin conexión`, tone: "danger" };
  if (syncStatus === "syncing") return { label: "Sincronizando cambios", tone: "neutral" };
  if (syncStatus === "review_required") return { label: "Hay operaciones por revisar", tone: "danger" };
  if (liveStatus === "down") return { label: "Sin actualización en vivo · recarga la página", tone: "danger" };
  if (pendingCount) return { label: `${pendingCount} cambios pendientes`, tone: "success" };
  return { label: "Todo sincronizado", tone: "success" };
}
