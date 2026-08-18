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
}

const atOrBefore = (counts: InventoryCount[], itemId: string, instant: string) => counts
  .filter((count) => count.countedAt <= instant && count.lines.some((line) => line.itemId === itemId))
  .sort((a, b) => b.countedAt.localeCompare(a.countedAt))[0];

const quantityFor = (count: InventoryCount | undefined, itemId: string) => count?.lines.find((line) => line.itemId === itemId)?.quantity;

function movementsBetween(movements: InventoryMovement[], itemId: string, fromExclusive: string, toInclusive: string) {
  const inWindow = movements.filter((movement) => movement.itemId === itemId && movement.recordedAt > fromExclusive && movement.recordedAt <= toInclusive);
  const entries = inWindow.filter((movement) => movement.type === "entry").reduce((sum, movement) => sum + movement.quantity, 0);
  const waste = inWindow.filter((movement) => movement.type === "waste").reduce((sum, movement) => sum + movement.quantity, 0);
  return { entries, waste };
}

export function createInventoryAnalysis(items: InventoryItem[], counts: InventoryCount[], movements: InventoryMovement[], expected: Record<string, number>, start: string, end: string): InventoryAnalysisRow[] {
  return items.filter((item) => item.active).map((item) => {
    const openingCount = atOrBefore(counts, item.id, start);
    const closingCount = atOrBefore(counts, item.id, end);
    const opening = quantityFor(openingCount, item.id);
    const closing = quantityFor(closingCount, item.id);
    const { entries, waste } = movementsBetween(movements, item.id, openingCount?.countedAt ?? start, closingCount?.countedAt ?? end);
    const comparable = opening !== undefined && closing !== undefined && openingCount?.id !== closingCount?.id;
    const physical = comparable ? opening + entries - closing - waste : undefined;
    return { item, opening, closing, entries, waste, physical, theoretical: expected[item.id] ?? 0, variance: physical === undefined ? undefined : physical - (expected[item.id] ?? 0), openingAt: openingCount?.countedAt, closingAt: closingCount?.countedAt };
  });
}

export function isInventoryVarianceAlert(row: InventoryAnalysisRow) {
  return row.variance !== undefined && Math.abs(row.variance) > row.item.tolerance;
}

export interface InventoryPeriod {
  itemId: string;
  startCountId?: string;
  startAt?: string;
  startQuantity?: number;
  endCountId: string;
  endAt: string;
  endQuantity: number;
  days: number;
  entries: number;
  waste: number;
  physical?: number;
}

export function buildInventoryPeriods(itemId: string, counts: InventoryCount[], movements: InventoryMovement[]): InventoryPeriod[] {
  const itemCounts = counts
    .filter((count) => count.lines.some((line) => line.itemId === itemId))
    .sort((a, b) => a.countedAt.localeCompare(b.countedAt));
  const periods: InventoryPeriod[] = [];
  for (let index = 0; index < itemCounts.length; index += 1) {
    const current = itemCounts[index];
    const previous = itemCounts[index - 1];
    const endQuantity = quantityFor(current, itemId) ?? 0;
    const startQuantity = previous ? quantityFor(previous, itemId) : undefined;
    const { entries, waste } = movementsBetween(movements, itemId, previous?.countedAt ?? current.countedAt, current.countedAt);
    const days = previous ? (Date.parse(current.countedAt) - Date.parse(previous.countedAt)) / 86_400_000 : 0;
    const physical = startQuantity === undefined ? undefined : startQuantity + entries - endQuantity - waste;
    periods.push({
      itemId,
      startCountId: previous?.id,
      startAt: previous?.countedAt,
      startQuantity,
      endCountId: current.id,
      endAt: current.countedAt,
      endQuantity,
      days: Math.round(days * 10) / 10,
      entries,
      waste,
      physical
    });
  }
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
