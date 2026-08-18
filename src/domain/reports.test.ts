import { describe, expect, it } from "vitest";
import { createReportDataset, resolveReportRange, type ReportOrder } from "./reports";

const range = resolveReportRange("custom", "2026-08-17", "2026-08-17");
const filters = { employeeId: "", orderType: "all" as const, paymentMethod: "all" as const };

function order(overrides: Partial<ReportOrder> = {}): ReportOrder {
  return {
    id: "sale", folio: 1, type: "takeaway", status: "closed", discount: 0,
    openedAt: "2026-08-17T15:00:00.000Z", updatedAt: "2026-08-17T16:00:00.000Z", closedAt: "2026-08-17T16:00:00.000Z",
    closedBy: "staff-1", closedByName: "Ana", items: [{ id: "item", productId: "coffee", name: "Café", quantity: 2, unitPrice: 90, modifiers: [], status: "prepared" }],
    payments: [{ id: "cash", method: "cash", amount: 100, tip: 3, createdAt: "2026-08-17T16:00:00.000Z" }, { id: "card", method: "card", amount: 100, tip: 5, createdAt: "2026-08-17T16:01:00.000Z" }],
    ...overrides
  };
}

describe("report calculations", () => {
  it("caps mixed payments at the sale total and keeps tips separate", () => {
    const data = createReportDataset([order()], range, filters);
    expect(data.metrics.grossSales.value).toBe(180);
    expect(data.metrics.netSales.value).toBe(180);
    expect(data.metrics.tips.value).toBe(8);
    expect(data.payments).toEqual([{ method: "cash", value: 100 }, { method: "card", value: 80 }, { method: "transfer", value: 0 }]);
  });

  it("uses only the selected method contribution while retaining the ticket", () => {
    const data = createReportDataset([order()], range, { ...filters, paymentMethod: "card" });
    expect(data.metrics.grossSales.value).toBe(80);
    expect(data.metrics.averageTicket.value).toBe(80);
    expect(data.metrics.tickets.value).toBe(1);
    expect(data.metrics.tips.value).toBe(5);
  });

  it("records a later reversal in its own period instead of rewriting the original sale", () => {
    const reversed = order({
      id: "reversed", status: "reversed", openedAt: "2026-08-16T15:00:00.000Z", updatedAt: "2026-08-17T18:00:00.000Z",
      closedAt: "2026-08-16T16:00:00.000Z", reversedAt: "2026-08-17T18:00:00.000Z",
      items: [{ id: "item", productId: "coffee", name: "Café", quantity: 1, unitPrice: 90, modifiers: [], status: "prepared" }],
      payments: [{ id: "cash", method: "cash", amount: 90, tip: 10, createdAt: "2026-08-16T16:00:00.000Z" }]
    });
    const data = createReportDataset([reversed], range, filters);
    expect(data.metrics.grossSales.value).toBe(0);
    expect(data.metrics.reversals.value).toBe(90);
    expect(data.metrics.netSales.value).toBe(-90);
    expect(data.metrics.tips.value).toBe(-10);
    expect(data.metrics.grossSales.previous).toBe(90);
  });

  it("filters employee and type consistently and counts cancellation events", () => {
    const cancelled = order({ id: "cancelled", folio: 2, type: "table", status: "cancelled", closedAt: undefined, closedBy: undefined, closedByName: undefined, updatedAt: "2026-08-17T17:00:00.000Z", payments: [] });
    const data = createReportDataset([order(), cancelled], range, filters);
    expect(data.metrics.cancellations.value).toBe(1);
    expect(createReportDataset([order(), cancelled], range, { ...filters, employeeId: "staff-1" }).metrics.cancellations.value).toBe(0);
    expect(createReportDataset([order(), cancelled], range, { ...filters, orderType: "table" }).metrics.cancellations.value).toBe(1);
  });

  it("enforces a maximum 90-day custom range", () => {
    expect(() => resolveReportRange("custom", "2026-01-01", "2026-04-01")).toThrow("hasta 90 días");
  });
});
