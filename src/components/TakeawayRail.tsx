import { ShoppingBag } from "lucide-react";
import { EmptyState, Panel } from "../../design-system/react";
import { mxn, orderTotal } from "../domain/money";
import { elapsedMinutes, orderDestination, tableStatus } from "../domain/order";
import type { Order } from "../domain/types";
import { tableStatusDot, tableStatusLabel } from "./tableStatusTone";

export function TakeawayRail({ orders, now, onSelect }: { orders: Order[]; now: number; onSelect: (order: Order) => void }) {
  return (
    <Panel className="flex flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-on-surface-variant">
          <ShoppingBag size={16} /> Para llevar
        </h2>
        <span className="rounded-full bg-surface-container-high px-2.5 py-1 text-xs font-bold text-on-surface-variant">{orders.length}</span>
      </div>
      {orders.length ? (
        <div className="space-y-2">
          {orders.map((order) => {
            const status = tableStatus(order);
            return (
              <button
                key={order.id}
                type="button"
                onClick={() => onSelect(order)}
                className="flex w-full min-h-16 items-center justify-between gap-3 rounded-xl border border-outline-variant/35 bg-surface-container-lowest p-3 text-left transition hover:border-primary/40 hover:shadow-panel"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <i className={`h-2.5 w-2.5 shrink-0 rounded-full ${tableStatusDot[status]}`} />
                  <div className="min-w-0">
                    <p className="truncate font-bold">{orderDestination(order)}</p>
                    <p className="truncate text-xs text-on-surface-variant">#{order.folio} · {tableStatusLabel[status]} · {elapsedMinutes(order.openedAt, now)} min</p>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-bold text-primary">{mxn.format(orderTotal(order))}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<ShoppingBag />} title="Sin pedidos para llevar" description="Los pedidos para llevar activos aparecerán aquí." />
      )}
    </Panel>
  );
}
