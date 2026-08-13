import { useMemo, useState } from "react";
import { ArrowLeft, Banknote, Check, ChevronRight, Coffee, CreditCard, Minus, MoreVertical, Plus, Printer, RotateCcw, Search, Send, Smartphone, Trash2 } from "lucide-react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, InlineAlert, Panel, TextField } from "../../design-system/react";
import { categories, commonModifiers, products } from "../data/menu";
import { itemTotal, mxn, orderSubtotal, orderTotal, paidTotal } from "../domain/money";
import type { PaymentMethod, Product } from "../domain/types";
import { Modal } from "../components/Modal";
import { OrderStatusBadge } from "../components/StatusBadge";
import { printCommand, printTicket } from "../lib/printing";
import { useApp } from "../state/AppContext";

const paymentOptions: Array<{ value: PaymentMethod; label: string; icon: typeof Banknote }> = [
  { value: "cash", label: "Efectivo", icon: Banknote },
  { value: "card", label: "Tarjeta", icon: CreditCard },
  { value: "transfer", label: "Transferencia", icon: Smartphone }
];

export function SalePage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { orders, session, addItem, changeQuantity, cancelCommandedItem, dispatchPending, addPayment, closeOrder, setDiscount, cancelOrder, reverseSale } = useApp();
  const order = orders.find((item) => item.id === orderId);
  const [categoryId, setCategoryId] = useState(categories[0].id);
  const [search, setSearch] = useState("");
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>();
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [itemNotes, setItemNotes] = useState("");
  const [cancelItemId, setCancelItemId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState("");
  const [tip, setTip] = useState("0");
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [message, setMessage] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [orderAction, setOrderAction] = useState<"cancel" | "reverse" | null>(null);
  const [orderActionReason, setOrderActionReason] = useState("");

  const visibleProducts = useMemo(() => products.filter((product) => product.available && (search ? `${product.name} ${product.description ?? ""}`.toLowerCase().includes(search.toLowerCase()) : product.categoryId === categoryId)), [categoryId, search]);
  if (!orderId) return <Navigate to="/salon" replace />;
  if (!order) return <div className="p-8">Cargando orden…</div>;
  const activeOrder = order;
  const subtotal = orderSubtotal(order); const total = orderTotal(order); const paid = paidTotal(order); const balance = Math.max(0, total - paid);
  const pendingItems = order.items.filter((item) => item.status === "pending");

  async function selectProduct(product: Product) {
    if (product.variants?.length || product.categoryId === "coffee") { setSelectedVariant(product.variants?.[0]?.id); setSelectedModifiers([]); setItemNotes(""); setVariantProduct(product); }
    else await addItem(activeOrder.id, { product });
  }
  async function addConfiguredItem() {
    if (!variantProduct) return;
    await addItem(activeOrder.id, { product: variantProduct, variantId: selectedVariant, modifiers: commonModifiers.filter((modifier) => selectedModifiers.includes(modifier.id)), notes: itemNotes });
    setVariantProduct(null);
  }
  async function cancelSentItem() {
    if (!cancelItemId || !cancelReason.trim()) return;
    const item = activeOrder.items.find((candidate) => candidate.id === cancelItemId); if (!item) return;
    const batchId = await cancelCommandedItem(activeOrder.id, cancelItemId, cancelReason);
    if (batchId) { try { printCommand(activeOrder, [{ ...item, status: "cancelled", cancellationReason: cancelReason, cancellationBatchId: batchId }], 0, true); } catch { setMessage("Incidencia creada. Habilita ventanas emergentes para imprimir la cancelación."); } }
    setCancelItemId(null); setCancelReason("");
  }
  async function dispatch() {
    const commandItems = activeOrder.items.filter((item) => item.status === "pending");
    if (!commandItems.length) return;
    const batchId = await dispatchPending(activeOrder.id);
    if (batchId) {
      setMessage(`${commandItems.length} artículo${commandItems.length === 1 ? "" : "s"} enviado${commandItems.length === 1 ? "" : "s"} a preparación.`);
      try { printCommand({ ...activeOrder, items: commandItems.map((item) => ({ ...item, dispatchBatchId: batchId })) }, commandItems.map((item) => ({ ...item, dispatchBatchId: batchId }))); } catch { setMessage("Comanda creada. Habilita ventanas emergentes para imprimir."); }
    }
  }
  async function registerPayment() {
    const value = Number(amount); const tipValue = Number(tip || 0);
    if (!value || value <= 0) return;
    await addPayment(activeOrder.id, method, value, tipValue); setAmount(""); setTip("0");
  }
  async function finish() {
    const refreshed = orders.find((item) => item.id === activeOrder.id) ?? activeOrder;
    await closeOrder(activeOrder.id); printTicket(refreshed); setCheckoutOpen(false); navigate("/salon");
  }
  async function performOrderAction() {
    if (!orderAction || !orderActionReason.trim()) return;
    if (orderAction === "cancel") await cancelOrder(activeOrder.id, orderActionReason);
    else await reverseSale(activeOrder.id, orderActionReason);
    setOrderAction(null); setOrderActionReason(""); navigate("/pedidos");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b border-outline-variant/30 bg-background/95 px-4 py-2 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-3"><Button size="icon" variant="ghost" onClick={() => navigate("/salon")} aria-label="Volver al salón"><ArrowLeft size={20} /></Button><div><div className="flex items-center gap-2"><h1 className="truncate text-lg font-bold">{order.type === "table" ? `Mesa ${order.tableId?.replace("t", "")}` : order.customerName || "Para llevar"}</h1><OrderStatusBadge status={order.status} /></div><p className="text-xs text-on-surface-variant">Orden #{order.folio} · {new Date(order.openedAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</p></div></div>
        <div className="relative flex items-center gap-2">{["open", "preparing", "ready"].includes(order.status) && <Button className="hidden sm:inline-flex" onClick={() => setDiscountOpen(true)} disabled={session?.role !== "manager"}>Descuento</Button>}{order.status === "closed" ? <Button variant="primary" onClick={() => printTicket(order)}><Printer size={18} /> Ticket</Button> : <Button variant="primary" onClick={() => setCheckoutOpen(true)} disabled={!order.items.length || ["cancelled", "reversed"].includes(order.status)}>Cobrar <ChevronRight size={18} /></Button>}<Button size="icon" variant="ghost" aria-label="Más acciones" onClick={() => setActionsOpen((value) => !value)}><MoreVertical size={19} /></Button>{actionsOpen && <div className="absolute right-0 top-12 z-40 w-56 rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-2 shadow-2xl">{["open", "preparing", "ready"].includes(order.status) && <button className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold text-error hover:bg-error-container" onClick={() => { setOrderAction("cancel"); setActionsOpen(false); }}><Trash2 size={17} /> Cancelar cuenta</button>}{order.status === "closed" && session?.role === "manager" && <button className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold text-error hover:bg-error-container" onClick={() => { setOrderAction("reverse"); setActionsOpen(false); }}><RotateCcw size={17} /> Revertir venta</button>}{order.items.some((item) => item.dispatchBatchId) && <button className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold hover:bg-surface-container-low" onClick={() => { const items = order.items.filter((item) => item.dispatchBatchId); printCommand(order, items, 1); setActionsOpen(false); }}><Printer size={17} /> Reimprimir COPIA 1</button>}</div>}</div>
      </header>
      {message && <div className="mx-4 mt-3 sm:mx-6"><InlineAlert tone="success">{message}</InlineAlert></div>}
      <div className="grid flex-1 xl:grid-cols-[180px_minmax(0,1fr)_390px]">
        <aside className="border-b border-outline-variant/30 bg-surface-container-low px-3 py-3 xl:border-b-0 xl:border-r xl:py-5">
          <div className="flex gap-2 overflow-x-auto xl:flex-col xl:overflow-visible">{categories.map((category) => <button key={category.id} onClick={() => { setCategoryId(category.id); setSearch(""); }} className={`min-h-11 shrink-0 rounded-xl px-4 text-left text-sm font-bold transition-colors xl:w-full ${categoryId === category.id && !search ? "bg-primary text-on-primary shadow-brand" : "bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high"}`}>{category.name}</button>)}</div>
        </aside>
        <section className="min-w-0 p-4 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">Menú abril 2026</p><h2 className="text-2xl font-bold">{search ? "Resultados" : categories.find((category) => category.id === categoryId)?.name}</h2></div><div className="relative w-full sm:w-72"><Search size={18} className="absolute left-3 top-[15px] text-outline" /><TextField className="mt-0 pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto" /></div></div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">{visibleProducts.map((product) => <button key={product.id} onClick={() => void selectProduct(product)} className="group flex min-h-36 flex-col justify-between rounded-2xl border border-outline-variant/35 bg-surface-container-lowest p-4 text-left shadow-panel transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-panel-hover"><div><div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary-fixed text-primary"><Coffee size={18} /></div><h3 className="font-bold leading-5 text-on-surface">{product.name}</h3>{product.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">{product.description}</p>}</div><div className="mt-3 flex items-end justify-between gap-2"><span className="text-base font-bold text-primary">{mxn.format(product.price)}{product.variants && "+"}</span>{product.schedule && <span className="text-[10px] font-bold text-outline">{product.schedule}</span>}</div></button>)}</div>
        </section>
        <aside className="border-t border-outline-variant/30 bg-surface-container-lowest xl:sticky xl:top-16 xl:h-[calc(100vh-4rem)] xl:border-l xl:border-t-0">
          <div className="flex h-full flex-col"><div className="border-b border-outline-variant/30 p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-outline">Cuenta actual</p><h2 className="text-xl font-bold">{order.items.filter((item) => item.status !== "cancelled").length} artículo{order.items.filter((item) => item.status !== "cancelled").length === 1 ? "" : "s"}</h2></div>{pendingItems.length > 0 && <Badge tone="primary">{pendingItems.length} nuevo{pendingItems.length === 1 ? "" : "s"}</Badge>}</div></div>
            <div className="custom-scrollbar min-h-48 flex-1 space-y-3 overflow-y-auto p-4">{order.items.length === 0 ? <div className="flex h-full min-h-52 flex-col items-center justify-center text-center text-on-surface-variant"><Coffee size={34} className="mb-3 text-outline" /><p className="font-semibold">La cuenta está vacía</p><p className="mt-1 max-w-xs text-xs">Elige un producto del menú para comenzar.</p></div> : order.items.map((item) => <div key={item.id} className={`rounded-xl border p-3 ${item.status === "cancelled" ? "border-error/20 bg-error-container/25 opacity-65" : item.status === "pending" ? "border-primary/25 bg-primary-fixed/35" : "border-outline-variant/30 bg-surface"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className={`font-semibold leading-5 ${item.status === "cancelled" ? "line-through" : ""}`}>{item.name}</p>{item.variant && <p className="mt-0.5 text-xs text-on-surface-variant">{item.variant}</p>}{item.modifiers.map((modifier) => <p key={modifier.id} className="text-xs text-on-surface-variant">+ {modifier.name}</p>)}{item.notes && <p className="text-xs font-semibold text-primary">Nota: {item.notes}</p>}<p className="mt-1 text-sm font-bold text-primary">{mxn.format(itemTotal(item))}</p></div>{item.status === "pending" ? <div className="flex items-center gap-1"><button onClick={() => void changeQuantity(order.id, item.id, -1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant/50" aria-label={item.quantity === 1 ? "Eliminar" : "Restar"}>{item.quantity === 1 ? <Trash2 size={15} /> : <Minus size={15} />}</button><span className="w-7 text-center text-sm font-bold">{item.quantity}</span><button onClick={() => void changeQuantity(order.id, item.id, 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant/50" aria-label="Sumar"><Plus size={15} /></button></div> : item.status === "cancelled" ? <Badge tone="danger">Cancelado</Badge> : <button type="button" title="Cancelar artículo comandado" onClick={() => setCancelItemId(item.id)}><Badge tone={item.status === "prepared" ? "success" : "neutral"}>{item.status === "prepared" ? "Listo" : "Enviado"}</Badge></button>}</div></div>)}</div>
            <div className="border-t border-outline-variant/30 p-4"><div className="mb-3 space-y-2 text-sm"><div className="flex justify-between text-on-surface-variant"><span>Subtotal</span><span>{mxn.format(subtotal)}</span></div>{order.discount > 0 && <div className="flex justify-between text-tertiary"><span>Descuento</span><span>-{mxn.format(order.discount)}</span></div>}<div className="flex items-end justify-between border-t border-outline-variant/30 pt-3"><span className="font-bold">Total</span><span className="text-2xl font-bold text-primary">{mxn.format(total)}</span></div></div><Button variant="success" size="lg" className="w-full" onClick={() => void dispatch()} disabled={!pendingItems.length}><Send size={18} /> {pendingItems.length ? `Enviar ${pendingItems.length} a preparación` : "Todo fue comandado"}</Button></div>
          </div>
        </aside>
      </div>
      {variantProduct && <Modal title={variantProduct.name} description="Configura la presentación y extras." onClose={() => setVariantProduct(null)}><div className="space-y-4">{variantProduct.variants?.length ? <div className="grid grid-cols-2 gap-2">{variantProduct.variants.map((variant) => <button key={variant.id} onClick={() => setSelectedVariant(variant.id)} className={`flex min-h-16 items-center justify-between rounded-xl border p-3 text-left ${selectedVariant === variant.id ? "border-primary bg-primary-fixed" : "border-outline-variant/40 bg-surface"}`}><span className="font-semibold">{variant.name}</span><span className="font-bold text-primary">{mxn.format(variant.price)}</span></button>)}</div> : null}<div><p className="mb-2 text-sm font-semibold">Extras opcionales</p><div className="space-y-2">{commonModifiers.map((modifier) => <label key={modifier.id} className="flex min-h-12 items-center justify-between rounded-xl border border-outline-variant/35 px-3"><span className="flex items-center gap-3"><input type="checkbox" checked={selectedModifiers.includes(modifier.id)} onChange={() => setSelectedModifiers((current) => current.includes(modifier.id) ? current.filter((id) => id !== modifier.id) : [...current, modifier.id])} className="rounded border-outline-variant text-primary focus:ring-primary" />{modifier.name}</span><strong className="text-sm text-primary">+{mxn.format(modifier.price)}</strong></label>)}</div></div><label className="block text-sm font-semibold">Nota para preparación<TextField value={itemNotes} onChange={(event) => setItemNotes(event.target.value)} placeholder="Ej. poco hielo" /></label><Button variant="primary" className="w-full" onClick={() => void addConfiguredItem()}>Agregar a la cuenta</Button></div></Modal>}
      {cancelItemId && <Modal title="Cancelar artículo comandado" description="Se creará una incidencia y una comanda de cancelación imprimible." onClose={() => setCancelItemId(null)}><div className="space-y-4"><label className="block text-sm font-semibold">Motivo obligatorio<TextField value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Ej. error de captura" autoFocus /></label><Button variant="danger" className="w-full" disabled={!cancelReason.trim()} onClick={() => void cancelSentItem()}>Cancelar e imprimir incidencia</Button></div></Modal>}
      {orderAction && <Modal title={orderAction === "cancel" ? "Cancelar cuenta abierta" : "Revertir venta cobrada"} description={orderAction === "cancel" ? "La cuenta seguirá visible en el historial." : "La venta original y sus pagos no se eliminarán ni reescribirán."} onClose={() => setOrderAction(null)}><div className="space-y-4"><label className="block text-sm font-semibold">Motivo obligatorio<TextField value={orderActionReason} onChange={(event) => setOrderActionReason(event.target.value)} autoFocus /></label><Button variant="danger" className="w-full" disabled={!orderActionReason.trim()} onClick={() => void performOrderAction()}>{orderAction === "cancel" ? "Cancelar cuenta" : "Confirmar reversión"}</Button></div></Modal>}
      {discountOpen && <Modal title="Descuento gerencial" description="El motivo quedará registrado en auditoría." onClose={() => setDiscountOpen(false)}><div className="space-y-4"><label className="block text-sm font-semibold">Importe<TextField type="number" min="0" max={subtotal} value={discountAmount} onChange={(event) => setDiscountAmount(event.target.value)} /></label><label className="block text-sm font-semibold">Motivo<TextField value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} placeholder="Ej. cortesía por demora" /></label><Button variant="primary" className="w-full" disabled={!discountReason.trim()} onClick={() => void setDiscount(order.id, Number(discountAmount), discountReason).then(() => setDiscountOpen(false))}>Aplicar descuento</Button></div></Modal>}
      {checkoutOpen && <Modal title={`Cobrar orden #${order.folio}`} description="Puedes registrar varios pagos para dividir la cuenta." onClose={() => setCheckoutOpen(false)} width="max-w-xl"><div className="rounded-2xl bg-primary p-5 text-on-primary"><p className="text-xs font-bold uppercase tracking-wider text-on-primary/65">Saldo pendiente</p><p className="mt-1 text-4xl font-bold">{mxn.format(balance)}</p><div className="mt-3 flex justify-between text-sm text-on-primary/70"><span>Total {mxn.format(total)}</span><span>Pagado {mxn.format(paid)}</span></div></div>{order.payments.length > 0 && <div className="my-4 space-y-2">{order.payments.map((payment) => <div key={payment.id} className="flex items-center justify-between rounded-xl bg-surface-container-low p-3 text-sm"><span className="font-semibold capitalize">{payment.method}</span><span>{mxn.format(payment.amount)}{payment.tip ? ` + ${mxn.format(payment.tip)} propina` : ""}</span></div>)}</div>}{balance > 0 ? <div className="mt-5 space-y-4"><div className="grid grid-cols-3 gap-2">{paymentOptions.map((option) => { const Icon = option.icon; return <button key={option.value} onClick={() => setMethod(option.value)} className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border text-xs font-bold ${method === option.value ? "border-primary bg-primary-fixed text-primary" : "border-outline-variant/40"}`}><Icon size={20} />{option.label}</button>; })}</div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Importe<TextField type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={String(balance)} /></label><label className="text-sm font-semibold">Propina aparte<TextField type="number" min="0" value={tip} onChange={(event) => setTip(event.target.value)} /></label></div><div className="flex gap-2"><Button className="flex-1" onClick={() => setAmount(String(balance))}>Saldo exacto</Button><Button className="flex-1" variant="primary" disabled={!Number(amount)} onClick={() => void registerPayment()}>Registrar pago</Button></div></div> : <div className="mt-5"><InlineAlert tone="success"><span className="flex items-center gap-2"><Check size={18} /> La cuenta está cubierta. Ya puedes cerrarla.</span></InlineAlert><Button variant="primary" size="lg" className="mt-4 w-full" onClick={() => void finish()}><Printer size={18} /> Cerrar e imprimir ticket</Button></div>}</Modal>}
    </div>
  );
}
