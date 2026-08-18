import { useEffect, useMemo, useState } from "react";
import { Coffee, Search, Sparkles } from "lucide-react";
import { Button, TextField } from "../../design-system/react";
import { mxn } from "../domain/money";
import type { OrderItem, Product } from "../domain/types";
import { useApp } from "../state/AppContext";
import { Modal } from "./Modal";

export interface ProductPickerSelection {
  product: Product;
  variantId?: string;
  modifiers?: OrderItem["modifiers"];
  notes?: string;
}

export function ProductPicker({ onSelect }: { onSelect: (selection: ProductPickerSelection) => void }) {
  const { categories, products, extras } = useApp();
  const [categoryId, setCategoryId] = useState("");
  const [seasonalOnly, setSeasonalOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>();
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [itemNotes, setItemNotes] = useState("");

  useEffect(() => {
    if (!categories.some((category) => category.id === categoryId)) setCategoryId(categories[0]?.id ?? "");
  }, [categories, categoryId]);

  const visibleProducts = useMemo(() => products.filter((product) => {
    if (!product.available) return false;
    if (search) return `${product.name} ${product.description ?? ""}`.toLowerCase().includes(search.toLowerCase());
    if (seasonalOnly) return product.seasonal;
    return product.categoryId === categoryId;
  }), [products, categoryId, seasonalOnly, search]);
  const eligibleExtras = useMemo(() => extras.filter((extra) => extra.active), [extras]);

  function selectProduct(product: Product) {
    setSelectedVariant(product.variants?.[0]?.id);
    setSelectedModifiers([]);
    setItemNotes("");
    setVariantProduct(product);
  }
  function addConfiguredItem() {
    if (!variantProduct) return;
    onSelect({ product: variantProduct, variantId: selectedVariant, modifiers: eligibleExtras.filter((modifier) => selectedModifiers.includes(modifier.id)), notes: itemNotes });
    setVariantProduct(null);
  }

  return (
    <>
      <aside className="border-b border-outline-variant/30 bg-surface-container-low px-3 py-3 xl:border-b-0 xl:border-r xl:py-5">
        <div className="flex gap-2 overflow-x-auto xl:flex-col xl:overflow-visible">
          {categories.map((category) => <button key={category.id} onClick={() => { setCategoryId(category.id); setSeasonalOnly(false); setSearch(""); }} className={`min-h-11 shrink-0 rounded-xl px-4 text-left text-sm font-bold transition-colors xl:w-full ${categoryId === category.id && !seasonalOnly && !search ? "bg-primary text-on-primary shadow-brand" : "bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high"}`}>{category.name}</button>)}
          <button onClick={() => { setSeasonalOnly(true); setSearch(""); }} className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-4 text-left text-sm font-bold transition-colors xl:w-full ${seasonalOnly && !search ? "bg-primary text-on-primary shadow-brand" : "bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high"}`}><Sparkles size={16} /> Temporada</button>
        </div>
      </aside>
      <section className="min-w-0 p-4 sm:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">Catálogo vigente</p><h2 className="text-2xl font-bold">{search ? "Resultados" : seasonalOnly ? "Temporada" : categories.find((category) => category.id === categoryId)?.name}</h2></div><div className="relative w-full sm:w-72"><Search size={18} className="absolute left-3 top-[15px] text-outline" /><TextField className="mt-0 pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto" /></div></div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">{visibleProducts.map((product) => <button key={product.id} onClick={() => selectProduct(product)} className="group flex min-h-36 flex-col justify-between rounded-2xl border border-outline-variant/35 bg-surface-container-lowest p-4 text-left shadow-panel transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-panel-hover"><div>{product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="mb-3 h-16 w-16 rounded-xl object-cover" /> : <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary-fixed text-primary"><Coffee size={18} /></div>}<div className="flex items-center gap-1.5"><h3 className="font-bold leading-5 text-on-surface">{product.name}</h3>{product.seasonal && <Sparkles size={14} className="shrink-0 text-primary" />}</div>{product.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">{product.description}</p>}</div><div className="mt-3 flex items-end justify-between gap-2"><span className="text-base font-bold text-primary">{mxn.format(product.price)}{product.variants?.length ? "+" : ""}</span></div></button>)}</div>
      </section>
      {variantProduct && <Modal title={variantProduct.name} description="Configura la presentación y extras." onClose={() => setVariantProduct(null)}><div className="space-y-4">{variantProduct.variants?.length ? <div className="grid grid-cols-2 gap-2">{variantProduct.variants.map((variant) => <button key={variant.id} onClick={() => setSelectedVariant(variant.id)} className={`flex min-h-16 items-center justify-between rounded-xl border p-3 text-left ${selectedVariant === variant.id ? "border-primary bg-primary-fixed" : "border-outline-variant/40 bg-surface"}`}><span className="font-semibold">{variant.name}</span><span className="font-bold text-primary">{mxn.format(variant.price)}</span></button>)}</div> : null}{eligibleExtras.length ? <div><p className="mb-2 text-sm font-semibold">Extras opcionales</p><div className="space-y-2">{eligibleExtras.map((modifier) => <label key={modifier.id} className="flex min-h-12 items-center justify-between rounded-xl border border-outline-variant/35 px-3"><span className="flex items-center gap-3"><input type="checkbox" checked={selectedModifiers.includes(modifier.id)} onChange={() => setSelectedModifiers((current) => current.includes(modifier.id) ? current.filter((id) => id !== modifier.id) : [...current, modifier.id])} className="rounded border-outline-variant text-primary focus:ring-primary" />{modifier.name}</span><strong className="text-sm text-primary">+{mxn.format(modifier.price)}</strong></label>)}</div></div> : null}<label className="block text-sm font-semibold">Nota para preparación<TextField value={itemNotes} onChange={(event) => setItemNotes(event.target.value)} placeholder="Ej. poco hielo" /></label><Button variant="primary" className="w-full" onClick={addConfiguredItem}>Agregar a la cuenta</Button></div></Modal>}
    </>
  );
}
