import { Cloud, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { useApp } from "../state/AppContext";

export function SyncPill({ compact = false }: { compact?: boolean }) {
  const { online, syncStatus, pendingCount, forceSync } = useApp();
  const Icon = !online ? CloudOff : syncStatus === "syncing" ? RefreshCw : syncStatus === "review_required" ? TriangleAlert : Cloud;
  const label = !online ? "Sin conexión" : syncStatus === "syncing" ? "Sincronizando" : syncStatus === "review_required" ? "Requiere revisión" : pendingCount ? `${pendingCount} pendiente${pendingCount === 1 ? "" : "s"}` : "Sincronizado";
  return (
    <button type="button" onClick={() => void forceSync()} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-outline-variant/50 bg-surface-container-lowest px-3 text-xs font-bold text-on-surface-variant" title="Sincronizar ahora">
      <Icon size={15} className={syncStatus === "syncing" ? "animate-spin" : ""} />
      {!compact && label}
      {compact && pendingCount > 0 && <span>{pendingCount}</span>}
    </button>
  );
}
