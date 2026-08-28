import { INVENTORY_UNITS } from "./inventory";
import type { InventoryUnit } from "./types";

/**
 * Familia de una unidad. Sólo se convierte dentro de la misma familia: un gramo no se transforma en
 * pieza, y las unidades de conteo (pza, paquete, bolsa) no equivalen entre sí porque un paquete no
 * trae siempre las mismas piezas. Cada una es su propia familia para que el selector de unidades
 * quede reducido a ella misma en lugar de ofrecer conversiones inventadas.
 */
export const UNIT_FAMILY: Record<InventoryUnit, string> = {
  g: "masa",
  kg: "masa",
  ml: "volumen",
  L: "volumen",
  pza: "pza",
  paquete: "paquete",
  bolsa: "bolsa"
};

/** Cuántas unidades base (g, ml) cabe en una unidad. Las familias de conteo valen 1. */
export const unitFactor = (unit: InventoryUnit) => (unit === "kg" || unit === "L" ? 1000 : 1);

export const areUnitsCompatible = (a: InventoryUnit, b: InventoryUnit) => UNIT_FAMILY[a] === UNIT_FAMILY[b];

/** Unidades que el usuario puede elegir para capturar una cantidad de un insumo medido en `unit`. */
export const compatibleUnits = (unit: InventoryUnit) => INVENTORY_UNITS.filter((option) => areUnitsCompatible(option.value, unit));

/**
 * Convierte a la unidad canónica del insumo. El redondeo a 3 decimales es el mismo que aplican las
 * columnas `numeric(12,3)` del servidor: redondear aquí evita que el cliente muestre un número que
 * la base de datos va a guardar distinto.
 */
export function convertQuantity(value: number, from: InventoryUnit, to: InventoryUnit) {
  if (from === to) return value;
  if (!areUnitsCompatible(from, to)) throw new Error(`No se puede convertir de ${from} a ${to}.`);
  return Math.round((value * unitFactor(from)) / unitFactor(to) * 1000) / 1000;
}

/**
 * Unidad con la que conviene *mostrar* una cantidad guardada. Evita leer «0.18 L» donde el usuario
 * escribió 180 ml: por debajo de una unidad grande se baja a la chica, y a partir de mil unidades
 * chicas se sube a la grande.
 */
export function preferredUnit(value: number, unit: InventoryUnit): InventoryUnit {
  const magnitude = Math.abs(value);
  if ((unit === "kg" || unit === "L") && magnitude > 0 && magnitude < 1) return unit === "kg" ? "g" : "ml";
  if ((unit === "g" || unit === "ml") && magnitude >= 1000) return unit === "g" ? "kg" : "L";
  return unit;
}

/** Cantidad capturada en un formulario, convertida a la unidad canónica del insumo. */
export function quantityIn(base: InventoryUnit | "", value: string, unit: InventoryUnit | "") {
  if (!base || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return convertQuantity(parsed, unit || base, base);
}
