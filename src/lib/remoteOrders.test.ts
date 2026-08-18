import { describe, expect, it } from "vitest";
import { batchIdOfType, mapRemoteOrder, mapRemoteOrderItem, REMOTE_ORDER_SELECT } from "./remoteOrders";

const COMMAND_BATCH = "eeeeeeee-1111-4111-8111-eeeeeeeeeeee";
const CANCEL_BATCH = "ffffffff-1111-4111-8111-ffffffffffff";

// Forma exacta que devuelve PostgREST para el select de REMOTE_ORDER_SELECT.
const itemRow = (overrides: Record<string, unknown> = {}) => ({
  id: "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb",
  product_id: null,
  product_name: "Cappuccino",
  variant_name: null,
  quantity: 2,
  unit_price_cents: 9000,
  modifiers: [],
  notes: null,
  cancellation_reason: null,
  status: "prepared",
  dispatch_batch_items: [{ batch_id: COMMAND_BATCH, dispatch_batches: { batch_type: "command" } }],
  ...overrides
});

describe("batchIdOfType", () => {
  it("trata un lote sin batch_type explícito como comanda, igual que el default de la columna", () => {
    expect(batchIdOfType([{ batch_id: COMMAND_BATCH, dispatch_batches: null }], "command")).toBe(COMMAND_BATCH);
  });

  it("separa el lote de comanda del de cancelación", () => {
    const links = [
      { batch_id: COMMAND_BATCH, dispatch_batches: { batch_type: "command" } },
      { batch_id: CANCEL_BATCH, dispatch_batches: { batch_type: "cancellation" } }
    ];
    expect(batchIdOfType(links, "command")).toBe(COMMAND_BATCH);
    expect(batchIdOfType(links, "cancellation")).toBe(CANCEL_BATCH);
  });

  it("no inventa un lote cuando no hay ninguno", () => {
    expect(batchIdOfType([], "command")).toBeUndefined();
    expect(batchIdOfType(null, "cancellation")).toBeUndefined();
    expect(batchIdOfType(undefined, "command")).toBeUndefined();
  });
});

describe("mapRemoteOrderItem", () => {
  it("conserva el lote de comanda al sincronizar, para que se pueda reimprimir la copia", () => {
    expect(mapRemoteOrderItem(itemRow()).dispatchBatchId).toBe(COMMAND_BATCH);
  });

  it("conserva el lote de cancelación de un artículo cancelado", () => {
    const cancelled = mapRemoteOrderItem(itemRow({
      status: "cancelled",
      cancellation_reason: "Error de captura",
      dispatch_batch_items: [
        { batch_id: COMMAND_BATCH, dispatch_batches: { batch_type: "command" } },
        { batch_id: CANCEL_BATCH, dispatch_batches: { batch_type: "cancellation" } }
      ]
    }));
    expect(cancelled.dispatchBatchId).toBe(COMMAND_BATCH);
    expect(cancelled.cancellationBatchId).toBe(CANCEL_BATCH);
    expect(cancelled.cancellationReason).toBe("Error de captura");
  });

  it("convierte centavos a pesos en el precio unitario y en los extras", () => {
    const item = mapRemoteOrderItem(itemRow({ unit_price_cents: 9050, modifiers: [{ id: "shot", name: "Carga extra", price: 1500 }] }));
    expect(item.unitPrice).toBe(90.5);
    expect(item.modifiers[0].price).toBe(15);
  });

  it("normaliza los nulos de Postgres a undefined en vez de la cadena \"null\"", () => {
    const item = mapRemoteOrderItem(itemRow());
    expect(item.variant).toBeUndefined();
    expect(item.notes).toBeUndefined();
    expect(item.cancellationReason).toBeUndefined();
    expect(item.productId).toBe("");
  });

  it("tolera un modifiers no-arreglo sin romper la sincronización", () => {
    expect(mapRemoteOrderItem(itemRow({ modifiers: null })).modifiers).toEqual([]);
  });
});

describe("mapRemoteOrder", () => {
  const row = {
    id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
    folio: 1033,
    order_type: "table",
    customer_name: null,
    status: "closed",
    discount_cents: 0,
    discount_reason: null,
    cancellation_reason: null,
    opened_by: "11111111-1111-4111-8111-111111111111",
    opened_at: "2026-08-18T10:00:00Z",
    updated_at: "2026-08-18T10:06:00Z",
    cafe_tables: { number: 7 },
    order_items: [itemRow()],
    payments: [{ id: "cccccccc-1111-4111-8111-cccccccccccc", method: "cash", amount_cents: 18000, tip_cents: 0, created_at: "2026-08-18T10:05:00Z" }]
  };

  it("reconstruye el identificador local de mesa a partir del número", () => {
    expect(mapRemoteOrder(row).tableId).toBe("t7");
  });

  it("deja tableId vacío en una orden para llevar", () => {
    const takeaway = mapRemoteOrder({ ...row, order_type: "takeaway", cafe_tables: null, customer_name: "Mariana" });
    expect(takeaway.tableId).toBeUndefined();
    expect(takeaway.customerName).toBe("Mariana");
  });

  it("marca como sincronizado lo que viene del servidor", () => {
    expect(mapRemoteOrder(row).syncStatus).toBe("synced");
  });

  it("convierte importes y propinas de centavos a pesos", () => {
    const order = mapRemoteOrder({ ...row, discount_cents: 1050, discount_reason: "Cortesía", payments: [{ ...row.payments[0], tip_cents: 2000 }] });
    expect(order.discount).toBe(10.5);
    expect(order.payments[0].amount).toBe(180);
    expect(order.payments[0].tip).toBe(20);
  });

  it("sobrevive a una orden sin renglones ni pagos", () => {
    const empty = mapRemoteOrder({ ...row, order_items: null, payments: null });
    expect(empty.items).toEqual([]);
    expect(empty.payments).toEqual([]);
  });

  it("pide explícitamente los lotes en el select, que es de donde salen", () => {
    expect(REMOTE_ORDER_SELECT).toContain("dispatch_batch_items(batch_id, dispatch_batches(batch_type))");
  });
});
