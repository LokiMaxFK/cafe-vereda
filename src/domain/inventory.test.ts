import { describe, expect, it } from "vitest";
import { analysisMovementStart, analyzeRestockPattern, buildInventoryPeriods, createInventoryAnalysis, deriveStock, isInventoryVarianceAlert, movementSign } from "./inventory";
import type { InventoryItem, InventoryMovement } from "./types";

const item: InventoryItem = { id: "coffee", name: "Café", unit: "kg", minimum: 2, tolerance: 0.1, active: true };
describe("inventory analysis", () => {
  it("compares physical consumption with prepared recipe usage", () => {
    const rows = createInventoryAnalysis([item], [
      { id: "opening", countedAt: "2026-08-16T23:00:00.000Z", lines: [{ itemId: "coffee", quantity: 8 }] },
      { id: "closing", countedAt: "2026-08-17T23:00:00.000Z", lines: [{ itemId: "coffee", quantity: 6.5 }] }
    ], [
      { id: "entry", itemId: "coffee", type: "entry", quantity: 1, note: "Compra", recordedAt: "2026-08-17T12:00:00.000Z" },
      { id: "waste", itemId: "coffee", type: "waste", quantity: 0.2, note: "Merma", recordedAt: "2026-08-17T14:00:00.000Z" },
      { id: "venta", itemId: "coffee", type: "daily_consumption", quantity: 2, signedQuantity: -2, note: "Venta folio 1", recordedAt: "2026-08-17T15:00:00.000Z" }
    ], "2026-08-16T23:30:00.000Z", "2026-08-18T00:00:00.000Z");
    expect(rows[0].physical).toBeCloseTo(2.3);
    expect(rows[0].variance).toBeCloseTo(0.3);
    expect(isInventoryVarianceAlert(rows[0])).toBe(true);
  });

  it("does not infer consumption from a single baseline count", () => {
    const [row] = createInventoryAnalysis([item], [{ id: "baseline", countedAt: "2026-08-17T10:00:00.000Z", lines: [{ itemId: "coffee", quantity: 8 }] }], [], "2026-08-17T00:00:00.000Z", "2026-08-18T00:00:00.000Z");
    expect(row.physical).toBeUndefined();
  });
});

describe("insumos dados de baja en la tabla", () => {
  const inactivo: InventoryItem = { ...item, id: "descafeinado", name: "Descafeinado", active: false };
  const counts = [
    { id: "c1", countedAt: "2026-08-10T10:00:00.000Z", lines: [{ itemId: "descafeinado", quantity: 5 }] },
    { id: "c2", countedAt: "2026-08-20T10:00:00.000Z", lines: [{ itemId: "descafeinado", quantity: 4 }] }
  ];
  const venta: InventoryMovement[] = [
    { id: "m1", itemId: "descafeinado", type: "daily_consumption", quantity: 1, signedQuantity: -1, note: "Venta folio 9", recordedAt: "2026-08-15T10:00:00.000Z" }
  ];
  const START = "2026-08-01T00:00:00.000Z";
  const END = "2026-08-25T00:00:00.000Z";

  /** El disparador descuenta por receta sin mirar `active`: ese consumo no puede quedar invisible. */
  it("lo enseña si una receta lo sigue descontando", () => {
    const rows = createInventoryAnalysis([inactivo], counts, venta, START, END);
    expect(rows).toHaveLength(1);
    expect(rows[0].theoretical).toBeCloseTo(1);
  });

  it("lo oculta cuando ya no se mueve", () => {
    expect(createInventoryAnalysis([inactivo], counts, [], START, END)).toEqual([]);
  });
});

describe("ventana de descarga de movimientos", () => {
  const counts = [
    { id: "apertura", countedAt: "2026-08-01T10:00:00.000Z", lines: [{ itemId: "coffee", quantity: 9 }] },
    { id: "cierre", countedAt: "2026-08-20T10:00:00.000Z", lines: [{ itemId: "coffee", quantity: 6 }] }
  ];

  it("retrocede hasta el conteo de apertura, que es anterior al inicio del rango", () => {
    expect(analysisMovementStart([item], counts, "2026-08-10T00:00:00.000Z", "2026-08-25T00:00:00.000Z"))
      .toBe("2026-08-01T10:00:00.000Z");
  });

  it("no retrocede cuando el conteo de apertura cae dentro del rango", () => {
    expect(analysisMovementStart([item], [counts[1]], "2026-08-10T00:00:00.000Z", "2026-08-25T00:00:00.000Z"))
      .toBe("2026-08-10T00:00:00.000Z");
  });

  it("respeta el tope de antigüedad", () => {
    const antiguo = [{ id: "prehistorico", countedAt: "2024-01-01T00:00:00.000Z", lines: [{ itemId: "coffee", quantity: 1 }] }];
    expect(analysisMovementStart([item], antiguo, "2026-08-10T00:00:00.000Z", "2026-08-25T00:00:00.000Z"))
      .toBe(new Date(Date.parse("2026-08-25T00:00:00.000Z") - 365 * 86_400_000).toISOString());
  });

  /** Un dado de baja que sigue en una receta necesita su conteo de apertura como cualquier otro. */
  it("retrocede también por un insumo dado de baja", () => {
    expect(analysisMovementStart([{ ...item, active: false }], counts, "2026-08-10T00:00:00.000Z", "2026-08-25T00:00:00.000Z"))
      .toBe("2026-08-01T10:00:00.000Z");
  });
});

describe("inventory periods between counts", () => {
  const counts = [
    { id: "c1", countedAt: "2026-08-10T10:00:00.000Z", lines: [{ itemId: "coffee", quantity: 10 }] },
    { id: "c2", countedAt: "2026-08-13T10:00:00.000Z", lines: [{ itemId: "coffee", quantity: 7 }] },
    { id: "c3", countedAt: "2026-08-17T10:00:00.000Z", lines: [{ itemId: "coffee", quantity: 5 }] }
  ];
  const movements: InventoryMovement[] = [
    { id: "entry", itemId: "coffee", type: "entry", quantity: 1, note: "Compra", recordedAt: "2026-08-12T10:00:00.000Z" },
    { id: "waste", itemId: "coffee", type: "waste", quantity: 0.5, note: "Merma", recordedAt: "2026-08-15T10:00:00.000Z" }
  ];
  const AHORA = "2026-08-19T10:00:00.000Z";

  it("arma un tramo por cada par de conteos consecutivos", () => {
    const [primero, segundo] = buildInventoryPeriods("coffee", counts, movements, AHORA);
    expect(primero).toMatchObject({ startQuantity: 10, endQuantity: 7, entries: 1, waste: 0, days: 3, physical: 4 });
    expect(segundo).toMatchObject({ startQuantity: 7, endQuantity: 5, entries: 0, waste: 0.5, days: 4, physical: 1.5 });
  });

  it("cierra con el tramo en curso, desde la última lectura hasta ahora", () => {
    const periods = buildInventoryPeriods("coffee", counts, movements, AHORA);
    expect(periods).toHaveLength(3);
    const ultimo = periods[periods.length - 1];
    expect(ultimo.openEnded).toBe(true);
    expect(ultimo.startCountId).toBe("c3");
    expect(ultimo.endCountId).toBeUndefined();
    expect(ultimo.days).toBe(2);
  });

  it("no inventa un consumo físico en el tramo en curso: falta el conteo que lo cierre", () => {
    const periods = buildInventoryPeriods("coffee", counts, movements, AHORA);
    expect(periods[periods.length - 1].physical).toBeUndefined();
  });

  it("con un solo conteo enseña lo movido después, en vez de un renglón en ceros", () => {
    // El fallo original: el renglón de «línea base» iba del conteo a sí mismo —una ventana vacía— y
    // las entradas y mermas posteriores no aparecían en ninguna parte.
    const posteriores: InventoryMovement[] = [
      { id: "e", itemId: "coffee", type: "entry", quantity: 3, note: "Compra proveedor", recordedAt: "2026-08-11T10:00:00.000Z" },
      { id: "w", itemId: "coffee", type: "waste", quantity: 1, note: "Merma", recordedAt: "2026-08-12T10:00:00.000Z" }
    ];
    const periods = buildInventoryPeriods("coffee", [counts[0]], posteriores, AHORA);
    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({ startCountId: "c1", entries: 3, waste: 1, openEnded: true });
    expect(periods[0].physical).toBeUndefined();
  });

  it("no cuenta en el tramo en curso lo ocurrido antes del último conteo", () => {
    const periods = buildInventoryPeriods("coffee", counts, movements, AHORA);
    const ultimo = periods[periods.length - 1];
    expect(ultimo.entries).toBe(0);
    expect(ultimo.waste).toBe(0);
  });

  it("no devuelve nada para un insumo sin conteos", () => {
    expect(buildInventoryPeriods("coffee", [], movements, AHORA)).toEqual([]);
  });

  it("ignora los conteos que no incluyen el insumo pedido", () => {
    const mixed = [...counts, { id: "milk-only", countedAt: "2026-08-14T10:00:00.000Z", lines: [{ itemId: "milk", quantity: 5 }] }];
    expect(buildInventoryPeriods("coffee", mixed, movements, AHORA)).toHaveLength(3);
  });
});

describe("restock pattern", () => {
  it("averages interval and quantity across regular restocks", () => {
    const movements: InventoryMovement[] = [
      { id: "e1", itemId: "coffee", type: "entry", quantity: 3, note: "", recordedAt: "2026-08-01T00:00:00.000Z" },
      { id: "e2", itemId: "coffee", type: "entry", quantity: 3, note: "", recordedAt: "2026-08-04T00:00:00.000Z" },
      { id: "e3", itemId: "coffee", type: "entry", quantity: 3, note: "", recordedAt: "2026-08-07T00:00:00.000Z" }
    ];
    const pattern = analyzeRestockPattern("coffee", movements);
    expect(pattern).toEqual({ count: 3, averageIntervalDays: 3, averageQuantity: 3, lastRestockAt: "2026-08-07T00:00:00.000Z" });
  });

  it("reports zero restocks without dividing by zero", () => {
    expect(analyzeRestockPattern("coffee", [])).toEqual({ count: 0 });
  });

  it("has no interval average with a single restock", () => {
    const pattern = analyzeRestockPattern("coffee", [{ id: "e1", itemId: "coffee", type: "entry", quantity: 3, note: "", recordedAt: "2026-08-01T00:00:00.000Z" }]);
    expect(pattern.count).toBe(1);
    expect(pattern.averageQuantity).toBe(3);
    expect(pattern.averageIntervalDays).toBeUndefined();
  });
});

describe("inventory variance tolerance boundary", () => {
  // El teórico ya no se inyecta: se expresa como el consumo que dejó una venta cerrada.
  const consumo = (quantity: number): InventoryMovement =>
    ({ id: "venta", itemId: "coffee", type: "daily_consumption", quantity, signedQuantity: -quantity, note: "Venta folio 1", recordedAt: "2026-08-17T12:00:00.000Z" });
  const build = (tolerance: number, closing: number) => createInventoryAnalysis(
    [{ ...item, tolerance }],
    [
      { id: "opening", countedAt: "2026-08-16T23:00:00.000Z", lines: [{ itemId: "coffee", quantity: 10 }] },
      { id: "closing", countedAt: "2026-08-17T23:00:00.000Z", lines: [{ itemId: "coffee", quantity: closing }] }
    ],
    [], "2026-08-16T23:30:00.000Z", "2026-08-18T00:00:00.000Z"
  )[0];

  it("no alerta cuando la variación cae exactamente en el límite de la tolerancia", () => {
    const row = build(0.5, 9.5);
    expect(row.variance).toBeCloseTo(0.5);
    expect(isInventoryVarianceAlert(row)).toBe(false);
  });

  it("alerta con un decimal por encima del límite", () => {
    const row = build(0.5, 9.4);
    expect(row.variance).toBeCloseTo(0.6);
    expect(isInventoryVarianceAlert(row)).toBe(true);
  });

  it("alerta igual cuando la variación se pasa por debajo (negativa)", () => {
    const row = build(0.5, 10.6);
    expect(row.variance).toBeCloseTo(-0.6);
    expect(isInventoryVarianceAlert(row)).toBe(true);
  });

  it("un insumo sin conteos no alerta ni inventa una variación", () => {
    const [row] = createInventoryAnalysis([item], [], [consumo(3)], "2026-08-16T00:00:00.000Z", "2026-08-18T00:00:00.000Z");
    expect(row.physical).toBeUndefined();
    expect(row.variance).toBeUndefined();
    expect(isInventoryVarianceAlert(row)).toBe(false);
  });
});

describe("línea base dentro de la ventana · hallazgo F12-02", () => {
  const dentro = [
    { id: "primero", countedAt: "2026-08-17T10:00:00.000Z", lines: [{ itemId: "coffee", quantity: 10 }] },
    { id: "segundo", countedAt: "2026-08-17T20:00:00.000Z", lines: [{ itemId: "coffee", quantity: 8 }] }
  ];

  it("compara dos conteos hechos dentro del periodo, sin exigir uno anterior a la ventana", () => {
    const [row] = createInventoryAnalysis([item], dentro, [], "2026-08-17T00:00:00.000Z", "2026-08-18T00:00:00.000Z");
    expect(row.openingAt).toBe("2026-08-17T10:00:00.000Z");
    expect(row.closingAt).toBe("2026-08-17T20:00:00.000Z");
    expect(row.physical).toBeCloseTo(2);
  });

  it("cuenta las entradas y mermas ocurridas entre esos dos conteos, no las anteriores", () => {
    const movimientos: InventoryMovement[] = [
      { id: "antes", itemId: "coffee", type: "entry", quantity: 5, note: "Previa", recordedAt: "2026-08-17T09:00:00.000Z" },
      { id: "dentro", itemId: "coffee", type: "entry", quantity: 1, note: "Compra", recordedAt: "2026-08-17T15:00:00.000Z" }
    ];
    const [row] = createInventoryAnalysis([item], dentro, movimientos, "2026-08-17T00:00:00.000Z", "2026-08-18T00:00:00.000Z");
    expect(row.entries).toBe(1);
    expect(row.physical).toBeCloseTo(3);
  });

  it("sigue sin comparar cuando sólo hay un conteo dentro del periodo", () => {
    const [row] = createInventoryAnalysis([item], [dentro[0]], [], "2026-08-17T00:00:00.000Z", "2026-08-18T00:00:00.000Z");
    expect(row.physical).toBeUndefined();
  });

  it("da preferencia al conteo anterior a la ventana cuando existe", () => {
    const previo = { id: "previo", countedAt: "2026-08-16T10:00:00.000Z", lines: [{ itemId: "coffee", quantity: 20 }] };
    const [row] = createInventoryAnalysis([item], [previo, ...dentro], [], "2026-08-17T00:00:00.000Z", "2026-08-18T00:00:00.000Z");
    expect(row.openingAt).toBe("2026-08-16T10:00:00.000Z");
    expect(row.physical).toBeCloseTo(12);
  });
});

describe("movementSign", () => {
  const base = { id: "m", itemId: "coffee", quantity: 2, note: "n", recordedAt: "2026-08-17T10:00:00.000Z" };

  it("deriva el signo del tipo cuando el movimiento se capturó a mano", () => {
    expect(movementSign({ ...base, type: "entry" })).toBe(2);
    expect(movementSign({ ...base, type: "waste" })).toBe(-2);
    expect(movementSign({ ...base, type: "daily_consumption" })).toBe(-2);
    expect(movementSign({ ...base, type: "adjustment" })).toBe(2);
  });

  it("respeta el signo que mandó el servidor por encima del tipo", () => {
    expect(movementSign({ ...base, type: "daily_consumption", signedQuantity: -1.5 })).toBe(-1.5);
    expect(movementSign({ ...base, type: "entry", signedQuantity: 0 })).toBe(0);
  });
});

describe("deriveStock", () => {
  const counts = [
    { id: "viejo", countedAt: "2026-08-10T10:00:00.000Z", lines: [{ itemId: "coffee", quantity: 99 }] },
    { id: "base", countedAt: "2026-08-17T10:00:00.000Z", lines: [{ itemId: "coffee", quantity: 8 }] }
  ];
  const movement = (id: string, type: InventoryMovement["type"], quantity: number, at: string, signedQuantity?: number): InventoryMovement =>
    ({ id, itemId: "coffee", type, quantity, signedQuantity, note: "n", recordedAt: at });

  it("parte del último conteo, no del primero", () => {
    expect(deriveStock("coffee", counts, [])).toBe(8);
  });

  it("suma entradas y resta mermas y consumo posteriores al conteo", () => {
    const movements = [
      movement("e", "entry", 2, "2026-08-17T12:00:00.000Z"),
      movement("w", "waste", 0.5, "2026-08-17T13:00:00.000Z"),
      movement("v", "daily_consumption", 1.2, "2026-08-17T14:00:00.000Z", -1.2)
    ];
    expect(deriveStock("coffee", counts, movements)).toBeCloseTo(8.3);
  });

  it("ignora lo que ocurrió antes del último conteo: el conteo ya lo refleja", () => {
    const movements = [movement("previo", "entry", 5, "2026-08-15T12:00:00.000Z")];
    expect(deriveStock("coffee", counts, movements)).toBe(8);
  });

  it("devuelve el ajuste compensatorio de una venta revertida", () => {
    const movements = [
      movement("v", "daily_consumption", 1, "2026-08-17T14:00:00.000Z", -1),
      movement("r", "adjustment", 1, "2026-08-17T15:00:00.000Z", 1)
    ];
    expect(deriveStock("coffee", counts, movements)).toBe(8);
  });

  it("acumula sólo los movimientos cuando el insumo aún no tiene conteo", () => {
    const movements = [movement("e", "entry", 3, "2026-08-17T12:00:00.000Z")];
    expect(deriveStock("azucar", [], movements.map((m) => ({ ...m, itemId: "azucar" })))).toBe(3);
  });

  it("no inventa un cero para un insumo sin conteo ni movimientos", () => {
    expect(deriveStock("azucar", counts, [])).toBeUndefined();
  });

  it("no deja que el consumo por venta ensucie el físico de la tabla de análisis", () => {
    // `physical` sale de dos conteos físicos: el conteo de cierre ya refleja lo que la venta se
    // llevó, así que restar además el consumo lo contaría dos veces.
    const [row] = createInventoryAnalysis([item], counts, [
      movement("v", "daily_consumption", 1, "2026-08-15T14:00:00.000Z", -1)
    ], "2026-08-09T00:00:00.000Z", "2026-08-18T00:00:00.000Z");
    expect(row.physical).toBeCloseTo(91);
    expect(row.theoretical).toBeCloseTo(1);
    expect(row.entries).toBe(0);
    expect(row.waste).toBe(0);
  });
});

describe("filas sin segundo conteo · la ventana no puede colapsar", () => {
  const conteo = { id: "unico", countedAt: "2026-08-22T23:31:00.000Z", lines: [{ itemId: "coffee", quantity: 3 }] };
  const posteriores: InventoryMovement[] = [
    { id: "e", itemId: "coffee", type: "entry", quantity: 1, note: "Compra", recordedAt: "2026-08-24T10:00:00.000Z" },
    { id: "w", itemId: "coffee", type: "waste", quantity: 0.2, note: "Merma", recordedAt: "2026-08-25T10:00:00.000Z" },
    { id: "v", itemId: "coffee", type: "daily_consumption", quantity: 0.18, signedQuantity: -0.18, note: "Venta folio 1097", recordedAt: "2026-08-26T07:20:00.000Z" }
  ];
  const build = () => createInventoryAnalysis([item], [conteo], posteriores, "2026-07-27T00:00:00.000Z", "2026-08-26T08:00:00.000Z")[0];

  it("cuenta lo movido desde la última lectura en vez de dejar la fila en ceros", () => {
    const row = build();
    expect(row.entries).toBeCloseTo(1);
    expect(row.waste).toBeCloseTo(0.2);
    expect(row.theoretical).toBeCloseTo(0.18);
  });

  it("no inventa un consumo físico: sin segundo conteo no hay nada que medir", () => {
    const row = build();
    expect(row.physical).toBeUndefined();
    expect(row.variance).toBeUndefined();
    expect(isInventoryVarianceAlert(row)).toBe(false);
  });

  it("se marca como abierta y no finge una fecha de cierre", () => {
    const row = build();
    expect(row.openEnded).toBe(true);
    expect(row.openingAt).toBe(conteo.countedAt);
    expect(row.closingAt).toBeUndefined();
  });

  it("con dos conteos vuelve a cerrar la ventana en el segundo, sin arrastrar lo posterior", () => {
    const segundo = { id: "cierre", countedAt: "2026-08-25T23:00:00.000Z", lines: [{ itemId: "coffee", quantity: 3.6 }] };
    const [row] = createInventoryAnalysis([item], [conteo, segundo], posteriores, "2026-07-27T00:00:00.000Z", "2026-08-26T08:00:00.000Z");
    // La venta del 26 queda fuera: ocurrió después del conteo de cierre.
    expect(row.theoretical).toBe(0);
    expect(row.entries).toBeCloseTo(1);
    expect(row.waste).toBeCloseTo(0.2);
    expect(row.physical).toBeCloseTo(0.2);
    expect(row.openEnded).toBe(false);
    expect(row.closingAt).toBe(segundo.countedAt);
  });

  it("un insumo sin ningún conteo suma todo el periodo visible", () => {
    const [row] = createInventoryAnalysis([item], [], posteriores, "2026-07-27T00:00:00.000Z", "2026-08-26T08:00:00.000Z");
    expect(row.entries).toBeCloseTo(1);
    expect(row.theoretical).toBeCloseTo(0.18);
    expect(row.physical).toBeUndefined();
  });
});
