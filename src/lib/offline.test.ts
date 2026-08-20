import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingOperation } from "../domain/types";

/**
 * Doble en memoria de la tabla `pendingOperations` de Dexie. Sólo implementa el trozo de API que
 * usa `offline.ts`: `add`, `where(campo).anyOf(...)`/`equals(...)` y sobre esa selección `sortBy`,
 * `modify` y `toArray`. Basta para ejercitar la cola completa sin IndexedDB ni navegador.
 */
function createFakeTable() {
  const rows: PendingOperation[] = [];
  const select = (field: keyof PendingOperation, values: unknown[]) => {
    const matching = () => rows.filter((row) => values.includes(row[field]));
    return {
      sortBy: async (key: keyof PendingOperation) =>
        matching().sort((a, b) => String(a[key]).localeCompare(String(b[key]))),
      toArray: async () => matching(),
      count: async () => matching().length,
      modify: async (changes: Partial<PendingOperation> | ((row: PendingOperation) => void)) => {
        const affected = matching();
        for (const row of affected) {
          if (typeof changes === "function") changes(row);
          else Object.assign(row, changes);
        }
        return affected.length;
      }
    };
  };
  return {
    rows,
    add: async (operation: PendingOperation) => { rows.push(operation); return operation.id; },
    where: (field: keyof PendingOperation) => ({
      anyOf: (...values: unknown[]) => select(field, values.flat()),
      equals: (value: unknown) => select(field, [value])
    })
  };
}

const fakeTable = createFakeTable();
const DEVICE = "11111111-1111-4111-8111-111111111111";

vi.mock("./db", () => ({
  db: { get pendingOperations() { return fakeTable; } },
  deviceId: () => DEVICE
}));

const rpc = vi.fn();
let supabaseStub: unknown = { rpc };
vi.mock("./supabase", () => ({ get supabase() { return supabaseStub; } }));

const { queueOperation, syncPendingOperations, reclaimStalledOperations } = await import("./offline");

function seed(overrides: Partial<PendingOperation> = {}): PendingOperation {
  const operation: PendingOperation = {
    id: overrides.id ?? crypto.randomUUID(),
    idempotencyKey: overrides.idempotencyKey ?? `${DEVICE}:${overrides.id ?? "seed"}`,
    deviceId: DEVICE,
    type: "upsert_order",
    entityId: "order-1",
    payload: { total: 4800 },
    createdAt: "2026-08-20T10:00:00.000Z",
    attempts: 0,
    status: "pending",
    ...overrides
  };
  fakeTable.rows.push(operation);
  return operation;
}

beforeEach(() => {
  fakeTable.rows.length = 0;
  rpc.mockReset();
  supabaseStub = { rpc };
  vi.stubGlobal("navigator", { onLine: true });
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); }
  });
});

describe("queueOperation", () => {
  it("nace pendiente, sin intentos y con una clave de idempotencia propia del dispositivo", async () => {
    const operation = await queueOperation("upsert_order", "order-1", { total: 4800 });
    expect(operation.status).toBe("pending");
    expect(operation.attempts).toBe(0);
    expect(operation.deviceId).toBe(DEVICE);
    expect(operation.idempotencyKey).toBe(`${DEVICE}:${operation.id}`);
    expect(fakeTable.rows).toHaveLength(1);
  });

  it("da una clave distinta a cada operación, para que el servidor pueda distinguirlas", async () => {
    const first = await queueOperation("upsert_order", "order-1", {});
    const second = await queueOperation("upsert_order", "order-1", {});
    expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
  });
});

describe("syncPendingOperations · camino feliz", () => {
  it("marca como enviada la operación que el servidor acepta", async () => {
    const operation = seed();
    rpc.mockResolvedValue({ data: [{ id: operation.id, status: "synced" }], error: null });

    const result = await syncPendingOperations();

    expect(result).toEqual({ synced: 1, review: 0 });
    expect(fakeTable.rows[0].status).toBe("synced");
    expect(rpc).toHaveBeenCalledWith("sync_offline_operations", { p_operations: [operation] });
  });

  it("no llama al servidor cuando no hay nada en la cola", async () => {
    const result = await syncPendingOperations();
    expect(result).toEqual({ synced: 0, review: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("envía las operaciones en orden de creación, no de inserción", async () => {
    seed({ id: "b", createdAt: "2026-08-20T10:05:00.000Z" });
    seed({ id: "a", createdAt: "2026-08-20T10:01:00.000Z" });
    rpc.mockResolvedValue({ data: [], error: null });

    await syncPendingOperations();

    const enviadas = rpc.mock.calls[0][1].p_operations as PendingOperation[];
    expect(enviadas.map((operation) => operation.id)).toEqual(["a", "b"]);
  });
});

describe("syncPendingOperations · sin servidor disponible", () => {
  it("sin conexión no toca el servidor y deja la operación intacta para reintentarla", async () => {
    seed();
    vi.stubGlobal("navigator", { onLine: false });

    const result = await syncPendingOperations();

    expect(result).toEqual({ synced: 0, review: 1 });
    expect(rpc).not.toHaveBeenCalled();
    expect(fakeTable.rows[0].status).toBe("pending");
    expect(fakeTable.rows[0].attempts).toBe(0);
  });

  it("en modo demostración (sin Supabase) la operación se queda pendiente, nunca falsamente enviada", async () => {
    seed();
    supabaseStub = null;

    const result = await syncPendingOperations();

    expect(result).toEqual({ synced: 0, review: 1 });
    expect(fakeTable.rows[0].status).toBe("pending");
  });
});

describe("syncPendingOperations · fallos y reintentos", () => {
  it("un fallo de red la deja pendiente y reintentable, contando el intento", async () => {
    seed();
    rpc.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });

    const result = await syncPendingOperations();

    expect(result).toEqual({ synced: 0, review: 1 });
    expect(fakeTable.rows[0].status).toBe("pending");
    expect(fakeTable.rows[0].attempts).toBe(1);
  });

  it("al tercer fallo la manda a «por revisar» y deja de considerarla sana", async () => {
    seed();
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    await syncPendingOperations();
    expect(fakeTable.rows[0].status).toBe("pending");
    await syncPendingOperations();
    expect(fakeTable.rows[0].status).toBe("pending");
    await syncPendingOperations();

    expect(fakeTable.rows[0].status).toBe("review_required");
    expect(fakeTable.rows[0].attempts).toBe(3);
  });

  it("la clave de idempotencia NO cambia entre reintentos: el servidor puede descartar el duplicado", async () => {
    const operation = seed();
    const claveOriginal = operation.idempotencyKey;
    rpc.mockResolvedValue({ data: null, error: { message: "timeout" } });

    await syncPendingOperations();
    await syncPendingOperations();

    const clavesEnviadas = rpc.mock.calls.map(
      (call) => (call[1].p_operations as PendingOperation[])[0].idempotencyKey
    );
    expect(clavesEnviadas).toEqual([claveOriginal, claveOriginal]);
    expect(fakeTable.rows[0].idempotencyKey).toBe(claveOriginal);
  });

  it("una operación en «por revisar» se vuelve a intentar y puede recuperarse sola", async () => {
    seed({ status: "review_required", attempts: 3 });
    rpc.mockResolvedValue({ data: [], error: null });

    const result = await syncPendingOperations();

    expect(result.synced).toBe(1);
    expect(fakeTable.rows[0].status).toBe("synced");
  });
});

describe("syncPendingOperations · insumos por su propia RPC", () => {
  it("cada conteo e insumo viaja por su RPC con la clave de idempotencia", async () => {
    const conteo = seed({ id: "c1", type: "record_inventory_count", payload: { id: "c1", countedAt: "2026-08-20T10:00:00.000Z", note: "QA", lines: [] } });
    rpc.mockResolvedValue({ data: null, error: null });

    await syncPendingOperations();

    expect(rpc).toHaveBeenCalledWith("record_inventory_count", expect.objectContaining({
      p_count_id: "c1",
      p_idempotency_key: conteo.idempotencyKey
    }));
    expect(fakeTable.rows[0].status).toBe("synced");
  });

  it("un insumo que falla no arrastra al lote de pedidos, que sí se envía", async () => {
    seed({ id: "inv", type: "record_inventory_movement", payload: { id: "inv", itemId: "i1", type: "waste", quantity: 2, note: "QA", recordedAt: "2026-08-20T10:00:00.000Z" }, createdAt: "2026-08-20T10:00:00.000Z" });
    seed({ id: "ord", createdAt: "2026-08-20T10:01:00.000Z" });
    rpc.mockImplementation(async (name: string) =>
      name === "record_inventory_movement" ? { data: null, error: { message: "no" } } : { data: [], error: null }
    );

    const result = await syncPendingOperations();

    expect(result).toEqual({ synced: 1, review: 1 });
    expect(fakeTable.rows.find((row) => row.id === "inv")?.status).toBe("pending");
    expect(fakeTable.rows.find((row) => row.id === "ord")?.status).toBe("synced");
  });
});

describe("reclaimStalledOperations · hallazgo F16-01", () => {
  it("devuelve a la cola las operaciones que quedaron atrapadas en «sincronizando»", async () => {
    seed({ id: "atrapada", status: "syncing", attempts: 1 });

    const recuperadas = await reclaimStalledOperations();

    expect(recuperadas).toBe(1);
    expect(fakeTable.rows[0].status).toBe("pending");
    expect(fakeTable.rows[0].attempts).toBe(1);
  });

  it("tras recuperarlas, la siguiente sincronización sí las envía", async () => {
    seed({ id: "atrapada", status: "syncing" });
    rpc.mockResolvedValue({ data: [], error: null });

    expect(await syncPendingOperations()).toEqual({ synced: 0, review: 0 });

    await reclaimStalledOperations();
    const result = await syncPendingOperations();

    expect(result.synced).toBe(1);
    expect(fakeTable.rows[0].status).toBe("synced");
  });

  it("no toca lo que ya está enviado ni lo que sigue pendiente", async () => {
    seed({ id: "enviada", status: "synced" });
    seed({ id: "pendiente", status: "pending" });

    expect(await reclaimStalledOperations()).toBe(0);
    expect(fakeTable.rows.find((row) => row.id === "enviada")?.status).toBe("synced");
    expect(fakeTable.rows.find((row) => row.id === "pendiente")?.status).toBe("pending");
  });
});
