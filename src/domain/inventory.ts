import type { InventoryCount, InventoryItem, InventoryMovement, InventoryUnit } from "./types";

export const INVENTORY_UNITS: Array<{ value: InventoryUnit; label: string }> = [
  { value: "g", label: "Gramos (g)" },
  { value: "kg", label: "Kilogramos (kg)" },
  { value: "ml", label: "Mililitros (ml)" },
  { value: "L", label: "Litros (L)" },
  { value: "pza", label: "Piezas (pza)" },
  { value: "paquete", label: "Paquetes" },
  { value: "bolsa", label: "Bolsas" }
];

export interface InventoryAnalysisRow {
  item: InventoryItem;
  opening?: number;
  closing?: number;
  entries: number;
  waste: number;
  physical?: number;
  theoretical: number;
  variance?: number;
  openingAt?: string;
  closingAt?: string;
  /** La fila no cierra en un segundo conteo: cuenta lo movido desde la última lectura hasta ahora. */
  openEnded?: boolean;
}

const atOrBefore = (counts: InventoryCount[], itemId: string, instant: string) => counts
  .filter((count) => count.countedAt <= instant && count.lines.some((line) => line.itemId === itemId))
  .sort((a, b) => b.countedAt.localeCompare(a.countedAt))[0];

/**
 * Primer conteo dentro de la ventana. Sirve de línea base cuando no existe ningún conteo anterior
 * al inicio del periodo: sin esto, un insumo empezado a contar dentro de la ventana nunca llega a
 * compararse —la tabla se queda en «Falta línea base o segundo conteo» aunque ya haya dos conteos—
 * y el indicador queda muerto durante los primeros 30 días de operación.
 */
const firstWithin = (counts: InventoryCount[], itemId: string, start: string, end: string) => counts
  .filter((count) => count.countedAt > start && count.countedAt <= end && count.lines.some((line) => line.itemId === itemId))
  .sort((a, b) => a.countedAt.localeCompare(b.countedAt))[0];

const quantityFor = (count: InventoryCount | undefined, itemId: string) => count?.lines.find((line) => line.itemId === itemId)?.quantity;

/**
 * Aporte de un movimiento a la existencia. Los movimientos capturados a mano no traen el signo —lo
 * dicta su tipo— pero los que escribe el servidor al cerrar o revertir una venta sí, y ese valor
 * manda: es el que la base de datos usó para descontar.
 */
export function movementSign(movement: InventoryMovement) {
  if (movement.signedQuantity !== undefined) return movement.signedQuantity;
  return movement.type === "entry" || movement.type === "adjustment" ? movement.quantity : -movement.quantity;
}

/**
 * `consumption` sale aparte de `entries`/`waste` a propósito: es consumo teórico (lo que las recetas
 * dicen que se vendió), neto de los ajustes que compensan una venta revertida. Mezclarlo con los
 * otros dos cubos rompería el cálculo de `physical`, que parte de dos conteos físicos.
 */
function movementsBetween(movements: InventoryMovement[], itemId: string, fromExclusive: string, toInclusive: string) {
  const inWindow = movements.filter((movement) => movement.itemId === itemId && movement.recordedAt > fromExclusive && movement.recordedAt <= toInclusive);
  const entries = inWindow.filter((movement) => movement.type === "entry").reduce((sum, movement) => sum + movement.quantity, 0);
  const waste = inWindow.filter((movement) => movement.type === "waste").reduce((sum, movement) => sum + movement.quantity, 0);
  // Se resta en el acumulador en vez de negar el total: negar una suma vacía devuelve -0.
  const consumption = inWindow
    .filter((movement) => movement.type === "daily_consumption" || movement.type === "adjustment")
    .reduce((sum, movement) => sum - movementSign(movement), 0);
  return { entries, waste, consumption };
}

/**
 * Existencia actual de un insumo. No se guarda en ninguna columna: es el último conteo físico más
 * todo lo que se movió después (entradas, mermas y el consumo que generan las ventas cerradas). Sin
 * conteo de partida se acumulan sólo los movimientos, que es lo único que se sabe del insumo.
 */
export function deriveStock(itemId: string, counts: InventoryCount[], movements: InventoryMovement[]) {
  const baseline = counts
    .filter((count) => count.lines.some((line) => line.itemId === itemId))
    .sort((a, b) => b.countedAt.localeCompare(a.countedAt))[0];
  const opening = quantityFor(baseline, itemId);
  const since = baseline?.countedAt ?? "";
  const delta = movements
    .filter((movement) => movement.itemId === itemId && movement.recordedAt > since)
    .reduce((sum, movement) => sum + movementSign(movement), 0);
  if (opening === undefined && !delta) return undefined;
  return Math.round(((opening ?? 0) + delta) * 1000) / 1000;
}

/**
 * El teórico sale del consumo que las ventas cerradas generaron **entre los mismos dos conteos** que
 * producen el físico. Antes venía de un mapa `expected` calculado sobre una ventana fija de 31 días,
 * de modo que se comparaban dos periodos distintos y el número no cambiaba hasta recargar la página.
 */
export function createInventoryAnalysis(items: InventoryItem[], counts: InventoryCount[], movements: InventoryMovement[], start: string, end: string): InventoryAnalysisRow[] {
  return items.filter((item) => item.active).map((item) => {
    const closingCount = atOrBefore(counts, item.id, end);
    const openingCount = atOrBefore(counts, item.id, start) ?? firstWithin(counts, item.id, start, end);
    const opening = quantityFor(openingCount, item.id);
    const closing = quantityFor(closingCount, item.id);
    const comparable = opening !== undefined && closing !== undefined && openingCount?.id !== closingCount?.id;
    // Con un solo conteo, `openingCount` y `closingCount` son el mismo y la ventana colapsaría a un
    // instante: la fila entera salía a cero aunque hubiera entradas, mermas y ventas posteriores. Sin
    // segundo conteo el periodo con sentido es «desde la última lectura hasta ahora».
    const windowEnd = comparable ? (closingCount?.countedAt ?? end) : end;
    const { entries, waste, consumption } = movementsBetween(movements, item.id, openingCount?.countedAt ?? start, windowEnd);
    const physical = comparable ? opening + entries - closing - waste : undefined;
    return { item, opening, closing, entries, waste, physical, theoretical: consumption, variance: physical === undefined ? undefined : physical - consumption, openingAt: openingCount?.countedAt, closingAt: comparable ? closingCount?.countedAt : undefined, openEnded: !comparable };
  });
}

export function isInventoryVarianceAlert(row: InventoryAnalysisRow) {
  return row.variance !== undefined && Math.abs(row.variance) > row.item.tolerance;
}

export interface InventoryPeriod {
  itemId: string;
  startCountId: string;
  startAt: string;
  startQuantity?: number;
  /** Ausentes en el tramo en curso: todavía no hay conteo que lo cierre. */
  endCountId?: string;
  endAt?: string;
  endQuantity?: number;
  days: number;
  entries: number;
  waste: number;
  physical?: number;
  /** El tramo va del último conteo hasta ahora, así que no hay consumo físico que medir. */
  openEnded?: boolean;
}

/**
 * Un renglón por tramo entre conteos, más el tramo en curso desde la última lectura hasta ahora.
 *
 * Antes se emitía un renglón de «línea base» para el primer conteo, cuyo periodo iba de ese conteo a
 * sí mismo: una ventana vacía que mostraba 0 entradas y 0 mermas sobre un tramo que no existe. Y no
 * había ningún renglón para lo ocurrido después del último conteo, que es justo donde vive todo lo
 * reciente: un insumo con un solo conteo no enseñaba ni una entrada ni una merma.
 */
export function buildInventoryPeriods(itemId: string, counts: InventoryCount[], movements: InventoryMovement[], now = new Date().toISOString()): InventoryPeriod[] {
  const itemCounts = counts
    .filter((count) => count.lines.some((line) => line.itemId === itemId))
    .sort((a, b) => a.countedAt.localeCompare(b.countedAt));
  if (!itemCounts.length) return [];
  const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000 * 10) / 10;
  const periods: InventoryPeriod[] = [];

  for (let index = 1; index < itemCounts.length; index += 1) {
    const previous = itemCounts[index - 1];
    const current = itemCounts[index];
    const startQuantity = quantityFor(previous, itemId);
    const endQuantity = quantityFor(current, itemId) ?? 0;
    const { entries, waste } = movementsBetween(movements, itemId, previous.countedAt, current.countedAt);
    periods.push({
      itemId,
      startCountId: previous.id,
      startAt: previous.countedAt,
      startQuantity,
      endCountId: current.id,
      endAt: current.countedAt,
      endQuantity,
      days: daysBetween(previous.countedAt, current.countedAt),
      entries,
      waste,
      physical: startQuantity === undefined ? undefined : startQuantity + entries - endQuantity - waste
    });
  }

  const last = itemCounts[itemCounts.length - 1];
  const { entries, waste } = movementsBetween(movements, itemId, last.countedAt, now);
  periods.push({
    itemId,
    startCountId: last.id,
    startAt: last.countedAt,
    startQuantity: quantityFor(last, itemId),
    days: daysBetween(last.countedAt, now),
    entries,
    waste,
    openEnded: true
  });

  return periods;
}

export interface RestockPattern {
  count: number;
  averageIntervalDays?: number;
  averageQuantity?: number;
  lastRestockAt?: string;
}

export function analyzeRestockPattern(itemId: string, movements: InventoryMovement[]): RestockPattern {
  const entries = movements
    .filter((movement) => movement.itemId === itemId && movement.type === "entry")
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  if (!entries.length) return { count: 0 };
  const averageQuantity = entries.reduce((sum, entry) => sum + entry.quantity, 0) / entries.length;
  const lastRestockAt = entries[entries.length - 1].recordedAt;
  if (entries.length < 2) return { count: entries.length, averageQuantity, lastRestockAt };
  const intervals: number[] = [];
  for (let index = 1; index < entries.length; index += 1) intervals.push((Date.parse(entries[index].recordedAt) - Date.parse(entries[index - 1].recordedAt)) / 86_400_000);
  const averageIntervalDays = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  return { count: entries.length, averageIntervalDays: Math.round(averageIntervalDays * 10) / 10, averageQuantity, lastRestockAt };
}
