import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, CalendarDays, Download, FileText, RefreshCw, ReceiptText, RotateCcw, ShoppingBag, TrendingDown, TrendingUp, WalletCards, XCircle } from "lucide-react";
import { Badge, Button, EmptyState, InlineAlert, LoadingState, MetricCard, Page, PageHeader, Panel, SegmentedControl, SelectField } from "../../design-system/react";
import { mxn, paymentMethodLabel } from "../domain/money";
import { createInventoryAnalysis, isInventoryVarianceAlert, type InventoryAnalysisRow } from "../domain/inventory";
import {
  createDailySales,
  createHourlyPattern,
  createReportDataset,
  dateInputValue,
  percentageChange,
  reportEventLabel,
  reportProductSummary,
  resolveReportRange,
  sortProducts,
  type ReportDataset,
  type ReportFilters,
  type ReportOrder,
  type ReportPaymentFilter,
  type ReportPreset,
  type ReportStaff
} from "../domain/reports";
import type { InventoryCount, InventoryItem, InventoryMovement, InventoryUnit, Order, OrderItem, Payment, PaymentMethod } from "../domain/types";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { useApp } from "../state/AppContext";

const PAGE_SIZE = 500;
const PAYMENT_LABEL = paymentMethodLabel;
const DEFAULT_FILTERS: ReportFilters = { employeeId: "", orderType: "all", paymentMethod: "all" };
const INCIDENT_LABEL = {
  item_cancellation: "Cancelación de artículo",
  order_cancellation: "Cancelación de cuenta",
  sale_reversal: "Reversión de venta",
  refund: "Reembolso"
} as const;

type RemoteOrder = Record<string, unknown>;
type IncidentType = keyof typeof INCIDENT_LABEL;
type ReportIncident = {
  id: string;
  orderId: string;
  orderItemId?: string;
  incidentType: IncidentType;
  reason: string;
  amountCents: number;
  createdAt: string;
  folio?: number;
  createdByName?: string;
};

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

async function fetchSupplementalReportData(start: string, end: string): Promise<{ inventory: InventoryAnalysisRow[]; incidents: ReportIncident[] }> {
  if (!supabase) return { inventory: [], incidents: [] };
  const [itemResult, countResult, movementResult, usageResult, incidentResult] = await Promise.all([
    supabase.from("inventory_items").select("id,name,unit,minimum_quantity,tolerance_quantity,active").eq("active", true).order("name"),
    supabase.from("inventory_counts").select("id,counted_at,inventory_count_lines(inventory_item_id,quantity)").lte("counted_at", end).order("counted_at", { ascending: false }).limit(1000),
    supabase.from("inventory_movements").select("id,inventory_item_id,movement_type,quantity,note,created_at").gte("created_at", start).lte("created_at", end).in("movement_type", ["entry", "waste"]).limit(1000),
    supabase.from("inventory_usage_events").select("inventory_usage_lines(inventory_item_id,quantity)").gte("occurred_at", start).lte("occurred_at", end).limit(1000),
    // El requisito de trazabilidad exige poder responsabilizar a alguien, no sólo el motivo: se
    // trae quién registró cada incidencia (staff_profiles vía created_by), no sólo qué y por qué.
    supabase.from("incidents").select("id, order_id, order_item_id, incident_type, reason, amount_cents, created_at, orders(folio), staff_profiles(display_name)").gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false }).limit(500)
  ]);
  const caught = itemResult.error || countResult.error || movementResult.error || usageResult.error || incidentResult.error;
  if (caught) throw new Error(caught.message);
  const items: InventoryItem[] = (itemResult.data ?? []).map((row) => ({ id: row.id, name: row.name, unit: row.unit as InventoryUnit, minimum: Number(row.minimum_quantity), tolerance: Number(row.tolerance_quantity ?? 0), active: row.active }));
  const counts: InventoryCount[] = (countResult.data ?? []).map((row) => ({ id: row.id, countedAt: row.counted_at, lines: (row.inventory_count_lines ?? []).map((line) => ({ itemId: line.inventory_item_id, quantity: Number(line.quantity) })) }));
  const movements: InventoryMovement[] = (movementResult.data ?? []).map((row) => ({ id: row.id, itemId: row.inventory_item_id, type: row.movement_type as "entry" | "waste", quantity: Number(row.quantity), note: row.note, recordedAt: row.created_at }));
  const expected: Record<string, number> = {};
  for (const event of usageResult.data ?? []) for (const line of event.inventory_usage_lines ?? []) expected[line.inventory_item_id] = (expected[line.inventory_item_id] ?? 0) + Number(line.quantity);
  const incidents = ((incidentResult.data ?? []) as unknown as Array<Record<string, unknown>>).map((row): ReportIncident => {
    const relatedOrder = row.orders as { folio?: number } | null;
    const actor = row.staff_profiles as { display_name?: string } | null;
    return {
      id: String(row.id),
      orderId: String(row.order_id),
      orderItemId: row.order_item_id ? String(row.order_item_id) : undefined,
      incidentType: row.incident_type as IncidentType,
      reason: String(row.reason),
      amountCents: Number(row.amount_cents),
      createdAt: String(row.created_at),
      folio: relatedOrder?.folio === undefined ? undefined : Number(relatedOrder.folio),
      createdByName: actor?.display_name ?? undefined
    };
  });
  return { inventory: createInventoryAnalysis(items, counts, movements, expected, start, end), incidents };
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
  const [productView, setProductView] = useState<"top" | "bottom">("top");
  const [inventoryAnalysis, setInventoryAnalysis] = useState<InventoryAnalysisRow[]>([]);
  const [incidents, setIncidents] = useState<ReportIncident[]>([]);

  const rangeResult = useMemo(() => {
    try { return { range: resolveReportRange(preset, customStart, customEnd), error: "" }; }
    catch (reason) { return { range: null, error: reason instanceof Error ? reason.message : "No se pudo calcular el periodo." }; }
  }, [preset, customStart, customEnd]);

  useEffect(() => { setPage(0); }, [filters, preset, customStart, customEnd]);

  // Las fechas se extraen como primitivas a propósito: `rangeResult` es un objeto nuevo en cada
  // render, así que depender de él volvería a consultar Supabase aunque el periodo no haya cambiado.
  const rangeStart = rangeResult.range?.start;
  const rangeEnd = rangeResult.range?.end;
  const rangeComparisonStart = rangeResult.range?.comparisonStart;

  useEffect(() => {
    if (!rangeComparisonStart || !rangeEnd) return;
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
    void fetchReportOrders(rangeComparisonStart, rangeEnd)
      .then((result) => {
        if (!active) return;
        setRemoteOrders(result.orders);
        setStaff(result.staff);
        setUpdatedAt(new Date());
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "No se pudo cargar el reporte."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [orders, rangeComparisonStart, rangeEnd, reloadKey]);

  useEffect(() => {
    if (!rangeStart || !rangeEnd || !supabase) { setInventoryAnalysis([]); setIncidents([]); return; }
    let active = true;
    void fetchSupplementalReportData(rangeStart, rangeEnd)
      .then((result) => { if (active) { setInventoryAnalysis(result.inventory); setIncidents(result.incidents); } })
      .catch(() => { if (active) { setInventoryAnalysis([]); setIncidents([]); } });
    return () => { active = false; };
  }, [rangeStart, rangeEnd, reloadKey]);

  const dataset = useMemo(() => rangeResult.range ? createReportDataset(remoteOrders, rangeResult.range, filters) : null, [filters, rangeResult.range, remoteOrders]);
  const hourlyPattern = useMemo(() => rangeResult.range ? createHourlyPattern(remoteOrders, rangeResult.range, filters) : [], [remoteOrders, rangeResult.range, filters]);
  const dailySales = useMemo(() => rangeResult.range ? createDailySales(remoteOrders, rangeResult.range, filters) : [], [remoteOrders, rangeResult.range, filters]);
  const visibleRows = dataset?.rows.slice(page * 25, page * 25 + 25) ?? [];
  const pageCount = Math.max(1, Math.ceil((dataset?.rows.length ?? 0) / 25));
  const timelineMax = Math.max(1, ...(dataset?.timeline.map((point) => Math.abs(point.value)) ?? [1]));
  const paymentMax = Math.max(1, ...(dataset?.payments.map((payment) => Math.abs(payment.value)) ?? [1]));
  const rankedProducts = useMemo(() => dataset ? sortProducts(dataset.products, productMode, productView, 8) : [], [dataset, productMode, productView]);
  const productMax = Math.max(1, ...(rankedProducts.map((product) => productMode === "quantity" ? product.quantity : product.revenue)));
  const hourlyMax = Math.max(1, ...hourlyPattern.map((point) => Math.abs(point.net)));

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
          <MetricCard icon={<ShoppingBag />} label={filters.paymentMethod === "all" ? "Ticket promedio (bruto)" : "Contribución promedio (bruta)"} value={mxn.format(dataset.metrics.averageTicket.value)} detail={metricDetail(dataset.metrics.averageTicket)} />
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

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
          <Panel className="p-5"><div><p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Todo el periodo</p><h2 className="mt-1 text-lg font-bold">Ventas por hora del día</h2><p className="mt-1 text-sm text-on-surface-variant">Suma la venta neta de cada hora sin importar cuántos días abarque el periodo, para ver a qué horas se vende más.</p></div>
            {hourlyPattern.some((point) => point.net !== 0) ? <div className="mt-8 flex h-56 items-end gap-1 border-b border-outline-variant/40 px-1">{hourlyPattern.map((point) => <div key={point.hour} className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-2 text-center"><span className="invisible rounded bg-on-surface px-1 py-0.5 text-[10px] text-surface group-hover:visible">{mxn.format(point.net)}</span><div className={`w-full rounded-t-md ${point.net < 0 ? "bg-error" : "bg-primary-fixed group-hover:bg-primary"}`} style={{ height: `${Math.max(3, (Math.abs(point.net) / hourlyMax) * 84)}%` }} /><span className="truncate text-[10px] font-semibold text-outline">{point.hour}h</span></div>)}</div> : <EmptyState icon={<BarChart3 />} title="Sin ventas en el periodo" description="No hay cobros para calcular horas pico." />}
          </Panel>
          <Panel className="overflow-hidden"><div className="border-b border-outline-variant/25 p-5"><p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Por día calendario</p><h2 className="mt-1 text-lg font-bold">Ventas por día</h2></div>{dailySales.length ? <div className="max-h-72 overflow-y-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-surface-container-low text-xs uppercase tracking-wider text-on-surface-variant"><tr><th className="px-5 py-3">Fecha</th><th className="px-5 py-3 text-right">Tickets</th><th className="px-5 py-3 text-right">Ventas netas</th></tr></thead><tbody className="divide-y divide-outline-variant/25">{dailySales.map((row) => <tr key={row.day}><td className="px-5 py-3 font-semibold">{row.label}</td><td className="px-5 py-3 text-right">{row.tickets}</td><td className={`px-5 py-3 text-right font-bold ${row.net < 0 ? "text-error" : ""}`}>{mxn.format(row.net)}</td></tr>)}</tbody></table></div> : <p className="p-6 text-sm text-on-surface-variant">Sin ventas por día en este periodo.</p>}</Panel>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[.85fr_1.15fr]">
          <Panel className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Productos cobrados</p><h2 className="mt-1 text-lg font-bold">{productView === "top" ? "Más vendidos" : "Menos vendidos"}</h2></div><div className="flex flex-wrap items-center gap-2"><SegmentedControl label="Ver más o menos vendidos" value={productView} onChange={setProductView} options={[{ value: "top", label: "Más vendidos" }, { value: "bottom", label: "Menos vendidos" }]} /><SelectField className="mt-0 w-28" value={productMode} onChange={(event) => setProductMode(event.target.value as "quantity" | "revenue")}><option value="quantity">Unidades</option><option value="revenue">Ingreso</option></SelectField></div></div><div className="mt-6 space-y-4">{rankedProducts.length ? rankedProducts.map((product, index) => { const value = productMode === "quantity" ? product.quantity : product.revenue; return <div key={product.name}><div className="mb-2 flex justify-between gap-3 text-sm"><span className="min-w-0 truncate font-semibold"><span className="mr-2 text-outline">{index + 1}</span>{product.name}</span><strong>{productMode === "quantity" ? product.quantity : mxn.format(product.revenue)}</strong></div><div className="h-2 rounded-full bg-surface-container-high"><div className="h-full rounded-full bg-tertiary" style={{ width: `${(value / productMax) * 100}%` }} /></div></div>; }) : <p className="py-6 text-center text-sm text-on-surface-variant">Sin productos cobrados en el periodo.</p>}</div></Panel>
          <Panel className="overflow-hidden print:hidden"><div className="flex items-center justify-between gap-3 border-b border-outline-variant/25 p-5"><div><p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Detalle auditable</p><h2 className="mt-1 text-lg font-bold">Ventas y movimientos</h2></div><Badge tone="neutral">{dataset.rows.length} registros</Badge></div>{dataset.rows.length ? <><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-surface-container-low text-xs uppercase tracking-wider text-on-surface-variant"><tr><th className="px-5 py-3">Venta</th><th className="px-5 py-3">Evento</th><th className="px-5 py-3">Empleado</th><th className="px-5 py-3">Tipo</th><th className="px-5 py-3 text-right">Bruta</th><th className="px-5 py-3 text-right">Reversión</th><th className="px-5 py-3 text-right">Neta</th><th className="px-5 py-3 text-right">Propina</th></tr></thead><tbody className="divide-y divide-outline-variant/25">{visibleRows.map((row) => <tr key={row.order.id} className="hover:bg-surface-container-low/60"><td className="px-5 py-4"><Link className="font-bold text-primary hover:underline" to={`/venta/${row.order.id}`}>#{row.order.folio}</Link><p className="mt-1 text-xs text-on-surface-variant">{formatDate(row.order.closedAt ?? row.order.reversedAt ?? row.order.updatedAt)}</p></td><td className="px-5 py-4"><Badge tone={row.reversedInRange || row.cancelledInRange ? "danger" : "success"}>{reportEventLabel(row)}</Badge></td><td className="px-5 py-4">{row.order.closedByName ?? "—"}</td><td className="px-5 py-4">{row.order.type === "table" ? "Mesa" : "Para llevar"}</td><td className="px-5 py-4 text-right font-semibold">{mxn.format(row.gross)}</td><td className="px-5 py-4 text-right text-error">{row.reversal ? `-${mxn.format(row.reversal)}` : "—"}</td><td className={`px-5 py-4 text-right font-bold ${row.net < 0 ? "text-error" : ""}`}>{mxn.format(row.net)}</td><td className="px-5 py-4 text-right">{mxn.format(row.tip)}</td></tr>)}</tbody></table></div><div className="flex items-center justify-between gap-3 border-t border-outline-variant/25 p-4"><p className="text-sm text-on-surface-variant">Página {page + 1} de {pageCount}</p><div className="flex gap-2"><Button size="sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Anterior</Button><Button size="sm" disabled={page >= pageCount - 1} onClick={() => setPage((value) => value + 1)}>Siguiente</Button></div></div></> : <EmptyState icon={<ReceiptText />} title="Sin registros" description="No hay ventas, reversiones o cancelaciones que coincidan con los filtros." />}</Panel>
        </div>
        <Panel className="mt-6 overflow-hidden print:hidden"><div className="flex items-center justify-between gap-3 border-b border-outline-variant/25 p-5"><div><p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Trazabilidad del periodo</p><h2 className="mt-1 text-lg font-bold">Incidencias</h2></div><Badge tone="danger">{incidents.length} registros</Badge></div>{incidents.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-surface-container-low text-xs uppercase tracking-wider text-on-surface-variant"><tr><th className="px-5 py-3">Venta</th><th className="px-5 py-3">Tipo</th><th className="px-5 py-3">Empleado</th><th className="px-5 py-3">Motivo</th><th className="px-5 py-3 text-right">Importe</th><th className="px-5 py-3">Fecha</th></tr></thead><tbody className="divide-y divide-outline-variant/25">{incidents.map((incident) => <tr key={incident.id} className="hover:bg-surface-container-low/60"><td className="px-5 py-4">{incident.folio === undefined ? "—" : <Link className="font-bold text-primary hover:underline" to={`/venta/${incident.orderId}`}>#{incident.folio}</Link>}</td><td className="px-5 py-4"><Badge tone="danger">{INCIDENT_LABEL[incident.incidentType] ?? incident.incidentType}</Badge></td><td className="px-5 py-4">{incident.createdByName ?? "—"}</td><td className="max-w-md px-5 py-4">{incident.reason}</td><td className="px-5 py-4 text-right font-semibold">{mxn.format(incident.amountCents / 100)}</td><td className="px-5 py-4 text-on-surface-variant">{formatDate(incident.createdAt)}</td></tr>)}</tbody></table></div> : <EmptyState icon={<XCircle />} title="Sin incidencias" description="No hubo cancelaciones, reversiones o reembolsos en este periodo." />}</Panel>
        <Panel className="mt-6 overflow-hidden print:hidden"><div className="border-b border-outline-variant/25 p-5"><p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Insumos preparados</p><h2 className="mt-1 text-lg font-bold">Consumo físico vs. receta teórica</h2><p className="mt-1 text-sm text-on-surface-variant">Las ventas no descuentan existencias: este indicador compara conteos, entradas, mermas y preparaciones del periodo.</p></div>{inventoryAnalysis.length ? <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-surface-container-low text-xs uppercase tracking-wider text-on-surface-variant"><tr><th className="px-5 py-3">Insumo</th><th className="px-5 py-3 text-right">Físico</th><th className="px-5 py-3 text-right">Teórico</th><th className="px-5 py-3 text-right">Merma</th><th className="px-5 py-3 text-right">Diferencia</th></tr></thead><tbody className="divide-y divide-outline-variant/25">{inventoryAnalysis.map((row) => <tr key={row.item.id}><td className="px-5 py-4"><p className="font-semibold">{row.item.name}</p><p className="text-xs text-on-surface-variant">{row.physical === undefined ? "Faltan dos conteos para comparar" : `Tolerancia ±${row.item.tolerance} ${row.item.unit}`}</p></td><td className="px-5 py-4 text-right font-semibold">{row.physical === undefined ? "—" : `${Number(row.physical.toFixed(3))} ${row.item.unit}`}</td><td className="px-5 py-4 text-right">{Number(row.theoretical.toFixed(3))} {row.item.unit}</td><td className="px-5 py-4 text-right">{Number(row.waste.toFixed(3))} {row.item.unit}</td><td className={`px-5 py-4 text-right font-bold ${isInventoryVarianceAlert(row) ? "text-error" : ""}`}>{row.variance === undefined ? "—" : `${row.variance > 0 ? "+" : ""}${Number(row.variance.toFixed(3))} ${row.item.unit}`}</td></tr>)}</tbody></table></div> : <div className="p-6 text-sm text-on-surface-variant">No hay información comparable de insumos para este periodo.</div>}</Panel>
      </>}
    </Page>
  );
}
