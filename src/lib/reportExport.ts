/**
 * Construcción del CSV de reportes.
 *
 * Vive aparte de `ReportsPage` porque el armado del archivo es lógica pura —y por tanto
 * comprobable— mientras que la página sólo aporta el estado ya calculado. El exportador anterior
 * volcaba únicamente el detalle de ventas; aquí se emite el reporte completo en un solo archivo,
 * por bloques, para que quien lo abra vea lo mismo que había en pantalla.
 *
 * Dos decisiones de formato, ambas por Excel en español de México:
 * - Los números salen **sin comillas** y con punto decimal (`1234.50`). Al entrecomillarlos, Excel
 *   los recibía como texto y no se podía sumar una columna sin convertirla a mano.
 * - Las fechas salen como `AAAA-MM-DD HH:mm` en la zona de Ciudad de México, la misma que usa la
 *   pantalla. Así ordenan bien y no dependen de la configuración regional de quien abra el archivo.
 */
import type { InventoryAnalysisRow } from "../domain/inventory";
import { paymentMethodLabel } from "../domain/money";
import {
  percentageChange,
  reportEventLabel,
  reportProductSummary,
  type DailySalesRow,
  type HourlyPatternPoint,
  type ReportDataset,
  type ReportMetric,
  type ReportRow
} from "../domain/reports";

const TIME_ZONE = "America/Mexico_City";

export interface ReportExportIncident {
  incidentType: string;
  incidentLabel: string;
  reason: string;
  amountCents: number;
  createdAt: string;
  folio?: number;
  createdByName?: string;
}

export interface ReportExportContext {
  businessName: string;
  rangeLabel: string;
  generatedAt: Date;
  generatedBy?: string;
  employeeLabel: string;
  orderTypeLabel: string;
  paymentLabel: string;
  /** `false` cuando la app corre en modo demostración: el reporte no cubre el historial completo. */
  usesRemoteHistory: boolean;
}

export interface ReportExportData {
  dataset: ReportDataset;
  dailySales: DailySalesRow[];
  hourlyPattern: HourlyPatternPoint[];
  incidents: ReportExportIncident[];
  inventory: InventoryAnalysisRow[];
}

/** Marca un número para que salga sin comillas y con dos decimales. */
type Cell = string | number | null | undefined;

function money(value: number) {
  return Number(value.toFixed(2));
}

function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  // Sólo se entrecomilla el texto que lo necesita; así los números quedan legibles para Excel.
  return /[",\n\r]/.test(value) || value !== value.trim() ? `"${value.replace(/"/g, '""')}"` : value;
}

function line(cells: Cell[]) {
  return cells.map(escapeCell).join(",");
}

const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

/** `AAAA-MM-DD HH:mm` en hora de Ciudad de México, ordenable y sin ambigüedad regional. */
export function csvTimestamp(value: string | Date | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(dateParts.formatToParts(date).map((part) => [part.type, part.value]));
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute}`;
}

function metricRow(label: string, metric: ReportMetric, money_ = true) {
  const change = percentageChange(metric);
  return line([
    label,
    money_ ? money(metric.value) : metric.value,
    money_ ? money(metric.previous) : metric.previous,
    change === null ? "Sin datos previos" : Number(change.toFixed(1))
  ]);
}

function subtotal(rows: ReportRow[]) {
  return rows.reduce(
    (totals, row) => ({
      gross: totals.gross + row.gross,
      reversal: totals.reversal + row.reversal,
      net: totals.net + row.net,
      tip: totals.tip + row.tip,
      discount: totals.discount + row.discount,
      cash: totals.cash + row.paymentContributions.cash,
      card: totals.card + row.paymentContributions.card,
      transfer: totals.transfer + row.paymentContributions.transfer
    }),
    { gross: 0, reversal: 0, net: 0, tip: 0, discount: 0, cash: 0, card: 0, transfer: 0 }
  );
}

function productSubtotal(order: ReportRow["order"]) {
  return order.items
    .filter((item) => item.status !== "cancelled")
    .reduce((sum, item) => sum + item.quantity * (item.unitPrice + item.modifiers.reduce((extra, modifier) => extra + modifier.price, 0)), 0);
}

export function buildReportCsv(data: ReportExportData, context: ReportExportContext): string {
  const { dataset, dailySales, hourlyPattern, incidents, inventory } = data;
  const out: string[] = [];
  const section = (title: string) => {
    if (out.length) out.push("");
    out.push(line([title]));
  };

  out.push(line([`${context.businessName} · Reporte de ventas`]));
  out.push(line(["Periodo", context.rangeLabel]));
  out.push(line(["Generado", csvTimestamp(context.generatedAt)]));
  if (context.generatedBy) out.push(line(["Generado por", context.generatedBy]));
  out.push(line(["Empleado", context.employeeLabel]));
  out.push(line(["Tipo de venta", context.orderTypeLabel]));
  out.push(line(["Método de pago", context.paymentLabel]));
  out.push(line(["Moneda", "MXN"]));
  out.push(line(["Zona horaria", TIME_ZONE]));
  out.push(
    line([
      "Origen de los datos",
      context.usesRemoteHistory
        ? "Historial completo (Supabase)"
        : "Modo demostración: sólo las órdenes locales de este dispositivo"
    ])
  );

  section("RESUMEN");
  out.push(line(["Indicador", "Valor", "Periodo anterior", "Variación %"]));
  out.push(metricRow("Ventas netas", dataset.metrics.netSales));
  out.push(metricRow("Ventas brutas", dataset.metrics.grossSales));
  out.push(metricRow("Tickets cobrados", dataset.metrics.tickets, false));
  out.push(metricRow("Ticket promedio (bruto)", dataset.metrics.averageTicket));
  out.push(metricRow("Propinas", dataset.metrics.tips));
  out.push(metricRow("Descuentos", dataset.metrics.discounts));
  out.push(metricRow("Reversiones", dataset.metrics.reversals));
  out.push(metricRow("Cancelaciones", dataset.metrics.cancellations, false));

  section("MÉTODOS DE PAGO");
  out.push(line(["Método", "Cobros netos"]));
  for (const payment of dataset.payments) out.push(line([paymentMethodLabel[payment.method], money(payment.value)]));
  out.push(line(["Total", money(dataset.payments.reduce((sum, payment) => sum + payment.value, 0))]));

  section("PRODUCTOS COBRADOS");
  out.push(line(["#", "Producto", "Unidades", "Ingreso"]));
  const products = [...dataset.products].sort((a, b) => b.quantity - a.quantity);
  products.forEach((product, index) => out.push(line([index + 1, product.name, product.quantity, money(product.revenue)])));
  out.push(
    line([
      "",
      "Total",
      products.reduce((sum, product) => sum + product.quantity, 0),
      money(products.reduce((sum, product) => sum + product.revenue, 0))
    ])
  );

  section("VENTAS POR DÍA");
  out.push(line(["Fecha", "Tickets", "Ventas netas"]));
  for (const row of dailySales) out.push(line([row.day, row.tickets, money(row.net)]));
  out.push(
    line([
      "Total",
      dailySales.reduce((sum, row) => sum + row.tickets, 0),
      money(dailySales.reduce((sum, row) => sum + row.net, 0))
    ])
  );

  section("VENTAS POR HORA DEL DÍA");
  out.push(line(["Hora", "Tickets", "Ventas netas"]));
  for (const point of hourlyPattern) out.push(line([`${String(point.hour).padStart(2, "0")}:00`, point.tickets, money(point.net)]));

  section("DETALLE DE VENTAS");
  out.push(
    line([
      "Folio",
      "Evento en el periodo",
      "Fecha de cobro",
      "Fecha de reversión",
      "Fecha de cancelación",
      "Empleado",
      "Tipo",
      "Estado actual",
      "Productos",
      "Subtotal productos",
      "Descuento",
      "Venta bruta",
      "Reversión",
      "Venta neta",
      "Efectivo",
      "Tarjeta",
      "Transferencia",
      "Propina"
    ])
  );
  for (const row of dataset.rows) {
    out.push(
      line([
        row.order.folio,
        reportEventLabel(row),
        csvTimestamp(row.order.closedAt),
        csvTimestamp(row.order.reversedAt),
        row.cancelledInRange ? csvTimestamp(row.order.updatedAt) : "",
        row.order.closedByName ?? "",
        row.order.type === "table" ? "Mesa" : "Para llevar",
        ORDER_STATUS_LABEL[row.order.status] ?? row.order.status,
        reportProductSummary(row.order),
        money(productSubtotal(row.order)),
        money(row.discount),
        money(row.gross),
        money(row.reversal),
        money(row.net),
        money(row.paymentContributions.cash),
        money(row.paymentContributions.card),
        money(row.paymentContributions.transfer),
        money(row.tip)
      ])
    );
  }
  const totals = subtotal(dataset.rows);
  out.push(
    line([
      "Total",
      `${dataset.rows.length} registros`,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      money(totals.discount),
      money(totals.gross),
      money(totals.reversal),
      money(totals.net),
      money(totals.cash),
      money(totals.card),
      money(totals.transfer),
      money(totals.tip)
    ])
  );

  section("INCIDENCIAS");
  out.push(line(["Folio", "Tipo", "Empleado", "Motivo", "Importe", "Fecha"]));
  if (incidents.length) {
    for (const incident of incidents) {
      out.push(
        line([
          incident.folio ?? "",
          incident.incidentLabel,
          incident.createdByName ?? "",
          incident.reason,
          money(incident.amountCents / 100),
          csvTimestamp(incident.createdAt)
        ])
      );
    }
    out.push(line(["Total", `${incidents.length} registros`, "", "", money(incidents.reduce((sum, incident) => sum + incident.amountCents, 0) / 100), ""]));
  } else {
    out.push(line(["Sin incidencias en el periodo"]));
  }

  section("INSUMOS · CONSUMO CONTADO VS. RECETA TEÓRICA");
  out.push(line(["Insumo", "Unidad", "Inicial", "Entradas", "Mermas", "Final", "Consumo contado", "Consumo teórico", "Diferencia", "Primer conteo", "Último conteo", "Cierre"]));
  if (inventory.length) {
    for (const row of inventory) {
      out.push(
        line([
          row.item.name,
          row.item.unit,
          row.opening,
          row.entries,
          row.waste,
          row.closing,
          row.physical,
          row.theoretical,
          row.variance,
          csvTimestamp(row.openingAt),
          csvTimestamp(row.closingAt),
          row.openEnded ? "Sin segundo conteo" : "Cerrado"
        ])
      );
    }
  } else {
    out.push(line(["No hay información comparable de insumos para este periodo"]));
  }

  return out.join("\r\n");
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  open: "Abierta",
  closed: "Cobrada",
  cancelled: "Cancelada",
  reversed: "Revertida"
};

export function reportCsvFilename(rangeLabel: string, generatedAt: Date): string {
  const slug = rangeLabel
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `vereda-reporte-${slug || "periodo"}-${csvTimestamp(generatedAt).replace(/[: ]/g, "-")}.csv`;
}

/**
 * Descarga el CSV. El `<a>` se agrega al documento y la URL se libera en el siguiente turno del
 * bucle de eventos: revocarla justo después de `click()` cancelaba la descarga en algunos
 * navegadores, porque el clic aún no había terminado de procesarse.
 */
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
