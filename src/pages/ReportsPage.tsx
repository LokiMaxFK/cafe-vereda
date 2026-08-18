import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, CalendarDays, Download, FileText, RefreshCw, ReceiptText, RotateCcw, ShoppingBag, TrendingDown, TrendingUp, WalletCards, XCircle } from "lucide-react";
import { Badge, Button, EmptyState, InlineAlert, LoadingState, MetricCard, Page, PageHeader, Panel, SelectField } from "../../design-system/react";
import { mxn } from "../domain/money";
import {
  createReportDataset,
  dateInputValue,
  percentageChange,
  reportEventLabel,
  reportProductSummary,
  resolveReportRange,
  type ReportDataset,
  type ReportFilters,
  type ReportOrder,
  type ReportPaymentFilter,
  type ReportPreset,
  type ReportStaff
} from "../domain/reports";
import type { Order, OrderItem, Payment, PaymentMethod } from "../domain/types";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { useApp } from "../state/AppContext";

const PAGE_SIZE = 500;
const PAYMENT_LABEL: Record<PaymentMethod, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia" };
const DEFAULT_FILTERS: ReportFilters = { employeeId: "", orderType: "all", paymentMethod: "all" };

type RemoteOrder = Record<string, unknown>;

function asReportOrder(row: RemoteOrder, staff: Map<string, string>): ReportOrder {
  const remoteItems = (row.order_items as Array<Record<string, unknown>> | null) ?? [];
  const remotePayments = (row.payments as Array<Record<string, unknown>> | null) ?? [];
  const closedBy = row.closed_by ? String(row.closed_by) : undefined;
  return {
    id: String(row.id),
    folio: Number(row.folio),
    type: row.order_type as ReportOrder["type"],
    status: row.status as ReportOrder["status"],
    discount: Number(row.discount_cents ?? 0) / 100,
    openedAt: String(row.opened_at),
    updatedAt: String(row.updated_at),
    closedAt: row.closed_at ? String(row.closed_at) : undefined,
    reversedAt: row.reversed_at ? String(row.reversed_at) : undefined,
    closedBy,
    closedByName: closedBy ? staff.get(closedBy) : undefined,
    items: remoteItems.map((item): OrderItem => ({
      id: String(item.id),
      productId: String(item.product_id ?? ""),
      name: String(item.product_name),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price_cents) / 100,
      variant: item.variant_name ? String(item.variant_name) : undefined,
      modifiers: Array.isArray(item.modifiers)
        ? (item.modifiers as Array<{ id?: string; name?: string; price?: number }>).map((modifier) => ({ id: modifier.id ?? crypto.randomUUID(), name: modifier.name ?? "Extra", price: Number(modifier.price ?? 0) / 100 }))
        : [],
      notes: item.notes ? String(item.notes) : undefined,
      cancellationReason: item.cancellation_reason ? String(item.cancellation_reason) : undefined,
      status: item.status as OrderItem["status"]
    })),
    payments: remotePayments.map((payment): Payment => ({
      id: String(payment.id),
      method: payment.method as PaymentMethod,
      amount: Number(payment.amount_cents) / 100,
      tip: Number(payment.tip_cents) / 100,
      createdAt: String(payment.created_at)
    }))
  };
}

async function fetchPage(field: "closed_at" | "reversed_at" | "updated_at", start: string, end: string, status?: "cancelled") {
  if (!supabase) return [] as RemoteOrder[];
  const rows: RemoteOrder[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from("orders")
      .select("id, folio, order_type, status, opened_at, updated_at, closed_at, reversed_at, opened_by, closed_by, discount_cents, order_items(id, product_id, product_name, variant_name, quantity, unit_price_cents, modifiers, notes, cancellation_reason, status), payments(id, method, amount_cents, tip_cents, created_at)")
      .gte(field, start)
      .lt(field, end)
      .order(field, { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (status) query = query.eq("status", status);
    else if (field === "closed_at") query = query.in("status", ["closed", "reversed"]);
    else if (field === "reversed_at") query = query.eq("status", "reversed");
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as RemoteOrder[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function fetchReportOrders(start: string, end: string) {
  if (!supabase) return { orders: [] as ReportOrder[], staff: [] as ReportStaff[] };
  const [staffResult, closed, reversed, cancelled] = await Promise.all([
    supabase.from("staff_profiles").select("id, display_name").order("display_name"),
    fetchPage("closed_at", start, end),
    fetchPage("reversed_at", start, end),
    fetchPage("updated_at", start, end, "cancelled")
  ]);
  if (staffResult.error) throw new Error(staffResult.error.message);
  const staff = (staffResult.data ?? []).map((person) => ({ id: person.id, name: person.display_name }));
  const staffMap = new Map(staff.map((person) => [person.id, person.name]));
  const unique = new Map<string, RemoteOrder>();
  for (const row of [...closed, ...reversed, ...cancelled]) unique.set(String(row.id), row);
  return { orders: [...unique.values()].map((row) => asReportOrder(row, staffMap)), staff };
}

function asDemoOrder(order: Order): ReportOrder {
  const isClosed = order.status === "closed" || order.status === "reversed";
  return {
    ...order,
    closedAt: isClosed ? (order.status === "reversed" ? order.openedAt : order.updatedAt) : undefined,
    reversedAt: order.status === "reversed" ? order.updatedAt : undefined,
    closedBy: isClosed ? order.openedBy : undefined,
    closedByName: order.openedBy === "demo-manager" ? "Jordan Cruz" : order.openedBy === "demo-barista" ? "Ana López" : order.openedBy
  };
}

function formatDate(value: string | undefined, withTime = true) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "short", ...(withTime ? { timeStyle: "short" } : {}), timeZone: "America/Mexico_City" }).format(new Date(value));
}

function metricDetail(value: { value: number; previous: number }, money = true) {
  const change = percentageChange(value);
  if (change === null) return value.previous ? "Sin comparación" : "Sin datos previos";
  return `${change > 0 ? "+" : ""}${change.toFixed(1)}% vs. periodo anterior${money ? "" : ""}`;
}

function exportCsv(dataset: ReportDataset, rangeLabel: string) {
  const headers = ["folio", "eventos_periodo", "fecha_cobro", "fecha_reversion", "fecha_cancelacion", "empleado_cobro", "tipo", "estado_actual", "productos", "subtotal_productos", "descuento", "venta_bruta", "reversion", "venta_neta", "efectivo", "tarjeta", "transferencia", "propina"];
  const rows = dataset.rows.map((row) => [
    row.order.folio,
    reportEventLabel(row),
    row.order.closedAt ?? "",
    row.order.reversedAt ?? "",
    row.cancelledInRange ? row.order.updatedAt : "",
    row.order.closedByName ?? "",
    row.order.type === "table" ? "Mesa" : "Para llevar",
    row.order.status,
    reportProductSummary(row.order),
    row.order.items.filter((item) => item.status !== "cancelled").reduce((sum, item) => sum + item.quantity * (item.unitPrice + item.modifiers.reduce((extra, modifier) => extra + modifier.price, 0)), 0),
    row.discount,
    row.gross,
    row.reversal,
    row.net,
    row.paymentContributions.cash,
    row.paymentContributions.card,
    row.paymentContributions.transfer,
    row.tip
  ]);
  const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  link.download = `vereda-reportes-${rangeLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function ReportsPage() {
  const { orders } = useApp();
  const [preset, setPreset] = useState<ReportPreset>("today");
  const [customStart, setCustomStart] = useState(dateInputValue());
  const [customEnd, setCustomEnd] = useState(dateInputValue());
  const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
  const [remoteOrders, setRemoteOrders] = useState<ReportOrder[]>([]);
  const [staff, setStaff] = useState<ReportStaff[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(0);
  const [productMode, setProductMode] = useState<"quantity" | "revenue">("quantity");

  const rangeResult = useMemo(() => {
    try { return { range: resolveReportRange(preset, customStart, customEnd), error: "" }; }
    catch (reason) { return { range: null, error: reason instanceof Error ? reason.message : "No se pudo calcular el periodo." }; }
  }, [preset, customStart, customEnd]);

  useEffect(() => { setPage(0); }, [filters, preset, customStart, customEnd]);

  useEffect(() => {
    if (!rangeResult.range) return;
    if (!supabase) {
      const demoOrders = orders.map(asDemoOrder);
      setRemoteOrders(demoOrders);
      setStaff([...new Map(demoOrders.filter((order) => order.closedBy).map((order) => [order.closedBy!, { id: order.closedBy!, name: order.closedByName ?? order.closedBy! }])).values()]);
      setLoading(false);
      setUpdatedAt(new Date());
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    void fetchReportOrders(rangeResult.range.comparisonStart, rangeResult.range.end)
      .then((result) => {
        if (!active) return;
        setRemoteOrders(result.orders);
        setStaff(result.staff);
        setUpdatedAt(new Date());
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "No se pudo cargar el reporte."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [orders, rangeResult.range?.comparisonStart, rangeResult.range?.end, reloadKey]);

  const dataset = useMemo(() => rangeResult.range ? createReportDataset(remoteOrders, rangeResult.range, filters) : null, [filters, rangeResult.range, remoteOrders]);
  const visibleRows = dataset?.rows.slice(page * 25, page * 25 + 25) ?? [];
  const pageCount = Math.max(1, Math.ceil((dataset?.rows.length ?? 0) / 25));
  const timelineMax = Math.max(1, ...(dataset?.timeline.map((point) => Math.abs(point.value)) ?? [1]));
  const paymentMax = Math.max(1, ...(dataset?.payments.map((payment) => Math.abs(payment.value)) ?? [1]));
  const productMax = Math.max(1, ...(dataset?.products.map((product) => productMode === "quantity" ? product.quantity : product.revenue) ?? [1]));

  return (
    <Page size="wide">
      <PageHeader
        className="report-print-header"
        eyebrow="DESEMPEÑO DEL NEGOCIO"
        title="Reportes"
        description={rangeResult.range ? `Resultados del ${rangeResult.range.label} · comparación contra el periodo anterior equivalente.` : "Corrige el periodo para consultar los resultados."}
        action={<><Button className="print:hidden" onClick={() => window.print()} disabled={!dataset}><FileText size={18} /> Guardar PDF</Button><Button className="print:hidden" variant="primary" onClick={() => dataset && exportCsv(dataset, rangeResult.range?.label ?? "reporte")} disabled={!dataset}><Download size={18} /> Exportar CSV</Button></>}
      />

      {!supabase && <div className="mb-5 print:hidden"><InlineAlert tone="success">Modo demostración: este reporte usa únicamente las órdenes locales de este dispositivo, no el historial de Supabase.</InlineAlert></div>}
      {(rangeResult.error || error) && <div className="mb-5 print:hidden"><InlineAlert>{rangeResult.error || error}</InlineAlert></div>}

      <Panel className="mb-5 flex flex-wrap items-end gap-3 p-4 print:hidden">
        <label className="text-xs font-bold text-on-surface-variant">PERIODO
          <SelectField className="mt-1 min-w-44" value={preset} onChange={(event) => setPreset(event.target.value as ReportPreset)}>
            <option value="today">Hoy</option><option value="yesterday">Ayer</option><option value="last7">Últimos 7 días</option><option value="last30">Últimos 30 días</option><option value="month">Este mes</option><option value="custom">Personalizado</option>
          </SelectField>
        </label>
        {preset === "custom" && <><label className="text-xs font-bold text-on-surface-variant">DESDE<input className="mt-1 block min-h-11 rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3 text-sm font-medium" type="date" value={customStart} max={customEnd} onChange={(event) => setCustomStart(event.target.value)} /></label><label className="text-xs font-bold text-on-surface-variant">HASTA<input className="mt-1 block min-h-11 rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3 text-sm font-medium" type="date" value={customEnd} min={customStart} max={dateInputValue()} onChange={(event) => setCustomEnd(event.target.value)} /></label></>}
        <label className="text-xs font-bold text-on-surface-variant">EMPLEADO
          <SelectField className="mt-1 min-w-44" value={filters.employeeId} onChange={(event) => setFilters((current) => ({ ...current, employeeId: event.target.value }))}>
            <option value="">Todos</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </SelectField>
        </label>
        <label className="text-xs font-bold text-on-surface-variant">TIPO
          <SelectField className="mt-1 min-w-36" value={filters.orderType} onChange={(event) => setFilters((current) => ({ ...current, orderType: event.target.value as ReportFilters["orderType"] }))}><option value="all">Todos</option><option value="table">Mesa</option><option value="takeaway">Para llevar</option></SelectField>
        </label>
        <label className="text-xs font-bold text-on-surface-variant">PAGO
          <SelectField className="mt-1 min-w-40" value={filters.paymentMethod} onChange={(event) => setFilters((current) => ({ ...current, paymentMethod: event.target.value as ReportPaymentFilter }))}><option value="all">Todos</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option></SelectField>
        </label>
        <div className="mb-1 ml-auto flex items-center gap-2"><Badge tone={error ? "danger" : "success"}><CalendarDays size={13} /> {updatedAt ? `Actualizado ${formatDate(updatedAt.toISOString())}` : "Pendiente"}</Badge><Button size="icon" variant="ghost" aria-label="Actualizar reporte" onClick={() => setReloadKey((value) => value + 1)} disabled={loading}><RefreshCw size={17} className={loading ? "animate-spin" : ""} /></Button></div>
      </Panel>

      {loading ? <LoadingState label="Consultando el historial de ventas…" /> : !dataset ? <EmptyState icon={<BarChart3 />} title="No hay reporte disponible" description="Ajusta el periodo y vuelve a intentarlo." /> : <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={<TrendingUp />} label="Ventas" value={mxn.format(dataset.metrics.netSales.value)} detail={metricDetail(dataset.metrics.netSales)} tone="primary" />
          <MetricCard icon={<ReceiptText />} label="Tickets cobrados" value={dataset.metrics.tickets.value} detail={metricDetail(dataset.metrics.tickets, false)} />
          <MetricCard icon={<ShoppingBag />} label={filters.paymentMethod === "all" ? "Ticket promedio" : "Contribución promedio"} value={mxn.format(dataset.metrics.averageTicket.value)} detail={metricDetail(dataset.metrics.averageTicket)} />
          <MetricCard icon={<WalletCards />} label="Propinas" value={mxn.format(dataset.metrics.tips.value)} detail={metricDetail(dataset.metrics.tips)} tone="success" />
          <MetricCard icon={<TrendingDown />} label="Descuentos" value={mxn.format(dataset.metrics.discounts.value)} detail={metricDetail(dataset.metrics.discounts)} />
          <MetricCard icon={<RotateCcw />} label="Reversiones" value={mxn.format(dataset.metrics.reversals.value)} detail={metricDetail(dataset.metrics.reversals)} tone="danger" />
          <MetricCard icon={<XCircle />} label="Cancelaciones" value={dataset.metrics.cancellations.value} detail={metricDetail(dataset.metrics.cancellations, false)} tone="danger" />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
          <Panel className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Venta neta</p><h2 className="mt-1 text-lg font-bold">Tendencia del periodo</h2></div><Badge tone="primary">MXN</Badge></div>
            {dataset.timeline.length ? <div className="mt-8 flex h-64 items-end gap-1 border-b border-outline-variant/40 px-1">{dataset.timeline.map((point) => <div key={point.key} className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-2 text-center"><span className="invisible rounded bg-on-surface px-1 py-0.5 text-[10px] text-surface group-hover:visible">{mxn.format(point.value)}</span><div className={`w-full rounded-t-md ${point.value < 0 ? "bg-error" : "bg-primary-fixed group-hover:bg-primary"}`} style={{ height: `${Math.max(3, (Math.abs(point.value) / timelineMax) * 84)}%` }} /><span className="truncate text-[10px] font-semibold text-outline">{point.label}</span></div>)}</div> : <EmptyState icon={<BarChart3 />} title="Sin movimientos financieros" description="No hubo cobros ni reversiones en este periodo." />}
          </Panel>
          <Panel className="p-5"><p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Cobros netos</p><h2 className="mt-1 text-lg font-bold">Métodos de pago</h2><div className="mt-6 space-y-5">{dataset.payments.map((payment) => <div key={payment.method}><div className="mb-2 flex justify-between gap-3 text-sm"><span className="font-semibold">{PAYMENT_LABEL[payment.method]}</span><strong className={payment.value < 0 ? "text-error" : ""}>{mxn.format(payment.value)}</strong></div><div className="h-2 rounded-full bg-surface-container-high"><div className={`h-full rounded-full ${payment.value < 0 ? "bg-error" : "bg-tertiary"}`} style={{ width: `${Math.min(100, (Math.abs(payment.value) / paymentMax) * 100)}%` }} /></div></div>)}</div></Panel>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[.85fr_1.15fr]">
          <Panel className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Productos cobrados</p><h2 className="mt-1 text-lg font-bold">Más vendidos</h2></div><SelectField className="mt-0 w-28" value={productMode} onChange={(event) => setProductMode(event.target.value as "quantity" | "revenue")}><option value="quantity">Unidades</option><option value="revenue">Ingreso</option></SelectField></div><div className="mt-6 space-y-4">{dataset.products.length ? dataset.products.map((product, index) => { const value = productMode === "quantity" ? product.quantity : product.revenue; return <div key={product.name}><div className="mb-2 flex justify-between gap-3 text-sm"><span className="min-w-0 truncate font-semibold"><span className="mr-2 text-outline">{index + 1}</span>{product.name}</span><strong>{productMode === "quantity" ? product.quantity : mxn.format(product.revenue)}</strong></div><div className="h-2 rounded-full bg-surface-container-high"><div className="h-full rounded-full bg-tertiary" style={{ width: `${(value / productMax) * 100}%` }} /></div></div>; }) : <p className="py-6 text-center text-sm text-on-surface-variant">Sin productos cobrados en el periodo.</p>}</div></Panel>
          <Panel className="overflow-hidden print:hidden"><div className="flex items-center justify-between gap-3 border-b border-outline-variant/25 p-5"><div><p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Detalle auditable</p><h2 className="mt-1 text-lg font-bold">Ventas y movimientos</h2></div><Badge tone="neutral">{dataset.rows.length} registros</Badge></div>{dataset.rows.length ? <><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-surface-container-low text-xs uppercase tracking-wider text-on-surface-variant"><tr><th className="px-5 py-3">Venta</th><th className="px-5 py-3">Evento</th><th className="px-5 py-3">Empleado</th><th className="px-5 py-3">Tipo</th><th className="px-5 py-3 text-right">Bruta</th><th className="px-5 py-3 text-right">Reversión</th><th className="px-5 py-3 text-right">Neta</th><th className="px-5 py-3 text-right">Propina</th></tr></thead><tbody className="divide-y divide-outline-variant/25">{visibleRows.map((row) => <tr key={row.order.id} className="hover:bg-surface-container-low/60"><td className="px-5 py-4"><Link className="font-bold text-primary hover:underline" to={`/venta/${row.order.id}`}>#{row.order.folio}</Link><p className="mt-1 text-xs text-on-surface-variant">{formatDate(row.order.closedAt ?? row.order.reversedAt ?? row.order.updatedAt)}</p></td><td className="px-5 py-4"><Badge tone={row.reversedInRange || row.cancelledInRange ? "danger" : "success"}>{reportEventLabel(row)}</Badge></td><td className="px-5 py-4">{row.order.closedByName ?? "—"}</td><td className="px-5 py-4">{row.order.type === "table" ? "Mesa" : "Para llevar"}</td><td className="px-5 py-4 text-right font-semibold">{mxn.format(row.gross)}</td><td className="px-5 py-4 text-right text-error">{row.reversal ? `-${mxn.format(row.reversal)}` : "—"}</td><td className={`px-5 py-4 text-right font-bold ${row.net < 0 ? "text-error" : ""}`}>{mxn.format(row.net)}</td><td className="px-5 py-4 text-right">{mxn.format(row.tip)}</td></tr>)}</tbody></table></div><div className="flex items-center justify-between gap-3 border-t border-outline-variant/25 p-4"><p className="text-sm text-on-surface-variant">Página {page + 1} de {pageCount}</p><div className="flex gap-2"><Button size="sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Anterior</Button><Button size="sm" disabled={page >= pageCount - 1} onClick={() => setPage((value) => value + 1)}>Siguiente</Button></div></div></> : <EmptyState icon={<ReceiptText />} title="Sin registros" description="No hay ventas, reversiones o cancelaciones que coincidan con los filtros." />}</Panel>
        </div>
      </>}
    </Page>
  );
}
