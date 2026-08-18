import { describe, expect, it } from "vitest";
import { createInventoryAnalysis, isInventoryVarianceAlert } from "./inventory";
import type { InventoryItem } from "./types";

const item: InventoryItem = { id: "coffee", name: "Café", unit: "kg", minimum: 2, tolerance: 0.1, active: true };
describe("inventory analysis", () => {
  it("compares physical consumption with prepared recipe usage", () => {
    const rows = createInventoryAnalysis([item], [
      { id: "opening", countedAt: "2026-08-16T23:00:00.000Z", lines: [{ itemId: "coffee", quantity: 8 }] },
      { id: "closing", countedAt: "2026-08-17T23:00:00.000Z", lines: [{ itemId: "coffee", quantity: 6.5 }] }
    ], [{ id: "entry", itemId: "coffee", type: "entry", quantity: 1, note: "Compra", recordedAt: "2026-08-17T12:00:00.000Z" }, { id: "waste", itemId: "coffee", type: "waste", quantity: 0.2, note: "Merma", recordedAt: "2026-08-17T14:00:00.000Z" }], { coffee: 2 }, "2026-08-16T23:30:00.000Z", "2026-08-18T00:00:00.000Z");
    expect(rows[0].physical).toBeCloseTo(2.3);
    expect(rows[0].variance).toBeCloseTo(0.3);
    expect(isInventoryVarianceAlert(rows[0])).toBe(true);
  });

  it("does not infer consumption from a single baseline count", () => {
    const [row] = createInventoryAnalysis([item], [{ id: "baseline", countedAt: "2026-08-17T10:00:00.000Z", lines: [{ itemId: "coffee", quantity: 8 }] }], [], {}, "2026-08-17T00:00:00.000Z", "2026-08-18T00:00:00.000Z");
    expect(row.physical).toBeUndefined();
  });
});
