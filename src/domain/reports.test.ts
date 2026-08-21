import { describe, expect, it } from "vitest";
import { createDailySales, createHourlyPattern, createReportDataset, resolveReportRange, sortProducts, type ReportOrder, type ReportProduct } from "./reports";

const range = resolveReportRange("custom", "2026-08-17", "2026-08-17");
const filters = { employeeId: "", orderType: "all" as const, paymentMethod: "all" as const };

function order(overrides: Partial<ReportOrder> = {}): ReportOrder {
  return {
    id: "sale", folio: 1, type: "takeaway", status: "closed", discount: 0,
    openedAt: "2026-08-17T15:00:00.000Z", updatedAt: "2026-08-17T16:00:00.000Z", closedAt: "2026-08-17T16:00:00.000Z",
    closedBy: "staff-1", closedByName: "Ana", items: [{ id: "item", productId: "coffee", name: "Café", quantity: 2, unitPrice: 90, modifiers: [], status: "prepared" }],
    payments: [{ id: "cash", method: "cash", amount: 100, tip: 3, createdAt: "2026-08-17T16:00:00.000Z" }, { id: "card", method: "card", amount: 100, tip: 5, createdAt: "2026-08-17T16:01:00.000Z" }],
    ...overrides
  };
}

describe("report calculations", () => {
  it("caps mixed payments at the sale total and keeps tips separate", () => {
    const data = createReportDataset([order()], range, filters);
    expect(data.metrics.grossSales.value).toBe(180);
    expect(data.metrics.netSales.value).toBe(180);
    expect(data.metrics.tips.value).toBe(8);
    expect(data.payments).toEqual([{ method: "cash", value: 100 }, { method: "card", value: 80 }, { method: "transfer", value: 0 }]);
  });

  it("uses only the selected method contribution while retaining the ticket", () => {
    const data = createReportDataset([order()], range, { ...filters, paymentMethod: "card" });
    expect(data.metrics.grossSales.value).toBe(80);
    expect(data.metrics.averageTicket.value).toBe(80);
    expect(data.metrics.tickets.value).toBe(1);
    expect(data.metrics.tips.value).toBe(5);
  });

  it("records a later reversal in its own period instead of rewriting the original sale", () => {
    const reversed = order({
      id: "reversed", status: "reversed", openedAt: "2026-08-16T15:00:00.000Z", updatedAt: "2026-08-17T18:00:00.000Z",
      closedAt: "2026-08-16T16:00:00.000Z", reversedAt: "2026-08-17T18:00:00.000Z",
      items: [{ id: "item", productId: "coffee", name: "Café", quantity: 1, unitPrice: 90, modifiers: [], status: "prepared" }],
      payments: [{ id: "cash", method: "cash", amount: 90, tip: 10, createdAt: "2026-08-16T16:00:00.000Z" }]
    });
    const data = createReportDataset([reversed], range, filters);
    expect(data.metrics.grossSales.value).toBe(0);
    expect(data.metrics.reversals.value).toBe(90);
    expect(data.metrics.netSales.value).toBe(-90);
    expect(data.metrics.tips.value).toBe(-10);
    expect(data.metrics.grossSales.previous).toBe(90);
  });

  it("filters employee and type consistently and counts cancellation events", () => {
    const cancelled = order({ id: "cancelled", folio: 2, type: "table", status: "cancelled", closedAt: undefined, closedBy: undefined, closedByName: undefined, updatedAt: "2026-08-17T17:00:00.000Z", payments: [] });
    const data = createReportDataset([order(), cancelled], range, filters);
    expect(data.metrics.cancellations.value).toBe(1);
    expect(createReportDataset([order(), cancelled], range, { ...filters, employeeId: "staff-1" }).metrics.cancellations.value).toBe(0);
    expect(createReportDataset([order(), cancelled], range, { ...filters, orderType: "table" }).metrics.cancellations.value).toBe(1);
  });

  it("enforces a maximum 90-day custom range", () => {
    expect(() => resolveReportRange("custom", "2026-01-01", "2026-04-01")).toThrow("hasta 90 días");
  });
});

describe("hourly sales pattern", () => {
  it("buckets net sales and tickets by local hour of day", () => {
    const morning = order({ id: "morning", closedAt: "2026-08-17T14:00:00.000Z" }); // 08:00 local
    const afternoon = order({ id: "afternoon", closedAt: "2026-08-17T20:00:00.000Z" }); // 14:00 local
    const points = createHourlyPattern([morning, afternoon], range, filters);
    expect(points).toHaveLength(24);
    expect(points[8].net).toBe(180);
    expect(points[8].tickets).toBe(1);
    expect(points[14].net).toBe(180);
    expect(points[14].tickets).toBe(1);
    expect(points[9].net).toBe(0);
  });

  it("subtracts a reversal from its own hour, not the original sale's hour", () => {
    const reversed = order({
      id: "reversed", status: "reversed", openedAt: "2026-08-16T15:00:00.000Z", updatedAt: "2026-08-17T18:00:00.000Z",
      closedAt: "2026-08-16T16:00:00.000Z", reversedAt: "2026-08-17T21:00:00.000Z", // 15:00 local
      items: [{ id: "item", productId: "coffee", name: "Café", quantity: 1, unitPrice: 90, modifiers: [], status: "prepared" }],
      payments: [{ id: "cash", method: "cash", amount: 90, tip: 10, createdAt: "2026-08-16T16:00:00.000Z" }]
    });
    const points = createHourlyPattern([reversed], range, filters);
    expect(points[15].net).toBe(-90);
    expect(points[15].tickets).toBe(0);
  });
});

describe("daily sales table", () => {
  it("groups by calendar day even when the timeline would use hourly buckets", () => {
    const rows = createDailySales([order()], range, filters);
    expect(rows).toEqual([{ day: "2026-08-17", label: "17/08", net: 180, tickets: 1 }]);
  });

  it("groups by calendar day even when the timeline would use weekly buckets", () => {
    const wideRange = resolveReportRange("custom", "2026-07-01", "2026-08-17");
    const first = order({ id: "first", closedAt: "2026-07-05T16:00:00.000Z" });
    const second = order({ id: "second", closedAt: "2026-08-10T16:00:00.000Z" });
    const rows = createDailySales([first, second], wideRange, filters);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.day)).toEqual(["2026-08-10", "2026-07-05"]);
    expect(rows.every((row) => row.net === 180 && row.tickets === 1)).toBe(true);
  });
});

describe("product ranking", () => {
  const products: ReportProduct[] = [
    { name: "Café", quantity: 10, revenue: 300 },
    { name: "Té", quantity: 3, revenue: 90 },
    { name: "Croissant", quantity: 5, revenue: 400 }
  ];

  it("returns the top products by quantity", () => {
    expect(sortProducts(products, "quantity", "top", 2).map((product) => product.name)).toEqual(["Café", "Croissant"]);
  });

  it("returns the bottom products by revenue, excluding nothing beyond what sold", () => {
    expect(sortProducts(products, "revenue", "bottom", 2).map((product) => product.name)).toEqual(["Té", "Café"]);
  });
});

// F13-U1: los huecos que quedaban. La zona horaria del reporte es America/Mexico_City (UTC-6 todo
// el año desde que México dejó el horario de verano), así que la medianoche local son las 06:00 UTC.
describe("cruce de medianoche", () => {
  const rangoDosDias = resolveReportRange("custom", "2026-08-16", "2026-08-17");
  const antesDeMedianoche = order({ id: "antes", closedAt: "2026-08-17T05:30:00.000Z" });  // 23:30 del día 16, hora local
  const despuesDeMedianoche = order({ id: "despues", closedAt: "2026-08-17T06:30:00.000Z" }); // 00:30 del día 17

  it("separa por día calendario local, no por el día UTC", () => {
    // Las dos ventas ocurren el 17 en UTC. Agrupar por UTC las metería en el mismo día y el café
    // vería el cierre de una noche sumado al día siguiente.
    const filas = createDailySales([antesDeMedianoche, despuesDeMedianoche], rangoDosDias, filters);
    expect(filas.map((fila) => fila.day)).toEqual(["2026-08-17", "2026-08-16"]);
    expect(filas.map((fila) => fila.tickets)).toEqual([1, 1]);
  });

  it("separa por hora local a un lado y otro de la medianoche", () => {
    const horas = createHourlyPattern([antesDeMedianoche, despuesDeMedianoche], rangoDosDias, filters);
    expect(horas.find((punto) => punto.hour === 23)?.tickets).toBe(1);
    expect(horas.find((punto) => punto.hour === 0)?.tickets).toBe(1);
  });
});

describe("empates en el ranking de productos", () => {
  const conEmpate: ReportProduct[] = [
    { name: "Latte", quantity: 5, revenue: 350 },
    { name: "Chai", quantity: 5, revenue: 400 },
    { name: "Moka", quantity: 2, revenue: 180 }
  ];

  it("no pierde ni duplica productos empatados, y conserva el orden de entrada", () => {
    // El desempate no está implementado: `sortProducts` se apoya en que el `sort` de JavaScript es
    // estable (garantizado por la norma desde ES2019), así que dos productos con la misma cantidad
    // conservan el orden en que llegaron. Queda escrito para que nadie lo cambie sin querer.
    const top = sortProducts(conEmpate, "quantity", "top", 8);
    expect(top.map((producto) => producto.name)).toEqual(["Latte", "Chai", "Moka"]);
    expect(top).toHaveLength(3);
  });

  it("ordena por ingreso cuando el empate es de cantidad", () => {
    expect(sortProducts(conEmpate, "revenue", "top", 8).map((producto) => producto.name)).toEqual(["Chai", "Latte", "Moka"]);
  });

  it("respeta el límite sin dejar fuera al primero", () => {
    expect(sortProducts(conEmpate, "quantity", "top", 1).map((producto) => producto.name)).toEqual(["Latte"]);
  });
});

describe("periodo sin ventas", () => {
  it("devuelve ceros y no un NaN en el ticket promedio", () => {
    // La división por cero es el error clásico aquí: sin tickets, el promedio debe ser 0 y no NaN,
    // que en pantalla saldría como "$NaN".
    const vacio = createReportDataset([], range, filters);
    expect(vacio.metrics.netSales.value).toBe(0);
    expect(vacio.metrics.tickets.value).toBe(0);
    expect(vacio.metrics.averageTicket.value).toBe(0);
    expect(Number.isNaN(vacio.metrics.averageTicket.value)).toBe(false);
    expect(vacio.rows).toEqual([]);
    expect(vacio.payments).toEqual([{ method: "cash", value: 0 }, { method: "card", value: 0 }, { method: "transfer", value: 0 }]);
    expect(createDailySales([], range, filters)).toEqual([]);
  });
});

describe("reversión dentro o fuera del rango", () => {
  // El caso donde más fácil se equivocan los reportes: el cierre y la reversión son eventos
  // distintos y pueden caer en periodos distintos. Cada uno debe contar en el suyo.
  it("una venta cerrada dentro y revertida después cuenta entera en este periodo", () => {
    const revertidaDespues = order({ id: "despues", status: "reversed", closedAt: "2026-08-17T16:00:00.000Z", reversedAt: "2026-08-25T16:00:00.000Z" });
    const data = createReportDataset([revertidaDespues], range, filters);
    expect(data.metrics.grossSales.value).toBe(180);
    expect(data.metrics.tickets.value).toBe(1);
    expect(data.metrics.reversals.value).toBe(0);
    expect(data.metrics.netSales.value).toBe(180);
  });

  it("una venta cerrada antes y revertida dentro resta aquí sin sumar ticket", () => {
    const cerradaAntes = order({ id: "antes", status: "reversed", closedAt: "2026-08-10T16:00:00.000Z", reversedAt: "2026-08-17T16:00:00.000Z" });
    const data = createReportDataset([cerradaAntes], range, filters);
    expect(data.metrics.grossSales.value).toBe(0);
    expect(data.metrics.tickets.value).toBe(0);
    expect(data.metrics.reversals.value).toBe(180);
    expect(data.metrics.netSales.value).toBe(-180);
  });
});
