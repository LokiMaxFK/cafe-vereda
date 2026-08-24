const STORAGE_KEY = "vereda-print-copies";
/** Sólo se conservan las cuentas recientes: el contador no vale nada una vez cerrada la orden. */
const MAX_TRACKED_ORDERS = 200;

type CopyCounters = Record<string, number>;

function readCounters(): CopyCounters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([, value]) => typeof value === "number" && Number.isFinite(value))
    ) as CopyCounters;
  } catch {
    return {};
  }
}

function writeCounters(counters: CopyCounters) {
  const entries = Object.entries(counters);
  const trimmed = entries.length > MAX_TRACKED_ORDERS ? entries.slice(entries.length - MAX_TRACKED_ORDERS) : entries;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(trimmed)));
  } catch {
    // Sin almacenamiento la comanda se imprime igual, sólo se repite el número de copia.
  }
}

/** Número de copia que llevaría la siguiente reimpresión, sin consumirlo. */
export function peekCopyNumber(orderId: string): number {
  return (readCounters()[orderId] ?? 0) + 1;
}

/**
 * Reserva el siguiente número de copia. La barra recibe COPIA 1, COPIA 2… y así distingue una
 * reimpresión de una comanda nueva en vez de preparar el pedido dos veces.
 */
export function nextCopyNumber(orderId: string): number {
  const counters = readCounters();
  const next = (counters[orderId] ?? 0) + 1;
  writeCounters({ ...counters, [orderId]: next });
  return next;
}

/** Reinicia el contador; se usa cuando la orden manda una comanda nueva de verdad. */
export function resetCopyNumber(orderId: string) {
  const counters = readCounters();
  if (!(orderId in counters)) return;
  delete counters[orderId];
  writeCounters(counters);
}
