import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { products } from "../data/menu";
import { initialTables } from "../data/tables";
import { orderSubtotal, orderTotal } from "../domain/money";
import type { AppRole, Order, OrderItem, PaymentMethod, Product, StaffSession, SyncStatus } from "../domain/types";
import { db } from "../lib/db";
import { queueOperation, syncPendingOperations } from "../lib/offline";
import { isSupabaseConfigured, supabase, usernameToInternalEmail } from "../lib/supabase";

const now = new Date();
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

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

interface AddItemInput { product: Product; variantId?: string; modifiers?: OrderItem["modifiers"]; notes?: string; }
interface AppContextValue {
  session: StaffSession | null;
  orders: Order[];
  online: boolean;
  syncStatus: SyncStatus;
  pendingCount: number;
  demoMode: boolean;
  login: (username: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  startOrder: (type: "table" | "takeaway", target?: string) => Promise<Order>;
  addItem: (orderId: string, input: AddItemInput) => Promise<void>;
  changeQuantity: (orderId: string, itemId: string, delta: number) => Promise<void>;
  cancelCommandedItem: (orderId: string, itemId: string, reason: string) => Promise<string | null>;
  dispatchPending: (orderId: string) => Promise<string | null>;
  markOrderReady: (orderId: string) => Promise<void>;
  addPayment: (orderId: string, method: PaymentMethod, amount: number, tip: number) => Promise<void>;
  closeOrder: (orderId: string) => Promise<void>;
  setDiscount: (orderId: string, amount: number, reason: string) => Promise<void>;
  cancelOrder: (orderId: string, reason: string) => Promise<void>;
  reverseSale: (orderId: string, reason: string) => Promise<void>;
  forceSync: () => Promise<void>;
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(navigator.onLine ? "synced" : "pending");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    Promise.all([db.orders.toArray(), db.sessions.orderBy("validatedAt").last()]).then(async ([savedOrders, savedSession]) => {
      if (!savedOrders.length && !isSupabaseConfigured) {
        await db.orders.bulkPut(sampleOrders);
        setOrders(sampleOrders);
      } else setOrders(savedOrders);
      if (savedSession) setSession(savedSession);
      setPendingCount(await db.pendingOperations.where("status").anyOf("pending", "review_required").count());
    });
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

  const forceSync = useCallback(async () => {
    if (!navigator.onLine) { setSyncStatus("pending"); return; }
    setSyncStatus("syncing");
    const result = await syncPendingOperations();
    if (!result.review) await pullRemoteOrders();
    const count = await db.pendingOperations.where("status").anyOf("pending", "review_required").count();
    setPendingCount(count);
    setSyncStatus(result.review > 0 ? "review_required" : "synced");
  }, [pullRemoteOrders]);

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

  const startOrder = useCallback(async (type: "table" | "takeaway", target?: string) => {
    if (!session) throw new Error("Sesión requerida");
    const nextFolio = Math.max(1044, ...orders.map((order) => order.folio)) + 1;
    const order: Order = {
      id: crypto.randomUUID(), folio: nextFolio, type, status: "open", items: [], payments: [], discount: 0,
      openedBy: session.id, openedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), syncStatus: "pending",
      ...(type === "table" ? { tableId: target } : { customerName: target || undefined })
    };
    await db.orders.put(order); await queueOperation("create_order", order.id, order);
    setOrders((current) => [...current, order]); setPendingCount((count) => count + 1);
    if (isSupabaseConfigured && navigator.onLine) void forceSync();
    return order;
  }, [orders, session, forceSync]);

  const addItem = useCallback(async (orderId: string, { product, variantId, modifiers = [], notes }: AddItemInput) => {
    const order = orders.find((item) => item.id === orderId); if (!order) return;
    const variant = product.variants?.find((item) => item.id === variantId);
    const item: OrderItem = { id: crypto.randomUUID(), productId: product.id, name: product.name, quantity: 1, unitPrice: variant?.price ?? product.price, variant: variant?.name, modifiers, notes: notes?.trim() || undefined, status: "pending" };
    await persistOrder({ ...order, items: [...order.items, item] }, "add_order_item");
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
    const order = orders.find((item) => item.id === orderId); if (!order || !reason.trim() || !["open", "preparing", "ready"].includes(order.status)) return;
    await persistOrder({ ...order, status: "cancelled", discountReason: `Cancelación: ${reason.trim()}` }, "cancel_order");
  }, [orders, persistOrder]);

  const reverseSale = useCallback(async (orderId: string, reason: string) => {
    if (session?.role !== "manager") throw new Error("Sólo gerencia puede revertir ventas.");
    const order = orders.find((item) => item.id === orderId); if (!order || order.status !== "closed" || !reason.trim()) return;
    await persistOrder({ ...order, status: "reversed", discountReason: `Reversión: ${reason.trim()}` }, "reverse_sale");
  }, [orders, persistOrder, session]);

  const value = useMemo(() => ({ session, orders, online, syncStatus, pendingCount, demoMode: !isSupabaseConfigured, login, logout, startOrder, addItem, changeQuantity, cancelCommandedItem, dispatchPending, markOrderReady, addPayment, closeOrder, setDiscount, cancelOrder, reverseSale, forceSync }), [session, orders, online, syncStatus, pendingCount, login, logout, startOrder, addItem, changeQuantity, cancelCommandedItem, dispatchPending, markOrderReady, addPayment, closeOrder, setDiscount, cancelOrder, reverseSale, forceSync]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp debe usarse dentro de AppProvider");
  return context;
}

export { initialTables, products };
