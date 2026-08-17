import { useState, type FormEvent } from "react";
import { Coffee, Pencil, Plus, Search, SlidersHorizontal } from "lucide-react";
import { Badge, Button, FieldLabel, InlineAlert, Page, PageHeader, Panel, SelectField, TextareaField, TextField } from "../../design-system/react";
import { Modal } from "../components/Modal";
import { mxn } from "../domain/money";
import type { CatalogExtra, Category, Product } from "../domain/types";
import { useApp } from "../state/AppContext";

function ProductForm({ product, categories, extras, onSave, onClose }: {
  product: Product | null;
  categories: Category[];
  extras: CatalogExtra[];
  onSave: (value: Omit<Product, "id">) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(String(product?.price ?? ""));
  const [schedule, setSchedule] = useState(product?.schedule ?? "");
  const [available, setAvailable] = useState(product?.available ?? true);
  const [modifierIds, setModifierIds] = useState(product?.modifierIds ?? []);
  const [variants, setVariants] = useState(product?.variants ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const numericPrice = Number(price);
    if (!name.trim() || !categoryId || !Number.isFinite(numericPrice) || numericPrice < 0 || variants.some((variant) => !Number.isFinite(Number(variant.price)) || Number(variant.price) < 0)) {
      setError("Completa el nombre, la categoría y un precio válido.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        name: name.trim(), categoryId, description: description.trim() || undefined, price: numericPrice,
        schedule: schedule.trim() || undefined, available, modifierIds,
        variants: variants.length ? variants.map((variant) => ({ ...variant, price: Number(variant.price) })) : undefined
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar el producto.");
    } finally {
      setSaving(false);
    }
  }

  return <form className="space-y-5" onSubmit={submit}>
    {error && <InlineAlert>{error}</InlineAlert>}
    <div className="grid gap-4 sm:grid-cols-2">
      <FieldLabel label="Nombre del producto"><TextField required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Latte vainilla" /></FieldLabel>
      <FieldLabel label="Categoría"><SelectField required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</SelectField></FieldLabel>
      <FieldLabel label="Precio base (MXN)"><TextField required type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" /></FieldLabel>
      <FieldLabel label="Horario" hint="Déjalo vacío si se vende todo el día."><TextField value={schedule} onChange={(event) => setSchedule(event.target.value)} placeholder="Ej. Hasta 1:30 pm" /></FieldLabel>
    </div>
    <FieldLabel label="Descripción"><TextareaField rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ingredientes o una descripción breve" /></FieldLabel>
    {variants.length > 0 && <div><p className="mb-2 text-sm font-semibold text-on-surface-variant">Precios por presentación</p><div className="grid gap-3 sm:grid-cols-2">{variants.map((variant, index) => <FieldLabel key={variant.id} label={variant.name}><TextField type="number" min="0" step="0.01" value={variant.price} onChange={(event) => setVariants((current) => current.map((item, position) => position === index ? { ...item, price: Number(event.target.value) } : item))} /></FieldLabel>)}</div></div>}
    <div><p className="mb-2 text-sm font-semibold text-on-surface-variant">Extras permitidos</p>{extras.length ? <div className="grid gap-2 sm:grid-cols-2">{extras.map((extra) => <label key={extra.id} className="flex min-h-12 items-center justify-between rounded-xl border border-outline-variant/35 px-3 text-sm"><span className="flex items-center gap-3"><input type="checkbox" checked={modifierIds.includes(extra.id)} onChange={() => setModifierIds((current) => current.includes(extra.id) ? current.filter((id) => id !== extra.id) : [...current, extra.id])} className="rounded border-outline-variant text-primary focus:ring-primary" />{extra.name}</span><strong className="text-primary">+{mxn.format(extra.price)}</strong></label>)}</div> : <p className="rounded-xl bg-surface-container-low p-3 text-sm text-on-surface-variant">Aún no hay extras registrados.</p>}</div>
    <label className="flex min-h-12 items-center gap-3 rounded-xl border border-outline-variant/35 px-3 text-sm font-semibold"><input type="checkbox" checked={available} onChange={(event) => setAvailable(event.target.checked)} className="rounded border-outline-variant text-primary focus:ring-primary" />Disponible para venta</label>
    <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancelar</Button><Button variant="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : product ? "Guardar cambios" : "Crear producto"}</Button></div>
  </form>;
}

function ExtraEditor({ extra, products, onSave, onCancel }: {
  extra: CatalogExtra | null;
  products: Product[];
  onSave: (value: Omit<CatalogExtra, "id" | "active">) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(extra?.name ?? "");
  const [price, setPrice] = useState(String(extra?.price ?? ""));
  const [productIds, setProductIds] = useState(extra?.productIds ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const numericPrice = Number(price);
    if (!name.trim() || !Number.isFinite(numericPrice) || numericPrice < 0) {
      setError("Captura el nombre y un precio adicional válido.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ name: name.trim(), price: numericPrice, productIds });
      onCancel();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar el extra.");
    } finally {
      setSaving(false);
    }
  }

  return <form className="space-y-4 rounded-2xl border border-primary/20 bg-primary-fixed/25 p-4" onSubmit={submit}>
    <div><p className="font-bold">{extra ? `Editar ${extra.name}` : "Nuevo extra"}</p><p className="text-xs text-on-surface-variant">Define el costo y en cuáles productos se ofrecerá.</p></div>
    {error && <InlineAlert>{error}</InlineAlert>}
    <div className="grid gap-3 sm:grid-cols-2"><FieldLabel label="Nombre"><TextField required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Leche deslactosada" /></FieldLabel><FieldLabel label="Precio adicional (MXN)"><TextField required type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" /></FieldLabel></div>
    <div><div className="mb-2 flex items-center justify-between gap-2"><p className="text-sm font-semibold text-on-surface-variant">Productos compatibles</p><button type="button" className="text-xs font-bold text-primary" onClick={() => setProductIds(productIds.length === products.length ? [] : products.map((product) => product.id))}>{productIds.length === products.length ? "Quitar todos" : "Seleccionar todos"}</button></div><div className="grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">{products.map((product) => <label key={product.id} className="flex min-h-11 items-center gap-3 rounded-xl border border-outline-variant/35 bg-surface-container-lowest px-3 text-sm"><input type="checkbox" checked={productIds.includes(product.id)} onChange={() => setProductIds((current) => current.includes(product.id) ? current.filter((id) => id !== product.id) : [...current, product.id])} className="rounded border-outline-variant text-primary focus:ring-primary" />{product.name}</label>)}</div></div>
    <div className="flex justify-end gap-2"><Button onClick={onCancel}>Cancelar</Button><Button variant="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar extra"}</Button></div>
  </form>;
}

function ExtrasModal({ extras, products, onCreate, onUpdate, onClose }: {
  extras: CatalogExtra[];
  products: Product[];
  onCreate: (value: Omit<CatalogExtra, "id" | "active">) => Promise<void>;
  onUpdate: (id: string, value: Omit<CatalogExtra, "id" | "active">) => Promise<void>;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<CatalogExtra | "new" | null>(null);
  return <Modal title="Extras" description="Crea cargos adicionales y decide en qué productos estarán disponibles." onClose={onClose} width="max-w-3xl">
    <div className="space-y-4">
      <div className="flex justify-end"><Button variant="primary" onClick={() => setEditing("new")}><Plus size={18} /> Nuevo extra</Button></div>
      {editing && <ExtraEditor key={editing === "new" ? "new" : editing.id} extra={editing === "new" ? null : editing} products={products} onCancel={() => setEditing(null)} onSave={(value) => editing === "new" ? onCreate(value) : onUpdate(editing.id, value)} />}
      <div className="divide-y divide-outline-variant/25 rounded-2xl border border-outline-variant/35">{extras.length ? extras.map((extra) => <div key={extra.id} className="flex items-center justify-between gap-4 p-4"><div><p className="font-semibold">{extra.name}</p><p className="mt-1 text-xs text-on-surface-variant">+{mxn.format(extra.price)} · {extra.productIds.length} productos</p></div><Button size="sm" onClick={() => setEditing(extra)}><Pencil size={16} /> Editar</Button></div>) : <div className="p-8 text-center text-sm text-on-surface-variant">Todavía no hay extras registrados.</div>}</div>
    </div>
  </Modal>;
}

export function CatalogPage() {
  const { products, categories, extras, createProduct, updateProduct, createExtra, updateExtra } = useApp();
  const [query, setQuery] = useState("");
  const [editingProduct, setEditingProduct] = useState<Product | "new" | null>(null);
  const [showExtras, setShowExtras] = useState(false);
  const [busyProductId, setBusyProductId] = useState("");
  const [error, setError] = useState("");
  const filtered = products.filter((product) => `${product.name} ${product.description ?? ""}`.toLowerCase().includes(query.toLowerCase()));

  async function toggleAvailability(product: Product) {
    setBusyProductId(product.id);
    setError("");
    try { await updateProduct(product.id, { available: !product.available }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo actualizar la disponibilidad."); }
    finally { setBusyProductId(""); }
  }

  return <Page size="wide">
    <PageHeader eyebrow="MENÚ Y DISPONIBILIDAD" title="Catálogo" description="Administra los productos, sus precios, disponibilidad y extras permitidos." action={<><Button onClick={() => setShowExtras(true)}><SlidersHorizontal size={18} /> Extras</Button><Button variant="primary" onClick={() => setEditingProduct("new")}><Plus size={18} /> Nuevo producto</Button></>} />
    {error && <div className="mb-4"><InlineAlert>{error}</InlineAlert></div>}
    <Panel className="mb-5 flex flex-wrap items-center gap-x-8 gap-y-3 p-5"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-fixed text-primary"><Coffee size={20} /></span><div><p className="text-2xl font-bold">{products.length}</p><p className="text-xs text-on-surface-variant">productos</p></div></div><div><p className="text-2xl font-bold">{categories.length}</p><p className="text-xs text-on-surface-variant">categorías</p></div><div><p className="text-2xl font-bold">{extras.length}</p><p className="text-xs text-on-surface-variant">extras configurados</p></div></Panel>
    <Panel className="overflow-hidden"><div className="border-b border-outline-variant/30 p-4"><div className="relative max-w-sm"><Search size={18} className="absolute left-3 top-[15px] text-outline" /><TextField aria-label="Buscar en el catálogo" className="mt-0 pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en el catálogo" /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-surface-container-low text-xs uppercase text-on-surface-variant"><tr><th className="px-5 py-4">Producto</th><th className="px-5 py-4">Categoría</th><th className="px-5 py-4">Precio base</th><th className="px-5 py-4">Extras</th><th className="px-5 py-4">Disponible</th><th className="px-5 py-4 text-right">Acciones</th></tr></thead><tbody className="divide-y divide-outline-variant/25">{filtered.map((product) => <tr key={product.id}><td className="px-5 py-4"><p className="font-semibold">{product.name}</p><p className="max-w-sm truncate text-xs text-on-surface-variant">{product.description || (product.variants?.length ? `${product.variants.length} presentaciones` : product.schedule || "Precio único")}</p></td><td className="px-5 py-4"><Badge>{categories.find((category) => category.id === product.categoryId)?.name ?? "Sin categoría"}</Badge></td><td className="px-5 py-4 font-bold">{mxn.format(product.price)}</td><td className="px-5 py-4 text-on-surface-variant">{product.modifierIds?.length ?? 0}</td><td className="px-5 py-4"><button type="button" role="switch" aria-label={`Disponibilidad de ${product.name}`} aria-checked={product.available} disabled={busyProductId === product.id} onClick={() => void toggleAvailability(product)} className={`relative h-7 w-12 rounded-full transition disabled:opacity-50 ${product.available ? "bg-tertiary" : "bg-outline-variant"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${product.available ? "left-6" : "left-1"}`} /></button></td><td className="px-4 text-right"><Button size="sm" onClick={() => setEditingProduct(product)}><Pencil size={16} /> Editar</Button></td></tr>)}</tbody></table>{!filtered.length && <div className="p-10 text-center text-sm text-on-surface-variant">No se encontraron productos.</div>}</div></Panel>
    {editingProduct && <Modal title={editingProduct === "new" ? "Nuevo producto" : `Editar ${editingProduct.name}`} description={editingProduct === "new" ? "Registra un producto para que aparezca en la toma de pedidos." : "Los cambios se reflejarán en los próximos pedidos."} onClose={() => setEditingProduct(null)} width="max-w-2xl"><ProductForm key={editingProduct === "new" ? "new" : editingProduct.id} product={editingProduct === "new" ? null : editingProduct} categories={categories} extras={extras} onClose={() => setEditingProduct(null)} onSave={async (value) => { if (editingProduct === "new") await createProduct(value); else await updateProduct(editingProduct.id, value); }} /></Modal>}
    {showExtras && <ExtrasModal extras={extras} products={products} onClose={() => setShowExtras(false)} onCreate={async (value) => { await createExtra(value); }} onUpdate={async (id, value) => { await updateExtra(id, value); }} />}
  </Page>;
}
