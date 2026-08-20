import { describe, expect, it } from "vitest";
import { nextFreeSlot, TABLE_SLOT_FALLBACK, TABLE_SLOT_TOLERANCE_X, TABLE_SLOT_TOLERANCE_Y } from "./tables";

const table = (x: number, y: number, active = true) => ({ x, y, active });

describe("nextFreeSlot", () => {
  it("coloca la primera mesa en el inicio de la rejilla", () => {
    expect(nextFreeSlot([])).toEqual({ x: 8, y: 12 });
  });

  it("respeta las tolerancias: no devuelve un hueco que encimaría otra mesa", () => {
    const slot = nextFreeSlot([table(8, 12)]);
    expect(Math.abs(slot.x - 8) >= TABLE_SLOT_TOLERANCE_X || Math.abs(slot.y - 12) >= TABLE_SLOT_TOLERANCE_Y).toBe(true);
  });

  it("ignora las mesas dadas de baja: una mesa inactiva no ocupa lugar", () => {
    expect(nextFreeSlot([table(8, 12, false)])).toEqual({ x: 8, y: 12 });
  });

  it("nunca encima mesas al colocar varias seguidas", () => {
    // Reproduce el caso de la prueba en navegador: seis mesas agregadas una tras otra.
    const tables: Array<{ x: number; y: number; active: boolean }> = [];
    for (let i = 0; i < 6; i += 1) {
      const slot = nextFreeSlot(tables);
      tables.push(table(slot.x, slot.y));
    }
    for (let i = 0; i < tables.length; i += 1) {
      for (let j = i + 1; j < tables.length; j += 1) {
        const encimadas = Math.abs(tables[i].x - tables[j].x) < TABLE_SLOT_TOLERANCE_X && Math.abs(tables[i].y - tables[j].y) < TABLE_SLOT_TOLERANCE_Y;
        expect(encimadas).toBe(false);
      }
    }
  });

  it("devuelve el centro como último recurso cuando el croquis está lleno", () => {
    // Una rejilla saturada: una mesa en cada punto que el recorrido podría devolver.
    const llenas: Array<{ x: number; y: number; active: boolean }> = [];
    for (let y = 0; y <= 100; y += 4) for (let x = 0; x <= 100; x += 3) llenas.push(table(x, y));
    expect(nextFreeSlot(llenas)).toEqual(TABLE_SLOT_FALLBACK);
  });

  it("no se sale del croquis", () => {
    const tables: Array<{ x: number; y: number; active: boolean }> = [];
    for (let i = 0; i < 20; i += 1) {
      const slot = nextFreeSlot(tables);
      expect(slot.x).toBeGreaterThanOrEqual(0);
      expect(slot.x).toBeLessThanOrEqual(100);
      expect(slot.y).toBeGreaterThanOrEqual(0);
      expect(slot.y).toBeLessThanOrEqual(100);
      tables.push(table(slot.x, slot.y));
    }
  });
});
