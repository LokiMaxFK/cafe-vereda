import { useState } from "react";
import { ArrowLeft, Banknote, Check, ChevronRight, ClipboardCheck, Coffee, CreditCard, Minus, MoreVertical, Plus, Printer, RotateCcw, Send, Smartphone, Trash2 } from "lucide-react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, InlineAlert, TextField } from "../../design-system/react";
import { cancellableStatuses } from "../domain/order";
import { itemTotal, mxn, orderSubtotal, orderTotal, paidTotal } from "../domain/money";
import type { PaymentMethod } from "../domain/types";
import { Modal } from "../components/Modal";
import { ProductPicker } from "../components/ProductPicker";
import { OrderStatusBadge } from "../components/StatusBadge";
import { printErrorMessage } from "../lib/browserPrinting";
import { printCommand, printTicket } from "../lib/printing";
import { useApp } from "../state/AppContext";

const paymentOptions: Array<{ value: PaymentMethod; label: string; icon: typeof Banknote }> = [
  { value: "cash", label: "Efectivo", icon: Banknote },
  { value: "card", label: "Tarjeta", icon: CreditCard },
  { value: "transfer", label: "Transferencia", icon: Smartphone }
];

const editableStatuses = ["open", "preparing", "ready"];

export function SalePage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { orders, session, addItem, changeQuantity, cancelCommandedItem, dispatchPending, finalizeOrder, addPayment, closeOrder, setDiscount, cancelOrder, reverseSale } = useApp();
  const order = orders.find((item) => item.id === orderId);
  const [cancelItemId, setCancelItemId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelQuantity, setCancelQuantity] = useState(1);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState("");
  const [tip, setTip] = useState("0");
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [discountError, setDiscountError] = useState("");
  // El descuento se puede abrir desde el cobro; al cerrarlo hay que devolver al cajero ahí.
  const [discountReturnsToCheckout, setDiscountReturnsToCheckout] = useState(false);
  const [message, setMessage] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [orderAction, setOrderAction] = useState<"cancel" | "reverse" | null>(null);
  const [orderActionReason, setOrderActionReason] = useState("");

  if (!orderId) return <Navigate to="/salon" replace />;
  if (!order) return <div className="p-8">Cargando orden…</div>;
  const activeOrder = order;
  const subtotal = orderSubtotal(order); const total = orderTotal(order); const paid = paidTotal(order); const balance = Math.max(0, total - paid);
  const pendingItems = order.items.filter((item) => item.status === "pending");
  const editable = editableStatuses.includes(order.status);
  // Una cuenta finalizada ya no admite productos, pero sí descuento: es el momento en que
  // gerencia decide una cortesía, con la cuenta cerrada y el cliente enfrente.
  const discountable = editable || order.status === "served";

  function openDiscount(fromCheckout: boolean) {
    setDiscountError("");
    setDiscountAmount(activeOrder.discount ? String(activeOrder.discount) : "");
    setDiscountReason(activeOrder.discountReason ?? "");
    setDiscountReturnsToCheckout(fromCheckout);
    if (fromCheckout) setCheckoutOpen(false);
    setDiscountOpen(true);
  }

  function closeDiscount() {
    setDiscountOpen(false);
    setDiscountError("");
    if (discountReturnsToCheckout) setCheckoutOpen(true);
    setDiscountReturnsToCheckout(false);
  }

  async function applyDiscount() {
    try {
      await setDiscount(activeOrder.id, Number(discountAmount), discountReason);
      closeDiscount();
    } catch (reason) {
      setDiscountError(reason instanceof Error ? reason.message : "No se pudo aplicar el descuento.");
    }
  }

  async function cancelSentItem() {
    if (!cancelItemId || !cancelReason.trim()) return;
    const target = activeOrder.items.find((candidate) => candidate.id === cancelItemId); if (!target) return;
    const result = await cancelCommandedItem(activeOrder.id, cancelItemId, cancelReason, Math.min(cancelQuantity, target.quantity));
    // Se imprime sólo la parte anulada, no la línea entera: la barra necesita saber cuántas retira.
    if (result) { try { await printCommand(activeOrder, [result.item], 0, true); } catch (reason) { setMessage(`Incidencia creada, pero no se pudo imprimir la cancelación: ${printErrorMessage(reason)}`); } }
    setCancelItemId(null); setCancelReason(""); setCancelQuantity(1);
  }
  async function dispatch() {
    const commandItems = activeOrder.items.filter((item) => item.status === "pending");
    if (!commandItems.length) return;
    const batchId = await dispatchPending(activeOrder.id);
    if (batchId) {
      setMessage(`${commandItems.length} artículo${commandItems.length === 1 ? "" : "s"} enviado${commandItems.length === 1 ? "" : "s"} a preparación.`);
      try { await printCommand({ ...activeOrder, items: commandItems.map((item) => ({ ...item, dispatchBatchId: batchId })) }, commandItems.map((item) => ({ ...item, dispatchBatchId: batchId }))); } catch (reason) { setMessage(`Comanda enviada a preparación, pero no se pudo imprimir: ${printErrorMessage(reason)}`); }
    }
  }
  async function finalize() {
    await finalizeOrder(activeOrder.id);
    setMessage("Orden finalizada. Ya está lista para cobrarse.");
  }
  async function registerPayment() {
    const value = Number(amount); const tipValue = Number(tip || 0);
    if (!value || value <= 0) return;
    await addPayment(activeOrder.id, method, value, tipValue); setAmount(""); setTip("0");
  }
  async function finish() {
    const refreshed = orders.find((item) => item.id === activeOrder.id) ?? activeOrder;
    await closeOrder(activeOrder.id);
    try { await printTicket(refreshed); } catch (reason) { setMessage(`Venta cerrada, pero no se pudo imprimir el ticket: ${printErrorMessage(reason)}`); }
    setCheckoutOpen(false); navigate("/salon");
  }
  async function reprintTicket() {
    try { await printTicket(activeOrder); } catch (reason) { setMessage(`No se pudo imprimir el ticket: ${printErrorMessage(reason)}`); }
  }
  async function reprintCommand() {
    const items = activeOrder.items.filter((item) => item.dispatchBatchId);
    try { await printCommand(activeOrder, items, 1); } catch (reason) { setMessage(`No se pudo reimprimir la comanda: ${printErrorMessage(reason)}`); }
  }
  async function performOrderAction() {
    if (!orderAction || !orderActionReason.trim()) return;
    if (orderAction === "cancel") {
      // Un artículo ya despachado o preparado sigue en la barra aunque se cancele toda la cuenta:
      // sin este aviso la cocina no tiene forma física de enterarse de que debe detenerse.
      const barraItems = activeOrder.items
        .filter((item) => item.status === "dispatched" || item.status === "prepared")
        .map((item) => ({ ...item, cancellationReason: orderActionReason.trim() }));
      await cancelOrder(activeOrder.id, orderActionReason);
      if (barraItems.length) {
        try { await printCommand(activeOrder, barraItems, 0, true); } catch (reason) { setMessage(`Cuenta cancelada, pero no se pudo imprimir la incidencia: ${printErrorMessage(reason)}`); }
      }
    } else {
      await reverseSale(activeOrder.id, orderActionReason);
    }
    setOrderAction(null); setOrderActionReason(""); navigate("/pedidos");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b border-outline-variant/30 bg-background/95 px-4 py-2 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-3"><Button size="icon" variant="ghost" onClick={() => navigate("/salon")} aria-label="Volver al salón"><ArrowLeft size={20} /></Button><div><div className="flex items-center gap-2"><h1 className="truncate text-lg font-bold">{order.type === "table" ? `Mesa ${order.tableId?.replace("t", "")}` : order.customerName || "Para llevar"}</h1><OrderStatusBadge status={order.status} /></div><p className="text-xs text-on-surface-variant">Orden #{order.folio} · {new Date(order.openedAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</p></div></div>
        <div className="relative flex items-center gap-2">{discountable && <Button className="hidden sm:inline-flex" onClick={() => openDiscount(false)} disabled={session?.role !== "manager"}>Descuento</Button>}{order.status === "closed" ? <Button variant="primary" onClick={() => void reprintTicket()}><Printer size={18} /> Reimprimir</Button> : order.status === "served" ? <Button variant="primary" onClick={() => setCheckoutOpen(true)} disabled={!order.items.length || ["cancelled", "reversed"].includes(order.status)}>Cobrar <ChevronRight size={18} /></Button> : <Button variant="success" onClick={() => void finalize()} disabled={!order.items.length || pendingItems.length > 0}><ClipboardCheck size={18} /> Finalizar orden</Button>}<Button size="icon" variant="ghost" aria-label="Más acciones" onClick={() => setActionsOpen((value) => !value)}><MoreVertical size={19} /></Button>{actionsOpen && <div className="absolute right-0 top-12 z-40 w-56 rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-2 shadow-2xl">{cancellableStatuses.includes(order.status) && <button className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold text-error hover:bg-error-container" onClick={() => { setOrderAction("cancel"); setActionsOpen(false); }}><Trash2 size={17} /> Cancelar cuenta</button>}{order.status === "closed" && session?.role === "manager" && <button className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold text-error hover:bg-error-container" onClick={() => { setOrderAction("reverse"); setActionsOpen(false); }}><RotateCcw size={17} /> Revertir venta</button>}{order.items.some((item) => item.dispatchBatchId) && <button className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold hover:bg-surface-container-low" onClick={() => { void reprintCommand(); setActionsOpen(false); }}><Printer size={17} /> Reimprimir COPIA 1</button>}</div>}</div>
      </header>
      {message && <div className="mx-4 mt-3 sm:mx-6"><InlineAlert tone="success">{message}</InlineAlert></div>}
      <div className="grid flex-1 xl:grid-cols-[180px_minmax(0,1fr)_390px]">
        {editable ? <ProductPicker onSelect={(selection) => void addItem(activeOrder.id, selection)} /> : <div className="flex min-h-52 flex-col items-center justify-center gap-3 p-8 text-center text-on-surface-variant xl:col-span-2"><ClipboardCheck size={34} className="text-outline" /><p className="font-semibold">Orden finalizada, lista para cobrar</p><p className="max-w-xs text-xs">Ya no se pueden agregar productos. Usa el botón «Cobrar» para registrar el pago.</p></div>}
        <aside className="border-t border-outline-variant/30 bg-surface-container-lowest xl:sticky xl:top-16 xl:h-[calc(100vh-4rem)] xl:border-l xl:border-t-0">
          <div className="flex h-full flex-col"><div className="border-b border-outline-variant/30 p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-outline">Cuenta actual</p><h2 className="text-xl font-bold">{order.items.filter((item) => item.status !== "cancelled").length} artículo{order.items.filter((item) => item.status !== "cancelled").length === 1 ? "" : "s"}</h2></div>{pendingItems.length > 0 && <Badge tone="primary">{pendingItems.length} nuevo{pendingItems.length === 1 ? "" : "s"}</Badge>}</div></div>
            <div className="custom-scrollbar min-h-48 flex-1 space-y-3 overflow-y-auto p-4">{order.items.length === 0 ? <div className="flex h-full min-h-52 flex-col items-center justify-center text-center text-on-surface-variant"><Coffee size={34} className="mb-3 text-outline" /><p className="font-semibold">La cuenta está vacía</p><p className="mt-1 max-w-xs text-xs">Elige un producto del menú para comenzar.</p></div> : order.items.map((item) => <div key={item.id} className={`rounded-xl border p-3 ${item.status === "cancelled" ? "border-error/20 bg-error-container/25 opacity-65" : item.status === "pending" ? "border-primary/25 bg-primary-fixed/35" : "border-outline-variant/30 bg-surface"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className={`font-semibold leading-5 ${item.status === "cancelled" ? "line-through" : ""}`}>{item.name}</p>{item.variant && <p className="mt-0.5 text-xs text-on-surface-variant">{item.variant}</p>}{item.modifiers.map((modifier) => <p key={modifier.id} className="text-xs text-on-surface-variant">+ {modifier.name}</p>)}{item.notes && <p className="text-xs font-semibold text-primary">Nota: {item.notes}</p>}{item.cancellationReason && <p className="text-xs font-semibold text-error">Motivo: {item.cancellationReason}</p>}<p className="mt-1 text-sm font-bold text-primary">{mxn.format(itemTotal(item))}</p></div>{item.status === "pending" ? <div className="flex items-center gap-1"><button onClick={() => void changeQuantity(order.id, item.id, -1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant/50" aria-label={item.quantity === 1 ? "Eliminar" : "Restar"}>{item.quantity === 1 ? <Trash2 size={15} /> : <Minus size={15} />}</button><span className="w-7 text-center text-sm font-bold">{item.quantity}</span><button onClick={() => void changeQuantity(order.id, item.id, 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant/50" aria-label="Sumar"><Plus size={15} /></button></div> : item.status === "cancelled" ? <Badge tone="danger">Cancelado</Badge> : <button type="button" title="Cancelar artículo comandado" onClick={() => { setCancelItemId(item.id); setCancelQuantity(1); setCancelReason(""); }}><Badge tone={item.status === "prepared" ? "success" : "neutral"}>{item.status === "prepared" ? "Listo" : "Enviado"}</Badge></button>}</div></div>)}</div>
            <div className="border-t border-outline-variant/30 p-4"><div className="mb-3 space-y-2 text-sm"><div className="flex justify-between text-on-surface-variant"><span>Subtotal</span><span>{mxn.format(subtotal)}</span></div>{order.discount > 0 && <div className="flex justify-between text-tertiary"><span>Descuento</span><span>-{mxn.format(order.discount)}</span></div>}<div className="flex items-end justify-between border-t border-outline-variant/30 pt-3"><span className="font-bold">Total</span><span className="text-2xl font-bold text-primary">{mxn.format(total)}</span></div></div>{editable && <Button variant="success" size="lg" className="w-full" onClick={() => void dispatch()} disabled={!pendingItems.length}><Send size={18} /> {pendingItems.length ? `Enviar ${pendingItems.length} a preparación` : "Todo fue comandado"}</Button>}</div>
          </div>
        </aside>
      </div>
      {cancelItemId && (() => {
        const target = order.items.find((candidate) => candidate.id === cancelItemId);
        const maxQuantity = target?.quantity ?? 1;
        const quantity = Math.min(cancelQuantity, maxQuantity);
        return <Modal title="Cancelar artículo comandado" description="Se creará una incidencia y una comanda de cancelación imprimible." onClose={() => setCancelItemId(null)}><div className="space-y-4">
          {target && maxQuantity > 1 && <div>
            <p className="text-sm font-semibold">¿Cuántas cancelas?</p>
            <p className="mt-0.5 text-xs text-on-surface-variant">{target?.name} · {maxQuantity} comandadas. Las demás siguen en preparación.</p>
            <div className="mt-2 flex items-center gap-3">
              <button type="button" onClick={() => setCancelQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1} className="flex h-11 w-11 items-center justify-center rounded-lg border border-outline-variant/50 disabled:opacity-40" aria-label="Cancelar una menos"><Minus size={17} /></button>
              <span className="min-w-16 text-center text-xl font-bold" aria-live="polite">{quantity} de {maxQuantity}</span>
              <button type="button" onClick={() => setCancelQuantity((value) => Math.min(maxQuantity, value + 1))} disabled={quantity >= maxQuantity} className="flex h-11 w-11 items-center justify-center rounded-lg border border-outline-variant/50 disabled:opacity-40" aria-label="Cancelar una más"><Plus size={17} /></button>
              <Button size="sm" className="ml-auto" onClick={() => setCancelQuantity(maxQuantity)} disabled={quantity >= maxQuantity}>Todas</Button>
            </div>
            <p className="mt-2 text-sm text-on-surface-variant">Se descontarán <strong className="text-on-surface">{mxn.format(itemTotal({ ...target, quantity }))}</strong> de la cuenta.</p>
          </div>}
          <label className="block text-sm font-semibold">Motivo obligatorio<TextField value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Ej. error de captura" autoFocus /></label>
          <Button variant="danger" className="w-full" disabled={!cancelReason.trim()} onClick={() => void cancelSentItem()}>Cancelar {maxQuantity > 1 ? `${quantity} ` : ""}e imprimir incidencia</Button>
        </div></Modal>;
      })()}
      {orderAction && <Modal title={orderAction === "cancel" ? "Cancelar cuenta abierta" : "Revertir venta cobrada"} description={orderAction === "cancel" ? "La cuenta seguirá visible en el historial." : "La venta original y sus pagos no se eliminarán ni reescribirán."} onClose={() => setOrderAction(null)}><div className="space-y-4"><label className="block text-sm font-semibold">Motivo obligatorio<TextField value={orderActionReason} onChange={(event) => setOrderActionReason(event.target.value)} autoFocus /></label><Button variant="danger" className="w-full" disabled={!orderActionReason.trim()} onClick={() => void performOrderAction()}>{orderAction === "cancel" ? "Cancelar cuenta" : "Confirmar reversión"}</Button></div></Modal>}
      {discountOpen && <Modal title="Descuento gerencial" description="El motivo quedará registrado en auditoría." onClose={closeDiscount}><div className="space-y-4">{discountError && <InlineAlert>{discountError}</InlineAlert>}<label className="block text-sm font-semibold">Importe<TextField type="number" min="0" max={subtotal} value={discountAmount} onChange={(event) => setDiscountAmount(event.target.value)} /></label><label className="block text-sm font-semibold">Motivo<TextField value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} placeholder="Ej. cortesía por demora" /></label><p className="text-xs text-on-surface-variant">Subtotal {mxn.format(subtotal)} · el descuento no puede superarlo.</p><Button variant="primary" className="w-full" disabled={!discountReason.trim()} onClick={() => void applyDiscount()}>Aplicar descuento</Button></div></Modal>}
      {checkoutOpen && <Modal title={`Cobrar orden #${order.folio}`} description="Puedes registrar varios pagos para dividir la cuenta." onClose={() => setCheckoutOpen(false)} width="max-w-xl"><div className="rounded-2xl bg-primary p-5 text-on-primary"><p className="text-xs font-bold uppercase tracking-wider text-on-primary/65">Saldo pendiente</p><p className="mt-1 text-4xl font-bold">{mxn.format(balance)}</p><div className="mt-3 flex justify-between text-sm text-on-primary/70"><span>Total {mxn.format(total)}</span><span>Pagado {mxn.format(paid)}</span></div></div>{session?.role === "manager" && balance > 0 && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant/40 p-3 text-sm"><span className="min-w-0 text-on-surface-variant">{order.discount > 0 ? <>Descuento <strong className="text-tertiary">-{mxn.format(order.discount)}</strong>{order.discountReason ? ` · ${order.discountReason}` : ""}</> : "Sin descuento aplicado"}</span><Button size="sm" onClick={() => openDiscount(true)}>{order.discount > 0 ? "Editar descuento" : "Aplicar descuento"}</Button></div>}{order.payments.length > 0 && <div className="my-4 space-y-2">{order.payments.map((payment) => <div key={payment.id} className="flex items-center justify-between rounded-xl bg-surface-container-low p-3 text-sm"><span className="font-semibold capitalize">{payment.method}</span><span>{mxn.format(payment.amount)}{payment.tip ? ` + ${mxn.format(payment.tip)} propina` : ""}</span></div>)}</div>}{balance > 0 ? <div className="mt-5 space-y-4"><div className="grid grid-cols-3 gap-2">{paymentOptions.map((option) => { const Icon = option.icon; return <button key={option.value} onClick={() => setMethod(option.value)} className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border text-xs font-bold ${method === option.value ? "border-primary bg-primary-fixed text-primary" : "border-outline-variant/40"}`}><Icon size={20} />{option.label}</button>; })}</div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Importe<TextField type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={String(balance)} />{Number(amount) > balance && <span className="mt-1 block text-xs font-medium text-tertiary">Cambio: {mxn.format(Number(amount) - balance)}</span>}</label><label className="text-sm font-semibold">Propina aparte<TextField type="number" min="0" value={tip} onChange={(event) => setTip(event.target.value)} /></label></div><div className="flex gap-2"><Button className="flex-1" onClick={() => setAmount(String(balance))}>Saldo exacto</Button><Button className="flex-1" variant="primary" disabled={!Number(amount)} onClick={() => void registerPayment()}>Registrar pago</Button></div></div> : <div className="mt-5"><InlineAlert tone="success"><span className="flex items-center gap-2"><Check size={18} /> La cuenta está cubierta. Ya puedes cerrarla.</span></InlineAlert><Button variant="primary" size="lg" className="mt-4 w-full" onClick={() => void finish()}><Printer size={18} /> Cerrar e imprimir ticket</Button></div>}</Modal>}
    </div>
  );
}
