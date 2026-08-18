import { describe, expect, it } from "vitest";
import { analyzeRestockPattern, buildInventoryPeriods, createInventoryAnalysis, isInventoryVarianceAlert } from "./inventory";
import type { InventoryItem, InventoryMovement } from "./types";

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

describe("inventory periods between counts", () => {
  const counts = [
    { id: "c1", countedAt: "2026-08-10T10:00:00.000Z", lines: [{ itemId: "coffee", quantity: 10 }] },
    { id: "c2", countedAt: "2026-08-13T10:00:00.000Z", lines: [{ itemId: "coffee", quantity: 7 }] },
    { id: "c3", countedAt: "2026-08-17T10:00:00.000Z", lines: [{ itemId: "coffee", quantity: 5 }] }
  ];
  const movements: InventoryMovement[] = [
    { id: "entry", itemId: "coffee", type: "entry", quantity: 1, note: "Compra", recordedAt: "2026-08-12T10:00:00.000Z" },
    { id: "waste", itemId: "coffee", type: "waste", quantity: 0.5, note: "Merma", recordedAt: "2026-08-15T10:00:00.000Z" }
  ];

  it("builds one period per pair of consecutive counts, with the first period having no baseline", () => {
    const periods = buildInventoryPeriods("coffee", counts, movements);
    expect(periods).toHaveLength(3);
    expect(periods[0].startCountId).toBeUndefined();
    expect(periods[0].physical).toBeUndefined();
    expect(periods[1]).toMatchObject({ startQuantity: 10, endQuantity: 7, entries: 1, waste: 0, days: 3, physical: 4 });
    expect(periods[2]).toMatchObject({ startQuantity: 7, endQuantity: 5, entries: 0, waste: 0.5, days: 4, physical: 1.5 });
  });

  it("returns a single undefined-baseline period when only one count exists", () => {
    const periods = buildInventoryPeriods("coffee", [counts[0]], []);
    expect(periods).toHaveLength(1);
    expect(periods[0].startCountId).toBeUndefined();
    expect(periods[0].physical).toBeUndefined();
  });

  it("ignores counts that don't include the requested item", () => {
    const mixed = [...counts, { id: "milk-only", countedAt: "2026-08-14T10:00:00.000Z", lines: [{ itemId: "milk", quantity: 5 }] }];
    expect(buildInventoryPeriods("coffee", mixed, movements)).toHaveLength(3);
  });
});

describe("restock pattern", () => {
  it("averages interval and quantity across regular restocks", () => {
    const movements: InventoryMovement[] = [
      { id: "e1", itemId: "coffee", type: "entry", quantity: 3, note: "", recordedAt: "2026-08-01T00:00:00.000Z" },
      { id: "e2", itemId: "coffee", type: "entry", quantity: 3, note: "", recordedAt: "2026-08-04T00:00:00.000Z" },
      { id: "e3", itemId: "coffee", type: "entry", quantity: 3, note: "", recordedAt: "2026-08-07T00:00:00.000Z" }
    ];
    const pattern = analyzeRestockPattern("coffee", movements);
    expect(pattern).toEqual({ count: 3, averageIntervalDays: 3, averageQuantity: 3, lastRestockAt: "2026-08-07T00:00:00.000Z" });
  });

  it("reports zero restocks without dividing by zero", () => {
    expect(analyzeRestockPattern("coffee", [])).toEqual({ count: 0 });
  });

  it("has no interval average with a single restock", () => {
    const pattern = analyzeRestockPattern("coffee", [{ id: "e1", itemId: "coffee", type: "entry", quantity: 3, note: "", recordedAt: "2026-08-01T00:00:00.000Z" }]);
    expect(pattern.count).toBe(1);
    expect(pattern.averageQuantity).toBe(3);
    expect(pattern.averageIntervalDays).toBeUndefined();
  });
});
