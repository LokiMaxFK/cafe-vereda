import type { CafeTable } from "./types";

/** Tolerancias que aproximan el tamaño de una mesa sobre el plano, en porcentaje del croquis. */
export const TABLE_SLOT_TOLERANCE_X = 12;
export const TABLE_SLOT_TOLERANCE_Y = 24;

/** Posición de reserva cuando el croquis ya no admite una mesa más sin encimarla. */
export const TABLE_SLOT_FALLBACK = { x: 50, y: 50 };

/**
 * Primer hueco libre del croquis, para que las mesas nuevas no se apilen todas en el centro.
 * Recorre la rejilla de arriba abajo y de izquierda a derecha, y sólo estorban las mesas activas:
 * una mesa dada de baja no ocupa lugar.
 */
export function nextFreeSlot(tables: Pick<CafeTable, "x" | "y" | "active">[]): { x: number; y: number } {
  const taken = tables.filter((table) => table.active);
  for (let y = 12; y <= 88; y += 4) {
    for (let x = 8; x <= 88; x += 3) {
      if (!taken.some((table) => Math.abs(table.x - x) < TABLE_SLOT_TOLERANCE_X && Math.abs(table.y - y) < TABLE_SLOT_TOLERANCE_Y)) return { x, y };
    }
  }
  return { ...TABLE_SLOT_FALLBACK };
}
