import { describe, expect, it } from "vitest";
import { applyPaymentCap, itemTotal, mxn, orderSubtotal, orderTotal, paidTotal } from "./money";
import type { Order } from "./types";

const order: Order = {
  id: "order", folio: 1, type: "takeaway", status: "open", openedBy: "staff", openedAt: "2026-08-12T10:00:00Z", updatedAt: "2026-08-12T10:00:00Z", syncStatus: "pending", discount: 20,
  items: [
    { id: "one", productId: "latte", name: "Latte", quantity: 2, unitPrice: 70, modifiers: [{ id: "extra", name: "Carga extra", price: 15 }], status: "pending" },
    { id: "two", productId: "cake", name: "Pastel", quantity: 1, unitPrice: 50, modifiers: [], status: "cancelled" }
  ],
  payments: [
    { id: "cash", method: "cash", amount: 100, tip: 10, createdAt: "2026-08-12T10:01:00Z" },
    { id: "card", method: "card", amount: 50, tip: 0, createdAt: "2026-08-12T10:02:00Z" }
  ]
};

describe("money calculations", () => {
  it("applies extras per unit", () => expect(itemTotal(order.items[0])).toBe(170));
  it("excludes cancelled items", () => expect(orderSubtotal(order)).toBe(170));
  it("applies the discount without going below zero", () => {
    expect(orderTotal(order)).toBe(150);
    expect(orderTotal({ ...order, discount: 999 })).toBe(0);
  });
  it("keeps tips separate from paid amount", () => expect(paidTotal(order)).toBe(150));

  it("calculates a total with a discount", () => {
    expect(orderTotal({ ...order, discount: 20 })).toBe(150);
  });

  it("caps a discount at the subtotal", () => {
    expect(orderTotal({ ...order, discount: 170 })).toBe(0);
    expect(orderTotal({ ...order, discount: 170.01 })).toBe(0);
  });

  it("does not include cancelled lines in the total", () => {
    expect(orderTotal({ ...order, discount: 0 })).toBe(170);
  });

  it("adds partial payments made with different methods", () => {
    expect(paidTotal(order)).toBe(100 + 50);
  });

  it("excludes tips from the amount paid toward the sale", () => {
    expect(paidTotal({ payments: [{ ...order.payments[0], amount: 100, tip: 999 }] })).toBe(100);
  });

  it("preserves cent precision for totals", () => {
    const centOrder = {
      items: [{ ...order.items[0], quantity: 3, unitPrice: 0.1, modifiers: [] }],
      discount: 0
    };
    expect(orderTotal(centOrder)).toBeCloseTo(0.3, 2);
  });

  it("does not meet the close threshold when payments are one cent short", () => {
    const centOrder = { ...order, discount: 69.99, payments: [{ ...order.payments[0], amount: 100, tip: 0 }] };
    expect(orderTotal(centOrder)).toBe(100.01);
    expect(paidTotal(centOrder)).toBe(100);
    expect(paidTotal(centOrder)).toBeLessThan(orderTotal(centOrder));
  });

  it("meets the close threshold when payments exceed the total by one cent", () => {
    const centOrder = { ...order, discount: 70, payments: [{ ...order.payments[0], amount: 100.01, tip: 0 }] };
    expect(orderTotal(centOrder)).toBe(100);
    expect(paidTotal(centOrder)).toBe(100.01);
    expect(paidTotal(centOrder)).toBeGreaterThanOrEqual(orderTotal(centOrder));
  });

  it("keeps a payment below the outstanding balance", () => {
    expect(applyPaymentCap(80, 100)).toBe(80);
  });

  it("accepts a payment equal to the outstanding balance", () => {
    expect(applyPaymentCap(100, 100)).toBe(100);
  });

  it("caps a payment that exceeds the outstanding balance", () => {
    expect(applyPaymentCap(120, 100)).toBe(100);
  });

  it("formats MXN amounts with two decimal places", () => {
    expect(mxn.format(100)).toBe("$100.00");
    expect(mxn.format(100.01)).toBe("$100.01");
  });
});
