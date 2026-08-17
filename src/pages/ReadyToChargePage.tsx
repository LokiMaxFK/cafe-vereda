import { Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, EmptyState, Page, PageHeader, Panel } from "../../design-system/react";
import { mxn, orderTotal } from "../domain/money";
import { OrderStatusBadge } from "../components/StatusBadge";
import { useApp } from "../state/AppContext";

export function ReadyToChargePage() {
  const { orders } = useApp();
  const served = orders.filter((order) => order.status === "served").sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  return <Page size="wide">
    <PageHeader eyebrow="POR COBRAR" title="Cobros" description="Órdenes finalizadas, entregadas y pendientes de pago." />
    {!served.length ? <Panel><EmptyState icon={<Eye />} title="No hay órdenes por cobrar" description="Las órdenes finalizadas desde el punto de venta aparecerán aquí." /></Panel> : <Panel className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-surface-container-low text-xs uppercase tracking-wider text-on-surface-variant"><tr><th className="px-5 py-4">Pedido</th><th className="px-5 py-4">Destino</th><th className="px-5 py-4">Estado</th><th className="px-5 py-4 text-right">Total</th><th className="px-5 py-4" /></tr></thead><tbody className="divide-y divide-outline-variant/25">{served.map((order) => <tr key={order.id} className="hover:bg-surface-container-low/60"><td className="px-5 py-4"><p className="font-bold">#{order.folio}</p><p className="text-xs text-on-surface-variant">{new Date(order.openedAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</p></td><td className="px-5 py-4 font-semibold">{order.type === "table" ? `Mesa ${order.tableId?.replace("t", "")}` : order.customerName || "Para llevar"}</td><td className="px-5 py-4"><OrderStatusBadge status={order.status} /></td><td className="px-5 py-4 text-right font-bold">{mxn.format(orderTotal(order))}</td><td className="px-5 py-4"><Link to={`/venta/${order.id}`}><Button size="icon" variant="ghost" aria-label="Cobrar orden"><Eye size={18} /></Button></Link></td></tr>)}</tbody></table></div></Panel>}
  </Page>;
}
