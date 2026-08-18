import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Boxes, ClipboardCheck, History, Plus, Scale } from "lucide-react";
import { Badge, Button, InlineAlert, LoadingState, MetricCard, Page, PageHeader, Panel, SelectField, TextField } from "../../design-system/react";
import { analyzeRestockPattern, buildInventoryPeriods, createInventoryAnalysis, INVENTORY_UNITS, isInventoryVarianceAlert } from "../domain/inventory";
import type { InventoryCount, InventoryItem, InventoryMovement, InventoryUnit } from "../domain/types";
import { Modal } from "../components/Modal";
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

function remoteItem(row: Record<string, unknown>): InventoryItem {
  return { id: String(row.id), name: String(row.name), unit: String(row.unit) as InventoryUnit, minimum: Number(row.minimum_quantity), tolerance: Number(row.tolerance_quantity ?? 0), active: Boolean(row.active), updatedAt: String(row.updated_at ?? "") };
}
function remoteCount(row: Record<string, unknown>): InventoryCount {
  const lines = (row.inventory_count_lines as Array<Record<string, unknown>> | null) ?? [];
  return { id: String(row.id), countedAt: String(row.counted_at), note: row.note ? String(row.note) : undefined, recordedBy: row.recorded_by ? String(row.recorded_by) : undefined, lines: lines.map((line) => ({ itemId: String(line.inventory_item_id), quantity: Number(line.quantity) })) };
}
function remoteMovement(row: Record<string, unknown>): InventoryMovement {
  return { id: String(row.id), itemId: String(row.inventory_item_id), type: row.movement_type as "entry" | "waste", quantity: Number(row.quantity), note: String(row.note), recordedAt: String(row.created_at), recordedBy: row.recorded_by ? String(row.recorded_by) : undefined };
}
const amount = (value: number, unit: string) => `${Number(value.toFixed(3))} ${unit}`;
const formatDate = (value: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

async function fetchItemHistory(itemId: string): Promise<{ counts: InventoryCount[]; movements: InventoryMovement[] }> {
  if (!supabase) return { counts: [], movements: [] };
  const [countResult, movementResult] = await Promise.all([
    supabase.from("inventory_counts").select("id,counted_at,note,recorded_by,inventory_count_lines!inner(inventory_item_id,quantity)").eq("inventory_count_lines.inventory_item_id", itemId).order("counted_at", { ascending: false }).limit(200),
    supabase.from("inventory_movements").select("id,inventory_item_id,movement_type,quantity,note,created_at,recorded_by").eq("inventory_item_id", itemId).in("movement_type", ["entry", "waste"]).order("created_at", { ascending: false }).limit(200)
  ]);
  const failure = countResult.error ?? movementResult.error;
  if (failure) throw new Error(failure.message);
  return {
    counts: (countResult.data ?? []).map((row) => remoteCount(row as Record<string, unknown>)),
    movements: (movementResult.data ?? []).map((row) => remoteMovement(row as Record<string, unknown>))
  };
}

export function InventoryPage() {
  const { session, forceSync } = useApp();
  const [items, setItems] = useState<InventoryItem[]>(demoItems);
  const [counts, setCounts] = useState<InventoryCount[]>(demoCounts);
  const [movements, setMovements] = useState<InventoryMovement[]>(demoMovements);
  const [expected, setExpected] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"count" | "movement" | "item" | null>(null);
  const [selected, setSelected] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [movementType, setMovementType] = useState<"entry" | "waste">("entry");
  const [itemName, setItemName] = useState("");
  const [unit, setUnit] = useState<InventoryUnit | "">("");
  const [minimum, setMinimum] = useState("");
  const [tolerance, setTolerance] = useState("");
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [detailHistory, setDetailHistory] = useState<{ counts: InventoryCount[]; movements: InventoryMovement[] }>({ counts: [], movements: [] });
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const load = async () => {
    if (!supabase) return;
    setLoading(true); setError("");
    const since = new Date(Date.now() - 31 * 86_400_000).toISOString();
    const [itemResult, countResult, movementResult, usageResult] = await Promise.all([
      supabase.from("inventory_items").select("id,name,unit,minimum_quantity,tolerance_quantity,active,updated_at").order("name"),
      supabase.from("inventory_counts").select("id,counted_at,note,recorded_by,inventory_count_lines(inventory_item_id,quantity)").order("counted_at", { ascending: false }).limit(500),
      supabase.from("inventory_movements").select("id,inventory_item_id,movement_type,quantity,note,created_at,recorded_by").in("movement_type", ["entry", "waste"]).gte("created_at", since).order("created_at", { ascending: false }).limit(500),
      supabase.from("inventory_usage_events").select("occurred_at,inventory_usage_lines(inventory_item_id,quantity)").gte("occurred_at", since)
    ]);
    const resultError = itemResult.error || countResult.error || movementResult.error || usageResult.error;
    if (resultError) setError(resultError.message);
    else {
      const nextItems = (itemResult.data ?? []).map((row) => remoteItem(row as Record<string, unknown>));
      const nextCounts = (countResult.data ?? []).map((row) => remoteCount(row as Record<string, unknown>));
      const nextMovements = (movementResult.data ?? []).map((row) => remoteMovement(row as Record<string, unknown>));
      setItems(nextItems); setCounts(nextCounts); setMovements(nextMovements);
      await Promise.all([db.inventoryItems.bulkPut(nextItems), db.inventoryCounts.bulkPut(nextCounts), db.inventoryMovements.bulkPut(nextMovements)]);
      const totals: Record<string, number> = {};
      for (const event of usageResult.data ?? []) for (const line of (event.inventory_usage_lines ?? []) as Array<{ inventory_item_id: string; quantity: number }>) totals[line.inventory_item_id] = (totals[line.inventory_item_id] ?? 0) + Number(line.quantity);
      setExpected(totals);
    }
    setLoading(false);
  };
  useEffect(() => { if (supabase) void Promise.all([db.inventoryItems.toArray(), db.inventoryCounts.toArray(), db.inventoryMovements.toArray()]).then(([savedItems, savedCounts, savedMovements]) => { if (savedItems.length) setItems(savedItems); if (savedCounts.length) setCounts(savedCounts); if (savedMovements.length) setMovements(savedMovements); }); void load(); }, []);
  useEffect(() => { if (!selected && items.length) setSelected(items[0].id); }, [items, selected]);
  useEffect(() => {
    if (!detailItemId) return;
    if (!supabase) {
      setDetailHistory({
        counts: counts.filter((count) => count.lines.some((line) => line.itemId === detailItemId)),
        movements: movements.filter((movement) => movement.itemId === detailItemId)
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

  const range = useMemo(() => ({ start: new Date(Date.now() - 30 * 86_400_000).toISOString(), end: new Date().toISOString() }), []);
  const analysis = useMemo(() => createInventoryAnalysis(items, counts, movements, expected, range.start, range.end), [items, counts, movements, expected, range]);
  const latestFor = (id: string) => counts.filter((count) => count.lines.some((line) => line.itemId === id)).sort((a, b) => b.countedAt.localeCompare(a.countedAt))[0];
  const low = items.filter((item) => { const value = latestFor(item.id)?.lines.find((line) => line.itemId === item.id)?.quantity; return value !== undefined && value <= item.minimum; });
  const close = () => { setModal(null); setQuantity(""); setNote(""); setItemName(""); setUnit(""); setMinimum(""); setTolerance(""); };

  async function saveCount() {
    const value = Number(quantity); if (!selected || !Number.isFinite(value) || value < 0) return;
    const count: InventoryCount = { id: crypto.randomUUID(), countedAt: new Date().toISOString(), note: note.trim() || undefined, recordedBy: session?.id, lines: [{ itemId: selected, quantity: value }] };
    setError("");
    try {
      if (supabase) { await db.inventoryCounts.put(count); await queueOperation("record_inventory_count", count.id, count); void forceSync(); }
      setCounts((current) => [count, ...current]); close();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar el conteo."); }
  }
  async function saveMovement() {
    const value = Number(quantity); if (!selected || !Number.isFinite(value) || value <= 0 || !note.trim()) return;
    const movement: InventoryMovement = { id: crypto.randomUUID(), itemId: selected, type: movementType, quantity: value, note: note.trim(), recordedAt: new Date().toISOString(), recordedBy: session?.id };
    setError("");
    try {
      if (supabase) { await db.inventoryMovements.put(movement); await queueOperation("record_inventory_movement", movement.id, movement); void forceSync(); }
      setMovements((current) => [movement, ...current]); close();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar el movimiento."); }
  }
  async function saveItem() {
    if (!itemName.trim() || !unit || Number(minimum) < 0 || Number(tolerance) < 0) return;
    const next: InventoryItem = { id: crypto.randomUUID(), name: itemName.trim(), unit, minimum: Number(minimum), tolerance: Number(tolerance), active: true };
    try {
      if (supabase) {
        const { error: insertError } = await supabase.from("inventory_items").insert({ id: next.id, name: next.name, unit: next.unit, minimum_quantity: next.minimum, tolerance_quantity: next.tolerance, active: true });
        if (insertError) throw insertError;
      }
      if (supabase) await db.inventoryItems.put(next);
      setItems((current) => [...current, next].sort((a, b) => a.name.localeCompare(b.name, "es"))); close();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo crear el insumo."); }
  }

  return <Page size="wide">
    <PageHeader eyebrow="CONTEO Y CONSUMO" title="Insumos" description="Los conteos son la existencia física. Las recetas sólo generan indicadores y nunca descuentan stock." action={<div className="flex flex-wrap gap-2"><Button onClick={() => setModal("item")}><Plus size={18} /> Nuevo insumo</Button><Button variant="primary" onClick={() => setModal("count")}><ClipboardCheck size={18} /> Registrar conteo</Button></div>} />
    {error && <div className="mb-5"><InlineAlert>{error}</InlineAlert></div>}
    {loading ? <LoadingState label="Cargando conteos e indicadores…" /> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Boxes />} label="Insumos activos" value={items.filter((item) => item.active).length} detail="Con unidad, mínimo y tolerancia" tone="primary" />
        <MetricCard icon={<AlertTriangle />} label="Bajo mínimo" value={low.length} detail={low.length ? low.map((item) => item.name).join(", ") : "Sin alertas de reposición"} tone={low.length ? "danger" : "success"} />
        <MetricCard icon={<Scale />} label="Variaciones" value={analysis.filter(isInventoryVarianceAlert).length} detail="Fuera de su tolerancia" tone={analysis.some(isInventoryVarianceAlert) ? "danger" : "success"} />
        <MetricCard icon={<History />} label="Conteos registrados" value={counts.length} detail="Cada lectura permanece auditable" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Panel className="overflow-hidden"><div className="flex items-center justify-between gap-3 border-b border-outline-variant/30 p-5"><div><h2 className="text-lg font-bold">Existencia contada</h2><p className="text-sm text-on-surface-variant">Última lectura física por insumo.</p></div><Button size="sm" onClick={() => setModal("movement")}><Plus size={16} /> Entrada o merma</Button></div><div className="divide-y divide-outline-variant/25">{items.map((item) => { const latest = latestFor(item.id); const value = latest?.lines.find((line) => line.itemId === item.id)?.quantity; const alert = value !== undefined && value <= item.minimum; return <button type="button" key={item.id} onClick={() => setDetailItemId(item.id)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-container-low/60"><div><div className="flex items-center gap-2"><p className="font-semibold">{item.name}</p>{alert && <Badge tone="danger">Reponer</Badge>}</div><p className="text-xs text-on-surface-variant">Mínimo {amount(item.minimum, item.unit)} · tolerancia ±{amount(item.tolerance, item.unit)}{latest ? ` · contado ${formatDate(latest.countedAt)}` : " · pendiente de línea base"}</p></div><p className={`text-xl font-bold ${alert ? "text-error" : "text-on-surface"}`}>{value === undefined ? "—" : amount(value, item.unit)}</p></button>; })}</div></Panel>
        <Panel className="p-5"><h2 className="text-lg font-bold">Últimos registros</h2><div className="mt-4 space-y-4">{[...movements].slice(0, 6).map((movement) => { const item = items.find((current) => current.id === movement.itemId); const positive = movement.type === "entry"; return <div key={movement.id} className="flex gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${positive ? "bg-tertiary-fixed text-tertiary" : "bg-error-container text-error"}`}>{positive ? <ArrowUp size={17} /> : <ArrowDown size={17} />}</span><div><div className="flex gap-2"><p className="font-semibold">{item?.name ?? "Insumo"}</p><strong>{positive ? "+" : "−"}{amount(movement.quantity, item?.unit ?? "")}</strong></div><p className="text-xs text-on-surface-variant">{positive ? "Entrada" : "Merma"} · {movement.note}</p></div></div>; })}{!movements.length && <p className="text-sm text-on-surface-variant">Aún no hay entradas ni mermas.</p>}</div></Panel>
      </div>
      <Panel className="mt-6 overflow-hidden"><div className="border-b border-outline-variant/30 p-5"><p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Indicador de los últimos 30 días</p><h2 className="mt-1 text-lg font-bold">Consumo contado vs. receta teórica</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-surface-container-low text-xs uppercase tracking-wider text-on-surface-variant"><tr><th className="px-5 py-3">Insumo</th><th className="px-5 py-3 text-right">Entradas</th><th className="px-5 py-3 text-right">Mermas</th><th className="px-5 py-3 text-right">Físico</th><th className="px-5 py-3 text-right">Teórico</th><th className="px-5 py-3 text-right">Diferencia</th></tr></thead><tbody className="divide-y divide-outline-variant/25">{analysis.map((row) => <tr key={row.item.id}><td className="px-5 py-4"><p className="font-semibold">{row.item.name}</p><p className="text-xs text-on-surface-variant">{row.openingAt && row.closingAt ? "Con dos conteos comparables" : "Falta línea base o segundo conteo"}</p></td><td className="px-5 py-4 text-right">{amount(row.entries, row.item.unit)}</td><td className="px-5 py-4 text-right">{amount(row.waste, row.item.unit)}</td><td className="px-5 py-4 text-right font-semibold">{row.physical === undefined ? "—" : amount(row.physical, row.item.unit)}</td><td className="px-5 py-4 text-right">{amount(row.theoretical, row.item.unit)}</td><td className={`px-5 py-4 text-right font-bold ${isInventoryVarianceAlert(row) ? "text-error" : ""}`}>{row.variance === undefined ? "—" : `${row.variance > 0 ? "+" : ""}${amount(row.variance, row.item.unit)}`}</td></tr>)}</tbody></table></div></Panel>
    </>}
    {modal === "count" && <Modal title="Conteo parcial" description="Registra la lectura física de un insumo. No modifica un stock calculado." onClose={close}><div className="space-y-4"><label className="block text-sm font-semibold">Insumo<SelectField value={selected} onChange={(event) => setSelected(event.target.value)}>{items.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</SelectField></label><label className="block text-sm font-semibold">Cantidad contada<TextField type="number" min="0" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label className="block text-sm font-semibold">Nota (opcional)<TextField value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej. cierre de turno" /></label><Button variant="primary" className="w-full" onClick={() => void saveCount()} disabled={!selected || quantity === ""}>Guardar conteo</Button></div></Modal>}
    {modal === "movement" && <Modal title="Entrada o merma" description="Este registro explica el cambio entre conteos; no altera el último conteo." onClose={close}><div className="space-y-4"><label className="block text-sm font-semibold">Insumo<SelectField value={selected} onChange={(event) => setSelected(event.target.value)}>{items.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</SelectField></label><label className="block text-sm font-semibold">Tipo<SelectField value={movementType} onChange={(event) => setMovementType(event.target.value as "entry" | "waste")}><option value="entry">Entrada</option><option value="waste">Merma</option></SelectField></label><label className="block text-sm font-semibold">Cantidad<TextField type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label className="block text-sm font-semibold">Nota<TextField value={note} onChange={(event) => setNote(event.target.value)} placeholder="Proveedor o motivo" /></label><Button variant="primary" className="w-full" onClick={() => void saveMovement()} disabled={!selected || !Number(quantity) || !note.trim()}>Guardar registro</Button></div></Modal>}
    {modal === "item" && <Modal title="Nuevo insumo" description="Configura una unidad estándar para los conteos y el margen aceptable de variación." onClose={close}><div className="space-y-4"><label className="block text-sm font-semibold">Nombre<TextField value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Ej. Café en grano" /></label><label className="block text-sm font-semibold">Unidad<SelectField value={unit} onChange={(event) => setUnit(event.target.value as InventoryUnit)}><option value="">Selecciona una unidad</option>{INVENTORY_UNITS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectField></label><label className="block text-sm font-semibold">Mínimo<TextField type="number" min="0" step="0.001" value={minimum} onChange={(event) => setMinimum(event.target.value)} /></label><label className="block text-sm font-semibold">Tolerancia<TextField type="number" min="0" step="0.001" value={tolerance} onChange={(event) => setTolerance(event.target.value)} /></label><Button variant="primary" className="w-full" onClick={() => void saveItem()} disabled={!itemName.trim() || !unit || minimum === "" || tolerance === ""}>Crear insumo</Button></div></Modal>}
    {detailItemId && <InventoryDetailModal itemId={detailItemId} item={items.find((item) => item.id === detailItemId)} history={detailHistory} loading={detailLoading} error={detailError} onClose={() => setDetailItemId(null)} />}
  </Page>;
}

type TimelineEntry =
  | { kind: "count"; at: string; count: InventoryCount }
  | { kind: "entry" | "waste"; at: string; movement: InventoryMovement };

function InventoryDetailModal({ itemId, item, history, loading, error, onClose }: { itemId: string; item: InventoryItem | undefined; history: { counts: InventoryCount[]; movements: InventoryMovement[] }; loading: boolean; error: string; onClose: () => void }) {
  const unit = item?.unit ?? "";
  const periods = useMemo(() => buildInventoryPeriods(itemId, history.counts, history.movements), [itemId, history]);
  const pattern = useMemo(() => analyzeRestockPattern(itemId, history.movements), [itemId, history]);
  const timeline: TimelineEntry[] = useMemo(() => [
    ...history.counts.map((count): TimelineEntry => ({ kind: "count", at: count.countedAt, count })),
    ...history.movements.map((movement): TimelineEntry => ({ kind: movement.type, at: movement.recordedAt, movement }))
  ].sort((a, b) => b.at.localeCompare(a.at)), [history]);

  return <Modal title={item?.name ?? "Insumo"} description="Historial de conteos, entradas y mermas de este insumo." onClose={onClose} width="max-w-2xl">
    {error && <div className="mb-4"><InlineAlert>{error}</InlineAlert></div>}
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
        {periods.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-surface-container-low text-xs uppercase tracking-wider text-on-surface-variant"><tr><th className="px-4 py-2">Desde</th><th className="px-4 py-2">Hasta</th><th className="px-4 py-2 text-right">Días</th><th className="px-4 py-2 text-right">Entradas</th><th className="px-4 py-2 text-right">Mermas</th><th className="px-4 py-2 text-right">Consumo físico</th></tr></thead><tbody className="divide-y divide-outline-variant/25">{periods.map((period) => <tr key={period.endCountId}><td className="px-4 py-2">{period.startAt ? formatDate(period.startAt) : "Línea base"}</td><td className="px-4 py-2">{formatDate(period.endAt)}</td><td className="px-4 py-2 text-right">{period.startAt ? period.days : "—"}</td><td className="px-4 py-2 text-right">{amount(period.entries, unit)}</td><td className="px-4 py-2 text-right">{amount(period.waste, unit)}</td><td className="px-4 py-2 text-right font-semibold">{period.physical === undefined ? "—" : amount(period.physical, unit)}</td></tr>)}</tbody></table></div> : <p className="mt-2 text-sm text-on-surface-variant">Sin conteos registrados.</p>}
      </div>
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant">Historial</h3>
        <div className="mt-3 space-y-3">{timeline.length ? timeline.map((entry) => entry.kind === "count"
          ? <div key={`count-${entry.count.id}`} className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><Badge tone="neutral">Conteo</Badge>{formatDate(entry.at)}</span><strong>{amount(entry.count.lines.find((line) => line.itemId === itemId)?.quantity ?? 0, unit)}</strong></div>
          : <div key={`movement-${entry.movement.id}`} className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><Badge tone={entry.kind === "entry" ? "success" : "danger"}>{entry.kind === "entry" ? "Entrada" : "Merma"}</Badge>{formatDate(entry.at)}</span><strong>{entry.kind === "entry" ? "+" : "−"}{amount(entry.movement.quantity, unit)}</strong></div>
        ) : <p className="text-sm text-on-surface-variant">Sin movimientos registrados.</p>}</div>
      </div>
    </div>}
  </Modal>;
}
