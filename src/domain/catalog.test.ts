import { describe, expect, it } from "vitest";
import { hasPriceChoices, PRODUCT_IMAGE_MAX_BYTES, productDisplayPrice, productImageError, sortCategories } from "./catalog";
import type { Category } from "./types";

const category = (id: string, name: string, position: number): Category => ({ id, name, position });

describe("sortCategories", () => {
  it("ordena por posición, no por identificador", () => {
    // Reproduce el defecto original: Dexie devuelve las filas por clave primaria, así que
    // `bakery` (Otros) llegaba antes que `coffee` (Café) aunque la gerencia puso Café primero.
    const fromIndexedDb = [
      category("bakery", "Otros", 6),
      category("breakfast", "Almuerzos", 2),
      category("coffee", "Café", 0),
      category("cold", "Frías", 1)
    ];
    expect(sortCategories(fromIndexedDb).map((item) => item.name)).toEqual(["Café", "Frías", "Almuerzos", "Otros"]);
  });

  it("no muta el arreglo recibido", () => {
    const original = [category("b", "Bebidas", 1), category("a", "Alimentos", 0)];
    const copy = [...original];
    sortCategories(original);
    expect(original).toEqual(copy);
  });

  it("manda al final las categorías sin posición utilizable y desempata por nombre", () => {
    const mixed = [
      { id: "z", name: "Zumos" } as unknown as Category,
      category("c", "Café", 0),
      { id: "a", name: "Antojos" } as unknown as Category
    ];
    expect(sortCategories(mixed).map((item) => item.name)).toEqual(["Café", "Antojos", "Zumos"]);
  });

  it("desempata por nombre en español cuando comparten posición", () => {
    const tied = [category("b", "Ñoquis", 0), category("a", "Nieves", 0), category("c", "Almuerzos", 0)];
    expect(sortCategories(tied).map((item) => item.name)).toEqual(["Almuerzos", "Nieves", "Ñoquis"]);
  });

  it("respeta el orden dado cuando las posiciones ya vienen consecutivas", () => {
    const ordered = [category("a", "Café", 0), category("b", "Frías", 1), category("c", "Crepas", 2)];
    expect(sortCategories(ordered)).toEqual(ordered);
  });

  it("tolera una lista vacía", () => {
    expect(sortCategories([])).toEqual([]);
  });
});

describe("productDisplayPrice", () => {
  const product = (price: number, variants?: Array<{ id: string; name: string; price: number }>) => ({ price, variants });

  it("usa el precio base cuando el producto no tiene presentaciones", () => {
    expect(productDisplayPrice(product(48))).toBe(48);
    expect(productDisplayPrice(product(48, []))).toBe(48);
  });

  it("anuncia la presentación más barata, no el precio base", () => {
    // El caso que lo destapó: base $50 con una sola presentación de $99. La tarjeta decía
    // "$50.00+", un precio que ningún cliente podía pagar.
    expect(productDisplayPrice(product(50, [{ id: "g", name: "Grande", price: 99 }]))).toBe(99);
    expect(productDisplayPrice(product(70, [{ id: "c", name: "Caliente", price: 70 }, { id: "f", name: "Frío", price: 90 }]))).toBe(70);
  });

  it("no se deja engañar por el orden de las presentaciones", () => {
    expect(productDisplayPrice(product(0, [{ id: "a", name: "Grande", price: 90 }, { id: "b", name: "Chico", price: 60 }]))).toBe(60);
  });

  it("ignora precios no numéricos en vez de devolver NaN", () => {
    expect(productDisplayPrice(product(55, [{ id: "a", name: "Rara", price: NaN }]))).toBe(55);
  });
});

describe("hasPriceChoices", () => {
  it("sólo hay que decir «desde» cuando se puede elegir entre varias", () => {
    expect(hasPriceChoices({ variants: [{ id: "a", name: "Chico", price: 50 }, { id: "b", name: "Grande", price: 65 }] })).toBe(true);
    expect(hasPriceChoices({ variants: [{ id: "a", name: "Único", price: 50 }] })).toBe(false);
    expect(hasPriceChoices({ variants: [] })).toBe(false);
    expect(hasPriceChoices({})).toBe(false);
  });
});

describe("productImageError", () => {
  const file = (type: string, size: number) => ({ type, size });

  it("acepta PNG y JPEG dentro del límite", () => {
    expect(productImageError(file("image/png", 10_928))).toBeNull();
    expect(productImageError(file("image/jpeg", PRODUCT_IMAGE_MAX_BYTES))).toBeNull();
  });

  it("rechaza cualquier cosa que no sea PNG o JPEG", () => {
    expect(productImageError(file("text/plain", 440))).toBe("La imagen debe ser PNG o JPEG.");
    expect(productImageError(file("image/gif", 1_000))).toBe("La imagen debe ser PNG o JPEG.");
    expect(productImageError(file("", 1_000))).toBe("La imagen debe ser PNG o JPEG.");
  });

  it("rechaza la imagen que pasa de 2 MB", () => {
    expect(productImageError(file("image/png", PRODUCT_IMAGE_MAX_BYTES + 1))).toBe("La imagen no debe pesar más de 2 MB.");
    expect(productImageError(file("image/png", 3_241_213))).toBe("La imagen no debe pesar más de 2 MB.");
  });

  it("avisa primero del formato: un archivo enorme y del tipo equivocado no confunde al usuario", () => {
    expect(productImageError(file("application/pdf", 9_000_000))).toBe("La imagen debe ser PNG o JPEG.");
  });
});
