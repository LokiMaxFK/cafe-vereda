import { quantityIn } from "./units";
import type { Category, InventoryItem, InventoryUnit, Product } from "./types";

// El servidor guarda el orden del menú en `categories.position`, pero ese orden se perdía al
// pasar por IndexedDB: Dexie devuelve `toArray()` ordenado por clave primaria, que es el
// identificador interno (un UUID en producción). Al recargar, el menú quedaba alfabetizado por
// un dato que nadie ve y el selector de productos abría en una categoría al azar.
export function sortCategories(categories: Category[]): Category[] {
  return [...categories].sort((a, b) => {
    const positionA = Number.isFinite(a.position) ? a.position : Number.MAX_SAFE_INTEGER;
    const positionB = Number.isFinite(b.position) ? b.position : Number.MAX_SAFE_INTEGER;
    if (positionA !== positionB) return positionA - positionB;
    return a.name.localeCompare(b.name, "es");
  });
}

/**
 * Precio que anuncia la tarjeta del selector de productos. Si el producto tiene presentaciones,
 * lo honesto es el precio **más barato que se puede pagar de verdad**: la tarjeta mostraba siempre
 * el precio base, así que bastaba con que la gerencia cambiara el precio de una presentación y no
 * el base para anunciar una cifra que no correspondía a ninguna opción comprable.
 */
export function productDisplayPrice(product: Pick<Product, "price" | "variants">): number {
  const variantPrices = (product.variants ?? []).map((variant) => variant.price).filter((price) => Number.isFinite(price));
  return variantPrices.length ? Math.min(...variantPrices) : product.price;
}

/** El "desde" sólo tiene sentido cuando hay más de una presentación entre las que elegir. */
export function hasPriceChoices(product: Pick<Product, "variants">): boolean {
  return (product.variants?.length ?? 0) > 1;
}

/** Formatos y tamaño que admite la imagen de un producto. */
export const PRODUCT_IMAGE_MAX_BYTES = 2_000_000;

/**
 * Valida la imagen antes de subirla. Vive aparte de `uploadProductImage` para poder probar los
 * tres caminos sin depender de Supabase ni del navegador.
 * Devuelve `null` cuando la imagen es aceptable, o el mensaje que debe ver la gerencia.
 */
export function productImageError(file: Pick<File, "type" | "size">): string | null {
  if (!/image\/(png|jpeg)/.test(file.type)) return "La imagen debe ser PNG o JPEG.";
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) return "La imagen no debe pesar más de 2 MB.";
  return null;
}

export type RecipeLine = { inventoryItemId: string; quantity: string; unit: InventoryUnit | "" };

/**
 * Qué está mal en una receta antes de mandarla al servidor, o `null` si se puede guardar.
 *
 * Antes el editor se limitaba a descartar en silencio toda línea sin insumo, sin cantidad o cuyo
 * insumo no estuviera cargado, y como `replace_inventory_recipe` borra y reescribe la receta
 * entera, guardar con el formulario a medias la vaciaba sin decir nada.
 */
export function recipeProblem(lines: RecipeLine[], items: InventoryItem[]): string | null {
  const chosen = lines.filter((line) => line.inventoryItemId);
  if (chosen.length !== lines.length) return "Hay una línea sin insumo seleccionado. Elígelo o quítala.";
  for (const line of lines) {
    const base = items.find((item) => item.id === line.inventoryItemId);
    if (!base) return "Una de las líneas apunta a un insumo que ya no existe. Quítala para poder guardar.";
    const quantity = quantityIn(base.unit, line.quantity, line.unit);
    if (quantity === null || quantity <= 0) return `Falta la cantidad de «${base.name}», o es cero.`;
  }
  const ids = chosen.map((line) => line.inventoryItemId);
  const duplicated = ids.find((id, index) => ids.indexOf(id) !== index);
  // La PK de inventory_recipe_lines es (recipe_id, inventory_item_id): sin esto el servidor
  // respondía con el mensaje crudo del índice único.
  if (duplicated) return `«${items.find((item) => item.id === duplicated)?.name ?? "Un insumo"}» está dos veces. Súmalo en una sola línea.`;
  return null;
}
