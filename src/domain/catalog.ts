import type { Category, Product } from "./types";

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
