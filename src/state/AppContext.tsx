import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { categories as initialCategories, commonModifiers as initialExtras, products as initialProducts } from "../data/menu";
import { initialTables } from "../data/tables";
import { CASH_SESSION_REQUIRED_MESSAGE, canTakeOrders } from "../domain/cash";
import { productImageError, sortCategories } from "../domain/catalog";
import { cancellableStatuses, isAbandonedDraft, isChargeable, isClosable, isEmptyDraft, isFinalizable, markItemsPrepared, nextLocalFolio } from "../domain/order";
import { nextFreeSlot } from "../domain/tables";
import { applyPaymentCap, orderSubtotal, orderTotal, paidTotal, roundToCents } from "../domain/money";
import { cancelItemUnits, mergeOrAddItem, type OrderItemInput } from "../domain/orderItem";
import { assignUnits, createSubaccounts, hasSubaccountPayments, pruneShares, subaccountBalance, subaccountTotal } from "../domain/splitBill";
import type { AppRole, CafeTable, CashSession, CatalogExtra, Category, Order, OrderItem, PaymentMethod, Product, SplitMode, StaffSession, SyncStatus } from "../domain/types";
import { fetchOpenCashSession } from "../lib/cashSessions";
import { db } from "../lib/db";
import { queueOperation, reclaimStalledOperations, syncPendingOperations } from "../lib/offline";
import { mapRemoteOrder, REMOTE_ORDER_SELECT } from "../lib/remoteOrders";
import { isSupabaseConfigured, supabase, usernameToInternalEmail } from "../lib/supabase";

const now = new Date();
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
const demoProducts: Product[] = initialProducts.map((product) => ({ ...product, seasonal: false }));
const demoExtras: CatalogExtra[] = initialExtras.map((extra) => ({ ...extra, active: true }));

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
  },
  {
    id: "demo-closed-1", folio: 1041, type: "takeaway", customerName: "Luis", status: "closed", openedBy: "demo-manager",
    openedAt: minutesAgo(160), updatedAt: minutesAgo(120), syncStatus: "synced", discount: 10,
    items: [
      { id: "i-6", productId: "latte", name: "Latte", quantity: 2, unitPrice: 75, modifiers: [], status: "prepared" },
      { id: "i-7", productId: "croissant", name: "Croissant", quantity: 1, unitPrice: 48, modifiers: [], status: "prepared" }
    ],
    payments: [{ id: "p-1", method: "card", amount: 188, tip: 20, createdAt: minutesAgo(121) }]
  },
  {
    id: "demo-closed-2", folio: 1040, type: "table", tableId: "t2", status: "closed", openedBy: "demo-barista",
    openedAt: minutesAgo(250), updatedAt: minutesAgo(205), syncStatus: "synced", discount: 0,
    items: [
      { id: "i-8", productId: "americano", name: "Americano", quantity: 2, unitPrice: 55, modifiers: [], status: "prepared" },
      { id: "i-9", productId: "panini", name: "Panini", quantity: 1, unitPrice: 110, modifiers: [], status: "prepared" }
    ],
    payments: [{ id: "p-2", method: "cash", amount: 120, tip: 0, createdAt: minutesAgo(206) }, { id: "p-3", method: "transfer", amount: 100, tip: 0, createdAt: minutesAgo(205) }]
  },
  {
    id: "demo-reversed", folio: 1039, type: "takeaway", customerName: "Rosa", status: "reversed", openedBy: "demo-manager",
    openedAt: minutesAgo(420), updatedAt: minutesAgo(65), syncStatus: "synced", discount: 0,
    items: [{ id: "i-10", productId: "cappuccino", name: "Cappuccino", quantity: 1, unitPrice: 90, modifiers: [], status: "prepared" }],
    payments: [{ id: "p-4", method: "cash", amount: 90, tip: 10, createdAt: minutesAgo(300) }]
  },
  {
    id: "demo-cancelled", folio: 1038, type: "table", tableId: "t4", status: "cancelled", openedBy: "demo-barista",
    openedAt: minutesAgo(100), updatedAt: minutesAgo(50), syncStatus: "synced", discount: 0,
    items: [{ id: "i-11", productId: "matcha", name: "Matcha", quantity: 1, unitPrice: 90, modifiers: [], status: "cancelled", cancellationReason: "Error de captura" }],
    payments: []
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
  /** Turno de caja abierto, o `null` si no hay ninguno. */
  cashSession: CashSession | null;
  /** El modo demo no tiene tabla de turnos, así que ahí la caja no condiciona los pedidos. */
  cashSessionRequired: boolean;
  canTakeOrders: boolean;
  refreshCashSession: () => Promise<void>;
  login: (username: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  startOrder: (type: "table" | "takeaway", target?: string, items?: OrderItem[]) => Promise<Order>;
  addItem: (orderId: string, input: OrderItemInput) => Promise<void>;
  changeQuantity: (orderId: string, itemId: string, delta: number) => Promise<void>;
  cancelCommandedItem: (orderId: string, itemId: string, reason: string, quantity?: number) => Promise<{ batchId: string; item: OrderItem } | null>;
  dispatchPending: (orderId: string) => Promise<string | null>;
  markOrderReady: (orderId: string) => Promise<void>;
  finalizeOrder: (orderId: string) => Promise<void>;
  addPayment: (orderId: string, method: PaymentMethod, amount: number, tip: number, subaccountId?: string) => Promise<void>;
  splitOrder: (orderId: string, mode: SplitMode, people: number) => Promise<void>;
  renameSubaccount: (orderId: string, subaccountId: string, label: string) => Promise<void>;
  assignItemUnits: (orderId: string, itemId: string, subaccountId: string, units: number) => Promise<void>;
  reassignItemUnits: (orderId: string, itemId: string, fromId: string, toId: string, units: number, reason: string) => Promise<void>;
  clearSplit: (orderId: string) => Promise<void>;
  closeOrder: (orderId: string) => Promise<void>;
  setDiscount: (orderId: string, amount: number, reason: string) => Promise<void>;
  cancelOrder: (orderId: string, reason: string) => Promise<void>;
  reverseSale: (orderId: string, reason: string) => Promise<void>;
  forceSync: () => Promise<void>;
  addTable: () => Promise<CafeTable>;
  updateTable: (tableId: string, patch: Partial<Pick<CafeTable, "seats" | "shape" | "x" | "y" | "active">>) => Promise<void>;
  createProduct: (product: Omit<Product, "id">) => Promise<Product>;
  updateProduct: (productId: string, patch: Partial<Omit<Product, "id">>) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  createExtra: (extra: Omit<CatalogExtra, "id" | "active">) => Promise<CatalogExtra>;
  updateExtra: (extraId: string, patch: Partial<Omit<CatalogExtra, "id">>) => Promise<void>;
  deleteExtra: (extraId: string) => Promise<void>;
  createCategory: (name: string) => Promise<Category>;
  updateCategory: (categoryId: string, name: string) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;
  uploadProductImage: (file: File) => Promise<string>;
}

const AppContext = createContext<AppContextValue | null>(null);

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
  const [cashSession, setCashSession] = useState<CashSession | null>(null);

  useEffect(() => {
    Promise.all([db.orders.toArray(), db.cafeTables.toArray(), db.sessions.orderBy("validatedAt").last(), db.catalog.toArray(), db.catalogCategories.toArray(), db.catalogExtras.toArray(), db.cashSessions.toArray()]).then(async ([savedOrders, savedTables, savedSession, savedProducts, savedCategories, savedExtras, savedCashSessions]) => {
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
      if (savedCategories.length) setCategories(sortCategories(savedCategories));
      else if (!isSupabaseConfigured) { await db.catalogCategories.bulkPut(initialCategories); setCategories(sortCategories(initialCategories)); }
      else setCategories([]);
      if (savedExtras.length) setExtras(savedExtras);
      else if (!isSupabaseConfigured) { await db.catalogExtras.bulkPut(demoExtras); setExtras(demoExtras); }
      else setExtras([]);
      // El turno cacheado es la única referencia hasta que llegue el primer sync: sin él, un
      // arranque sin conexión bloquearía los pedidos aunque la caja esté abierta.
      setCashSession(savedCashSessions.find((cash) => !cash.closedAt) ?? null);
      await reclaimStalledOperations();
      setPendingCount(await db.pendingOperations.where("status").anyOf("pending", "review_required").count());
    }).finally(() => setHydrated(true));
  }, []);

  const pullRemoteOrders = useCallback(async () => {
    if (!supabase || !navigator.onLine) return;
    const { data, error } = await supabase
      .from("orders")
      .select(REMOTE_ORDER_SELECT)
      .order("updated_at", { ascending: false })
      .limit(250);
    if (error || !data) return;
    const remoteOrders: Order[] = data.map((row) => mapRemoteOrder(row as Record<string, unknown>));
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
    const [categoryResult, productResult, variantResult, extraResult] = await Promise.all([
      supabase.from("categories").select("id, name, position").eq("active", true).order("position"),
      supabase.from("products").select("id, category_id, name, description, price_cents, available, seasonal, image_url").eq("active", true).order("name"),
      supabase.from("product_variants").select("id, product_id, name, price_cents").eq("active", true),
      supabase.from("modifiers").select("id, name, price_cents, active").eq("active", true).order("name")
    ]);
    const error = categoryResult.error || productResult.error || variantResult.error || extraResult.error;
    if (error) throw new Error(error.message);
    const remoteCategories: Category[] = sortCategories((categoryResult.data ?? []).map((row, index) => ({ id: row.id, name: row.name, position: Number.isFinite(Number(row.position)) ? Number(row.position) : index })));
    const remoteProducts: Product[] = (productResult.data ?? []).map((row) => ({
      id: row.id,
      categoryId: row.category_id,
      name: row.name,
      description: row.description ?? undefined,
      price: Number(row.price_cents) / 100,
      available: row.available,
      seasonal: row.seasonal,
      imageUrl: row.image_url ?? undefined,
      variants: (variantResult.data ?? []).filter((variant) => variant.product_id === row.id).map((variant) => ({ id: variant.id, name: variant.name, price: Number(variant.price_cents) / 100 }))
    }));
    const remoteExtras: CatalogExtra[] = (extraResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      price: Number(row.price_cents) / 100,
      active: row.active
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

  /**
   * Refresca el turno de caja y lo cachea. Un fallo de red deja intacta la copia local: dar
   * por cerrada la caja por un error de conexión pararía el servicio entero.
   */
  const refreshCashSession = useCallback(async () => {
    const remote = await fetchOpenCashSession();
    if (remote === undefined) return;
    await db.cashSessions.clear();
    if (remote) await db.cashSessions.put(remote);
    setCashSession(remote);
  }, []);

  const forceSync = useCallback(async () => {
    if (!navigator.onLine) { setSyncStatus("pending"); return; }
    setSyncStatus("syncing");
    const result = await syncPendingOperations();
    if (!result.review) await pullRemoteOrders();
    await Promise.all([pullRemoteTables(), pullRemoteCatalog(), refreshCashSession()]);
    const count = await db.pendingOperations.where("status").anyOf("pending", "review_required").count();
    setPendingCount(count);
    setSyncStatus(result.review > 0 ? "review_required" : "synced");
  }, [pullRemoteOrders, pullRemoteTables, pullRemoteCatalog, refreshCashSession]);

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

  /**
   * `extra` son datos que sólo tienen sentido para el servidor en esa operación concreta —el motivo
   * de una reasignación, por ejemplo—. Viajan en el payload pero no se guardan en la orden: si
   * entraran en Dexie se quedarían pegados al siguiente cambio, atribuyéndole un motivo ajeno.
   */
  /**
   * La sesión que se restaura de Dexie dice quién usaba esta estación, no que el acceso al servidor
   * siga vivo. El JWT de Supabase caduca por su cuenta, y cuando eso pasaba la aplicación seguía
   * enseñando la pantalla de alguien con sesión iniciada mientras cada llamada viajaba como
   * anónima. El primer tropiezo era abrir la caja —`anon` tiene revocado el EXECUTE de los RPC de
   * caja—, así que el barista recibía «permission denied for function open_cash_session» con la
   * fila esperando, y con la caja obligatoria eso deja el punto de venta entero sin poder vender.
   *
   * Sin conexión no se toca nada: ahí la sesión guardada es justo lo que sostiene el turno. Y un
   * error de red tampoco expulsa a nadie; sólo se cierra cuando el servidor dice que no hay sesión.
   */
  useEffect(() => {
    if (!hydrated || !session || !supabase || !navigator.onLine) return;
    let cancelled = false;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled || error) return;
      if (!data.session) void db.sessions.clear().then(() => setSession(null));
    });
    return () => { cancelled = true; };
  }, [hydrated, session]);

  /** Si Supabase cierra la sesión por su cuenta, la estación vuelve al acceso en vez de fingir. */
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") void db.sessions.clear().then(() => setSession(null));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const persistOrder = useCallback(async (order: Order, operation: string, extra?: Record<string, unknown>) => {
    const next = { ...order, updatedAt: new Date().toISOString(), syncStatus: isSupabaseConfigured && navigator.onLine ? "syncing" as const : "pending" as const };
    await db.orders.put(next);
    await queueOperation(operation, order.id, extra ? { ...next, ...extra } : next);
    setOrders((current) => current.map((item) => item.id === order.id ? next : item));
    const count = await db.pendingOperations.where("status").anyOf("pending", "review_required").count();
    setPendingCount(count);
    if (isSupabaseConfigured && navigator.onLine) void forceSync();
  }, [forceSync]);

  /**
   * Cancela los borradores vacíos que quedaron colgando de una mesa. El salón antiguo abría la
   * cuenta con sólo tocar la mesa, así que las instalaciones viejas arrastran varias de estas:
   * aparecen como «cuenta abierta» sin un solo producto y bloquean la mesa para siempre. Se limpian
   * una vez por id —el ref evita reencolar la cancelación mientras el sync la procesa—.
   */
  const cleanedDrafts = useRef(new Set<string>());
  useEffect(() => {
    if (!hydrated || !session) return;
    const abandoned = orders.filter((order) => isAbandonedDraft(order) && !cleanedDrafts.current.has(order.id));
    if (!abandoned.length) return;
    abandoned.forEach((order) => cleanedDrafts.current.add(order.id));
    void (async () => {
      for (const order of abandoned) {
        await persistOrder({ ...order, status: "cancelled", cancellationReason: "Cuenta vacía sin actividad" }, "cancel_order");
      }
    })();
  }, [hydrated, session, orders, persistOrder]);

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

  /**
   * El folio se reserva de la secuencia del servidor para que el número impreso en la comanda
   * sea ya el definitivo. Sin conexión se usa un consecutivo local provisional: el servidor lo
   * respeta si sigue libre al sincronizar y, si no, le asigna uno de la secuencia.
   */
  const reserveFolio = useCallback(async () => {
    const localFolio = nextLocalFolio(orders.map((order) => order.folio));
    if (!supabase || !navigator.onLine) return localFolio;
    const { data, error } = await supabase.rpc("next_order_folio");
    return error || data == null ? localFolio : Number(data);
  }, [orders]);

  const cashSessionRequired = isSupabaseConfigured;
  const ordersAllowed = canTakeOrders({ required: cashSessionRequired, session: cashSession });

  const startOrder = useCallback(async (type: "table" | "takeaway", target?: string, items: OrderItem[] = []) => {
    if (!session) throw new Error("Sesión requerida");
    // Última barrera del candado de caja: la UI lo bloquea antes, pero un pedido creado por
    // una ruta directa seguiría dejando cobros fuera de todo arqueo.
    if (!ordersAllowed) throw new Error(CASH_SESSION_REQUIRED_MESSAGE);
    const nextFolio = await reserveFolio();
    const order: Order = {
      id: crypto.randomUUID(), folio: nextFolio, type, status: "open", items, payments: [], discount: 0,
      openedBy: session.id, openedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), syncStatus: "pending",
      ...(type === "table" ? { tableId: target } : { customerName: target || undefined })
    };
    await db.orders.put(order); await queueOperation("create_order", order.id, order);
    setOrders((current) => [...current, order]); setPendingCount((count) => count + 1);
    if (isSupabaseConfigured && navigator.onLine) void forceSync();
    return order;
  }, [reserveFolio, session, forceSync, ordersAllowed]);

  const addItem = useCallback(async (orderId: string, input: OrderItemInput) => {
    const order = orders.find((item) => item.id === orderId); if (!order) return;
    await persistOrder({ ...order, items: mergeOrAddItem(order.items, input) }, "add_order_item");
  }, [orders, persistOrder]);

  const cancelCommandedItem = useCallback(async (orderId: string, itemId: string, reason: string, quantity?: number) => {
    const order = orders.find((item) => item.id === orderId); if (!order) return null;
    const target = order.items.find((candidate) => candidate.id === itemId); if (!target) return null;
    const batchId = crypto.randomUUID();
    const result = cancelItemUnits(order.items, itemId, quantity ?? target.quantity, reason, batchId, crypto.randomUUID());
    if (!result) return null;
    // Cancelar parte de un renglón lo encoge sin tocar el reparto, y las participaciones se quedaban
    // reclamando unidades que ya no existen: la suma de las subcuentas superaba el total y la cuenta
    // no podía cerrarse. Las unidades que quedan libres vuelven a «sin asignar», que es lo que la
    // pantalla ya sabe pedir.
    await persistOrder({ ...order, items: result.items, ...(order.itemShares?.length ? { itemShares: pruneShares(result.items, order.itemShares) } : {}) }, "cancel_dispatched_item");
    return { batchId, item: result.cancelled };
  }, [orders, persistOrder]);

  const changeQuantity = useCallback(async (orderId: string, itemId: string, delta: number) => {
    const order = orders.find((item) => item.id === orderId); if (!order) return;
    const current = order.items.find((item) => item.id === itemId); if (!current || current.status !== "pending") return;
    const items = current.quantity + delta <= 0 ? order.items.filter((item) => item.id !== itemId) : order.items.map((item) => item.id === itemId ? { ...item, quantity: item.quantity + delta } : item);
    // Quitar el último producto de un borrador que nunca se comandó no deja una cuenta vacía colgando
    // de la mesa: se descarta cancelándola, y la pantalla de venta devuelve al salón.
    if (isEmptyDraft({ ...order, items })) {
      await persistOrder({ ...order, items, status: "cancelled", cancellationReason: "Cuenta vacía descartada" }, "cancel_order");
      return;
    }
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
    await persistOrder({ ...order, status: "ready", items: markItemsPrepared(order.items) }, "mark_order_ready");
  }, [orders, persistOrder]);

  /**
   * Una cuenta cancelada o revertida no vuelve a la vida. Sin esta guarda, finalizarla la devolvía a
   * 'served' y desde ahí se cobraba con normalidad: el dinero entraba al cajón por una venta que el
   * servidor sigue teniendo por anulada.
   */
  const finalizeOrder = useCallback(async (orderId: string) => {
    const order = orders.find((item) => item.id === orderId); if (!order) return;
    if (!isFinalizable(order)) throw new Error("Esta cuenta ya no se puede finalizar.");
    await persistOrder({ ...order, status: "served" }, "finalize_order");
  }, [orders, persistOrder]);

  const addPayment = useCallback(async (orderId: string, method: PaymentMethod, amount: number, tip: number, subaccountId?: string) => {
    const order = orders.find((item) => item.id === orderId); if (!order || amount <= 0) return;
    // El modal de cobro se pinta con su propio estado, no con el de la orden: si otro dispositivo la
    // cancela mientras está abierto, el cajero sigue teniendo delante un formulario que cobra.
    if (!isChargeable(order)) throw new Error("Esta cuenta ya no se puede cobrar.");
    // Con la cuenta dividida el tope es el saldo de esa persona, no el de la cuenta: sin él, quien
    // paga primero con un billete grande absorbería el saldo de los demás y sus tickets saldrían
    // en cero. El saldo de la cuenta se mantiene como cota exterior.
    const orderBalance = orderTotal(order) - paidTotal(order);
    const balance = subaccountId ? Math.min(subaccountBalance(order, subaccountId), orderBalance) : orderBalance;
    if (balance <= 0) return;
    const appliedAmount = applyPaymentCap(amount, balance);
    // El importe tecleado es el efectivo que entregó el cliente: `appliedAmount` se recorta al
    // saldo, así que sin guardarlo aparte el cambio ya no se podría reconstruir en el ticket.
    const received = method === "cash" ? roundToCents(amount) : undefined;
    await persistOrder({ ...order, payments: [...order.payments, { id: crypto.randomUUID(), method, amount: appliedAmount, tip, received, subaccountId, createdAt: new Date().toISOString() }] }, "record_payment");
  }, [orders, persistOrder]);

  const closeOrder = useCallback(async (orderId: string) => {
    const order = orders.find((item) => item.id === orderId); if (!order) return;
    if (!isChargeable(order)) throw new Error("Esta cuenta ya no se puede cerrar.");
    if (!isClosable(order)) return;
    await persistOrder({ ...order, status: "closed" }, "close_order");
  }, [orders, persistOrder]);

  /**
   * Divide la cuenta entre `people` personas. Rehacer el reparto borra el anterior, así que se
   * bloquea en cuanto alguien pagó: mover el importe de una persona que ya se fue con su ticket
   * en la mano dejaría la cuenta sin cuadrar y sin forma de explicarlo.
   *
   * Tampoco se puede dividir una cuenta que ya tiene cobros propios, aunque no sean de nadie en
   * particular. Las subcuentas reparten el total entero, no el saldo: con $100 ya cobrados de una
   * cuenta de $250, cada mitad seguía pidiendo $125 y el tope de `addPayment` recortaba el cobro de
   * la última al saldo real, de modo que se quedaba debiendo para siempre. Ni se cerraba la cuenta
   * ni se podía volver a juntar, y el dinero de esa persona entraba al cajón sin quedar registrado.
   */
  const splitOrder = useCallback(async (orderId: string, mode: SplitMode, people: number) => {
    const order = orders.find((item) => item.id === orderId); if (!order) return;
    if (hasSubaccountPayments(order)) throw new Error("La cuenta ya tiene cobros: no se puede volver a dividir.");
    if (order.payments.length) throw new Error("La cuenta ya tiene pagos registrados: cóbrala completa o revierte la venta para dividirla.");
    const subaccounts = createSubaccounts(people);
    if (!subaccounts.length) throw new Error("Una cuenta separada necesita al menos dos personas.");
    await persistOrder({ ...order, splitMode: mode, subaccounts, itemShares: [] }, "split_order");
  }, [orders, persistOrder]);

  const renameSubaccount = useCallback(async (orderId: string, subaccountId: string, label: string) => {
    const order = orders.find((item) => item.id === orderId); if (!order || !label.trim()) return;
    await persistOrder({ ...order, subaccounts: (order.subaccounts ?? []).map((subaccount) => subaccount.id === subaccountId ? { ...subaccount, label: label.trim() } : subaccount) }, "split_order");
  }, [orders, persistOrder]);

  const assignItemUnits = useCallback(async (orderId: string, itemId: string, subaccountId: string, units: number) => {
    const order = orders.find((item) => item.id === orderId); if (!order) return;
    const item = order.items.find((candidate) => candidate.id === itemId); if (!item || item.status === "cancelled") return;
    // Si esa persona ya pagó, cambiar lo suyo es una reasignación con motivo, no un reparto normal.
    if (order.payments.some((payment) => payment.subaccountId === subaccountId)) throw new Error("Esa persona ya pagó: usa «Reasignar» para mover sus artículos.");
    const itemShares = assignUnits(pruneShares(order.items, order.itemShares ?? []), item, subaccountId, units);
    await persistOrder({ ...order, itemShares }, "assign_split_units");
  }, [orders, persistOrder]);

  /**
   * Mueve unidades de una persona a otra cuando el reparto ya empezó a cobrarse. Reescribe una
   * cuenta que alguien dio por cerrada, así que pide gerencia y motivo y el servidor lo registra
   * como incidencia; el mismo trato que una reversión de venta.
   */
  const reassignItemUnits = useCallback(async (orderId: string, itemId: string, fromId: string, toId: string, units: number, reason: string) => {
    const order = orders.find((item) => item.id === orderId); if (!order || !reason.trim()) return;
    const item = order.items.find((candidate) => candidate.id === itemId); if (!item || item.status === "cancelled") return;
    if (fromId === toId) return;
    if (hasSubaccountPayments(order) && session?.role !== "manager") throw new Error("Sólo gerencia puede reasignar artículos de una cuenta que ya empezó a cobrarse.");

    const current = pruneShares(order.items, order.itemShares ?? []);
    const held = current.filter((share) => share.itemId === itemId && share.subaccountId === fromId).reduce((sum, share) => sum + share.units, 0);
    const moved = Math.min(Math.max(0, Math.trunc(units)), held);
    if (!moved) return;
    const taken = current.filter((share) => share.itemId === itemId && share.subaccountId === toId).reduce((sum, share) => sum + share.units, 0);
    const itemShares = assignUnits(assignUnits(current, item, fromId, held - moved), item, toId, taken + moved);

    const before = subaccountTotal(order, toId);
    const after = subaccountTotal({ ...order, itemShares }, toId);
    await persistOrder({ ...order, itemShares }, "reassign_split_item", {
      splitReassignmentReason: reason.trim(),
      splitReassignmentAmount: Math.abs(roundToCents(after - before))
    });
  }, [orders, persistOrder, session]);

  const clearSplit = useCallback(async (orderId: string) => {
    const order = orders.find((item) => item.id === orderId); if (!order) return;
    if (hasSubaccountPayments(order)) throw new Error("La cuenta ya tiene cobros por persona: no se puede volver a juntar.");
    await persistOrder({ ...order, splitMode: undefined, subaccounts: [], itemShares: [] }, "clear_split");
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
        price_cents: Math.round(product.price * 100), available: product.available, seasonal: product.seasonal, image_url: product.imageUrl ?? null, active: true
      });
      if (error) throw new Error(error.message);
      if (product.variants?.length) {
        const { error: variantError } = await supabase.from("product_variants").insert(product.variants.map((variant) => ({ id: variant.id, product_id: product.id, name: variant.name, price_cents: Math.round(variant.price * 100), active: true })));
        if (variantError) throw new Error(variantError.message);
      }
    }
    await db.catalog.put(product);
    setProducts((current) => [...current, product].sort((a, b) => a.name.localeCompare(b.name, "es")));
    return product;
  }, [session]);

  const updateProduct = useCallback(async (productId: string, patch: Partial<Omit<Product, "id">>) => {
    if (session?.role !== "manager") throw new Error("Sólo gerencia puede editar el catálogo.");
    if (isSupabaseConfigured && !navigator.onLine) throw new Error("Necesitas conexión para modificar el catálogo.");
    const current = products.find((product) => product.id === productId);
    if (!current) throw new Error("No se encontró el producto.");
    const next: Product = { ...current, ...patch, id: productId };
    if (supabase) {
      const { error } = await supabase.from("products").update({
        category_id: next.categoryId, name: next.name, description: next.description ?? null,
        price_cents: Math.round(next.price * 100), available: next.available, seasonal: next.seasonal, image_url: next.imageUrl ?? null
      }).eq("id", productId);
      if (error) throw new Error(error.message);
      if (patch.variants) {
        const removedVariantIds = (current.variants ?? []).map((variant) => variant.id).filter((id) => !next.variants?.some((variant) => variant.id === id));
        if (removedVariantIds.length) {
          const { error: removeError } = await supabase.from("product_variants").delete().in("id", removedVariantIds);
          if (removeError) throw new Error(removeError.message);
        }
        if (next.variants?.length) {
          const { error: variantError } = await supabase.from("product_variants").upsert(next.variants.map((variant) => ({ id: variant.id, product_id: productId, name: variant.name, price_cents: Math.round(variant.price * 100), active: true })));
          if (variantError) throw new Error(variantError.message);
        }
      }
    }
    await db.catalog.put(next);
    setProducts((items) => items.map((product) => product.id === productId ? next : product).sort((a, b) => a.name.localeCompare(b.name, "es")));
  }, [session, products]);

  const deleteProduct = useCallback(async (productId: string) => {
    if (session?.role !== "manager") throw new Error("Sólo gerencia puede editar el catálogo.");
    if (isSupabaseConfigured && !navigator.onLine) throw new Error("Necesitas conexión para modificar el catálogo.");
    if (supabase) {
      const { error } = await supabase.from("products").update({ active: false }).eq("id", productId);
      if (error) throw new Error(error.message);
    }
    await db.catalog.delete(productId);
    setProducts((items) => items.filter((product) => product.id !== productId));
  }, [session]);

  const createExtra = useCallback(async (input: Omit<CatalogExtra, "id" | "active">) => {
    if (session?.role !== "manager") throw new Error("Sólo gerencia puede editar los extras.");
    if (isSupabaseConfigured && !navigator.onLine) throw new Error("Necesitas conexión para modificar los extras.");
    const extra: CatalogExtra = { ...input, id: crypto.randomUUID(), active: true };
    if (supabase) {
      const { error } = await supabase.from("modifiers").insert({ id: extra.id, name: extra.name, price_cents: Math.round(extra.price * 100), active: true });
      if (error) throw new Error(error.message);
    }
    await db.catalogExtras.put(extra);
    setExtras((current) => [...current, extra].sort((a, b) => a.name.localeCompare(b.name, "es")));
    return extra;
  }, [session]);

  const updateExtra = useCallback(async (extraId: string, patch: Partial<Omit<CatalogExtra, "id">>) => {
    if (session?.role !== "manager") throw new Error("Sólo gerencia puede editar los extras.");
    if (isSupabaseConfigured && !navigator.onLine) throw new Error("Necesitas conexión para modificar los extras.");
    const current = extras.find((extra) => extra.id === extraId);
    if (!current) throw new Error("No se encontró el extra.");
    const next: CatalogExtra = { ...current, ...patch, id: extraId };
    if (supabase) {
      const { error } = await supabase.from("modifiers").update({ name: next.name, price_cents: Math.round(next.price * 100), active: next.active }).eq("id", extraId);
      if (error) throw new Error(error.message);
    }
    await db.catalogExtras.put(next);
    setExtras((items) => items.map((extra) => extra.id === extraId ? next : extra).sort((a, b) => a.name.localeCompare(b.name, "es")));
  }, [session, extras]);

  const deleteExtra = useCallback(async (extraId: string) => {
    if (session?.role !== "manager") throw new Error("Sólo gerencia puede editar los extras.");
    if (isSupabaseConfigured && !navigator.onLine) throw new Error("Necesitas conexión para modificar los extras.");
    if (supabase) {
      const { error } = await supabase.from("modifiers").update({ active: false }).eq("id", extraId);
      if (error) throw new Error(error.message);
    }
    await db.catalogExtras.delete(extraId);
    setExtras((items) => items.filter((extra) => extra.id !== extraId));
  }, [session]);

  const createCategory = useCallback(async (name: string) => {
    if (session?.role !== "manager") throw new Error("Sólo gerencia puede editar las categorías.");
    if (isSupabaseConfigured && !navigator.onLine) throw new Error("Necesitas conexión para modificar las categorías.");
    const category: Category = { id: crypto.randomUUID(), name, position: categories.length };
    if (supabase) {
      const { error } = await supabase.from("categories").insert({ id: category.id, name, position: category.position, active: true, published: true });
      if (error) throw new Error(error.message);
    }
    await db.catalogCategories.put(category);
    setCategories((current) => [...current, category]);
    return category;
  }, [session, categories]);

  const updateCategory = useCallback(async (categoryId: string, name: string) => {
    if (session?.role !== "manager") throw new Error("Sólo gerencia puede editar las categorías.");
    if (isSupabaseConfigured && !navigator.onLine) throw new Error("Necesitas conexión para modificar las categorías.");
    if (supabase) {
      const { error } = await supabase.from("categories").update({ name }).eq("id", categoryId);
      if (error) throw new Error(error.message);
    }
    // `put` reemplaza el registro completo: hay que conservar la posición o el menú se
    // reordenaría al renombrar una categoría.
    const current = categories.find((category) => category.id === categoryId);
    await db.catalogCategories.put({ id: categoryId, name, position: current?.position ?? categories.length });
    setCategories((items) => items.map((category) => category.id === categoryId ? { ...category, name } : category));
  }, [session, categories]);

  const deleteCategory = useCallback(async (categoryId: string) => {
    if (session?.role !== "manager") throw new Error("Sólo gerencia puede editar las categorías.");
    if (isSupabaseConfigured && !navigator.onLine) throw new Error("Necesitas conexión para modificar las categorías.");
    const productsInCategory = products.filter((product) => product.categoryId === categoryId).length;
    if (productsInCategory > 0) throw new Error(`Hay ${productsInCategory} producto(s) en esta categoría. Muévelos o elimínalos antes de borrarla.`);
    if (supabase) {
      // Baja lógica, igual que productos y extras. El DELETE real nunca funcionó: el rol
      // `authenticated` no tiene ese privilegio sobre categories, y aunque lo tuviera chocaría
      // contra la llave foránea de products, que conserva category_id al darse de baja.
      const { error } = await supabase.from("categories").update({ active: false }).eq("id", categoryId);
      if (error) throw new Error(error.message);
    }
    await db.catalogCategories.delete(categoryId);
    setCategories((items) => items.filter((category) => category.id !== categoryId));
  }, [session, products]);

  const uploadProductImage = useCallback(async (file: File) => {
    if (session?.role !== "manager") throw new Error("Sólo gerencia puede editar el catálogo.");
    const imageError = productImageError(file);
    if (imageError) throw new Error(imageError);
    if (supabase) {
      const path = `${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file);
      if (error) throw new Error(error.message);
      return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    }
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
      reader.readAsDataURL(file);
    });
  }, [session]);

  const value = useMemo(() => ({
    session, hydrated, orders, tables, products, categories, extras, online, syncStatus, pendingCount, demoMode: !isSupabaseConfigured,
    cashSession, cashSessionRequired, canTakeOrders: ordersAllowed, refreshCashSession,
    login, logout, startOrder, addItem, changeQuantity, cancelCommandedItem, dispatchPending, markOrderReady, finalizeOrder, addPayment,
    closeOrder, setDiscount, cancelOrder, reverseSale, forceSync, addTable, updateTable,
    splitOrder, renameSubaccount, assignItemUnits, reassignItemUnits, clearSplit,
    createProduct, updateProduct, deleteProduct, createExtra, updateExtra, deleteExtra, createCategory, updateCategory, deleteCategory, uploadProductImage
  }), [
    session, hydrated, orders, tables, products, categories, extras, online, syncStatus, pendingCount,
    cashSession, cashSessionRequired, ordersAllowed, refreshCashSession,
    login, logout, startOrder, addItem, changeQuantity, cancelCommandedItem, dispatchPending, markOrderReady, finalizeOrder, addPayment,
    closeOrder, setDiscount, cancelOrder, reverseSale, forceSync, addTable, updateTable,
    splitOrder, renameSubaccount, assignItemUnits, reassignItemUnits, clearSplit,
    createProduct, updateProduct, deleteProduct, createExtra, updateExtra, deleteExtra, createCategory, updateCategory, deleteCategory, uploadProductImage
  ]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook del Context, se exporta junto al Provider a propósito
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp debe usarse dentro de AppProvider");
  return context;
}
