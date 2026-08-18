import type { OrderItem, Payment, PaymentMethod } from "./types";
import { itemTotal } from "./money";

export const REPORT_TIME_ZONE = "America/Mexico_City";
export const REPORT_MAX_RANGE_DAYS = 90;

export type ReportPreset = "today" | "yesterday" | "last7" | "last30" | "month" | "custom";
export type ReportOrderTypeFilter = "all" | "table" | "takeaway";
export type ReportPaymentFilter = "all" | PaymentMethod;

export interface ReportFilters {
  employeeId: string;
  orderType: ReportOrderTypeFilter;
  paymentMethod: ReportPaymentFilter;
}

export interface ReportRange {
  start: string;
  end: string;
  label: string;
  comparisonStart: string;
  comparisonEnd: string;
}

export interface ReportStaff {
  id: string;
  name: string;
}

export interface ReportOrder {
  id: string;
  folio: number;
  type: "table" | "takeaway";
  status: "open" | "preparing" | "ready" | "served" | "closed" | "cancelled" | "reversed";
  items: OrderItem[];
  payments: Payment[];
  discount: number;
  openedAt: string;
  updatedAt: string;
  closedAt?: string;
  reversedAt?: string;
  closedBy?: string;
  closedByName?: string;
}

export interface ReportMetric {
  value: number;
  previous: number;
}

export interface ReportMetrics {
  netSales: ReportMetric;
  grossSales: ReportMetric;
  tickets: ReportMetric;
  averageTicket: ReportMetric;
  tips: ReportMetric;
  discounts: ReportMetric;
  reversals: ReportMetric;
  cancellations: ReportMetric;
}

export interface ReportTimelinePoint {
  key: string;
  label: string;
  value: number;
}

export interface ReportProduct {
  name: string;
  quantity: number;
  revenue: number;
}

export interface ReportPaymentBreakdown {
  method: PaymentMethod;
  value: number;
}

export interface ReportRow {
  order: ReportOrder;
  gross: number;
  reversal: number;
  net: number;
  tip: number;
  discount: number;
  cancellation: boolean;
  closedInRange: boolean;
  reversedInRange: boolean;
  cancelledInRange: boolean;
  paymentContributions: Record<PaymentMethod, number>;
}

export interface ReportDataset {
  metrics: ReportMetrics;
  timeline: ReportTimelinePoint[];
  products: ReportProduct[];
  payments: ReportPaymentBreakdown[];
  rows: ReportRow[];
}

export interface HourlyPatternPoint {
  hour: number;
  net: number;
  tickets: number;
}

export interface DailySalesRow {
  day: string;
  label: string;
  net: number;
  tickets: number;
}

const emptyContributions = (): Record<PaymentMethod, number> => ({ cash: 0, card: 0, transfer: 0 });

function dateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(byType.year), month: Number(byType.month), day: Number(byType.day) };
}

function formatDatePart(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function offsetAt(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(Number(byType.year), Number(byType.month) - 1, Number(byType.day), Number(byType.hour), Number(byType.minute), Number(byType.second));
  return asUtc - date.getTime();
}

function zonedStart(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  let instant = new Date(Date.UTC(year, month - 1, date));
  instant = new Date(instant.getTime() - offsetAt(instant));
  return instant;
}

function addDays(day: string, amount: number) {
  const [year, month, date] = day.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, date + amount));
  return formatDatePart({ year: result.getUTCFullYear(), month: result.getUTCMonth() + 1, day: result.getUTCDate() });
}

function withComparison(start: Date, end: Date, label: string): ReportRange {
  const duration = end.getTime() - start.getTime();
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label,
    comparisonStart: new Date(start.getTime() - duration).toISOString(),
    comparisonEnd: start.toISOString()
  };
}

export function dateInputValue(date = new Date()) {
  return formatDatePart(dateParts(date));
}

export function resolveReportRange(preset: ReportPreset, customStart?: string, customEnd?: string, now = new Date()): ReportRange {
  const today = dateInputValue(now);
  const todayStart = zonedStart(today);
  if (preset === "today") return withComparison(todayStart, now, "Hoy");
  if (preset === "yesterday") {
    const start = zonedStart(addDays(today, -1));
    return withComparison(start, todayStart, "Ayer");
  }
  if (preset === "last7" || preset === "last30") {
    const days = preset === "last7" ? 7 : 30;
    return withComparison(zonedStart(addDays(today, 1 - days)), now, preset === "last7" ? "Últimos 7 días" : "Últimos 30 días");
  }
  if (preset === "month") {
    const { year, month } = dateParts(now);
    return withComparison(zonedStart(`${year}-${String(month).padStart(2, "0")}-01`), now, "Este mes");
  }
  if (!customStart || !customEnd || customEnd < customStart) throw new Error("Selecciona un rango de fechas válido.");
  const start = zonedStart(customStart);
  const end = zonedStart(addDays(customEnd, 1));
  const days = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
  if (days > REPORT_MAX_RANGE_DAYS) throw new Error(`El rango personalizado puede abarcar hasta ${REPORT_MAX_RANGE_DAYS} días.`);
  return withComparison(start, end, `${customStart} al ${customEnd}`);
}

function isInRange(value: string | undefined, start: string, end: string) {
  if (!value) return false;
  const instant = Date.parse(value);
  return Number.isFinite(instant) && instant >= Date.parse(start) && instant < Date.parse(end);
}

function paymentContributions(order: ReportOrder) {
  const contributions = emptyContributions();
  let remaining = orderTotal(order);
  for (const payment of [...order.payments].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const applied = Math.max(0, Math.min(remaining, payment.amount));
    contributions[payment.method] += applied;
    remaining -= applied;
  }
  return contributions;
}

function orderTotal(order: ReportOrder) {
  return Math.max(0, order.items.filter((item) => item.status !== "cancelled").reduce((sum, item) => sum + itemTotal(item), 0) - order.discount);
}

function matchesFilters(order: ReportOrder, filters: ReportFilters, contributions: Record<PaymentMethod, number>) {
  if (filters.orderType !== "all" && order.type !== filters.orderType) return false;
  if (filters.employeeId && order.closedBy !== filters.employeeId) return false;
  if (filters.paymentMethod !== "all" && contributions[filters.paymentMethod] <= 0) return false;
  return true;
}

function contributionForFilter(order: ReportOrder, filters: ReportFilters, contributions: Record<PaymentMethod, number>) {
  return filters.paymentMethod === "all" ? orderTotal(order) : contributions[filters.paymentMethod];
}

function tipsForFilter(order: ReportOrder, filters: ReportFilters) {
  return order.payments.reduce((sum, payment) => sum + (filters.paymentMethod === "all" || payment.method === filters.paymentMethod ? payment.tip : 0), 0);
}

function timelineKey(value: string, range: ReportRange) {
  const start = new Date(range.start);
  const end = new Date(range.end);
  const days = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const day = `${map.year}-${map.month}-${map.day}`;
  if (days <= 1) return { key: `${day}T${map.hour}`, label: `${map.hour}h` };
  if (days <= 31) return { key: day, label: `${map.day}/${map.month}` };
  const localDate = zonedStart(day);
  const weekStart = new Date(localDate);
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
  const week = dateInputValue(weekStart);
  return { key: week, label: new Intl.DateTimeFormat("es-MX", { timeZone: REPORT_TIME_ZONE, day: "numeric", month: "short" }).format(weekStart) };
}

function buildSlice(orders: ReportOrder[], range: ReportRange, filters: ReportFilters, includeRows: boolean) {
  let gross = 0;
  let reversals = 0;
  let tickets = 0;
  let tips = 0;
  let discounts = 0;
  let cancellations = 0;
  const products = new Map<string, ReportProduct>();
  const payments = emptyContributions();
  const timeline = new Map<string, ReportTimelinePoint>();
  const rows: ReportRow[] = [];

  for (const order of orders) {
    const contributions = paymentContributions(order);
    if (!matchesFilters(order, filters, contributions)) continue;
    const closedInRange = isInRange(order.closedAt, range.start, range.end);
    const reversedInRange = isInRange(order.reversedAt, range.start, range.end);
    const cancelledInRange = order.status === "cancelled" && isInRange(order.updatedAt, range.start, range.end);
    if (!closedInRange && !reversedInRange && !cancelledInRange) continue;

    const contribution = contributionForFilter(order, filters, contributions);
    const orderTips = tipsForFilter(order, filters);
    const row: ReportRow = {
      order,
      gross: closedInRange ? contribution : 0,
      reversal: reversedInRange ? contribution : 0,
      net: (closedInRange ? contribution : 0) - (reversedInRange ? contribution : 0),
      tip: (closedInRange ? orderTips : 0) - (reversedInRange ? orderTips : 0),
      discount: closedInRange ? order.discount : 0,
      cancellation: cancelledInRange,
      closedInRange,
      reversedInRange,
      cancelledInRange,
      paymentContributions: contributions
    };

    if (closedInRange) {
      gross += contribution;
      tickets += 1;
      tips += orderTips;
      discounts += order.discount;
      for (const [method, value] of Object.entries(contributions) as Array<[PaymentMethod, number]>) payments[method] += filters.paymentMethod === "all" ? value : method === filters.paymentMethod ? value : 0;
      for (const item of order.items.filter((item) => item.status !== "cancelled")) {
        const current = products.get(item.name) ?? { name: item.name, quantity: 0, revenue: 0 };
        current.quantity += item.quantity;
        current.revenue += itemTotal(item);
        products.set(item.name, current);
      }
      if (order.closedAt) {
        const point = timelineKey(order.closedAt, range);
        const current = timeline.get(point.key) ?? { ...point, value: 0 };
        current.value += contribution;
        timeline.set(point.key, current);
      }
    }
    if (reversedInRange) {
      reversals += contribution;
      tips -= orderTips;
      for (const [method, value] of Object.entries(contributions) as Array<[PaymentMethod, number]>) payments[method] -= filters.paymentMethod === "all" ? value : method === filters.paymentMethod ? value : 0;
      if (order.reversedAt) {
        const point = timelineKey(order.reversedAt, range);
        const current = timeline.get(point.key) ?? { ...point, value: 0 };
        current.value -= contribution;
        timeline.set(point.key, current);
      }
    }
    if (cancelledInRange) cancellations += 1;
    if (includeRows) rows.push(row);
  }

  return {
    gross,
    reversals,
    tickets,
    tips,
    discounts,
    cancellations,
    products: [...products.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue),
    payments: (Object.keys(payments) as PaymentMethod[]).map((method) => ({ method, value: payments[method] })),
    timeline: [...timeline.values()].sort((a, b) => a.key.localeCompare(b.key)),
    rows: rows.sort((a, b) => reportRowTime(b) - reportRowTime(a))
  };
}

function reportRowTime(row: ReportRow) {
  return Math.max(...[row.order.reversedAt, row.order.closedAt, row.order.updatedAt].filter((value): value is string => Boolean(value)).map((value) => Date.parse(value)));
}

export function createReportDataset(orders: ReportOrder[], range: ReportRange, filters: ReportFilters): ReportDataset {
  const current = buildSlice(orders, range, filters, true);
  const previous = buildSlice(orders, { ...range, start: range.comparisonStart, end: range.comparisonEnd }, filters, false);
  const metric = (value: number, previousValue: number): ReportMetric => ({ value, previous: previousValue });
  return {
    metrics: {
      netSales: metric(current.gross - current.reversals, previous.gross - previous.reversals),
      grossSales: metric(current.gross, previous.gross),
      tickets: metric(current.tickets, previous.tickets),
      averageTicket: metric(current.tickets ? current.gross / current.tickets : 0, previous.tickets ? previous.gross / previous.tickets : 0),
      tips: metric(current.tips, previous.tips),
      discounts: metric(current.discounts, previous.discounts),
      reversals: metric(current.reversals, previous.reversals),
      cancellations: metric(current.cancellations, previous.cancellations)
    },
    timeline: current.timeline,
    products: current.products,
    payments: current.payments,
    rows: current.rows
  };
}

export function sortProducts(products: ReportProduct[], mode: "quantity" | "revenue", direction: "top" | "bottom", limit = 8): ReportProduct[] {
  const value = (product: ReportProduct) => (mode === "quantity" ? product.quantity : product.revenue);
  return [...products].sort((a, b) => (direction === "top" ? value(b) - value(a) : value(a) - value(b))).slice(0, limit);
}

function hourOf(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: REPORT_TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  return Number(parts.find((part) => part.type === "hour")?.value ?? "0");
}

export function createHourlyPattern(orders: ReportOrder[], range: ReportRange, filters: ReportFilters): HourlyPatternPoint[] {
  const buckets: HourlyPatternPoint[] = Array.from({ length: 24 }, (_, hour) => ({ hour, net: 0, tickets: 0 }));
  for (const order of orders) {
    const contributions = paymentContributions(order);
    if (!matchesFilters(order, filters, contributions)) continue;
    const closedInRange = isInRange(order.closedAt, range.start, range.end);
    const reversedInRange = isInRange(order.reversedAt, range.start, range.end);
    if (!closedInRange && !reversedInRange) continue;
    const contribution = contributionForFilter(order, filters, contributions);
    if (closedInRange && order.closedAt) {
      const bucket = buckets[hourOf(order.closedAt)];
      bucket.net += contribution;
      bucket.tickets += 1;
    }
    if (reversedInRange && order.reversedAt) buckets[hourOf(order.reversedAt)].net -= contribution;
  }
  return buckets;
}

function dayKey(value: string) {
  return formatDatePart(dateParts(new Date(value)));
}

function dayLabel(day: string) {
  const [, month, date] = day.split("-");
  return `${date}/${month}`;
}

export function createDailySales(orders: ReportOrder[], range: ReportRange, filters: ReportFilters): DailySalesRow[] {
  const map = new Map<string, DailySalesRow>();
  const rowFor = (day: string) => map.get(day) ?? { day, label: dayLabel(day), net: 0, tickets: 0 };
  for (const order of orders) {
    const contributions = paymentContributions(order);
    if (!matchesFilters(order, filters, contributions)) continue;
    const closedInRange = isInRange(order.closedAt, range.start, range.end);
    const reversedInRange = isInRange(order.reversedAt, range.start, range.end);
    if (!closedInRange && !reversedInRange) continue;
    const contribution = contributionForFilter(order, filters, contributions);
    if (closedInRange && order.closedAt) {
      const day = dayKey(order.closedAt);
      const row = rowFor(day);
      row.net += contribution;
      row.tickets += 1;
      map.set(day, row);
    }
    if (reversedInRange && order.reversedAt) {
      const day = dayKey(order.reversedAt);
      const row = rowFor(day);
      row.net -= contribution;
      map.set(day, row);
    }
  }
  return [...map.values()].sort((a, b) => b.day.localeCompare(a.day));
}

export function percentageChange(metric: ReportMetric) {
  if (!metric.previous) return null;
  return ((metric.value - metric.previous) / Math.abs(metric.previous)) * 100;
}

export function reportEventLabel(row: ReportRow) {
  return [row.closedInRange && "Cobro", row.reversedInRange && "Reversión", row.cancelledInRange && "Cancelación"].filter(Boolean).join(" · ");
}

export function reportProductSummary(order: ReportOrder) {
  return order.items.filter((item) => item.status !== "cancelled").map((item) => `${item.quantity}× ${item.name}`).join("; ");
}
