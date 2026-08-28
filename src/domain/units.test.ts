import { describe, expect, it } from "vitest";
import { areUnitsCompatible, compatibleUnits, convertQuantity, preferredUnit, unitFactor } from "./units";

describe("compatibleUnits", () => {
  it("ofrece las dos unidades de masa para un insumo en kilos", () => {
    expect(compatibleUnits("kg").map((option) => option.value)).toEqual(["g", "kg"]);
  });

  it("ofrece las dos unidades de volumen para un insumo en litros", () => {
    expect(compatibleUnits("L").map((option) => option.value)).toEqual(["ml", "L"]);
  });

  it("no mezcla unidades de conteo: un paquete no equivale a una pieza ni a una bolsa", () => {
    expect(compatibleUnits("pza").map((option) => option.value)).toEqual(["pza"]);
    expect(compatibleUnits("paquete").map((option) => option.value)).toEqual(["paquete"]);
    expect(compatibleUnits("bolsa").map((option) => option.value)).toEqual(["bolsa"]);
  });

  it("nunca cruza familias", () => {
    expect(areUnitsCompatible("g", "ml")).toBe(false);
    expect(areUnitsCompatible("L", "pza")).toBe(false);
  });
});

describe("convertQuantity", () => {
  it("baja de la unidad grande a la chica", () => {
    expect(convertQuantity(0.5, "L", "ml")).toBe(500);
    expect(convertQuantity(1.5, "kg", "g")).toBe(1500);
  });

  it("sube de la unidad chica a la grande", () => {
    expect(convertQuantity(250, "ml", "L")).toBe(0.25);
    expect(convertQuantity(180, "g", "kg")).toBe(0.18);
  });

  it("es idempotente cuando las unidades coinciden", () => {
    expect(convertQuantity(7, "bolsa", "bolsa")).toBe(7);
  });

  it("redondea a los 3 decimales que guarda la base de datos", () => {
    // 1 g = 0.001 kg; medio gramo no sobrevive a numeric(12,3) y debe redondearse aquí también.
    expect(convertQuantity(1, "g", "kg")).toBe(0.001);
    expect(convertQuantity(0.4, "g", "kg")).toBe(0);
  });

  it("da la vuelta completa sin perder el valor original", () => {
    expect(convertQuantity(convertQuantity(2.5, "kg", "g"), "g", "kg")).toBe(2.5);
  });

  it("rechaza cruzar familias en vez de inventar una equivalencia", () => {
    expect(() => convertQuantity(1, "kg", "L")).toThrow();
  });
});

describe("unitFactor", () => {
  it("vale mil para las unidades grandes y uno para el resto", () => {
    expect(unitFactor("kg")).toBe(1000);
    expect(unitFactor("L")).toBe(1000);
    expect(unitFactor("g")).toBe(1);
    expect(unitFactor("paquete")).toBe(1);
  });
});

describe("preferredUnit", () => {
  it("baja a la unidad chica cuando la cantidad no llega a una unidad grande", () => {
    expect(preferredUnit(0.18, "L")).toBe("ml");
    expect(preferredUnit(0.5, "kg")).toBe("g");
  });

  it("sube a la unidad grande a partir de mil unidades chicas", () => {
    expect(preferredUnit(1500, "g")).toBe("kg");
    expect(preferredUnit(1000, "ml")).toBe("L");
  });

  it("deja el cero y las unidades de conteo en su propia unidad", () => {
    expect(preferredUnit(0, "L")).toBe("L");
    expect(preferredUnit(12, "pza")).toBe("pza");
  });

  it("no toca las cantidades que ya se leen bien", () => {
    expect(preferredUnit(2.5, "kg")).toBe("kg");
    expect(preferredUnit(750, "ml")).toBe("ml");
  });
});
