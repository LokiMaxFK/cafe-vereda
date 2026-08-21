import { describe, expect, it } from "vitest";
import { barItemsForCancellation, deliverableItemCount, elapsedMinutes, FIRST_LOCAL_FOLIO, isCancellable, isTracked, markItemsPrepared, nextLocalFolio, orderDestination, tableStatus } from "./order";
import type { Order, OrderItem, OrderStatus } from "./types";

const allStatuses: OrderStatus[] = ["open", "preparing", "ready", "served", "closed", "cancelled", "reversed"];

describe("order tracking", () => {
  it("tracks exactly the statuses that still occupy the floor", () => {
    expect(allStatuses.filter((status) => isTracked({ status } as Order))).toEqual(["open", "preparing", "ready", "served"]);
  });

  it("allows cancelling every live status and refuses settled ones", () => {
    expect(allStatuses.filter((status) => isCancellable({ status }))).toEqual(["open", "preparing", "ready", "served"]);
    expect(isCancellable({ status: "closed" })).toBe(false);
    expect(isCancellable({ status: "reversed" })).toBe(false);
  });
});

describe("tableStatus", () => {
  it("reports a free table when nothing is open on it", () => {
    expect(tableStatus(undefined)).toBe("free");
  });

  it("maps a served order to billing so the floor plan shows it as ready to charge", () => {
    expect(tableStatus({ status: "served" })).toBe("billing");
  });

  it("maps the kitchen statuses one to one", () => {
    expect(tableStatus({ status: "ready" })).toBe("ready");
    expect(tableStatus({ status: "preparing" })).toBe("preparing");
    expect(tableStatus({ status: "open" })).toBe("open");
  });
});

describe("orderDestination", () => {
  it("names the table for dine-in orders", () => {
    expect(orderDestination({ type: "table", tableId: "t12" })).toBe("Mesa 12");
  });

  it("prefers the customer name for takeaway and falls back when it is missing", () => {
    expect(orderDestination({ type: "takeaway", customerName: "Mariana" })).toBe("Mariana");
    expect(orderDestination({ type: "takeaway" })).toBe("Para llevar");
    expect(orderDestination({ type: "takeaway", customerName: "" })).toBe("Para llevar");
  });
});

describe("elapsedMinutes", () => {
  const opened = "2026-08-18T10:00:00.000Z";

  it("rounds to whole minutes", () => {
    expect(elapsedMinutes(opened, Date.parse("2026-08-18T10:24:00.000Z"))).toBe(24);
    expect(elapsedMinutes(opened, Date.parse("2026-08-18T10:24:40.000Z"))).toBe(25);
  });

  it("never reports less than a minute, so a fresh order still shows a wait", () => {
    expect(elapsedMinutes(opened, Date.parse("2026-08-18T10:00:01.000Z"))).toBe(1);
  });

  it("never goes negative when a device clock runs behind", () => {
    expect(elapsedMinutes(opened, Date.parse("2026-08-18T09:30:00.000Z"))).toBe(1);
  });
});

describe("nextLocalFolio", () => {
  it("arranca en el primer folio local cuando el dispositivo no conoce ningún pedido", () => {
    expect(nextLocalFolio([])).toBe(FIRST_LOCAL_FOLIO);
  });

  it("toma el folio más alto aunque la lista venga desordenada", () => {
    expect(nextLocalFolio([1050, 1047, 1063, 1052])).toBe(1064);
  });

  it("nunca retrocede por debajo del primer folio local", () => {
    expect(nextLocalFolio([12, 3, 7])).toBe(FIRST_LOCAL_FOLIO);
  });

  it("es monótona: cada folio asignado es mayor que todos los conocidos", () => {
    const folios = [1045];
    for (let step = 0; step < 5; step += 1) {
      const next = nextLocalFolio(folios);
      expect(next).toBeGreaterThan(Math.max(...folios));
      folios.push(next);
    }
    expect(folios).toEqual([1045, 1046, 1047, 1048, 1049, 1050]);
  });

  it("ignora folios no numéricos en vez de devolver NaN", () => {
    // Un solo pedido sin folio bastaba para que Math.max devolviera NaN y el pedido naciera sin folio.
    expect(nextLocalFolio([1050, NaN, 1048])).toBe(1051);
    expect(nextLocalFolio([undefined as unknown as number, 1060])).toBe(1061);
    expect(nextLocalFolio([NaN])).toBe(FIRST_LOCAL_FOLIO);
  });
});

describe("deliverableItemCount", () => {
  const line = (status: OrderItem["status"]) => ({ status });

  it("cuenta lo que la barra sí va a entregar", () => {
    expect(deliverableItemCount([line("prepared"), line("dispatched")])).toBe(2);
  });

  it("no cuenta los renglones cancelados, que no salen en la charola", () => {
    expect(deliverableItemCount([line("prepared"), line("cancelled"), line("prepared")])).toBe(2);
  });

  it("no cuenta lo que todavía no se ha enviado a la barra", () => {
    expect(deliverableItemCount([line("prepared"), line("pending")])).toBe(1);
  });

  it("devuelve cero cuando no queda nada entregable", () => {
    expect(deliverableItemCount([line("cancelled"), line("pending")])).toBe(0);
    expect(deliverableItemCount([])).toBe(0);
  });
});

describe("markItemsPrepared", () => {
  const line = (id: string, status: OrderItem["status"]) => ({ id, status });

  it("convierte a preparado sólo lo que ya salió a la barra", () => {
    const items = [line("a", "dispatched"), line("b", "dispatched")];
    expect(markItemsPrepared(items).map((item) => item.status)).toEqual(["prepared", "prepared"]);
  });

  it("deja intactas las líneas pendientes: la barra nunca las recibió", () => {
    const items = [line("a", "dispatched"), line("b", "pending")];
    expect(markItemsPrepared(items)).toEqual([line("a", "prepared"), line("b", "pending")]);
  });

  it("no revive una línea cancelada", () => {
    const items = [line("a", "cancelled"), line("b", "dispatched")];
    expect(markItemsPrepared(items)).toEqual([line("a", "cancelled"), line("b", "prepared")]);
  });

  it("es idempotente: marcar listo dos veces no cambia nada", () => {
    const once = markItemsPrepared([line("a", "dispatched"), line("b", "pending")]);
    expect(markItemsPrepared(once)).toEqual(once);
  });

  it("no muta el arreglo recibido", () => {
    const items = [line("a", "dispatched")];
    markItemsPrepared(items);
    expect(items[0].status).toBe("dispatched");
  });
});

describe("tableStatus con estados ya liquidados", () => {
  // El salón nunca le pasa estos estados porque filtra antes con `isTracked`. Se prueba el par
  // completo para dejar claro cuál de las dos piezas es la que libera la mesa.
  it("isTracked excluye las cuentas cerradas, canceladas y revertidas", () => {
    const settled: OrderStatus[] = ["closed", "cancelled", "reversed"];
    for (const status of settled) expect(isTracked({ status } as Order)).toBe(false);
  });

  it("una mesa sin pedido rastreado queda libre", () => {
    const settled: OrderStatus[] = ["closed", "cancelled", "reversed"];
    for (const status of settled) {
      const order = { status } as Order;
      // Así es como lo hace el salón: primero filtra, y sólo lo que sobrevive pinta la mesa.
      const tracked = [order].filter(isTracked);
      expect(tableStatus(tracked[0])).toBe("free");
    }
  });
});

// F08-05: al cancelar una cuenta entera hay que avisar en papel de lo que ya está en la barra, y la
// regla no puede depender de desde qué pantalla se cancele.
describe("aviso a la barra al cancelar una cuenta", () => {
  const renglon = (id: string, status: OrderItem["status"]): OrderItem =>
    ({ id, productId: "cafe", name: "Café", quantity: 1, unitPrice: 50, modifiers: [], status });

  it("avisa de lo despachado y de lo ya preparado, que es lo que ocupa a la cocina", () => {
    const avisados = barItemsForCancellation([renglon("a", "dispatched"), renglon("b", "prepared")], "El cliente se fue");
    expect(avisados.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("no avisa de lo que la barra nunca vio ni de lo ya cancelado", () => {
    const avisados = barItemsForCancellation([renglon("a", "pending"), renglon("b", "cancelled")], "El cliente se fue");
    expect(avisados).toEqual([]);
  });

  it("estampa el motivo en cada renglón, para que salga impreso en la comanda", () => {
    const avisados = barItemsForCancellation([renglon("a", "dispatched")], "  El cliente se fue  ");
    expect(avisados[0].cancellationReason).toBe("El cliente se fue");
  });

  it("no toca los renglones originales", () => {
    const originales = [renglon("a", "dispatched")];
    barItemsForCancellation(originales, "El cliente se fue");
    expect(originales[0].cancellationReason).toBeUndefined();
  });

  it("devuelve vacío cuando no hay nada en la barra, para no imprimir papel de más", () => {
    expect(barItemsForCancellation([], "El cliente se fue")).toEqual([]);
  });
});

