import { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, Coffee, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Badge, Button, SegmentedControl, TextField } from "../../design-system/react";
import { Modal } from "../components/Modal";
import { ProductPicker, type ProductPickerSelection } from "../components/ProductPicker";
import { TableFloorPlan } from "../components/TableFloorPlan";
import { mergeOrAddItem } from "../domain/orderItem";
import { itemTotal, mxn, orderSubtotal } from "../domain/money";
import type { OrderItem } from "../domain/types";
import { useApp } from "../state/AppContext";

interface NewOrderNavState { type?: "table" | "takeaway"; tableId?: string }

export function NewOrderPage() {
  const { orders, tables, startOrder } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const preset = (location.state as NewOrderNavState | null) ?? null;
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [destType, setDestType] = useState<"table" | "takeaway">(preset?.type ?? "table");
  const [selectedTableId, setSelectedTableId] = useState<string | undefined>(preset?.tableId);
  const [customerName, setCustomerName] = useState("");
  const [creating, setCreating] = useState(false);

  const activeTables = useMemo(() => tables.filter((table) => table.active), [tables]);
  const activeOrders = orders.filter((order) => !["served", "closed", "cancelled", "reversed"].includes(order.status));
  const occupiedTableIds = useMemo(() => new Set(activeOrders.filter((order) => order.tableId).map((order) => order.tableId as string)), [activeOrders]);

  const subtotal = orderSubtotal({ items: cartItems });
  const visibleItems = cartItems.filter((item) => item.status !== "cancelled");

  function addToCart(selection: ProductPickerSelection) {
    setCartItems((current) => mergeOrAddItem(current, selection));
  }
  function changeQty(itemId: string, delta: number) {
    setCartItems((current) => {
      const item = current.find((candidate) => candidate.id === itemId); if (!item) return current;
      if (item.quantity + delta <= 0) return current.filter((candidate) => candidate.id !== itemId);
      return current.map((candidate) => candidate.id === itemId ? { ...candidate, quantity: candidate.quantity + delta } : candidate);
    });
  }
  async function confirm() {
    if (destType === "table" && !selectedTableId) return;
    setCreating(true);
    try {
      const target = destType === "table" ? selectedTableId : customerName.trim() || undefined;
      const created = await startOrder(destType, target, cartItems);
      navigate(`/venta/${created.id}`);
    } finally { setCreating(false); }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b border-outline-variant/30 bg-background/95 px-4 py-2 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-3"><Button size="icon" variant="ghost" onClick={() => navigate("/salon")} aria-label="Volver al salón"><ArrowLeft size={20} /></Button><div><h1 className="text-lg font-bold">Nueva orden</h1><p className="text-xs text-on-surface-variant">Elige los productos y luego asigna mesa o para llevar.</p></div></div>
        <Button variant="primary" onClick={() => setAssignOpen(true)} disabled={!visibleItems.length}>Continuar <ChevronRight size={18} /></Button>
      </header>
      <div className="grid flex-1 xl:grid-cols-[180px_minmax(0,1fr)_390px]">
        <ProductPicker onSelect={addToCart} />
        <aside className="border-t border-outline-variant/30 bg-surface-container-lowest xl:sticky xl:top-16 xl:h-[calc(100vh-4rem)] xl:border-l xl:border-t-0">
          <div className="flex h-full flex-col"><div className="border-b border-outline-variant/30 p-5"><p className="text-xs font-bold uppercase tracking-wider text-outline">Pedido</p><h2 className="text-xl font-bold">{visibleItems.length} artículo{visibleItems.length === 1 ? "" : "s"}</h2></div>
            <div className="custom-scrollbar min-h-48 flex-1 space-y-3 overflow-y-auto p-4">{visibleItems.length === 0 ? <div className="flex h-full min-h-52 flex-col items-center justify-center text-center text-on-surface-variant"><Coffee size={34} className="mb-3 text-outline" /><p className="font-semibold">Aún no hay productos</p><p className="mt-1 max-w-xs text-xs">Elige del menú para armar el pedido.</p></div> : visibleItems.map((item) => <div key={item.id} className="rounded-xl border border-primary/25 bg-primary-fixed/35 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold leading-5">{item.name}</p>{item.variant && <p className="mt-0.5 text-xs text-on-surface-variant">{item.variant}</p>}{item.modifiers.map((modifier) => <p key={modifier.id} className="text-xs text-on-surface-variant">+ {modifier.name}</p>)}{item.notes && <p className="text-xs font-semibold text-primary">Nota: {item.notes}</p>}<p className="mt-1 text-sm font-bold text-primary">{mxn.format(itemTotal(item))}</p></div><div className="flex items-center gap-1"><button onClick={() => changeQty(item.id, -1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant/50" aria-label={item.quantity === 1 ? "Eliminar" : "Restar"}>{item.quantity === 1 ? <Trash2 size={15} /> : <Minus size={15} />}</button><span className="w-7 text-center text-sm font-bold">{item.quantity}</span><button onClick={() => changeQty(item.id, 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant/50" aria-label="Sumar"><Plus size={15} /></button></div></div></div>)}</div>
            <div className="border-t border-outline-variant/30 p-4"><div className="mb-3 flex items-end justify-between"><span className="font-bold">Total</span><span className="text-2xl font-bold text-primary">{mxn.format(subtotal)}</span></div><Button variant="primary" size="lg" className="w-full" onClick={() => setAssignOpen(true)} disabled={!visibleItems.length}>Continuar <ChevronRight size={18} /></Button></div>
          </div>
        </aside>
      </div>
      {assignOpen && <Modal title="¿A dónde va este pedido?" description="Asigna una mesa o márcalo para llevar antes de mandarlo a preparación." onClose={() => setAssignOpen(false)} width="max-w-2xl">
        <div className="space-y-5">
          <SegmentedControl label="Destino" value={destType} onChange={setDestType} options={[{ value: "table", label: "Mesa" }, { value: "takeaway", label: "Para llevar" }]} />
          {destType === "table" ? (
            activeTables.length ? (
              <TableFloorPlan tables={activeTables} disabledIds={occupiedTableIds} selectedId={selectedTableId} onSelect={(table) => setSelectedTableId(table.id)} />
            ) : (
              <p className="rounded-xl border border-dashed border-outline-variant p-5 text-center text-sm text-on-surface-variant">No hay mesas configuradas todavía.</p>
            )
          ) : (
            <label className="block text-sm font-semibold text-on-surface-variant">Nombre del pedido (opcional)<TextField value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Ej. Mariana" autoFocus /></label>
          )}
          {visibleItems.length > 0 && <div className="flex flex-wrap gap-2">{visibleItems.map((item) => <Badge key={item.id} tone="neutral">{item.quantity}× {item.name}</Badge>)}</div>}
          <Button variant="primary" size="lg" className="w-full" disabled={creating || (destType === "table" && !selectedTableId)} onClick={() => void confirm()}><ShoppingBag size={18} /> Crear pedido</Button>
        </div>
      </Modal>}
    </div>
  );
}
