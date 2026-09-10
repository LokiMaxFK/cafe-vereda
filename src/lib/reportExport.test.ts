import { describe, expect, it } from "vitest";
import { buildReportCsv, csvTimestamp, reportCsvFilename, type ReportExportContext, type ReportExportData } from "./reportExport";
import { createDailySales, createHourlyPattern, createReportDataset, resolveReportRange, type ReportOrder } from "../domain/reports";

const range = resolveReportRange("custom", "2026-08-17", "2026-08-17");
const filters = { employeeId: "", orderType: "all" as const, paymentMethod: "all" as const };

function order(overrides: Partial<ReportOrder> = {}): ReportOrder {
  return {
    id: "sale", folio: 1, type: "takeaway", status: "closed", discount: 0,
    openedAt: "2026-08-17T15:00:00.000Z", updatedAt: "2026-08-17T16:00:00.000Z", closedAt: "2026-08-17T16:00:00.000Z",
    closedBy: "staff-1", closedByName: "Ana", items: [{ id: "item", productId: "coffee", name: "Café", quantity: 2, unitPrice: 90, modifiers: [], status: "prepared" }],
    payments: [{ id: "cash", method: "cash", amount: 180, tip: 8, createdAt: "2026-08-17T16:00:00.000Z" }],
    ...overrides
  };
}

const context: ReportExportContext = {
  businessName: "Vereda Café",
  rangeLabel: "17 de agosto de 2026",
  generatedAt: new Date("2026-08-18T02:30:00.000Z"),
  generatedBy: "Ana López",
  employeeLabel: "Todos",
  orderTypeLabel: "Todos",
  paymentLabel: "Todos",
  usesRemoteHistory: true
};

function build(orders: ReportOrder[], overrides: Partial<ReportExportData> = {}, ctx: Partial<ReportExportContext> = {}) {
  const dataset = createReportDataset(orders, range, filters);
  return buildReportCsv(
    {
      dataset,
      dailySales: createDailySales(orders, range, filters),
      hourlyPattern: createHourlyPattern(orders, range, filters),
      incidents: [],
      inventory: [],
      ...overrides
    },
    { ...context, ...ctx }
  );
}

function section(csv: string, title: string) {
  const lines = csv.split("\r\n");
  const start = lines.indexOf(title);
  if (start === -1) throw new Error(`No existe la sección ${title}`);
  const rest = lines.slice(start + 1);
  const end = rest.indexOf("");
  return end === -1 ? rest : rest.slice(0, end);
}

describe("report CSV export", () => {
  it("leaves numbers unquoted so Excel can add up the columns", () => {
    const detail = section(build([order()]), "DETALLE DE VENTAS");
    const totals = detail[detail.length - 1].split(",");

    expect(detail[1]).toContain(",180,");
    expect(detail[1]).not.toContain('"180"');
    expect(totals[0]).toBe("Total");
    expect(Number(totals[13])).toBe(180);
  });

  it("quotes only the text that needs it", () => {
    const csv = build([order({ items: [{ id: "item", productId: "coffee", name: 'Café "de olla", grande', quantity: 1, unitPrice: 50, modifiers: [], status: "prepared" }] })]);

    expect(csv).toContain('"Café ""de olla"", grande"');
    expect(section(csv, "MÉTODOS DE PAGO")[1]).toBe("Efectivo,50");
  });

  it("writes timestamps in Mexico City time so the file matches the screen", () => {
    // 2026-08-17T16:00Z son las 10:00 en Ciudad de México (UTC-6).
    expect(csvTimestamp("2026-08-17T16:00:00.000Z")).toBe("2026-08-17 10:00");
    expect(csvTimestamp(undefined)).toBe("");
    expect(csvTimestamp("no es una fecha")).toBe("");
    expect(section(build([order()]), "DETALLE DE VENTAS")[1]).toContain("2026-08-17 10:00");
  });

  it("carries the filters and the data source into the file", () => {
    const csv = build([order()], {}, { employeeLabel: "Ana López", paymentLabel: "Efectivo", usesRemoteHistory: false });

    expect(csv).toContain("Vereda Café · Reporte de ventas");
    expect(csv).toContain("Periodo,17 de agosto de 2026");
    expect(csv).toContain("Empleado,Ana López");
    expect(csv).toContain("Método de pago,Efectivo");
    expect(csv).toContain("Generado por,Ana López");
    expect(csv).toContain("Modo demostración");
  });

  it("exports every section that the screen shows, not just the sales detail", () => {
    const csv = build([order()], {
      incidents: [{ incidentType: "refund", incidentLabel: "Reembolso", reason: "Bebida derramada", amountCents: 4500, createdAt: "2026-08-17T18:00:00.000Z", folio: 1, createdByName: "Ana" }],
      inventory: [{ item: { id: "milk", name: "Leche", unit: "ml", minimum: 0, tolerance: 0, active: true }, entries: 1000, waste: 0, theoretical: 400, physical: 450, variance: 50, opening: 2000, closing: 2600 }]
    });

    for (const title of ["RESUMEN", "MÉTODOS DE PAGO", "PRODUCTOS COBRADOS", "VENTAS POR DÍA", "VENTAS POR HORA DEL DÍA", "DETALLE DE VENTAS", "INCIDENCIAS", "INSUMOS · CONSUMO CONTADO VS. RECETA TEÓRICA"]) {
      expect(csv).toContain(`\r\n${title}\r\n`);
    }
    expect(section(csv, "INCIDENCIAS")[1]).toBe("1,Reembolso,Ana,Bebida derramada,45,2026-08-17 12:00");
    expect(section(csv, "INSUMOS · CONSUMO CONTADO VS. RECETA TEÓRICA")[1]).toContain("Leche,ml,2000,1000,0,2600,450,400,50");
  });

  it("translates the order status instead of dumping the raw enum", () => {
    expect(section(build([order()]), "DETALLE DE VENTAS")[1]).toContain(",Cobrada,");
    expect(section(build([order({ status: "reversed", reversedAt: "2026-08-17T18:00:00.000Z" })]), "DETALLE DE VENTAS")[1]).toContain(",Revertida,");
  });

  it("totals the summary sections", () => {
    const csv = build([order(), order({ id: "second", folio: 2, payments: [{ id: "card", method: "card", amount: 180, tip: 0, createdAt: "2026-08-17T17:00:00.000Z" }] })]);

    expect(section(csv, "MÉTODOS DE PAGO").at(-1)).toBe("Total,360");
    expect(section(csv, "PRODUCTOS COBRADOS").at(-1)).toBe(",Total,4,360");
    expect(section(csv, "VENTAS POR DÍA").at(-1)).toBe("Total,2,360");
  });

  it("reports the empty sections instead of leaving a bare header", () => {
    const csv = build([order()]);

    expect(section(csv, "INCIDENCIAS")[1]).toBe("Sin incidencias en el periodo");
    expect(section(csv, "INSUMOS · CONSUMO CONTADO VS. RECETA TEÓRICA")[1]).toBe("No hay información comparable de insumos para este periodo");
  });

  it("builds a filename without accents or spaces", () => {
    expect(reportCsvFilename("Últimos 7 días", new Date("2026-08-18T02:30:00.000Z"))).toBe("vereda-reporte-ultimos-7-dias-2026-08-17-20-30.csv");
    expect(reportCsvFilename("!!!", new Date("2026-08-18T02:30:00.000Z"))).toBe("vereda-reporte-periodo-2026-08-17-20-30.csv");
  });
});
