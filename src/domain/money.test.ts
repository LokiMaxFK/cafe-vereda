import { describe, expect, it } from "vitest";
import { itemTotal, orderSubtotal, orderTotal, paidTotal } from "./money";
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
});
