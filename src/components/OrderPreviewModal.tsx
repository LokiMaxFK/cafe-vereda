import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button } from "../../design-system/react";
import { itemTotal, mxn, orderSubtotal, orderTotal } from "../domain/money";
import { elapsedMinutes, isCancellable, orderDestination } from "../domain/order";
import type { Order } from "../domain/types";
import { CancelOrderModal } from "./CancelOrderModal";
import { Modal } from "./Modal";
import { OrderStatusBadge } from "./StatusBadge";

/** Vista de sólo lectura de una cuenta (más la acción de cancelar). Se abre desde el croquis y desde el carril para llevar. */
export function OrderPreviewModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const navigate = useNavigate();
  const [cancelOpen, setCancelOpen] = useState(false);
  const subtotal = orderSubtotal(order);
  const total = orderTotal(order);
  const visibleItems = order.items;

  return (
    <>
    <Modal
      title={orderDestination(order)}
      description={`Orden #${order.folio} · abierta hace ${elapsedMinutes(order.openedAt)} min`}
      onClose={onClose}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <OrderStatusBadge status={order.status} />
          <Badge tone="neutral">{order.type === "table" ? "En mesa" : "Para llevar"}</Badge>
        </div>

        {visibleItems.length ? (
          <ul className="space-y-2">
            {visibleItems.map((item) => (
              <li
                key={item.id}
                className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${item.status === "cancelled" ? "border-error/20 bg-error-container/25 opacity-65" : "border-outline-variant/30 bg-surface-container-low"}`}
              >
                <div className="flex min-w-0 gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-sm font-bold">{item.quantity}</span>
                  <div className="min-w-0">
                    <p className={`font-semibold leading-5 ${item.status === "cancelled" ? "line-through" : ""}`}>{item.name}</p>
                    {item.variant && <p className="text-xs text-on-surface-variant">{item.variant}</p>}
                    {item.modifiers.map((modifier) => <p key={modifier.id} className="text-xs text-on-surface-variant">+ {modifier.name}</p>)}
                    {item.notes && <p className="text-xs font-semibold text-primary">Nota: {item.notes}</p>}
                    {item.status === "cancelled" && item.cancellationReason && <p className="text-xs font-semibold text-error">Cancelado: {item.cancellationReason}</p>}
                  </div>
                </div>
                <span className={`shrink-0 text-sm font-bold ${item.status === "cancelled" ? "text-on-surface-variant line-through" : "text-primary"}`}>{mxn.format(itemTotal(item))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant">La cuenta todavía está vacía.</p>
        )}

        <div className="space-y-2 border-t border-outline-variant/30 pt-4 text-sm">
          <div className="flex justify-between text-on-surface-variant"><span>Subtotal</span><span>{mxn.format(subtotal)}</span></div>
          {order.discount > 0 && <div className="flex justify-between text-tertiary"><span>Descuento</span><span>-{mxn.format(order.discount)}</span></div>}
          <div className="flex items-end justify-between border-t border-outline-variant/30 pt-3">
            <span className="font-bold">Total</span>
            <span className="text-2xl font-bold text-primary">{mxn.format(total)}</span>
          </div>
        </div>

        <Button variant="primary" size="lg" className="w-full" onClick={() => navigate(`/venta/${order.id}`)}>
          Abrir cuenta completa <ArrowRight size={18} />
        </Button>
        {isCancellable(order) && (
          <button type="button" className="w-full text-center text-sm font-semibold text-error hover:underline" onClick={() => setCancelOpen(true)}>
            Cancelar pedido
          </button>
        )}
      </div>
    </Modal>
    {cancelOpen && <CancelOrderModal order={order} onClose={() => { setCancelOpen(false); onClose(); }} />}
    </>
  );
}
