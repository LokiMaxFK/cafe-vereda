import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, ShoppingBag, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Page, PageHeader, Panel, SegmentedControl } from "../../design-system/react";
import { OrderPreviewModal } from "../components/OrderPreviewModal";
import { SyncPill } from "../components/SyncPill";
import { TableFloorPlan } from "../components/TableFloorPlan";
import { TakeawayRail } from "../components/TakeawayRail";
import { tableStatusBadge, tableStatusDot, tableStatusLabel, tableStatusOrder, tableStatusSurface } from "../components/tableStatusTone";
import { mxn, orderTotal } from "../domain/money";
import { elapsedMinutes, isTracked, tableStatus, type TableStatus } from "../domain/order";
import type { CafeTable, Order } from "../domain/types";
import { useApp } from "../state/AppContext";

interface TableCard { table: CafeTable; order?: Order; status: TableStatus }

/** Reloj compartido para que los minutos transcurridos avancen sin recargar la página. */
function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function SalonPage() {
  const { orders, tables } = useApp();
  const navigate = useNavigate();
  const now = useNow(30_000);
  const [view, setView] = useState<"map" | "list">("map");
  const [previewId, setPreviewId] = useState<string | null>(null);

  const activeTables = useMemo(() => tables.filter((table) => table.active), [tables]);
  const tracked = useMemo(() => orders.filter(isTracked), [orders]);
  const byTable = useMemo(
    () => new Map(tracked.filter((order) => order.type === "table" && order.tableId).map((order) => [order.tableId as string, order])),
    [tracked]
  );
  const takeaway = useMemo(
    () => tracked.filter((order) => order.type === "takeaway").sort((a, b) => a.openedAt.localeCompare(b.openedAt)),
    [tracked]
  );
  const cards = useMemo<TableCard[]>(
    () => activeTables.map((table) => { const order = byTable.get(table.id); return { table, order, status: tableStatus(order) }; }),
    [activeTables, byTable]
  );
  const statusById = useMemo(() => new Map(cards.map((card) => [card.table.id, card.status])), [cards]);
  const counts = useMemo(
    () => cards.reduce((total, card) => ({ ...total, [card.status]: total[card.status] + 1 }), { free: 0, open: 0, preparing: 0, ready: 0, billing: 0 } as Record<TableStatus, number>),
    [cards]
  );

  // El id se guarda en vez del objeto para que el modal siga reflejando los cambios que llegan por realtime.
  const previewOrder = previewId ? orders.find((order) => order.id === previewId) : undefined;
  useEffect(() => { if (previewId && !previewOrder) setPreviewId(null); }, [previewId, previewOrder]);

  function handleTable(card: TableCard) {
    if (card.order) setPreviewId(card.order.id);
    else navigate("/venta/nueva", { state: { type: "table", tableId: card.table.id } });
  }

  return (
    <Page size="wide">
      <PageHeader
        eyebrow="SEGUIMIENTO EN VIVO"
        title="Salón"
        description={`${counts.free} de ${cards.length} mesas libres · ${takeaway.length} pedido${takeaway.length === 1 ? "" : "s"} para llevar en curso`}
        action={<><SyncPill /><Button variant="primary" onClick={() => navigate("/venta/nueva", { state: { type: "takeaway" } })}><ShoppingBag size={18} /> Para llevar</Button></>}
      />

      {/* La tira de estados funciona a la vez como métrica y como leyenda del croquis. */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {tableStatusOrder.map((status) => (
          <Panel key={status} className="flex items-center gap-3 p-4">
            <i className={`h-3 w-3 shrink-0 rounded-full ${tableStatusDot[status]}`} />
            <div className="min-w-0">
              <p className="text-2xl font-bold leading-7">{counts[status]}</p>
              <p className="truncate text-xs font-semibold text-on-surface-variant">{tableStatusLabel[status]}</p>
            </div>
          </Panel>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          <div className="mb-3">
            <SegmentedControl
              label="Vista del salón"
              value={view}
              onChange={setView}
              options={[{ value: "map", label: "Croquis" }, { value: "list", label: "Lista" }]}
            />
          </div>

          {view === "map" ? (
            <Panel className="relative min-h-0 overflow-hidden p-4 sm:min-h-[570px] sm:p-6">
              <div className="absolute left-5 top-5 z-10 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-outline"><LayoutGrid size={15} /> Área principal</div>
              <div className="absolute bottom-5 left-5 z-10 hidden rounded-xl border border-dashed border-outline-variant px-5 py-3 text-xs font-semibold text-outline sm:block">ENTRADA</div>

              <div className="grid grid-cols-2 gap-3 pt-10 sm:hidden">
                {cards.map((card) => (
                  <button
                    key={`mobile-${card.table.id}`}
                    type="button"
                    onClick={() => handleTable(card)}
                    className={`flex min-h-28 flex-col items-center justify-center rounded-2xl border-2 shadow-panel ${tableStatusSurface[card.status]}`}
                  >
                    <span className="text-xs font-bold uppercase tracking-wider opacity-70">Mesa</span>
                    <span className="text-2xl font-bold">{card.table.number}</span>
                    <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold">
                      <Users size={13} /> {card.table.seats}{card.order ? ` · ${mxn.format(orderTotal(card.order))}` : ""}
                    </span>
                  </button>
                ))}
              </div>

              <div className="hidden sm:block">
                <TableFloorPlan
                  tables={activeTables}
                  getStatus={(table) => statusById.get(table.id) ?? "free"}
                  getBadge={(table) => { const order = byTable.get(table.id); return order ? mxn.format(orderTotal(order)) : undefined; }}
                  onSelect={(table) => { const card = cards.find((candidate) => candidate.table.id === table.id); if (card) handleTable(card); }}
                />
              </div>
            </Panel>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {cards.map((card) => (
                <button
                  key={card.table.id}
                  type="button"
                  onClick={() => handleTable(card)}
                  className="flex min-h-24 items-center justify-between gap-3 rounded-2xl border border-outline-variant/35 bg-surface-container-lowest p-4 text-left shadow-panel transition hover:border-primary/40 hover:shadow-panel-hover"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <i className={`h-3 w-3 shrink-0 rounded-full ${tableStatusDot[card.status]}`} />
                    <div className="min-w-0">
                      <p className="font-bold">Mesa {card.table.number}</p>
                      <p className="mt-0.5 truncate text-sm text-on-surface-variant">
                        {card.table.seats} lugares · {card.order ? `#${card.order.folio} · ${elapsedMinutes(card.order.openedAt, now)} min` : tableStatusLabel[card.status]}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge tone={tableStatusBadge[card.status]}>{tableStatusLabel[card.status]}</Badge>
                    {card.order && <p className="mt-1 text-sm font-bold text-primary">{mxn.format(orderTotal(card.order))}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <TakeawayRail orders={takeaway} now={now} onSelect={(order) => setPreviewId(order.id)} />
      </div>

      {previewOrder && <OrderPreviewModal order={previewOrder} onClose={() => setPreviewId(null)} />}
    </Page>
  );
}
