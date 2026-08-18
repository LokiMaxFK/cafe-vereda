import { useRef, useState, type FormEvent } from "react";
import { Coffee, ImagePlus, Pencil, Plus, Search, Sparkles, Tags, Trash2, X } from "lucide-react";
import { Badge, Button, FieldLabel, InlineAlert, Page, PageHeader, Panel, SelectField, TextareaField, TextField } from "../../design-system/react";
import { Modal } from "../components/Modal";
import { mxn } from "../domain/money";
import type { CatalogExtra, Category, Product, ProductVariant } from "../domain/types";
import { useApp } from "../state/AppContext";

function ProductForm({ product, categories, onSave, onDelete, onClose }: {
  product: Product | null;
  categories: Category[];
  onSave: (value: Omit<Product, "id">) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const { uploadProductImage } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(String(product?.price ?? ""));
  const [available, setAvailable] = useState(product?.available ?? true);
  const [seasonal, setSeasonal] = useState(product?.seasonal ?? false);
  const [variants, setVariants] = useState<ProductVariant[]>(product?.variants ?? []);
  const [imageUrl, setImageUrl] = useState(product?.imageUrl);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  function addVariant() {
    setVariants((current) => [...current, { id: crypto.randomUUID(), name: "", price: 0 }]);
  }
  function removeVariant(id: string) {
    setVariants((current) => current.filter((variant) => variant.id !== id));
  }

  function selectImage(event: FormEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!/image\/(png|jpeg)/.test(file.type)) { setError("La imagen debe ser PNG o JPEG."); return; }
    if (file.size > 2_000_000) { setError("La imagen no debe pesar más de 2 MB."); return; }
    setError("");
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
  }
  function removeImage() {
    setImageFile(null);
    setImageUrl(undefined);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const numericPrice = Number(price);
    if (!name.trim() || !categoryId || !Number.isFinite(numericPrice) || numericPrice < 0 || variants.some((variant) => !variant.name.trim() || !Number.isFinite(Number(variant.price)) || Number(variant.price) < 0)) {
      setError("Completa el nombre, la categoría, un precio válido y el nombre/precio de cada tamaño.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const finalImageUrl = imageFile ? await uploadProductImage(imageFile) : imageUrl;
      await onSave({
        name: name.trim(), categoryId, description: description.trim() || undefined, price: numericPrice,
        available, seasonal, imageUrl: finalImageUrl,
        variants: variants.length ? variants.map((variant) => ({ ...variant, name: variant.name.trim(), price: Number(variant.price) })) : undefined
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar el producto.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!onDelete) return;
    setDeleting(true);
    setError("");
    try { await onDelete(); onClose(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo eliminar el producto."); }
    finally { setDeleting(false); }
  }

  return <form className="space-y-5" onSubmit={submit}>
    {error && <InlineAlert>{error}</InlineAlert>}
    <div className="grid gap-4 sm:grid-cols-2">
      <FieldLabel label="Nombre del producto"><TextField required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Latte vainilla" /></FieldLabel>
      <FieldLabel label="Categoría"><SelectField required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</SelectField></FieldLabel>
      <FieldLabel label="Precio base (MXN)"><TextField required type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" /></FieldLabel>
    </div>
    <FieldLabel label="Descripción"><TextareaField rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ingredientes o una descripción breve" /></FieldLabel>

    <div>
      <p className="mb-2 text-sm font-semibold text-on-surface-variant">Imagen</p>
      {imageUrl
        ? <div className="flex items-center gap-4"><img src={imageUrl} alt={name || "Producto"} className="h-20 w-20 rounded-xl object-cover" /><Button type="button" size="sm" variant="danger" onClick={removeImage}><Trash2 size={16} /> Quitar</Button></div>
        : <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-outline-variant/50 text-sm text-on-surface-variant hover:border-primary/40"><ImagePlus size={20} /> Subir imagen<input ref={fileInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={selectImage} /></label>}
    </div>

    <div>
      <div className="mb-2 flex items-center justify-between gap-2"><p className="text-sm font-semibold text-on-surface-variant">Tamaños</p><button type="button" className="text-xs font-bold text-primary" onClick={addVariant}>+ Agregar tamaño</button></div>
      {variants.length
        ? <div className="space-y-2">{variants.map((variant, index) => <div key={variant.id} className="flex items-end gap-2"><FieldLabel label="Nombre"><TextField value={variant.name} onChange={(event) => setVariants((current) => current.map((item, position) => position === index ? { ...item, name: event.target.value } : item))} placeholder="Ej. Grande" /></FieldLabel><FieldLabel label="Precio"><TextField type="number" min="0" step="0.01" value={variant.price} onChange={(event) => setVariants((current) => current.map((item, position) => position === index ? { ...item, price: Number(event.target.value) } : item))} /></FieldLabel><Button type="button" size="icon" variant="danger" aria-label={`Quitar tamaño ${variant.name || index + 1}`} onClick={() => removeVariant(variant.id)}><X size={16} /></Button></div>)}</div>
        : <p className="rounded-xl bg-surface-container-low p-3 text-sm text-on-surface-variant">Precio único, sin tamaños.</p>}
    </div>

    <div className="flex flex-col gap-2 sm:flex-row">
      <label className="flex min-h-12 flex-1 items-center gap-3 rounded-xl border border-outline-variant/35 px-3 text-sm font-semibold"><input type="checkbox" checked={available} onChange={(event) => setAvailable(event.target.checked)} className="rounded border-outline-variant text-primary focus:ring-primary" />Disponible para venta</label>
      <label className="flex min-h-12 flex-1 items-center gap-3 rounded-xl border border-outline-variant/35 px-3 text-sm font-semibold"><input type="checkbox" checked={seasonal} onChange={(event) => setSeasonal(event.target.checked)} className="rounded border-outline-variant text-primary focus:ring-primary" />Producto de temporada</label>
    </div>

    <div className="flex items-center justify-between gap-2">
      {onDelete ? <Button type="button" variant="danger" disabled={deleting} onClick={() => void remove()}><Trash2 size={16} /> {deleting ? "Eliminando…" : "Eliminar producto"}</Button> : <span />}
      <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancelar</Button><Button variant="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : product ? "Guardar cambios" : "Crear producto"}</Button></div>
    </div>
  </form>;
}

function ExtraEditor({ extra, onSave, onCancel }: {
  extra: CatalogExtra | null;
  onSave: (value: Omit<CatalogExtra, "id" | "active">) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(extra?.name ?? "");
  const [price, setPrice] = useState(String(extra?.price ?? ""));
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
      await onSave({ name: name.trim(), price: numericPrice });
      onCancel();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar el extra.");
    } finally {
      setSaving(false);
    }
  }

  return <form className="space-y-4 rounded-2xl border border-primary/20 bg-primary-fixed/25 p-4" onSubmit={submit}>
    <div><p className="font-bold">{extra ? `Editar ${extra.name}` : "Nuevo extra"}</p><p className="text-xs text-on-surface-variant">Estará disponible para cualquier producto en la toma de pedidos.</p></div>
    {error && <InlineAlert>{error}</InlineAlert>}
    <div className="grid gap-3 sm:grid-cols-2"><FieldLabel label="Nombre"><TextField required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Leche deslactosada" /></FieldLabel><FieldLabel label="Precio adicional (MXN)"><TextField required type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" /></FieldLabel></div>
    <div className="flex justify-end gap-2"><Button onClick={onCancel}>Cancelar</Button><Button variant="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar extra"}</Button></div>
  </form>;
}

function ExtrasModal({ extras, onCreate, onUpdate, onDelete, onClose }: {
  extras: CatalogExtra[];
  onCreate: (value: Omit<CatalogExtra, "id" | "active">) => Promise<void>;
  onUpdate: (id: string, value: Omit<CatalogExtra, "id" | "active">) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<CatalogExtra | "new" | null>(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function remove(extra: CatalogExtra) {
    setBusyId(extra.id);
    setError("");
    try { await onDelete(extra.id); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo eliminar el extra."); }
    finally { setBusyId(""); }
  }

  return <Modal title="Extras" description="Crea cargos adicionales disponibles para cualquier producto." onClose={onClose} width="max-w-2xl">
    <div className="space-y-4">
      {error && <InlineAlert>{error}</InlineAlert>}
      <div className="flex justify-end"><Button variant="primary" onClick={() => setEditing("new")}><Plus size={18} /> Nuevo extra</Button></div>
      {editing && <ExtraEditor key={editing === "new" ? "new" : editing.id} extra={editing === "new" ? null : editing} onCancel={() => setEditing(null)} onSave={(value) => editing === "new" ? onCreate(value) : onUpdate(editing.id, value)} />}
      <div className="divide-y divide-outline-variant/25 rounded-2xl border border-outline-variant/35">{extras.length ? extras.map((extra) => <div key={extra.id} className="flex items-center justify-between gap-4 p-4"><div><p className="font-semibold">{extra.name}</p><p className="mt-1 text-xs text-on-surface-variant">+{mxn.format(extra.price)}</p></div><div className="flex gap-2"><Button size="sm" onClick={() => setEditing(extra)}><Pencil size={16} /> Editar</Button><Button size="sm" variant="danger" disabled={busyId === extra.id} onClick={() => void remove(extra)}><Trash2 size={16} /> Eliminar</Button></div></div>) : <div className="p-8 text-center text-sm text-on-surface-variant">Todavía no hay extras registrados.</div>}</div>
    </div>
  </Modal>;
}

function CategoryRow({ category, productCount, onRename, onDelete }: {
  category: Category;
  productCount: number;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(category.name);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try { await onRename(name.trim()); setEditing(false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo renombrar."); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try { await onDelete(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo eliminar."); }
    finally { setBusy(false); }
  }

  return <div className="p-4">
    <div className="flex items-center justify-between gap-3">
      {editing
        ? <TextField className="mt-0" autoFocus value={name} onChange={(event) => setName(event.target.value)} />
        : <div><p className="font-semibold">{category.name}</p><p className="mt-1 text-xs text-on-surface-variant">{productCount} producto{productCount === 1 ? "" : "s"}</p></div>}
      <div className="flex shrink-0 gap-2">
        {editing
          ? <><Button size="sm" onClick={() => { setEditing(false); setName(category.name); }}>Cancelar</Button><Button size="sm" variant="primary" disabled={busy} onClick={() => void save()}>Guardar</Button></>
          : <><Button size="sm" onClick={() => setEditing(true)}><Pencil size={16} /> Renombrar</Button><Button size="sm" variant="danger" disabled={busy || productCount > 0} onClick={() => void remove()}><Trash2 size={16} /> Eliminar</Button></>}
      </div>
    </div>
    {error && <p className="mt-2 text-xs font-semibold text-error">{error}</p>}
    {!editing && productCount > 0 && <p className="mt-2 text-xs text-on-surface-variant">Mueve o elimina sus productos antes de borrarla.</p>}
  </div>;
}

function CategoriesModal({ categories, products, onCreate, onRename, onDelete, onClose }: {
  categories: Category[];
  products: Product[];
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError("");
    try { await onCreate(name.trim()); setName(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo crear la categoría."); }
    finally { setCreating(false); }
  }

  return <Modal title="Categorías" description="Organiza los productos del catálogo." onClose={onClose} width="max-w-2xl">
    <div className="space-y-4">
      {error && <InlineAlert>{error}</InlineAlert>}
      <form className="flex items-end gap-2" onSubmit={create}>
        <FieldLabel label="Nueva categoría"><TextField value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Postres" /></FieldLabel>
        <Button type="submit" variant="primary" disabled={creating}><Plus size={18} /> Agregar</Button>
      </form>
      <div className="divide-y divide-outline-variant/25 rounded-2xl border border-outline-variant/35">
        {categories.length ? categories.map((category) => <CategoryRow key={category.id} category={category} productCount={products.filter((product) => product.categoryId === category.id).length} onRename={(newName) => onRename(category.id, newName)} onDelete={() => onDelete(category.id)} />) : <div className="p-8 text-center text-sm text-on-surface-variant">Todavía no hay categorías.</div>}
      </div>
    </div>
  </Modal>;
}

export function CatalogPage() {
  const { products, categories, extras, createProduct, updateProduct, deleteProduct, createExtra, updateExtra, deleteExtra, createCategory, updateCategory, deleteCategory } = useApp();
  const [query, setQuery] = useState("");
  const [editingProduct, setEditingProduct] = useState<Product | "new" | null>(null);
  const [showExtras, setShowExtras] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
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
    <PageHeader eyebrow="MENÚ Y DISPONIBILIDAD" title="Catálogo" description="Administra los productos, sus precios, disponibilidad y extras." action={<><Button onClick={() => setShowCategories(true)}><Tags size={18} /> Categorías</Button><Button onClick={() => setShowExtras(true)}><Plus size={18} /> Extras</Button><Button variant="primary" onClick={() => setEditingProduct("new")}><Plus size={18} /> Nuevo producto</Button></>} />
    {error && <div className="mb-4"><InlineAlert>{error}</InlineAlert></div>}
    <Panel className="mb-5 flex flex-wrap items-center gap-x-8 gap-y-3 p-5"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-fixed text-primary"><Coffee size={20} /></span><div><p className="text-2xl font-bold">{products.length}</p><p className="text-xs text-on-surface-variant">productos</p></div></div><div><p className="text-2xl font-bold">{categories.length}</p><p className="text-xs text-on-surface-variant">categorías</p></div><div><p className="text-2xl font-bold">{extras.length}</p><p className="text-xs text-on-surface-variant">extras configurados</p></div></Panel>
    <Panel className="overflow-hidden"><div className="border-b border-outline-variant/30 p-4"><div className="relative max-w-sm"><Search size={18} className="absolute left-3 top-[15px] text-outline" /><TextField aria-label="Buscar en el catálogo" className="mt-0 pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en el catálogo" /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-surface-container-low text-xs uppercase text-on-surface-variant"><tr><th className="px-5 py-4">Producto</th><th className="px-5 py-4">Categoría</th><th className="px-5 py-4">Precio base</th><th className="px-5 py-4">Disponible</th><th className="px-5 py-4 text-right">Acciones</th></tr></thead><tbody className="divide-y divide-outline-variant/25">{filtered.map((product) => <tr key={product.id}><td className="px-5 py-4"><div className="flex items-center gap-2"><p className="font-semibold">{product.name}</p>{product.seasonal && <Badge tone="primary"><Sparkles size={12} /> Temporada</Badge>}</div><p className="max-w-sm truncate text-xs text-on-surface-variant">{product.description || (product.variants?.length ? `${product.variants.length} presentaciones` : "Precio único")}</p></td><td className="px-5 py-4"><Badge>{categories.find((category) => category.id === product.categoryId)?.name ?? "Sin categoría"}</Badge></td><td className="px-5 py-4 font-bold">{mxn.format(product.price)}</td><td className="px-5 py-4"><button type="button" role="switch" aria-label={`Disponibilidad de ${product.name}`} aria-checked={product.available} disabled={busyProductId === product.id} onClick={() => void toggleAvailability(product)} className={`relative h-7 w-12 rounded-full transition disabled:opacity-50 ${product.available ? "bg-tertiary" : "bg-outline-variant"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${product.available ? "left-6" : "left-1"}`} /></button></td><td className="px-4 text-right"><Button size="sm" onClick={() => setEditingProduct(product)}><Pencil size={16} /> Editar</Button></td></tr>)}</tbody></table>{!filtered.length && <div className="p-10 text-center text-sm text-on-surface-variant">No se encontraron productos.</div>}</div></Panel>
    {editingProduct && <Modal title={editingProduct === "new" ? "Nuevo producto" : `Editar ${editingProduct.name}`} description={editingProduct === "new" ? "Registra un producto para que aparezca en la toma de pedidos." : "Los cambios se reflejarán en los próximos pedidos."} onClose={() => setEditingProduct(null)} width="max-w-2xl"><ProductForm key={editingProduct === "new" ? "new" : editingProduct.id} product={editingProduct === "new" ? null : editingProduct} categories={categories} onClose={() => setEditingProduct(null)} onDelete={editingProduct === "new" ? undefined : () => deleteProduct(editingProduct.id)} onSave={async (value) => { if (editingProduct === "new") await createProduct(value); else await updateProduct(editingProduct.id, value); }} /></Modal>}
    {showExtras && <ExtrasModal extras={extras} onClose={() => setShowExtras(false)} onCreate={async (value) => { await createExtra(value); }} onUpdate={async (id, value) => { await updateExtra(id, value); }} onDelete={async (id) => { await deleteExtra(id); }} />}
    {showCategories && <CategoriesModal categories={categories} products={products} onClose={() => setShowCategories(false)} onCreate={async (name) => { await createCategory(name); }} onRename={async (id, name) => { await updateCategory(id, name); }} onDelete={async (id) => { await deleteCategory(id); }} />}
  </Page>;
}
