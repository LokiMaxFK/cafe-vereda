import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { categories as initialCategories, commonModifiers as initialExtras, products as initialProducts } from "../data/menu";
import { initialTables } from "../data/tables";
import { cancellableStatuses } from "../domain/order";
import { orderSubtotal, orderTotal } from "../domain/money";
import { mergeOrAddItem, type OrderItemInput } from "../domain/orderItem";
import type { AppRole, CafeTable, CatalogExtra, Category, Order, OrderItem, PaymentMethod, Product, StaffSession, SyncStatus } from "../domain/types";
import { db } from "../lib/db";
import { queueOperation, syncPendingOperations } from "../lib/offline";
import { isSupabaseConfigured, supabase, usernameToInternalEmail } from "../lib/supabase";

const now = new Date();
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
const initialExtraIds = initialExtras.map((extra) => extra.id);
const demoProducts: Product[] = initialProducts.map((product) => ({
  ...product,
  modifierIds: product.categoryId === "coffee" ? initialExtraIds : []
}));
const demoExtras: CatalogExtra[] = initialExtras.map((extra) => ({
  ...extra,
  active: true,
  productIds: demoProducts.filter((product) => product.modifierIds?.includes(extra.id)).map((product) => product.id)
}));

const sampleOrders: Order[] = [
  {
    id: "demo-table-3", folio: 1042, type: "table", tableId: "t3", status: "preparing", openedBy: "demo-manager",
    openedAt: minutesAgo(24), updatedAt: minutesAgo(3), syncStatus: "synced", payments: [], discount: 0,
    items: [
      { id: "i-1", productId: "cappuccino", name: "Cappuccino", quantity: 2, unitPrice: 90, variant: "Frío / frappé", modifiers: [], status: "dispatched", dispatchBatchId: "b-1" },
      { id: "i-2", productId: "crepa-nogal", name: "Crepa Nogal", quantity: 1, unitPrice: 95, modifiers: [], status: "dispatched", dispatchBatchId: "b-1" }
    ]
  },
  {
    id: "demo-table-6", folio: 1043, type: "table", tableId: "t6", status: "ready", openedBy: "demo-manager",
    openedAt: minutesAgo(18), updatedAt: minutesAgo(1), syncStatus: "synced", payments: [], discount: 0,
    items: [
      { id: "i-3", productId: "chilaquiles", name: "Chilaquiles", quantity: 1, unitPrice: 120, modifiers: [], status: "prepared", dispatchBatchId: "b-2" },
      { id: "i-4", productId: "americano", name: "Americano", quantity: 1, unitPrice: 55, variant: "Caliente", modifiers: [], status: "prepared", dispatchBatchId: "b-2" }
    ]
  },
  {
    id: "demo-takeaway", folio: 1044, type: "takeaway", customerName: "Mariana", status: "open", openedBy: "demo-manager",
    openedAt: minutesAgo(6), updatedAt: minutesAgo(2), syncStatus: "pending", payments: [], discount: 0,
    items: [{ id: "i-5", productId: "matcha", name: "Matcha", quantity: 1, unitPrice: 90, variant: "Frío / frappé", modifiers: [], status: "pending" }]
  }
];

interface AppContextValue {
  session: StaffSession | null;
  hydrated: boolean;
  orders: Order[];
  tables: CafeTable[];
  products: Product[];
  categories: Category[];
  extras: CatalogExtra[];
  online: boolean;
  syncStatus: SyncStatus;
  pendingCount: number;
  demoMode: boolean;
  login: (username: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  startOrder: (type: "table" | "takeaway", target?: string, items?: OrderItem[]) => Promise<Order>;
  addItem: (orderId: string, input: OrderItemInput) => Promise<void>;
  changeQuantity: (orderId: string, itemId: string, delta: number) => Promise<void>;
  cancelCommandedItem: (orderId: string, itemId: string, reason: string) => Promise<string | null>;
  dispatchPending: (orderId: string) => Promise<string | null>;
  markOrderReady: (orderId: string) => Promise<void>;
  finalizeOrder: (orderId: string) => Promise<void>;
  addPayment: (orderId: string, method: PaymentMethod, amount: number, tip: number) => Promise<void>;
  closeOrder: (orderId: string) => Promise<void>;
  setDiscount: (orderId: string, amount: number, reason: string) => Promise<void>;
  cancelOrder: (orderId: string, reason: string) => Promise<void>;
  reverseSale: (orderId: string, reason: string) => Promise<void>;
  forceSync: () => Promise<void>;
  addTable: () => Promise<CafeTable>;
  updateTable: (tableId: string, patch: Partial<Pick<CafeTable, "seats" | "shape" | "x" | "y" | "active">>) => Promise<void>;
  createProduct: (product: Omit<Product, "id">) => Promise<Product>;
  updateProduct: (productId: string, patch: Partial<Omit<Product, "id">>) => Promise<void>;
  createExtra: (extra: Omit<CatalogExtra, "id" | "active">) => Promise<CatalogExtra>;
  updateExtra: (extraId: string, patch: Partial<Omit<CatalogExtra, "id">>) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

/**
 * Primer hueco libre del croquis, para que las mesas nuevas no se apilen todas en el centro.
 * Las tolerancias aproximan el tamaño de una mesa sobre el plano (~12 % de ancho, ~24 % de alto).
 */
function nextFreeSlot(tables: CafeTable[]) {
  const taken = tables.filter((table) => table.active);
  for (let y = 12; y <= 88; y += 4) {
    for (let x = 8; x <= 88; x += 3) {
      if (!taken.some((table) => Math.abs(table.x - x) < 12 && Math.abs(table.y - y) < 24)) return { x, y };
    }
  }
  return { x: 50, y: 50 };
}

function demoIdentity(username: string): StaffSession | null {
  const normalized = username.trim().toLowerCase();
  if (["gerente", "demo", "jordan"].includes(normalized)) {
    return { id: "demo-manager", username: normalized, name: "Jordan Cruz", role: "manager", validatedAt: new Date().toISOString() };
  }
  if (["ana", "barista"].includes(normalized)) {
    return { id: "demo-barista", username: normalized, name: "Ana López", role: "barista", validatedAt: new Date().toISOString() };
  }
  return null;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<CafeTable[]>([]);
  const [products, setProducts] = useState<Product[]>(demoProducts);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [extras, setExtras] = useState<CatalogExtra[]>(demoExtras);
  const [online, setOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(navigator.onLine ? "synced" : "pending");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    Promise.all([db.orders.toArray(), db.cafeTables.toArray(), db.sessions.orderBy("validatedAt").last(), db.catalog.toArray(), db.catalogCategories.toArray(), db.catalogExtras.toArray()]).then(async ([savedOrders, savedTables, savedSession, savedProducts, savedCategories, savedExtras]) => {
      if (!savedOrders.length && !isSupabaseConfigured) {
        await db.orders.bulkPut(sampleOrders);
        setOrders(sampleOrders);
      } else setOrders(savedOrders);
      if (savedTables.length) setTables(savedTables);
      else if (!isSupabaseConfigured) {
        await db.cafeTables.bulkPut(initialTables);
        setTables(initialTables);
      }
      if (savedSession) setSession(savedSession);
      if (savedProducts.length) setProducts(savedProducts);
      else if (!isSupabaseConfigured) { await db.catalog.bulkPut(demoProducts); setProducts(demoProducts); }
      else setProducts([]);
      if (savedCategories.length) setCategories(savedCategories);
      else if (!isSupabaseConfigured) { await db.catalogCategories.bulkPut(initialCategories); setCategories(initialCategories); }
      else setCategories([]);
      if (savedExtras.length) setExtras(savedExtras);
      else if (!isSupabaseConfigured) { await db.catalogExtras.bulkPut(demoExtras); setExtras(demoExtras); }
      else setExtras([]);
      setPendingCount(await db.pendingOperations.where("status").anyOf("pending", "review_required").count());
    }).finally(() => setHydrated(true));
  }, []);

  const pullRemoteOrders = useCallback(async () => {
    if (!supabase || !navigator.onLine) return;
    const { data, error } = await supabase
      .from("orders")
      .select("*, cafe_tables(number), order_items(*), payments(*)")
      .order("updated_at", { ascending: false })
      .limit(250);
    if (error || !data) return;
    const remoteOrders: Order[] = data.map((row: Record<string, unknown>) => {
      const table = row.cafe_tables as { number?: number } | null;
      const remoteItems = (row.order_items as Array<Record<string, unknown>> | null) ?? [];
      const remotePayments = (row.payments as Array<Record<string, unknown>> | null) ?? [];
      return {
        id: String(row.id),
        folio: Number(row.folio),
        type: row.order_type as Order["type"],
        tableId: table?.number ? `t${table.number}` : undefined,
        customerName: row.customer_name ? String(row.customer_name) : undefined,
        status: row.status as Order["status"],
        discount: Number(row.discount_cents ?? 0) / 100,
        discountReason: row.discount_reason ? String(row.discount_reason) : undefined,
        cancellationReason: row.cancellation_reason ? String(row.cancellation_reason) : undefined,
        openedBy: String(row.opened_by),
        openedAt: String(row.opened_at),
        updatedAt: String(row.updated_at),
        syncStatus: "synced",
        items: remoteItems.map((item) => ({
          id: String(item.id), productId: String(item.product_id ?? ""), name: String(item.product_name), quantity: Number(item.quantity),
          unitPrice: Number(item.unit_price_cents) / 100, variant: item.variant_name ? String(item.variant_name) : undefined,
          modifiers: Array.isArray(item.modifiers) ? (item.modifiers as Array<{ id?: string; name?: string; price?: number }>).map((modifier) => ({ id: modifier.id ?? crypto.randomUUID(), name: modifier.name ?? "Extra", price: Number(modifier.price ?? 0) / 100 })) : [],
          notes: item.notes ? String(item.notes) : undefined, cancellationReason: item.cancellation_reason ? String(item.cancellation_reason) : undefined,
          status: item.status as OrderItem["status"]
        })),
        payments: remotePayments.map((payment) => ({ id: String(payment.id), method: payment.method as PaymentMethod, amount: Number(payment.amount_cents) / 100, tip: Number(payment.tip_cents) / 100, createdAt: String(payment.created_at) }))
      };
    });
    await db.orders.bulkPut(remoteOrders);
    setOrders(remoteOrders);
  }, []);

  const pullRemoteTables = useCallback(async () => {
    if (!supabase || !navigator.onLine) return;
    const { data, error } = await supabase.from("cafe_tables").select("*").order("number");
    if (error || !data) return;
    const remoteTables: CafeTable[] = data.map((row: Record<string, unknown>) => ({
      id: `t${row.number}`, number: Number(row.number), seats: Number(row.seats), shape: row.shape as CafeTable["shape"],
      x: Number(row.x), y: Number(row.y), active: Boolean(row.active)
    }));
    await db.cafeTables.bulkPut(remoteTables);
    setTables(remoteTables);
  }, []);

  const pullRemoteCatalog = useCallback(async () => {
    if (!supabase || !navigator.onLine) return;
    const [categoryResult, productResult, variantResult, extraResult, assignmentResult] = await Promise.all([
      supabase.from("categories").select("id, name").eq("active", true).order("position"),
      supabase.from("products").select("id, category_id, name, description, price_cents, available, schedule_label").eq("active", true).order("name"),
      supabase.from("product_variants").select("id, product_id, name, price_cents").eq("active", true),
      supabase.from("modifiers").select("id, name, price_cents, active").eq("active", true).order("name"),
      supabase.from("product_modifiers").select("product_id, modifier_id")
    ]);
    const error = categoryResult.error || productResult.error || variantResult.error || extraResult.error || assignmentResult.error;
    if (error) throw new Error(error.message);
    const assignments = assignmentResult.data ?? [];
    const remoteCategories: Category[] = (categoryResult.data ?? []).map((row) => ({ id: row.id, name: row.name }));
    const remoteProducts: Product[] = (productResult.data ?? []).map((row) => ({
      id: row.id,
      categoryId: row.category_id,
      name: row.name,
      description: row.description ?? undefined,
      price: Number(row.price_cents) / 100,
      available: row.available,
      schedule: row.schedule_label ?? undefined,
      variants: (variantResult.data ?? []).filter((variant) => variant.product_id === row.id).map((variant) => ({ id: variant.id, name: variant.name, price: Number(variant.price_cents) / 100 })),
      modifierIds: assignments.filter((assignment) => assignment.product_id === row.id).map((assignment) => assignment.modifier_id)
    }));
    const remoteExtras: CatalogExtra[] = (extraResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      price: Number(row.price_cents) / 100,
      active: row.active,
      productIds: assignments.filter((assignment) => assignment.modifier_id === row.id).map((assignment) => assignment.product_id)
    }));
    await Promise.all([
      db.catalog.clear().then(() => db.catalog.bulkPut(remoteProducts)),
      db.catalogCategories.clear().then(() => db.catalogCategories.bulkPut(remoteCategories)),
      db.catalogExtras.clear().then(() => db.catalogExtras.bulkPut(remoteExtras))
    ]);
    setProducts(remoteProducts);
    setCategories(remoteCategories);
    setExtras(remoteExtras);
  }, []);

  const forceSync = useCallback(async () => {
    if (!navigator.onLine) { setSyncStatus("pending"); return; }
    setSyncStatus("syncing");
    const result = await syncPendingOperations();
    if (!result.review) await pullRemoteOrders();
    await Promise.all([pullRemoteTables(), pullRemoteCatalog()]);
    const count = await db.pendingOperations.where("status").anyOf("pending", "review_required").count();
    setPendingCount(count);
    setSyncStatus(result.review > 0 ? "review_required" : "synced");
  }, [pullRemoteOrders, pullRemoteTables, pullRemoteCatalog]);

  useEffect(() => {
    const connected = () => { setOnline(true); void forceSync(); };
    const disconnected = () => { setOnline(false); setSyncStatus("pending"); };
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => { window.removeEventListener("online", connected); window.removeEventListener("offline", disconnected); };
  }, [forceSync]);

  useEffect(() => {
    if (!session || !supabase || !navigator.onLine) return;
    const client = supabase;
    void client.realtime.setAuth();
    const channel = client.channel("branch:main", { config: { private: true } });
    const refresh = () => { setSyncStatus("syncing"); void forceSync(); };
    channel.on("broadcast", { event: "INSERT" }, refresh).on("broadcast", { event: "UPDATE" }, refresh).on("broadcast", { event: "DELETE" }, refresh).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [session, online, forceSync]);

  useEffect(() => {
    if (session && isSupabaseConfigured && navigator.onLine) void forceSync();
  }, [session, forceSync]);

  const persistOrder = useCallback(async (order: Order, operation: string) => {
    const next = { ...order, updatedAt: new Date().toISOString(), syncStatus: isSupabaseConfigured && navigator.onLine ? "syncing" as const : "pending" as const };
    await db.orders.put(next);
    await queueOperation(operation, order.id, next);
    setOrders((current) => current.map((item) => item.id === order.id ? next : item));
    const count = await db.pendingOperations.where("status").anyOf("pending", "review_required").count();
    setPendingCount(count);
    if (isSupabaseConfigured && navigator.onLine) void forceSync();
  }, [forceSync]);

  const login = useCallback(async (username: string, pin: string) => {
    if (!navigator.onLine && !session) throw new Error("El primer acceso o cambio de usuario requiere conexión.");
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: usernameToInternalEmail(username), password: pin });
      if (error || !data.user) throw new Error("Usuario o PIN incorrectos.");
      const { data: profile, error: profileError } = await supabase.from("staff_profiles").select("id, username, display_name, role, active").eq("id", data.user.id).single();
      if (profileError || !profile?.active) throw new Error("Este acceso está desactivado.");
      const next: StaffSession = { id: profile.id, username: profile.username, name: profile.display_name, role: profile.role as AppRole, validatedAt: new Date().toISOString() };
      await db.sessions.clear(); await db.sessions.put(next); setSession(next);
      return;
    }
    const identity = demoIdentity(username);
    const validPin = identity?.role === "manager" ? pin === "2468" : pin === "1234";
    if (!identity || !validPin) throw new Error("Usuario o PIN incorrectos.");
    await db.sessions.clear(); await db.sessions.put(identity); setSession(identity);
  }, [session]);

  const logout = useCallback(async () => {
    if (!navigator.onLine) throw new Error("Necesitas conexión para cambiar de usuario.");
    if (supabase) await supabase.auth.signOut();
    await db.sessions.clear(); setSession(null);
  }, []);

  const startOrder = useCallback(async (type: "table" | "takeaway", target?: string, items: OrderItem[] = []) => {
    if (!session) throw new Error("Sesión requerida");
    const nextFolio = Math.max(1044, ...orders.map((order) => order.folio)) + 1;
    const order: Order = {
      id: crypto.randomUUID(), folio: nextFolio, type, status: "open", items, payments: [], discount: 0,
      openedBy: session.id, openedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), syncStatus: "pending",
      ...(type === "table" ? { tableId: target } : { customerName: target || undefined })
    };
    await db.orders.put(order); await queueOperation("create_order", order.id, order);
    setOrders((current) => [...current, order]); setPendingCount((count) => count + 1);
    if (isSupabaseConfigured && navigator.onLine) void forceSync();
    return order;
  }, [orders, session, forceSync]);

  const addItem = useCallback(async (orderId: string, input: OrderItemInput) => {
    const order = orders.find((item) => item.id === orderId); if (!order) return;
    await persistOrder({ ...order, items: mergeOrAddItem(order.items, input) }, "add_order_item");
  }, [orders, persistOrder]);

  const cancelCommandedItem = useCallback(async (orderId: string, itemId: string, reason: string) => {
    const order = orders.find((item) => item.id === orderId); if (!order || !reason.trim()) return null;
    const item = order.items.find((candidate) => candidate.id === itemId); if (!item || !["dispatched", "prepared"].includes(item.status)) return null;
    const batchId = crypto.randomUUID();
    await persistOrder({ ...order, items: order.items.map((candidate) => candidate.id === itemId ? { ...candidate, status: "cancelled", cancellationReason: reason.trim(), cancellationBatchId: batchId } : candidate) }, "cancel_dispatched_item");
    return batchId;
  }, [orders, persistOrder]);

  const changeQuantity = useCallback(async (orderId: string, itemId: string, delta: number) => {
    const order = orders.find((item) => item.id === orderId); if (!order) return;
    const current = order.items.find((item) => item.id === itemId); if (!current || current.status !== "pending") return;
    const items = current.quantity + delta <= 0 ? order.items.filter((item) => item.id !== itemId) : order.items.map((item) => item.id === itemId ? { ...item, quantity: item.quantity + delta } : item);
    await persistOrder({ ...order, items }, "update_order_item");
  }, [orders, persistOrder]);

  const dispatchPending = useCallback(async (orderId: string) => {
    const order = orders.find((item) => item.id === orderId); if (!order) return null;
    const pending = order.items.filter((item) => item.status === "pending"); if (!pending.length) return null;
    const batchId = crypto.randomUUID();
    await persistOrder({ ...order, status: "preparing", items: order.items.map((item) => item.status === "pending" ? { ...item, status: "dispatched", dispatchBatchId: batchId } : item) }, "dispatch_order_items");
    return batchId;
  }, [orders, persistOrder]);

  const markOrderReady = useCallback(async (orderId: string) => {
    const order = orders.find((item) => item.id === orderId); if (!order) return;
    await persistOrder({ ...order, status: "ready", items: order.items.map((item) => item.status === "dispatched" ? { ...item, status: "prepared" } : item) }, "mark_order_ready");
  }, [orders, persistOrder]);

  const finalizeOrder = useCallback(async (orderId: string) => {
    const order = orders.find((item) => item.id === orderId); if (!order) return;
    await persistOrder({ ...order, status: "served" }, "finalize_order");
  }, [orders, persistOrder]);

  const addPayment = useCallback(async (orderId: string, method: PaymentMethod, amount: number, tip: number) => {
    const order = orders.find((item) => item.id === orderId); if (!order || amount <= 0) return;
    await persistOrder({ ...order, payments: [...order.payments, { id: crypto.randomUUID(), method, amount, tip, createdAt: new Date().toISOString() }] }, "record_payment");
  }, [orders, persistOrder]);

  const closeOrder = useCallback(async (orderId: string) => {
    const order = orders.find((item) => item.id === orderId); if (!order || order.payments.reduce((s, p) => s + p.amount, 0) < orderTotal(order)) return;
    await persistOrder({ ...order, status: "closed" }, "close_order");
  }, [orders, persistOrder]);

  const setDiscount = useCallback(async (orderId: string, amount: number, reason: string) => {
    if (session?.role !== "manager") throw new Error("Sólo gerencia puede aplicar descuentos.");
    const order = orders.find((item) => item.id === orderId); if (!order || !reason.trim()) return;
    await persistOrder({ ...order, discount: Math.min(Math.max(0, amount), orderSubtotal(order)), discountReason: reason.trim() }, "apply_discount");
  }, [orders, persistOrder, session]);

  const cancelOrder = useCallback(async (orderId: string, reason: string) => {
    const order = orders.find((item) => item.id === orderId); if (!order || !reason.trim() || !cancellableStatuses.includes(order.status)) return;
    await persistOrder({ ...order, status: "cancelled", cancellationReason: reason.trim() }, "cancel_order");
  }, [orders, persistOrder]);

  const reverseSale = useCallback(async (orderId: string, reason: string) => {
    if (session?.role !== "manager") throw new Error("Sólo gerencia puede revertir ventas.");
    const order = orders.find((item) => item.id === orderId); if (!order || order.status !== "closed" || !reason.trim()) return;
    await persistOrder({ ...order, status: "reversed", discountReason: `Reversión: ${reason.trim()}` }, "reverse_sale");
  }, [orders, persistOrder, session]);

  const addTable = useCallback(async () => {
    if (session?.role !== "manager") throw new Error("Sólo gerencia puede editar mesas.");
    const nextNumber = Math.max(0, ...tables.map((table) => table.number)) + 1;
    const slot = nextFreeSlot(tables);
    const table: CafeTable = { id: `t${nextNumber}`, number: nextNumber, seats: 2, shape: "square", x: slot.x, y: slot.y, active: true };
    if (supabase && navigator.onLine) {
      const { error } = await supabase.from("cafe_tables").insert({ number: table.number, seats: table.seats, shape: table.shape, x: table.x, y: table.y, active: true });
      if (error) throw new Error(error.message);
    }
    await db.cafeTables.put(table);
    setTables((current) => [...current, table]);
    return table;
  }, [tables, session]);

  const updateTable = useCallback(async (tableId: string, patch: Partial<Pick<CafeTable, "seats" | "shape" | "x" | "y" | "active">>) => {
    if (session?.role !== "manager") throw new Error("Sólo gerencia puede editar mesas.");
    const table = tables.find((item) => item.id === tableId); if (!table) return;
    const next = { ...table, ...patch };
    if (supabase && navigator.onLine) {
      const { error } = await supabase.from("cafe_tables").update(patch).eq("number", table.number);
      if (error) throw new Error(error.message);
    }
    await db.cafeTables.put(next);
    setTables((current) => current.map((item) => item.id === tableId ? next : item));
  }, [tables, session]);

  const createProduct = useCallback(async (input: Omit<Product, "id">) => {
    if (session?.role !== "manager") throw new Error("Sólo gerencia puede editar el catálogo.");
    if (isSupabaseConfigured && !navigator.onLine) throw new Error("Necesitas conexión para modificar el catálogo.");
    const product: Product = { ...input, id: crypto.randomUUID(), variants: input.variants?.map((variant) => ({ ...variant, id: crypto.randomUUID() })) };
    if (supabase) {
      const { error } = await supabase.from("products").insert({
        id: product.id, category_id: product.categoryId, name: product.name, description: product.description ?? null,
        price_cents: Math.round(product.price * 100), available: product.available, schedule_label: product.schedule ?? null, active: true
      });
      if (error) throw new Error(error.message);
      if (product.variants?.length) {
        const { error: variantError } = await supabase.from("product_variants").insert(product.variants.map((variant) => ({ id: variant.id, product_id: product.id, name: variant.name, price_cents: Math.round(variant.price * 100), active: true })));
        if (variantError) throw new Error(variantError.message);
      }
      if (product.modifierIds?.length) {
        const { error: assignmentError } = await supabase.from("product_modifiers").insert(product.modifierIds.map((modifierId) => ({ product_id: product.id, modifier_id: modifierId })));
        if (assignmentError) throw new Error(assignmentError.message);
      }
    }
    await db.catalog.put(product);
    setProducts((current) => [...current, product].sort((a, b) => a.name.localeCompare(b.name, "es")));
    setExtras((current) => current.map((extra) => product.modifierIds?.includes(extra.id) ? { ...extra, productIds: [...extra.productIds, product.id] } : extra));
    await db.catalogExtras.bulkPut(extras.map((extra) => product.modifierIds?.includes(extra.id) ? { ...extra, productIds: [...extra.productIds, product.id] } : extra));
    return product;
  }, [session, extras]);

  const updateProduct = useCallback(async (productId: string, patch: Partial<Omit<Product, "id">>) => {
    if (session?.role !== "manager") throw new Error("Sólo gerencia puede editar el catálogo.");
    if (isSupabaseConfigured && !navigator.onLine) throw new Error("Necesitas conexión para modificar el catálogo.");
    const current = products.find((product) => product.id === productId);
    if (!current) throw new Error("No se encontró el producto.");
    const next: Product = { ...current, ...patch, id: productId };
    if (supabase) {
      const { error } = await supabase.from("products").update({
        category_id: next.categoryId, name: next.name, description: next.description ?? null,
        price_cents: Math.round(next.price * 100), available: next.available, schedule_label: next.schedule ?? null
      }).eq("id", productId);
      if (error) throw new Error(error.message);
      if (next.variants?.length) {
        const { error: variantError } = await supabase.from("product_variants").upsert(next.variants.map((variant) => ({ id: variant.id, product_id: productId, name: variant.name, price_cents: Math.round(variant.price * 100), active: true })));
        if (variantError) throw new Error(variantError.message);
      }
      if (patch.modifierIds) {
        const { error: clearError } = await supabase.from("product_modifiers").delete().eq("product_id", productId);
        if (clearError) throw new Error(clearError.message);
        if (next.modifierIds?.length) {
          const { error: assignmentError } = await supabase.from("product_modifiers").insert(next.modifierIds.map((modifierId) => ({ product_id: productId, modifier_id: modifierId })));
          if (assignmentError) throw new Error(assignmentError.message);
        }
      }
    }
    await db.catalog.put(next);
    const nextExtras = extras.map((extra) => next.modifierIds?.includes(extra.id)
      ? { ...extra, productIds: Array.from(new Set([...extra.productIds, productId])) }
      : { ...extra, productIds: extra.productIds.filter((id) => id !== productId) });
    await db.catalogExtras.bulkPut(nextExtras);
    setProducts((items) => items.map((product) => product.id === productId ? next : product).sort((a, b) => a.name.localeCompare(b.name, "es")));
    setExtras(nextExtras);
  }, [session, products, extras]);

  const createExtra = useCallback(async (input: Omit<CatalogExtra, "id" | "active">) => {
    if (session?.role !== "manager") throw new Error("Sólo gerencia puede editar los extras.");
    if (isSupabaseConfigured && !navigator.onLine) throw new Error("Necesitas conexión para modificar los extras.");
    const extra: CatalogExtra = { ...input, id: crypto.randomUUID(), active: true };
    if (supabase) {
      const { error } = await supabase.from("modifiers").insert({ id: extra.id, name: extra.name, price_cents: Math.round(extra.price * 100), active: true });
      if (error) throw new Error(error.message);
      if (extra.productIds.length) {
        const { error: assignmentError } = await supabase.from("product_modifiers").insert(extra.productIds.map((productId) => ({ product_id: productId, modifier_id: extra.id })));
        if (assignmentError) throw new Error(assignmentError.message);
      }
    }
    const nextProducts = products.map((product) => extra.productIds.includes(product.id) ? { ...product, modifierIds: [...(product.modifierIds ?? []), extra.id] } : product);
    await Promise.all([db.catalogExtras.put(extra), db.catalog.bulkPut(nextProducts)]);
    setExtras((current) => [...current, extra].sort((a, b) => a.name.localeCompare(b.name, "es")));
    setProducts(nextProducts);
    return extra;
  }, [session, products]);

  const updateExtra = useCallback(async (extraId: string, patch: Partial<Omit<CatalogExtra, "id">>) => {
    if (session?.role !== "manager") throw new Error("Sólo gerencia puede editar los extras.");
    if (isSupabaseConfigured && !navigator.onLine) throw new Error("Necesitas conexión para modificar los extras.");
    const current = extras.find((extra) => extra.id === extraId);
    if (!current) throw new Error("No se encontró el extra.");
    const next: CatalogExtra = { ...current, ...patch, id: extraId };
    if (supabase) {
      const { error } = await supabase.from("modifiers").update({ name: next.name, price_cents: Math.round(next.price * 100), active: next.active }).eq("id", extraId);
      if (error) throw new Error(error.message);
      if (patch.productIds) {
        const { error: clearError } = await supabase.from("product_modifiers").delete().eq("modifier_id", extraId);
        if (clearError) throw new Error(clearError.message);
        if (next.productIds.length) {
          const { error: assignmentError } = await supabase.from("product_modifiers").insert(next.productIds.map((productId) => ({ product_id: productId, modifier_id: extraId })));
          if (assignmentError) throw new Error(assignmentError.message);
        }
      }
    }
    const nextProducts = products.map((product) => next.productIds.includes(product.id)
      ? { ...product, modifierIds: Array.from(new Set([...(product.modifierIds ?? []), extraId])) }
      : { ...product, modifierIds: (product.modifierIds ?? []).filter((id) => id !== extraId) });
    await Promise.all([db.catalogExtras.put(next), db.catalog.bulkPut(nextProducts)]);
    setExtras((items) => items.map((extra) => extra.id === extraId ? next : extra).sort((a, b) => a.name.localeCompare(b.name, "es")));
    setProducts(nextProducts);
  }, [session, extras, products]);

  const value = useMemo(() => ({ session, hydrated, orders, tables, products, categories, extras, online, syncStatus, pendingCount, demoMode: !isSupabaseConfigured, login, logout, startOrder, addItem, changeQuantity, cancelCommandedItem, dispatchPending, markOrderReady, finalizeOrder, addPayment, closeOrder, setDiscount, cancelOrder, reverseSale, forceSync, addTable, updateTable, createProduct, updateProduct, createExtra, updateExtra }), [session, hydrated, orders, tables, products, categories, extras, online, syncStatus, pendingCount, login, logout, startOrder, addItem, changeQuantity, cancelCommandedItem, dispatchPending, markOrderReady, finalizeOrder, addPayment, closeOrder, setDiscount, cancelOrder, reverseSale, forceSync, addTable, updateTable, createProduct, updateProduct, createExtra, updateExtra]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook del Context, se exporta junto al Provider a propósito
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp debe usarse dentro de AppProvider");
  return context;
}
