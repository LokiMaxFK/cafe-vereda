import { useMemo, useState } from "react";
import { Coffee, LayoutGrid, Plus, ShoppingBag, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Page, PageHeader, Panel, SegmentedControl, TextField } from "../../design-system/react";
import { mxn, orderTotal } from "../domain/money";
import { Modal } from "../components/Modal";
import { SyncPill } from "../components/SyncPill";
import { initialTables, useApp } from "../state/AppContext";

export function SalonPage() {
  const { orders, startOrder } = useApp();
  const navigate = useNavigate();
  const [view, setView] = useState("map");
  const [takeawayOpen, setTakeawayOpen] = useState(false);
  const [customer, setCustomer] = useState("");
  const activeOrders = orders.filter((order) => !["closed", "cancelled", "reversed"].includes(order.status));
  const tableOrders = useMemo(() => new Map(activeOrders.filter((order) => order.tableId).map((order) => [order.tableId, order])), [activeOrders]);

  async function openTable(tableId: string) {
    const existing = tableOrders.get(tableId);
    if (existing) navigate(`/venta/${existing.id}`);
    else navigate(`/venta/${(await startOrder("table", tableId)).id}`);
  }
  async function createTakeaway() {
    const order = await startOrder("takeaway", customer.trim()); setTakeawayOpen(false); navigate(`/venta/${order.id}`);
  }
  return (
    <Page size="wide">
      <PageHeader eyebrow="OPERACIÓN · TURNO MATUTINO" title="Salón" description={`${activeOrders.length} cuentas activas · ${initialTables.length - tableOrders.size} mesas disponibles`} action={<><SyncPill /><Button variant="primary" onClick={() => setTakeawayOpen(true)}><ShoppingBag size={18} /> Para llevar</Button></>} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><SegmentedControl label="Vista del salón" value={view} onChange={setView} options={[{ value: "map", label: "Croquis" }, { value: "list", label: "Lista" }]} /><div className="flex items-center gap-4 text-xs font-semibold text-on-surface-variant"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-surface-container-highest" />Libre</span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-primary" />Ocupada</span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-tertiary" />Lista</span></div></div>
      {view === "map" ? (
        <Panel className="relative min-h-0 overflow-hidden bg-[linear-gradient(rgba(90,58,27,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(90,58,27,.035)_1px,transparent_1px)] bg-[size:32px_32px] p-4 sm:min-h-[570px] sm:p-6">
          <div className="absolute left-5 top-5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-outline"><LayoutGrid size={15} /> Área principal</div>
          <div className="absolute bottom-5 left-5 hidden rounded-xl border border-dashed border-outline-variant px-5 py-3 text-xs font-semibold text-outline sm:block">ENTRADA</div>
          <div className="grid grid-cols-2 gap-3 pt-10 sm:hidden">
            {initialTables.map((table) => {
              const order = tableOrders.get(table.id); const ready = order?.status === "ready";
              return <button key={`mobile-${table.id}`} type="button" onClick={() => void openTable(table.id)} className={`flex min-h-28 flex-col items-center justify-center rounded-2xl border-2 shadow-panel ${ready ? "border-tertiary bg-tertiary-fixed text-on-tertiary-fixed" : order ? "border-primary bg-primary-fixed text-on-primary-fixed" : "border-outline-variant/50 bg-surface-container-lowest text-on-surface"}`}><span className="text-xs font-bold uppercase tracking-wider opacity-70">Mesa</span><span className="text-2xl font-bold">{table.number}</span><span className="mt-1 flex items-center gap-1 text-[11px] font-semibold"><Users size={13} /> {table.seats}{order ? ` · ${mxn.format(orderTotal(order))}` : ""}</span></button>;
            })}
          </div>
          {initialTables.map((table) => {
            const order = tableOrders.get(table.id); const ready = order?.status === "ready";
            return <button key={table.id} type="button" onClick={() => void openTable(table.id)} style={{ left: `${table.x}%`, top: `${table.y}%` }} className={`absolute hidden -translate-x-1/2 flex-col items-center justify-center border-2 shadow-panel transition hover:-translate-y-1 hover:shadow-panel-hover sm:flex ${table.shape === "round" ? "h-28 w-28 rounded-full" : table.shape === "rectangular" ? "h-24 w-36 rounded-2xl" : "h-28 w-28 rounded-2xl"} ${ready ? "border-tertiary bg-tertiary-fixed text-on-tertiary-fixed" : order ? "border-primary bg-primary-fixed text-on-primary-fixed" : "border-outline-variant/50 bg-surface-container-lowest text-on-surface"}`}>
              <span className="text-xs font-bold uppercase tracking-wider opacity-70">Mesa</span><span className="text-2xl font-bold">{table.number}</span><span className="mt-1 flex items-center gap-1 text-[11px] font-semibold"><Users size={13} /> {table.seats}{order ? ` · ${mxn.format(orderTotal(order))}` : ""}</span>
            </button>;
          })}
        </Panel>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{initialTables.map((table) => { const order = tableOrders.get(table.id); return <button key={table.id} onClick={() => void openTable(table.id)} className="flex min-h-24 items-center justify-between rounded-2xl border border-outline-variant/35 bg-surface-container-lowest p-4 text-left shadow-panel"><div><p className="font-bold">Mesa {table.number}</p><p className="mt-1 text-sm text-on-surface-variant">{table.seats} lugares · {order ? `Orden #${order.folio}` : "Disponible"}</p></div>{order ? <Badge tone={order.status === "ready" ? "success" : "primary"}>{mxn.format(orderTotal(order))}</Badge> : <Plus className="text-outline" />}</button>; })}</div>
      )}
      <div className="mt-5 grid gap-4 md:grid-cols-3"><Panel className="flex items-center gap-4 p-4"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-fixed text-primary"><Coffee size={21} /></span><div><p className="text-xs font-bold text-on-surface-variant">EN PREPARACIÓN</p><p className="text-xl font-bold">{activeOrders.filter((order) => order.status === "preparing").length}</p></div></Panel><Panel className="flex items-center gap-4 p-4"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-tertiary-fixed text-tertiary"><ShoppingBag size={21} /></span><div><p className="text-xs font-bold text-on-surface-variant">PARA LLEVAR</p><p className="text-xl font-bold">{activeOrders.filter((order) => order.type === "takeaway").length}</p></div></Panel><Panel className="flex items-center gap-4 p-4"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary-container"><Users size={21} /></span><div><p className="text-xs font-bold text-on-surface-variant">CUENTAS ACTIVAS</p><p className="text-xl font-bold">{activeOrders.length}</p></div></Panel></div>
      {takeawayOpen && <Modal title="Nuevo pedido para llevar" description="El nombre es opcional y sólo identifica esta orden." onClose={() => setTakeawayOpen(false)}><div className="space-y-5"><label className="block text-sm font-semibold text-on-surface-variant">Nombre del pedido<TextField value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="Ej. Mariana" autoFocus /></label><div className="flex justify-end gap-2"><Button onClick={() => setTakeawayOpen(false)}>Cancelar</Button><Button variant="primary" onClick={() => void createTakeaway()}>Crear pedido</Button></div></div></Modal>}
    </Page>
  );
}
