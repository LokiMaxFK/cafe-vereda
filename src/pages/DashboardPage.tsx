import { useState, type ReactNode } from "react";
import { ArrowRight, BarChart3, BookOpen, Boxes, ChefHat, Clock3, Coffee, LayoutGrid, Plus, ShoppingBag, Users, WalletCards } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, EmptyState, MetricCard, Page, PageHeader, Panel, SectionHeader, TextField } from "../../design-system/react";
import { mxn, orderTotal } from "../domain/money";
import { Modal } from "../components/Modal";
import { OrderStatusBadge } from "../components/StatusBadge";
import { SyncPill } from "../components/SyncPill";
import { useApp } from "../state/AppContext";

interface QuickAction { key: string; label: string; description: string; icon: ReactNode; onClick: () => void; managerOnly?: boolean; featured?: boolean; }

export function DashboardPage() {
  const { session, orders, startOrder } = useApp();
  const navigate = useNavigate();
  const manager = session?.role === "manager";
  const activeOrders = orders.filter((order) => !["closed", "cancelled", "reversed"].includes(order.status));
  const preparing = activeOrders.filter((order) => order.status === "preparing");
  const ready = activeOrders.filter((order) => order.status === "ready");
  const closedToday = orders.filter((order) => order.status === "closed");
  const revenueToday = closedToday.reduce((sum, order) => sum + orderTotal(order), 0);
  const recent = [...orders].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";

  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [customer, setCustomer] = useState("");

  async function placeOrder() {
    const order = await startOrder("takeaway", customer.trim());
    setOrderModalOpen(false);
    setCustomer("");
    navigate(`/venta/${order.id}`);
  }

  const quickActions: QuickAction[] = [
    { key: "new-order", label: "Pedir orden", description: "Nuevo pedido para llevar, listo en segundos", icon: <Plus size={20} />, onClick: () => setOrderModalOpen(true), featured: true },
    { key: "salon", label: "Salón", description: "Abrir una mesa o ver el croquis", icon: <LayoutGrid size={20} />, onClick: () => navigate("/salon") },
    { key: "preparacion", label: "Preparación", description: "Ver la cola de comandas activas", icon: <ChefHat size={20} />, onClick: () => navigate("/preparacion") },
    { key: "pedidos", label: "Pedidos", description: "Historial completo de la operación", icon: <Coffee size={20} />, onClick: () => navigate("/pedidos") },
    { key: "caja", label: "Caja", description: "Cortes, retiros y efectivo esperado", icon: <WalletCards size={20} />, onClick: () => navigate("/caja"), managerOnly: true },
    { key: "reportes", label: "Reportes", description: "Ventas, ticket promedio y más vendidos", icon: <BarChart3 size={20} />, onClick: () => navigate("/reportes"), managerOnly: true },
    { key: "insumos", label: "Insumos", description: "Existencias y movimientos de kardex", icon: <Boxes size={20} />, onClick: () => navigate("/insumos"), managerOnly: true },
    { key: "catalogo", label: "Catálogo", description: "Productos, precios y disponibilidad", icon: <BookOpen size={20} />, onClick: () => navigate("/catalogo"), managerOnly: true },
    { key: "personal", label: "Personal", description: "Accesos y turnos del equipo", icon: <Users size={20} />, onClick: () => navigate("/personal"), managerOnly: true }
  ];
  const actions = quickActions.filter((action) => manager || !action.managerOnly);

  return (
    <Page size="wide">
      <PageHeader
        eyebrow={session?.role === "manager" ? "GERENCIA" : "TURNO ACTUAL"}
        title={`${greeting}, ${session?.name?.split(" ")[0] ?? ""}`}
        description="Esto es lo que está pasando en la cafetería ahora mismo."
        action={<SyncPill />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Coffee />} label="Cuentas activas" value={activeOrders.length} detail="Mesas y para llevar abiertos" tone="primary" />
        <MetricCard icon={<ChefHat />} label="En preparación" value={preparing.length} detail="Comandas en la barra" />
        <MetricCard icon={<ShoppingBag />} label="Listos para entregar" value={ready.length} detail="Esperando salir a la mesa" tone={ready.length ? "success" : "neutral"} />
        {manager
          ? <MetricCard icon={<WalletCards />} label="Venta del día" value={mxn.format(revenueToday)} detail={`${closedToday.length} tickets cobrados`} tone="success" />
          : <MetricCard icon={<Users />} label="Tu turno" value={session?.name ?? "—"} detail="Sesión validada" />}
      </div>

      <SectionHeader className="mt-8" title="Acciones rápidas" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={action.onClick}
            className={`group flex flex-col items-start gap-3 rounded-2xl border p-5 text-left shadow-panel transition hover:-translate-y-0.5 hover:shadow-panel-hover ${action.featured ? "border-primary bg-primary text-on-primary hover:border-primary" : "border-outline-variant/35 bg-surface-container-lowest hover:border-primary/40"}`}
          >
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${action.featured ? "bg-on-primary/15 text-on-primary" : "bg-primary-fixed text-primary"}`}>{action.icon}</span>
            <div className="min-w-0">
              <p className={`flex items-center gap-1 font-bold ${action.featured ? "text-on-primary" : "text-on-surface"}`}>{action.label}<ArrowRight size={15} className={`transition group-hover:translate-x-0.5 ${action.featured ? "text-on-primary/70" : "text-outline group-hover:text-primary"}`} /></p>
              <p className={`mt-1 text-sm leading-5 ${action.featured ? "text-on-primary/75" : "text-on-surface-variant"}`}>{action.description}</p>
            </div>
          </button>
        ))}
      </div>

      {orderModalOpen && (
        <Modal title="Nuevo pedido para llevar" description="El nombre es opcional y sólo identifica esta orden." onClose={() => setOrderModalOpen(false)}>
          <div className="space-y-5">
            <label className="block text-sm font-semibold text-on-surface-variant">
              Nombre del pedido
              <TextField value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="Ej. Mariana" autoFocus />
            </label>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setOrderModalOpen(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void placeOrder()}>Crear pedido</Button>
            </div>
          </div>
        </Modal>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <Panel className="p-5">
          <SectionHeader title="Listos para entregar" action={<Badge tone={ready.length ? "success" : "neutral"}>{ready.length}</Badge>} />
          {ready.length ? (
            <div className="space-y-3">
              {ready.map((order) => (
                <Link key={order.id} to={`/venta/${order.id}`} className="flex items-center justify-between rounded-xl border border-tertiary/30 bg-tertiary-fixed/30 p-4 transition hover:border-tertiary/60">
                  <div>
                    <p className="font-bold">{order.type === "table" ? `Mesa ${order.tableId?.replace("t", "")}` : order.customerName || "Para llevar"}</p>
                    <p className="text-xs text-on-surface-variant">#{order.folio} · {order.items.length} artículos</p>
                  </div>
                  <ArrowRight size={18} className="text-tertiary" />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon={<ChefHat />} title="Nada por entregar" description="Los pedidos listos aparecerán aquí en cuanto la barra los termine." />
          )}
        </Panel>

        <Panel className="p-5">
          <SectionHeader title="Actividad reciente" action={<Link to="/pedidos" className="text-xs font-bold text-primary">Ver todo</Link>} />
          {recent.length ? (
            <div className="divide-y divide-outline-variant/25">
              {recent.map((order) => (
                <Link key={order.id} to={`/venta/${order.id}`} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 hover:bg-surface-container-low/60">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-on-surface-variant">
                      {order.type === "table" ? <Coffee size={16} /> : <ShoppingBag size={16} />}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">#{order.folio} · {order.type === "table" ? `Mesa ${order.tableId?.replace("t", "")}` : order.customerName || "Para llevar"}</p>
                      <p className="flex items-center gap-1 text-xs text-on-surface-variant"><Clock3 size={11} /> {new Date(order.updatedAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>
                  <OrderStatusBadge status={order.status} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Coffee />} title="Sin actividad todavía" description="Los pedidos que se abran hoy aparecerán aquí." />
          )}
        </Panel>
      </div>

      {manager && (
        <div className="mt-6">
          <Button variant="primary" onClick={() => navigate("/reportes")}><BarChart3 size={18} /> Ver reporte completo del día</Button>
        </div>
      )}
    </Page>
  );
}
