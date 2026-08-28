import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Boxes, ClipboardCheck, Pencil, Plus, Scale, Trash2 } from "lucide-react";
import { Badge, Button, InlineAlert, LoadingState, MetricCard, Page, PageHeader, Panel, SelectField, TextField } from "../../design-system/react";
import { analyzeRestockPattern, buildInventoryPeriods, createInventoryAnalysis, deriveStock, INVENTORY_UNITS, isInventoryVarianceAlert } from "../domain/inventory";
import { compatibleUnits, quantityIn } from "../domain/units";
import type { InventoryCount, InventoryItem, InventoryMovement, InventoryUnit } from "../domain/types";
import { Modal } from "../components/Modal";
import { QuantityField } from "../components/QuantityField";
import { db } from "../lib/db";
import { queueOperation } from "../lib/offline";
import { supabase } from "../lib/supabase";
import { useApp } from "../state/AppContext";

const demoItems: InventoryItem[] = [
  { id: "coffee", name: "Café en grano", unit: "kg", minimum: 3, tolerance: 0.15, active: true },
  { id: "milk", name: "Leche entera", unit: "L", minimum: 8, tolerance: 0.5, active: true },
  { id: "almond", name: "Bebida de almendra", unit: "L", minimum: 5, tolerance: 0.25, active: true },
  { id: "ice", name: "Hielo", unit: "bolsa", minimum: 3, tolerance: 1, active: true }
];
const demoCounts: InventoryCount[] = [
  { id: "base", countedAt: new Date(Date.now() - 86_400_000).toISOString(), lines: [{ itemId: "coffee", quantity: 8.4 }, { itemId: "milk", quantity: 14 }, { itemId: "almond", quantity: 4 }, { itemId: "ice", quantity: 2 }] },
  { id: "today", countedAt: new Date().toISOString(), lines: [{ itemId: "coffee", quantity: 7.9 }, { itemId: "milk", quantity: 12.5 }] }
];
const demoMovements: InventoryMovement[] = [{ id: "entry", itemId: "coffee", type: "entry", quantity: 1, note: "Recepción", recordedAt: new Date(Date.now() - 43_200_000).toISOString() }];

const MOVEMENT_COLUMNS = "id,inventory_item_id,movement_type,quantity,signed_quantity,note,created_at,recorded_by";

function remoteItem(row: Record<string, unknown>): InventoryItem {
  return { id: String(row.id), name: String(row.name), unit: String(row.unit) as InventoryUnit, minimum: Number(row.minimum_quantity), tolerance: Number(row.tolerance_quantity ?? 0), active: Boolean(row.active), updatedAt: String(row.updated_at ?? "") };
}
function remoteCount(row: Record<string, unknown>): InventoryCount {
  const lines = (row.inventory_count_lines as Array<Record<string, unknown>> | null) ?? [];
  return { id: String(row.id), countedAt: String(row.counted_at), note: row.note ? String(row.note) : undefined, recordedBy: row.recorded_by ? String(row.recorded_by) : undefined, lines: lines.map((line) => ({ itemId: String(line.inventory_item_id), quantity: Number(line.quantity) })) };
}
function remoteMovement(row: Record<string, unknown>): InventoryMovement {
  return { id: String(row.id), itemId: String(row.inventory_item_id), type: row.movement_type as InventoryMovement["type"], quantity: Number(row.quantity), signedQuantity: row.signed_quantity === null || row.signed_quantity === undefined ? undefined : Number(row.signed_quantity), note: String(row.note), recordedAt: String(row.created_at), recordedBy: row.recorded_by ? String(row.recorded_by) : undefined };
}
const amount = (value: number, unit: string) => `${Number(value.toFixed(3))} ${unit}`;
const formatDate = (value: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const byRecordedAtDesc = (a: InventoryMovement, b: InventoryMovement) => b.recordedAt.localeCompare(a.recordedAt);

async function fetchItemHistory(itemId: string): Promise<{ counts: InventoryCount[]; movements: InventoryMovement[] }> {
  if (!supabase) return { counts: [], movements: [] };
  const [countResult, movementResult] = await Promise.all([
    supabase.from("inventory_counts").select("id,counted_at,note,recorded_by,inventory_count_lines!inner(inventory_item_id,quantity)").eq("inventory_count_lines.inventory_item_id", itemId).order("counted_at", { ascending: false }).limit(200),
    // El detalle es la bitácora de lo que se captura a mano. El consumo que generan las ventas se
    // mide en la existencia y en la tabla de indicadores, no aquí: mezclarlo enterraría las entradas
    // y las mermas bajo una lista de ventas que no aporta nada a este historial.
    supabase.from("inventory_movements").select(MOVEMENT_COLUMNS).eq("inventory_item_id", itemId).in("movement_type", ["entry", "waste"]).order("created_at", { ascending: false }).limit(200)
  ]);
  const failure = countResult.error ?? movementResult.error;
  if (failure) throw new Error(failure.message);
  return {
    counts: (countResult.data ?? []).map((row) => remoteCount(row as Record<string, unknown>)),
    movements: (movementResult.data ?? []).map((row) => remoteMovement(row as Record<string, unknown>))
  };
}

/**
 * Desde cuándo hay que traer movimientos. El indicador de la tabla mira 30 días, pero la existencia
 * se deriva del último conteo de cada insumo, que puede ser más viejo. Se toma el más antiguo de
 * esos conteos, con un tope de un año para que la consulta no crezca sin límite.
 */
function movementWindowStart(items: InventoryItem[], counts: InventoryCount[]) {
  const floor = Date.now() - 365 * 86_400_000;
  let earliest = Date.now() - 31 * 86_400_000;
  for (const item of items) {
    if (!item.active) continue;
    const latest = counts.filter((count) => count.lines.some((line) => line.itemId === item.id)).sort((a, b) => b.countedAt.localeCompare(a.countedAt))[0];
    if (latest) earliest = Math.min(earliest, Date.parse(latest.countedAt));
  }
  return new Date(Math.max(earliest, floor)).toISOString();
}

export function InventoryPage() {
  const { session, forceSync } = useApp();
  const [items, setItems] = useState<InventoryItem[]>(demoItems);
  const [counts, setCounts] = useState<InventoryCount[]>(demoCounts);
  const [movements, setMovements] = useState<InventoryMovement[]>(demoMovements);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<"count" | "movement" | "item" | "delete" | null>(null);
  const [selected, setSelected] = useState("");
  const [quantity, setQuantity] = useState("");
  const [quantityUnit, setQuantityUnit] = useState<InventoryUnit | "">("");
  const [note, setNote] = useState("");
  const [movementType, setMovementType] = useState<"entry" | "waste">("entry");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [itemName, setItemName] = useState("");
  const [unit, setUnit] = useState<InventoryUnit | "">("");
  const [minimum, setMinimum] = useState("");
  const [minimumUnit, setMinimumUnit] = useState<InventoryUnit | "">("");
  const [tolerance, setTolerance] = useState("");
  const [toleranceUnit, setToleranceUnit] = useState<InventoryUnit | "">("");
  const [saving, setSaving] = useState(false);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [detailHistory, setDetailHistory] = useState<{ counts: InventoryCount[]; movements: InventoryMovement[] }>({ counts: [], movements: [] });
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const load = async () => {
    if (!supabase) return;
    setLoading(true); setError("");
    const [itemResult, countResult] = await Promise.all([
      supabase.from("inventory_items").select("id,name,unit,minimum_quantity,tolerance_quantity,active,updated_at").order("name"),
      supabase.from("inventory_counts").select("id,counted_at,note,recorded_by,inventory_count_lines(inventory_item_id,quantity)").order("counted_at", { ascending: false }).limit(500)
    ]);
    if (itemResult.error || countResult.error) { setError((itemResult.error ?? countResult.error)!.message); setLoading(false); return; }
    const nextItems = (itemResult.data ?? []).map((row) => remoteItem(row as Record<string, unknown>));
    const nextCounts = (countResult.data ?? []).map((row) => remoteCount(row as Record<string, unknown>));
    // Los movimientos se piden desde el conteo de referencia más antiguo, no desde una ventana fija:
    // la existencia se deriva a partir del último conteo de cada insumo, y si ese conteo quedara
    // fuera de la ventana los movimientos intermedios faltarían y la existencia saldría inflada.
    const since = movementWindowStart(nextItems, nextCounts);
    const movementResult = await supabase.from("inventory_movements").select(MOVEMENT_COLUMNS).gte("created_at", since).order("created_at", { ascending: false }).limit(2000);
    if (movementResult.error) { setError(movementResult.error.message); setLoading(false); return; }
    const nextMovements = (movementResult.data ?? []).map((row) => remoteMovement(row as Record<string, unknown>));
    setItems(nextItems); setCounts(nextCounts); setMovements(nextMovements);
    await Promise.all([db.inventoryItems.bulkPut(nextItems), db.inventoryCounts.bulkPut(nextCounts), db.inventoryMovements.bulkPut(nextMovements)]);
    setLoading(false);
  };
  useEffect(() => {
    if (!supabase) return;
    // Dexie devuelve en orden de clave primaria (UUID): sin ordenar aquí, «Últimos registros» pinta
    // movimientos al azar mientras la carga remota está en vuelo, o para siempre si no hay conexión.
    void Promise.all([db.inventoryItems.toArray(), db.inventoryCounts.toArray(), db.inventoryMovements.toArray()]).then(([savedItems, savedCounts, savedMovements]) => {
      if (savedItems.length) setItems(savedItems);
      if (savedCounts.length) setCounts(savedCounts);
      if (savedMovements.length) setMovements([...savedMovements].sort(byRecordedAtDesc));
    });
    void load();
  }, []);
  useEffect(() => {
    if (!detailItemId) return;
    if (!supabase) {
      setDetailHistory({
        counts: counts.filter((count) => count.lines.some((line) => line.itemId === detailItemId)),
        movements: movements.filter((movement) => movement.itemId === detailItemId && (movement.type === "entry" || movement.type === "waste"))
      });
      return;
    }
    let active = true;
    setDetailLoading(true); setDetailError("");
    void fetchItemHistory(detailItemId)
      .then((result) => { if (active) setDetailHistory(result); })
      .catch((reason) => { if (active) setDetailError(reason instanceof Error ? reason.message : "No se pudo cargar el historial."); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [detailItemId, counts, movements]);

  // El fin de la ventana se recalcula con los datos: cuando era un useMemo con dependencias vacías se
  // quedaba congelado en el instante del montaje y un conteo recién registrado, con `countedAt`
  // posterior, caía fuera del filtro `countedAt <= end` — la tabla de abajo no se enteraba de nada.
  const analysis = useMemo(() => {
    const end = new Date().toISOString();
    const start = new Date(Date.now() - 30 * 86_400_000).toISOString();
    return createInventoryAnalysis(items, counts, movements, start, end);
  }, [items, counts, movements]);
  // Un insumo dado de baja desaparece de lo operativo (existencia, selectores y últimos registros),
  // igual que ya hacía la tabla de análisis. `items` completo se conserva para resolver el nombre de
  // los movimientos históricos y para el detalle, que sí deben seguir siendo consultables.
  const activeItems = useMemo(() => items.filter((item) => item.active), [items]);
  // Se comprueba que el insumo elegido siga existiendo, no sólo que haya alguno elegido: la página
  // arranca con los datos de demostración y, al llegar los reales, `selected` apuntaba a un id que ya
  // no existe. El desplegable pinta entonces la primera opción —porque su `value` no casa con
  // ninguna— y el formulario dice un insumo mientras el estado guarda otro.
  useEffect(() => {
    if (activeItems.length && !activeItems.some((item) => item.id === selected)) setSelected(activeItems[0].id);
  }, [activeItems, selected]);
  const latestFor = (id: string) => counts.filter((count) => count.lines.some((line) => line.itemId === id)).sort((a, b) => b.countedAt.localeCompare(a.countedAt))[0];
  const stockFor = (id: string) => deriveStock(id, counts, movements);
  // La existencia derivada, y no el conteo crudo, es lo que decide la alerta: si no, «Bajo mínimo»
  // ignoraría todo lo vendido desde la última lectura física.
  const low = activeItems.filter((item) => { const value = stockFor(item.id); return value !== undefined && value <= item.minimum; });
  const recent = useMemo(() => movements
    .filter((movement) => (movement.type === "entry" || movement.type === "waste") && activeItems.some((item) => item.id === movement.itemId))
    .sort(byRecordedAtDesc)
    .slice(0, 10), [movements, activeItems]);

  const selectedUnit = items.find((item) => item.id === selected)?.unit ?? "";
  useEffect(() => { setQuantityUnit(selectedUnit); }, [selectedUnit]);

  const close = () => {
    setModal(null); setQuantity(""); setQuantityUnit(selectedUnit); setNote("");
    setEditingId(null); setTargetId(null); setItemName(""); setUnit(""); setMinimum(""); setMinimumUnit(""); setTolerance(""); setToleranceUnit("");
  };
  const openCreate = () => { setEditingId(null); setItemName(""); setUnit(""); setMinimum(""); setMinimumUnit(""); setTolerance(""); setToleranceUnit(""); setNotice(""); setModal("item"); };
  const openEdit = (item: InventoryItem) => {
    setEditingId(item.id); setItemName(item.name); setUnit(item.unit);
    setMinimum(String(item.minimum)); setMinimumUnit(item.unit);
    setTolerance(String(item.tolerance)); setToleranceUnit(item.unit);
    setNotice(""); setModal("item");
  };
  const openDelete = (item: InventoryItem) => { setTargetId(item.id); setNotice(""); setModal("delete"); };

  /** Al cambiar la unidad canónica, las de mínimo y tolerancia deben seguirla o quedan de otra familia. */
  const changeUnit = (next: InventoryUnit) => {
    setUnit(next);
    if (!minimumUnit || compatibleUnits(next).every((option) => option.value !== minimumUnit)) setMinimumUnit(next);
    if (!toleranceUnit || compatibleUnits(next).every((option) => option.value !== toleranceUnit)) setToleranceUnit(next);
  };

  /**
   * Empuja la cola y dice si la operación quedó sin sincronizar estando en línea. Sin esto, un
   * rechazo del servidor —un nombre repetido, una unidad incompatible— sería invisible: la escritura
   * optimista deja el insumo pintado como si hubiera funcionado.
   */
  async function syncAndReport(operationId: string) {
    if (!navigator.onLine) return false;
    await forceSync();
    const operation = await db.pendingOperations.get(operationId);
    return Boolean(operation && operation.status !== "synced");
  }

  async function saveCount() {
    const value = quantityIn(selectedUnit, quantity, quantityUnit);
    if (!selected || value === null || value < 0) return;
    const count: InventoryCount = { id: crypto.randomUUID(), countedAt: new Date().toISOString(), note: note.trim() || undefined, recordedBy: session?.id, lines: [{ itemId: selected, quantity: value }] };
    setError("");
    try {
      if (supabase) { await db.inventoryCounts.put(count); await queueOperation("record_inventory_count", count.id, count); void forceSync(); }
      setCounts((current) => [count, ...current]); close();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar el conteo."); }
  }
  async function saveMovement() {
    const value = quantityIn(selectedUnit, quantity, quantityUnit);
    if (!selected || value === null || value <= 0 || !note.trim()) return;
    const movement: InventoryMovement = { id: crypto.randomUUID(), itemId: selected, type: movementType, quantity: value, signedQuantity: movementType === "entry" ? value : -value, note: note.trim(), recordedAt: new Date().toISOString(), recordedBy: session?.id };
    setError("");
    try {
      if (supabase) { await db.inventoryMovements.put(movement); await queueOperation("record_inventory_movement", movement.id, movement); void forceSync(); }
      setMovements((current) => [movement, ...current].sort(byRecordedAtDesc)); close();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar el movimiento."); }
  }
  async function saveItem() {
    if (!itemName.trim() || !unit) return;
    const min = quantityIn(unit, minimum, minimumUnit);
    const tol = quantityIn(unit, tolerance, toleranceUnit);
    if (min === null || tol === null || min < 0 || tol < 0) return;
    const previous = editingId ? items.find((item) => item.id === editingId) : undefined;
    const next: InventoryItem = { id: editingId ?? crypto.randomUUID(), name: itemName.trim(), unit, minimum: min, tolerance: tol, active: previous?.active ?? true, updatedAt: new Date().toISOString() };
    setError(""); setSaving(true);
    try {
      let rejected = false;
      if (supabase) {
        await db.inventoryItems.put(next);
        const operation = await queueOperation(editingId ? "update_inventory_item" : "create_inventory_item", next.id, next);
        rejected = await syncAndReport(operation.id);
      }
      setItems((current) => {
        const rest = current.filter((item) => item.id !== next.id);
        return [...rest, next].sort((a, b) => a.name.localeCompare(b.name, "es"));
      });
      // Cambiar de unidad reescala el histórico en el servidor: hay que releerlo para no seguir
      // pintando las cantidades viejas junto a la unidad nueva.
      const rescaled = Boolean(previous && previous.unit !== next.unit);
      close();
      setNotice(rejected
        ? "El servidor no aceptó el cambio (revisa que el nombre no esté repetido o que la unidad sea compatible). Quedó pendiente de sincronizar."
        : editingId ? "Insumo actualizado." : "Insumo creado.");
      if (rescaled && !rejected) void load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar el insumo."); }
    finally { setSaving(false); }
  }
  async function removeItem() {
    const item = targetId ? items.find((current) => current.id === targetId) : undefined;
    if (!item) return;
    // El servidor decide entre borrar y dar de baja según si queda evidencia que dependa del insumo.
    // El cliente predice la misma rama con lo que tiene en memoria para no mentir mientras sincroniza.
    const used = movements.some((movement) => movement.itemId === item.id) || counts.some((count) => count.lines.some((line) => line.itemId === item.id));
    setError(""); setSaving(true);
    try {
      let rejected = false;
      if (supabase) {
        if (used) await db.inventoryItems.put({ ...item, active: false }); else await db.inventoryItems.delete(item.id);
        const operation = await queueOperation("delete_inventory_item", item.id, { id: item.id });
        rejected = await syncAndReport(operation.id);
      }
      setItems((current) => used ? current.map((entry) => entry.id === item.id ? { ...entry, active: false } : entry) : current.filter((entry) => entry.id !== item.id));
      if (detailItemId === item.id) setDetailItemId(null);
      close();
      setNotice(rejected
        ? "El servidor no aceptó la baja. Quedó pendiente de sincronizar."
        : used ? `«${item.name}» se dio de baja: conserva su historial y sus recetas.` : `«${item.name}» se eliminó.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo eliminar el insumo."); }
    finally { setSaving(false); }
  }

  const editing = editingId ? items.find((item) => item.id === editingId) : undefined;
  const targetItem = targetId ? items.find((item) => item.id === targetId) : undefined;
  const targetUsed = targetItem ? movements.some((movement) => movement.itemId === targetItem.id) || counts.some((count) => count.lines.some((line) => line.itemId === targetItem.id)) : false;
  const unitChanged = Boolean(editing && unit && editing.unit !== unit);
  const unitFamilyChanged = Boolean(editing && unit && compatibleUnits(editing.unit).every((option) => option.value !== unit));

  return <Page size="wide">
    <PageHeader eyebrow="CONTEO Y CONSUMO" title="Insumos" description="Los conteos fijan la existencia física; las entradas, las mermas y las ventas cobradas la mueven a partir de ahí." action={<div className="flex flex-wrap gap-2"><Button onClick={openCreate}><Plus size={18} /> Nuevo insumo</Button><Button variant="primary" onClick={() => { setNotice(""); setModal("count"); }}><ClipboardCheck size={18} /> Registrar conteo</Button></div>} />
    {error && <div className="mb-5"><InlineAlert>{error}</InlineAlert></div>}
    {notice && <div className="mb-5 rounded-xl bg-surface-container-high px-4 py-3 text-sm text-on-surface-variant">{notice}</div>}
    {loading ? <LoadingState label="Cargando conteos e indicadores…" /> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard icon={<Boxes />} label="Insumos activos" value={activeItems.length} detail="Con unidad, mínimo y tolerancia" tone="primary" />
        <MetricCard icon={<AlertTriangle />} label="Bajo mínimo" value={low.length} detail={low.length ? low.map((item) => item.name).join(", ") : "Sin alertas de reposición"} tone={low.length ? "danger" : "success"} />
        <MetricCard icon={<Scale />} label="Variaciones" value={analysis.filter(isInventoryVarianceAlert).length} detail="Fuera de su tolerancia" tone={analysis.some(isInventoryVarianceAlert) ? "danger" : "success"} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-outline-variant/30 p-5">
            <div><h2 className="text-lg font-bold">Existencia</h2><p className="text-sm text-on-surface-variant">Último conteo, más entradas, mermas y ventas posteriores.</p></div>
            <Button size="sm" onClick={() => { setNotice(""); setModal("movement"); }}><Plus size={16} /> Entrada o merma</Button>
          </div>
          <div className="divide-y divide-outline-variant/25">{activeItems.map((item) => {
            const latest = latestFor(item.id);
            const value = stockFor(item.id);
            const alert = value !== undefined && value <= item.minimum;
            return <div key={item.id} className="flex items-center gap-2 px-2 transition-colors hover:bg-surface-container-low/60">
              <button type="button" onClick={() => setDetailItemId(item.id)} className="flex flex-1 items-center justify-between gap-4 px-3 py-4 text-left">
                <div>
                  <div className="flex items-center gap-2"><p className="font-semibold">{item.name}</p>{alert && <Badge tone="danger">Reponer</Badge>}</div>
                  <p className="text-xs text-on-surface-variant">Mínimo {amount(item.minimum, item.unit)} · tolerancia ±{amount(item.tolerance, item.unit)}{latest ? ` · contado ${formatDate(latest.countedAt)}` : " · pendiente de línea base"}</p>
                </div>
                <p className={`text-xl font-bold ${alert ? "text-error" : "text-on-surface"}`}>{value === undefined ? "—" : amount(value, item.unit)}</p>
              </button>
              <Button variant="ghost" size="icon" aria-label={`Editar ${item.name}`} title="Editar" onClick={() => openEdit(item)}><Pencil size={17} /></Button>
              <Button variant="ghost" size="icon" aria-label={`Eliminar ${item.name}`} title="Eliminar" onClick={() => openDelete(item)}><Trash2 size={17} /></Button>
            </div>;
          })}</div>
        </Panel>
        <Panel className="p-5">
          <h2 className="text-lg font-bold">Últimos registros</h2>
          <div className="mt-4 space-y-3">{recent.map((movement) => {
            const item = items.find((current) => current.id === movement.itemId);
            const positive = movement.type === "entry";
            return <div key={movement.id} className="flex items-center gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${positive ? "bg-tertiary-fixed text-tertiary" : "bg-error-container text-error"}`}>{positive ? <ArrowUp size={17} /> : <ArrowDown size={17} />}</span>
              <p className="flex-1 font-semibold">{item?.name ?? "Insumo"}</p>
              <strong className={positive ? "text-tertiary" : "text-error"}>{positive ? "+" : "−"}{amount(movement.quantity, item?.unit ?? "")}</strong>
            </div>;
          })}{!recent.length && <p className="text-sm text-on-surface-variant">Aún no hay entradas ni mermas.</p>}</div>
        </Panel>
      </div>
      <Panel className="mt-6 overflow-hidden"><div className="border-b border-outline-variant/30 p-5"><p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Indicador de los últimos 30 días</p><h2 className="mt-1 text-lg font-bold">Consumo contado vs. receta teórica</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-surface-container-low text-xs uppercase tracking-wider text-on-surface-variant"><tr><th className="px-5 py-3">Insumo</th><th className="px-5 py-3 text-right">Entradas</th><th className="px-5 py-3 text-right">Mermas</th><th className="px-5 py-3 text-right">Físico</th><th className="px-5 py-3 text-right">Teórico</th><th className="px-5 py-3 text-right">Diferencia</th></tr></thead><tbody className="divide-y divide-outline-variant/25">{analysis.map((row) => <tr key={row.item.id}><td className="px-5 py-4"><p className="font-semibold">{row.item.name}</p><p className="text-xs text-on-surface-variant">{row.physical !== undefined ? `Entre los conteos del ${formatDate(row.openingAt ?? "")} y el ${formatDate(row.closingAt ?? "")}` : row.openingAt ? `Desde el conteo del ${formatDate(row.openingAt)} · falta un segundo conteo para medir el físico` : "Sin conteos: sólo lo registrado en el periodo"}</p></td><td className="px-5 py-4 text-right">{amount(row.entries, row.item.unit)}</td><td className="px-5 py-4 text-right">{amount(row.waste, row.item.unit)}</td><td className="px-5 py-4 text-right font-semibold">{row.physical === undefined ? "—" : amount(row.physical, row.item.unit)}</td><td className="px-5 py-4 text-right">{amount(row.theoretical, row.item.unit)}</td><td className={`px-5 py-4 text-right font-bold ${isInventoryVarianceAlert(row) ? "text-error" : ""}`}>{row.variance === undefined ? "—" : `${row.variance > 0 ? "+" : ""}${amount(row.variance, row.item.unit)}`}</td></tr>)}</tbody></table></div></Panel>
    </>}
    {modal === "count" && <Modal title="Conteo parcial" description="Registra la lectura física de un insumo. Vuelve a fijar su existencia desde cero." onClose={close}><div className="space-y-4">
      <label className="block text-sm font-semibold">Insumo<SelectField value={selected} onChange={(event) => setSelected(event.target.value)}>{activeItems.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</SelectField></label>
      <div className="block text-sm font-semibold">Cantidad contada<QuantityField base={selectedUnit} value={quantity} unit={quantityUnit} min="0" onChange={(next) => { setQuantity(next.value); setQuantityUnit(next.unit); }} /></div>
      <label className="block text-sm font-semibold">Nota (opcional)<TextField value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej. cierre de turno" /></label>
      <Button variant="primary" className="w-full" onClick={() => void saveCount()} disabled={!selected || quantity === "" || !(Number(quantity) >= 0)}>Guardar conteo</Button>
    </div></Modal>}
    {modal === "movement" && <Modal title="Entrada o merma" description="Este registro mueve la existencia a partir del último conteo." onClose={close}><div className="space-y-4">
      <label className="block text-sm font-semibold">Insumo<SelectField value={selected} onChange={(event) => setSelected(event.target.value)}>{activeItems.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</SelectField></label>
      <label className="block text-sm font-semibold">Tipo<SelectField value={movementType} onChange={(event) => setMovementType(event.target.value as "entry" | "waste")}><option value="entry">Entrada</option><option value="waste">Merma</option></SelectField></label>
      <div className="block text-sm font-semibold">Cantidad<QuantityField base={selectedUnit} value={quantity} unit={quantityUnit} min="0.001" onChange={(next) => { setQuantity(next.value); setQuantityUnit(next.unit); }} /></div>
      <label className="block text-sm font-semibold">Nota<TextField value={note} onChange={(event) => setNote(event.target.value)} placeholder="Proveedor o motivo" /></label>
      <Button variant="primary" className="w-full" onClick={() => void saveMovement()} disabled={!selected || !(Number(quantity) > 0) || !note.trim()}>Guardar registro</Button>
    </div></Modal>}
    {modal === "item" && <Modal title={editing ? `Editar ${editing.name}` : "Nuevo insumo"} description="La unidad elegida es la que guarda el insumo; el mínimo y la tolerancia se pueden capturar en cualquier unidad de la misma familia." onClose={close}><div className="space-y-4">
      <label className="block text-sm font-semibold">Nombre<TextField value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Ej. Café en grano" /></label>
      <label className="block text-sm font-semibold">Unidad<SelectField value={unit} onChange={(event) => changeUnit(event.target.value as InventoryUnit)}><option value="">Selecciona una unidad</option>{INVENTORY_UNITS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectField></label>
      {unitChanged && <InlineAlert>{unitFamilyChanged
        ? `Cambiar de ${editing?.unit} a ${unit} no tiene equivalencia: sólo se aceptará si el insumo aún no tiene conteos, movimientos ni recetas.`
        : `Al pasar de ${editing?.unit} a ${unit} se convertirán también sus conteos, movimientos y recetas.`}</InlineAlert>}
      <div className="block text-sm font-semibold">Mínimo<QuantityField base={unit} value={minimum} unit={minimumUnit} min="0" onChange={(next) => { setMinimum(next.value); setMinimumUnit(next.unit); }} /></div>
      <div className="block text-sm font-semibold">Tolerancia<QuantityField base={unit} value={tolerance} unit={toleranceUnit} min="0" onChange={(next) => { setTolerance(next.value); setToleranceUnit(next.unit); }} /></div>
      <Button variant="primary" className="w-full" onClick={() => void saveItem()} disabled={saving || !itemName.trim() || !unit || minimum === "" || tolerance === ""}>{saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear insumo"}</Button>
    </div></Modal>}
    {modal === "delete" && targetItem && <Modal title={`Eliminar ${targetItem.name}`} onClose={close}><div className="space-y-4">
      <p className="text-sm text-on-surface-variant">{targetUsed
        ? "Este insumo ya tiene historial, así que se dará de baja en lugar de borrarse: desaparecerá de las listas de trabajo pero sus conteos, movimientos y recetas seguirán cuadrando en los reportes."
        : "Este insumo no tiene conteos, movimientos ni recetas, así que se eliminará por completo."}</p>
      <div className="flex justify-end gap-2"><Button onClick={close}>Cancelar</Button><Button variant="danger" disabled={saving} onClick={() => void removeItem()}>{saving ? "Eliminando…" : targetUsed ? "Dar de baja" : "Eliminar"}</Button></div>
    </div></Modal>}
    {detailItemId && <InventoryDetailModal itemId={detailItemId} item={items.find((item) => item.id === detailItemId)} history={detailHistory} loading={detailLoading} error={detailError} onClose={() => setDetailItemId(null)} onEdit={openEdit} onDelete={openDelete} />}
  </Page>;
}

type TimelineEntry =
  | { kind: "count"; at: string; count: InventoryCount }
  | { kind: "movement"; at: string; movement: InventoryMovement };

const MOVEMENT_LABEL: Record<InventoryMovement["type"], string> = { entry: "Entrada", waste: "Merma", daily_consumption: "Venta", adjustment: "Ajuste" };
const MOVEMENT_TONE: Record<InventoryMovement["type"], "success" | "danger" | "neutral"> = { entry: "success", waste: "danger", daily_consumption: "danger", adjustment: "neutral" };

function InventoryDetailModal({ itemId, item, history, loading, error, onClose, onEdit, onDelete }: { itemId: string; item: InventoryItem | undefined; history: { counts: InventoryCount[]; movements: InventoryMovement[] }; loading: boolean; error: string; onClose: () => void; onEdit: (item: InventoryItem) => void; onDelete: (item: InventoryItem) => void }) {
  const unit = item?.unit ?? "";
  const periods = useMemo(() => buildInventoryPeriods(itemId, history.counts, history.movements), [itemId, history]);
  const pattern = useMemo(() => analyzeRestockPattern(itemId, history.movements), [itemId, history]);
  const timeline: TimelineEntry[] = useMemo(() => [
    ...history.counts.map((count): TimelineEntry => ({ kind: "count", at: count.countedAt, count })),
    ...history.movements.map((movement): TimelineEntry => ({ kind: "movement", at: movement.recordedAt, movement }))
  ].sort((a, b) => b.at.localeCompare(a.at)), [history]);

  return <Modal title={item?.name ?? "Insumo"} description="Historial de conteos, entradas y mermas de este insumo." onClose={onClose} width="max-w-2xl">
    {error && <div className="mb-4"><InlineAlert>{error}</InlineAlert></div>}
    {item && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-container-low px-4 py-3">
      <p className="text-sm text-on-surface-variant">{INVENTORY_UNITS.find((option) => option.value === item.unit)?.label ?? item.unit} · mínimo {amount(item.minimum, item.unit)} · tolerancia ±{amount(item.tolerance, item.unit)}</p>
      <div className="flex gap-2"><Button size="sm" onClick={() => { onClose(); onEdit(item); }}><Pencil size={16} /> Editar</Button><Button size="sm" variant="danger" onClick={() => { onClose(); onDelete(item); }}><Trash2 size={16} /> Eliminar</Button></div>
    </div>}
    {loading ? <LoadingState label="Cargando historial…" /> : <div className="space-y-6">
      <div className="rounded-xl bg-surface-container-high p-4 text-sm">
        {pattern.count === 0
          ? <p>Aún no hay recargas registradas para este insumo.</p>
          : pattern.averageIntervalDays === undefined
            ? <p>Una recarga registrada de <strong>{amount(pattern.averageQuantity ?? 0, unit)}</strong>. Falta historial para calcular la frecuencia.</p>
            : <p>Recarga cada <strong>~{pattern.averageIntervalDays} días</strong>, con <strong>~{amount(pattern.averageQuantity ?? 0, unit)}</strong> en promedio.</p>}
      </div>
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant">Consumo entre conteos</h3>
        {periods.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[460px] text-left text-sm"><thead className="bg-surface-container-low text-xs uppercase tracking-wider text-on-surface-variant"><tr><th className="px-4 py-2">Desde</th><th className="px-4 py-2 text-right">Días</th><th className="px-4 py-2 text-right">Entradas</th><th className="px-4 py-2 text-right">Mermas</th><th className="px-4 py-2 text-right">Consumo físico</th></tr></thead><tbody className="divide-y divide-outline-variant/25">{periods.map((period) => <tr key={period.endCountId ?? `${period.startCountId}-en-curso`}><td className="px-4 py-2">{formatDate(period.startAt)}{period.openEnded && <span className="ml-2 text-xs text-on-surface-variant">en curso</span>}</td><td className="px-4 py-2 text-right">{period.days}</td><td className="px-4 py-2 text-right">{amount(period.entries, unit)}</td><td className="px-4 py-2 text-right">{amount(period.waste, unit)}</td><td className="px-4 py-2 text-right font-semibold">{period.physical === undefined ? "—" : amount(period.physical, unit)}</td></tr>)}</tbody></table></div> : <p className="mt-2 text-sm text-on-surface-variant">Sin conteos registrados.</p>}
      </div>
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant">Historial</h3>
        <div className="mt-3 space-y-3">{timeline.length ? timeline.map((entry) => entry.kind === "count"
          ? <div key={`count-${entry.count.id}`} className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><Badge tone="neutral">Conteo</Badge>{formatDate(entry.at)}</span><strong>{amount(entry.count.lines.find((line) => line.itemId === itemId)?.quantity ?? 0, unit)}</strong></div>
          : <div key={`movement-${entry.movement.id}`} className="flex items-center justify-between gap-3 text-sm"><span className="flex flex-wrap items-center gap-2"><Badge tone={MOVEMENT_TONE[entry.movement.type]}>{MOVEMENT_LABEL[entry.movement.type]}</Badge>{formatDate(entry.at)}<span className="text-xs text-on-surface-variant">{entry.movement.note}</span></span><strong>{entry.movement.type === "entry" || entry.movement.type === "adjustment" ? "+" : "−"}{amount(entry.movement.quantity, unit)}</strong></div>
        ) : <p className="text-sm text-on-surface-variant">Sin movimientos registrados.</p>}</div>
      </div>
    </div>}
  </Modal>;
}
