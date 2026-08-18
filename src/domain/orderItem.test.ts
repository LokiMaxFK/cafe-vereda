import { describe, expect, it } from "vitest";
import { buildOrderItem, mergeOrAddItem, type OrderItemInput } from "./orderItem";
import type { OrderItem, Product } from "./types";

const latte: Product = {
  id: "latte",
  categoryId: "cafe",
  name: "Latte",
  price: 70,
  available: true,
  seasonal: false,
  variants: [
    { id: "hot", name: "Caliente", price: 70 },
    { id: "cold", name: "Frío / frappé", price: 90 }
  ]
};

const shot: OrderItem["modifiers"][number] = { id: "shot", name: "Carga extra", price: 15 };
const oat: OrderItem["modifiers"][number] = { id: "oat", name: "Leche de avena", price: 20 };

const add = (items: OrderItem[], input: OrderItemInput) => mergeOrAddItem(items, input);

describe("buildOrderItem", () => {
  it("uses the variant price when a variant is selected", () => {
    expect(buildOrderItem({ product: latte, variantId: "cold" })).toMatchObject({ unitPrice: 90, variant: "Frío / frappé" });
  });

  it("falls back to the base price when the variant does not exist", () => {
    expect(buildOrderItem({ product: latte, variantId: "nope" })).toMatchObject({ unitPrice: 70, variant: undefined });
  });

  it("normalizes blank notes to undefined so they never reach the command ticket", () => {
    expect(buildOrderItem({ product: latte, notes: "   " }).notes).toBeUndefined();
    expect(buildOrderItem({ product: latte, notes: "  sin azúcar " }).notes).toBe("sin azúcar");
  });

  it("starts every new line as pending so it still has to be dispatched", () => {
    expect(buildOrderItem({ product: latte }).status).toBe("pending");
  });
});

describe("mergeOrAddItem", () => {
  it("merges an identical selection into the existing pending line", () => {
    const items = add(add([], { product: latte, variantId: "hot" }), { product: latte, variantId: "hot" });
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  it("keeps different variants on separate lines", () => {
    const items = add(add([], { product: latte, variantId: "hot" }), { product: latte, variantId: "cold" });
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.unitPrice)).toEqual([70, 90]);
  });

  it("keeps different notes on separate lines", () => {
    const items = add(add([], { product: latte, notes: "sin azúcar" }), { product: latte, notes: "extra caliente" });
    expect(items).toHaveLength(2);
  });

  it("treats the same modifiers in a different order as the same selection", () => {
    const items = add(add([], { product: latte, modifiers: [shot, oat] }), { product: latte, modifiers: [oat, shot] });
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  it("keeps a different modifier set on its own line", () => {
    const items = add(add([], { product: latte, modifiers: [shot] }), { product: latte, modifiers: [shot, oat] });
    expect(items).toHaveLength(2);
  });

  it("never merges into an already dispatched line, so the kitchen ticket stays truthful", () => {
    const dispatched: OrderItem = { ...buildOrderItem({ product: latte, variantId: "hot" }), status: "dispatched" };
    const items = add([dispatched], { product: latte, variantId: "hot" });
    expect(items).toHaveLength(2);
    expect(items[0].quantity).toBe(1);
    expect(items[1].status).toBe("pending");
  });

  it("never revives a cancelled line", () => {
    const cancelled: OrderItem = { ...buildOrderItem({ product: latte }), status: "cancelled" };
    const items = add([cancelled], { product: latte });
    expect(items).toHaveLength(2);
    expect(items[0].status).toBe("cancelled");
  });

  it("does not mutate the array it receives", () => {
    const original = add([], { product: latte });
    const snapshot = structuredClone(original);
    add(original, { product: latte });
    expect(original).toEqual(snapshot);
  });
});
