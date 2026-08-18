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

export function createInventoryAnalysis(items: InventoryItem[], counts: InventoryCount[], movements: InventoryMovement[], expected: Record<string, number>, start: string, end: string): InventoryAnalysisRow[] {
  return items.filter((item) => item.active).map((item) => {
    const openingCount = atOrBefore(counts, item.id, start);
    const closingCount = atOrBefore(counts, item.id, end);
    const opening = quantityFor(openingCount, item.id);
    const closing = quantityFor(closingCount, item.id);
    const inWindow = movements.filter((movement) => movement.itemId === item.id && movement.recordedAt > (openingCount?.countedAt ?? start) && movement.recordedAt <= (closingCount?.countedAt ?? end));
    const entries = inWindow.filter((movement) => movement.type === "entry").reduce((sum, movement) => sum + movement.quantity, 0);
    const waste = inWindow.filter((movement) => movement.type === "waste").reduce((sum, movement) => sum + movement.quantity, 0);
    const comparable = opening !== undefined && closing !== undefined && openingCount?.id !== closingCount?.id;
    const physical = comparable ? opening + entries - closing - waste : undefined;
    return { item, opening, closing, entries, waste, physical, theoretical: expected[item.id] ?? 0, variance: physical === undefined ? undefined : physical - (expected[item.id] ?? 0), openingAt: openingCount?.countedAt, closingAt: closingCount?.countedAt };
  });
}

export function isInventoryVarianceAlert(row: InventoryAnalysisRow) {
  return row.variance !== undefined && Math.abs(row.variance) > row.item.tolerance;
}
