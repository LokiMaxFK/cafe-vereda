import { useMemo, useState } from "react";
import { Circle, Plus, RectangleHorizontal, Square, Trash2 } from "lucide-react";
import { Button, InlineAlert, Page, PageHeader, Panel, TextField } from "../../design-system/react";
import { Modal } from "../components/Modal";
import { TableFloorPlan } from "../components/TableFloorPlan";
import type { CafeTable } from "../domain/types";
import { occupiesFloor, orderDestination } from "../domain/order";
import { useApp } from "../state/AppContext";

const shapeOptions: Array<{ value: CafeTable["shape"]; label: string; icon: typeof Circle }> = [
  { value: "round", label: "Redonda", icon: Circle },
  { value: "square", label: "Cuadrada", icon: Square },
  { value: "rectangular", label: "Rectangular", icon: RectangleHorizontal }
];

export function TablesPage() {
  const { tables, orders, online, addTable, updateTable, removeTable } = useApp();
  // Una mesa quitada desaparece del croquis; si tenía historial queda archivada sólo en la base.
  const activeTables = useMemo(() => tables.filter((table) => table.active), [tables]);
  const [editing, setEditing] = useState<CafeTable | null>(null);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [seats, setSeats] = useState("2");
  const [shape, setShape] = useState<CafeTable["shape"]>("square");
  const [message, setMessage] = useState("");

  function openEditor(table: CafeTable) {
    setEditing(table); setSeats(String(table.seats)); setShape(table.shape); setConfirmingRemoval(false);
  }
  async function saveDetails() {
    if (!editing) return;
    await updateTable(editing.id, { seats: Math.max(1, Number(seats) || 1), shape });
    setEditing(null);
  }
  async function handleRemove() {
    if (!editing || openOrder) return;
    setRemoving(true);
    try { await removeTable(editing.id); setEditing(null); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo quitar la mesa."); setEditing(null); }
    finally { setRemoving(false); }
  }
  async function handleAddTable() {
    try { await addTable(); } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo agregar la mesa."); }
  }
  async function handleReposition(table: CafeTable, x: number, y: number) {
    try { await updateTable(table.id, { x, y }); } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo mover la mesa."); }
  }

  // Una mesa con cuenta viva no se puede dar de baja: el pedido desaparecería del salón sin aviso
  // y sólo se recuperaría entrando a Pedidos, con el riesgo de que nadie llegue a cobrarlo.
  const openOrder = editing ? orders.find((order) => order.tableId === editing.id && occupiesFloor(order)) : undefined;

  return (
    <Page size="wide">
      <PageHeader eyebrow="GESTIÓN · SALÓN" title="Mesas" description="Agrega, quita y acomoda las mesas arrastrándolas sobre el croquis." action={<Button variant="primary" onClick={() => void handleAddTable()}><Plus size={18} /> Agregar mesa</Button>} />
      {!online && <div className="mb-4"><InlineAlert tone="error">Sin conexión: los cambios se ven aquí pero no se guardarán hasta reconectar.</InlineAlert></div>}
      {message && <div className="mb-4"><InlineAlert tone="error">{message}</InlineAlert></div>}
      <Panel className="p-4 sm:p-6">
        {activeTables.length ? (
          <TableFloorPlan tables={activeTables} draggable onReposition={(table, x, y) => void handleReposition(table, x, y)} onSelect={openEditor} />
        ) : (
          <p className="rounded-xl border border-dashed border-outline-variant p-8 text-center text-sm text-on-surface-variant">Todavía no hay mesas. Agrega la primera con el botón de arriba.</p>
        )}
      </Panel>
      <p className="mt-3 text-xs text-on-surface-variant">Arrastra una mesa para reacomodarla. Toca una mesa (sin arrastrar) para editar sus lugares, forma o quitarla.</p>
      {editing && <Modal title={`Mesa ${editing.number}`} description="Ajusta sus lugares y forma." onClose={() => setEditing(null)}>
        <div className="space-y-5">
          <label className="block text-sm font-semibold text-on-surface-variant">Lugares<TextField type="number" min="1" value={seats} onChange={(event) => setSeats(event.target.value)} /></label>
          <div>
            <p className="mb-2 text-sm font-semibold">Forma</p>
            <div className="grid grid-cols-3 gap-2">{shapeOptions.map((option) => { const Icon = option.icon; return <button key={option.value} type="button" onClick={() => setShape(option.value)} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-bold ${shape === option.value ? "border-primary bg-primary-fixed text-primary" : "border-outline-variant/40"}`}><Icon size={18} />{option.label}</button>; })}</div>
          </div>
          <Button variant="primary" className="w-full" onClick={() => void saveDetails()}>Guardar cambios</Button>
          {confirmingRemoval ? (
            <div className="space-y-2 rounded-xl border border-error/40 p-3">
              <p className="text-center text-sm font-semibold">¿Quitar la mesa {editing.number} definitivamente?</p>
              <div className="grid grid-cols-2 gap-2">
                <Button disabled={removing} onClick={() => setConfirmingRemoval(false)}>Cancelar</Button>
                <Button variant="danger" disabled={removing} onClick={() => void handleRemove()}><Trash2 size={18} /> {removing ? "Quitando…" : "Sí, quitar"}</Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" className="w-full" disabled={Boolean(openOrder)} onClick={() => setConfirmingRemoval(true)}><Trash2 size={18} /> Quitar mesa</Button>
          )}
          {openOrder && <p className="text-center text-xs text-on-surface-variant">Tiene la cuenta #{openOrder.folio} abierta ({orderDestination(openOrder)}). Cóbrala o cancélala antes de quitar la mesa.</p>}
        </div>
      </Modal>}
    </Page>
  );
}
