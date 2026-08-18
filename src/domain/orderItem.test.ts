import { describe, expect, it } from "vitest";
import { buildOrderItem, cancelItemUnits, mergeOrAddItem, type OrderItemInput } from "./orderItem";
import { orderSubtotal } from "./money";
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

describe("cancelItemUnits", () => {
  const dispatched: OrderItem = {
    id: "line", productId: "latte", name: "Latte", quantity: 3, unitPrice: 70,
    variant: "Caliente", modifiers: [shot], status: "dispatched", dispatchBatchId: "lote-1"
  };
  const cancel = (items: OrderItem[], quantity: number, reason = "Se derramó") =>
    cancelItemUnits(items, "line", quantity, reason, "lote-cancelacion", "linea-anulada");

  it("anula parcialmente partiendo la línea en dos", () => {
    const result = cancel([dispatched], 1);
    expect(result).not.toBeNull();
    expect(result!.items).toHaveLength(2);
    const [resto, anulada] = result!.items;
    expect(resto.id).toBe("line");
    expect(resto.quantity).toBe(2);
    expect(resto.status).toBe("dispatched");
    expect(anulada.id).toBe("linea-anulada");
    expect(anulada.quantity).toBe(1);
    expect(anulada.status).toBe("cancelled");
    expect(anulada.cancellationReason).toBe("Se derramó");
    expect(anulada.cancellationBatchId).toBe("lote-cancelacion");
  });

  it("conserva el lote de envío original en la parte anulada", () => {
    // El papel de cancelación tiene que poder referirse a la comanda en la que salió.
    expect(cancel([dispatched], 1)!.cancelled.dispatchBatchId).toBe("lote-1");
  });

  it("copia variante y extras en la parte anulada, para que la barra sepa qué retira", () => {
    const { cancelled } = cancel([dispatched], 2)!;
    expect(cancelled.variant).toBe("Caliente");
    expect(cancelled.modifiers).toEqual([shot]);
  });

  it("descuenta de la cuenta sólo las unidades anuladas", () => {
    // 3 × (70 + 15) = 255. Al anular 1 quedan 2 × 85 = 170.
    expect(orderSubtotal({ items: [dispatched] })).toBe(255);
    expect(orderSubtotal({ items: cancel([dispatched], 1)!.items })).toBe(170);
    expect(orderSubtotal({ items: cancel([dispatched], 3)!.items })).toBe(0);
  });

  it("al anular la línea completa conserva su identificador y no la duplica", () => {
    // Importante para el servidor: la incidencia y el lote siguen apuntando al mismo artículo.
    const result = cancel([dispatched], 3)!;
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("line");
    expect(result.items[0].status).toBe("cancelled");
    expect(result.items[0].quantity).toBe(3);
  });

  it("permite anular en varias veces, con un motivo distinto cada una", () => {
    const primera = cancelItemUnits([dispatched], "line", 1, "Se derramó", "lote-a", "anulada-a")!;
    const segunda = cancelItemUnits(primera.items, "line", 1, "Error de captura", "lote-b", "anulada-b")!;
    expect(segunda.items).toHaveLength(3);
    expect(segunda.items.find((item) => item.id === "line")!.quantity).toBe(1);
    // Cada anulación queda junto a la línea de la que salió, la más reciente primero, para que en
    // pantalla se lea el historial completo de ese producto sin buscarlo por la cuenta.
    expect(segunda.items.map((item) => item.id)).toEqual(["line", "anulada-b", "anulada-a"]);
    const anuladas = segunda.items.filter((item) => item.status === "cancelled");
    expect(anuladas.map((item) => item.cancellationReason)).toEqual(["Error de captura", "Se derramó"]);
    expect(new Set(anuladas.map((item) => item.id)).size).toBe(2);
    expect(orderSubtotal({ items: segunda.items })).toBe(85);
  });

  it("rechaza cantidades fuera de rango", () => {
    expect(cancel([dispatched], 0)).toBeNull();
    expect(cancel([dispatched], -1)).toBeNull();
    expect(cancel([dispatched], 4)).toBeNull();
    expect(cancel([dispatched], 1.5)).toBeNull();
  });

  it("rechaza motivo vacío o de sólo espacios", () => {
    expect(cancel([dispatched], 1, "")).toBeNull();
    expect(cancel([dispatched], 1, "   ")).toBeNull();
  });

  it("recorta los espacios del motivo", () => {
    expect(cancel([dispatched], 1, "  Se derramó  ")!.cancelled.cancellationReason).toBe("Se derramó");
  });

  it("sólo anula artículos que ya salieron a la barra", () => {
    expect(cancelItemUnits([{ ...dispatched, status: "pending" }], "line", 1, "x", "b", "n")).toBeNull();
    expect(cancelItemUnits([{ ...dispatched, status: "cancelled" }], "line", 1, "x", "b", "n")).toBeNull();
    expect(cancelItemUnits([{ ...dispatched, status: "prepared" }], "line", 1, "x", "b", "n")).not.toBeNull();
  });

  it("devuelve nulo si el artículo no existe y no altera la lista original", () => {
    const original = [dispatched];
    const snapshot = structuredClone(original);
    expect(cancelItemUnits(original, "otro", 1, "x", "b", "n")).toBeNull();
    cancel(original, 1);
    expect(original).toEqual(snapshot);
  });
});
