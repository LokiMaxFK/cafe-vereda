import { useState } from "react";
import { Circle, Plus, RectangleHorizontal, RotateCcw, Square, Trash2 } from "lucide-react";
import { Button, InlineAlert, Page, PageHeader, Panel, TextField } from "../../design-system/react";
import { Modal } from "../components/Modal";
import { TableFloorPlan } from "../components/TableFloorPlan";
import type { CafeTable } from "../domain/types";
import { useApp } from "../state/AppContext";

const shapeOptions: Array<{ value: CafeTable["shape"]; label: string; icon: typeof Circle }> = [
  { value: "round", label: "Redonda", icon: Circle },
  { value: "square", label: "Cuadrada", icon: Square },
  { value: "rectangular", label: "Rectangular", icon: RectangleHorizontal }
];

export function TablesPage() {
  const { tables, online, addTable, updateTable } = useApp();
  const [editing, setEditing] = useState<CafeTable | null>(null);
  const [seats, setSeats] = useState("2");
  const [shape, setShape] = useState<CafeTable["shape"]>("square");
  const [message, setMessage] = useState("");

  function openEditor(table: CafeTable) {
    setEditing(table); setSeats(String(table.seats)); setShape(table.shape);
  }
  async function saveDetails() {
    if (!editing) return;
    await updateTable(editing.id, { seats: Math.max(1, Number(seats) || 1), shape });
    setEditing(null);
  }
  async function toggleActive() {
    if (!editing) return;
    await updateTable(editing.id, { active: !editing.active });
    setEditing(null);
  }
  async function handleAddTable() {
    try { await addTable(); } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo agregar la mesa."); }
  }
  async function handleReposition(table: CafeTable, x: number, y: number) {
    try { await updateTable(table.id, { x, y }); } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo mover la mesa."); }
  }

  return (
    <Page size="wide">
      <PageHeader eyebrow="GESTIÓN · SALÓN" title="Mesas" description="Agrega, quita y acomoda las mesas arrastrándolas sobre el croquis." action={<Button variant="primary" onClick={() => void handleAddTable()}><Plus size={18} /> Agregar mesa</Button>} />
      {!online && <div className="mb-4"><InlineAlert tone="error">Sin conexión: los cambios se ven aquí pero no se guardarán hasta reconectar.</InlineAlert></div>}
      {message && <div className="mb-4"><InlineAlert tone="error">{message}</InlineAlert></div>}
      <Panel className="p-4 sm:p-6">
        {tables.length ? (
          <TableFloorPlan tables={tables} draggable onReposition={(table, x, y) => void handleReposition(table, x, y)} onSelect={openEditor} />
        ) : (
          <p className="rounded-xl border border-dashed border-outline-variant p-8 text-center text-sm text-on-surface-variant">Todavía no hay mesas. Agrega la primera con el botón de arriba.</p>
        )}
      </Panel>
      <p className="mt-3 text-xs text-on-surface-variant">Arrastra una mesa para reacomodarla. Toca una mesa (sin arrastrar) para editar sus lugares, forma o darla de baja. Las mesas atenuadas están dadas de baja.</p>
      {editing && <Modal title={`Mesa ${editing.number}`} description={editing.active ? "Ajusta sus lugares y forma." : "Esta mesa está dada de baja."} onClose={() => setEditing(null)}>
        <div className="space-y-5">
          <label className="block text-sm font-semibold text-on-surface-variant">Lugares<TextField type="number" min="1" value={seats} onChange={(event) => setSeats(event.target.value)} /></label>
          <div>
            <p className="mb-2 text-sm font-semibold">Forma</p>
            <div className="grid grid-cols-3 gap-2">{shapeOptions.map((option) => { const Icon = option.icon; return <button key={option.value} type="button" onClick={() => setShape(option.value)} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-bold ${shape === option.value ? "border-primary bg-primary-fixed text-primary" : "border-outline-variant/40"}`}><Icon size={18} />{option.label}</button>; })}</div>
          </div>
          <Button variant="primary" className="w-full" onClick={() => void saveDetails()}>Guardar cambios</Button>
          <Button variant={editing.active ? "danger" : "success"} className="w-full" onClick={() => void toggleActive()}>{editing.active ? <><Trash2 size={18} /> Quitar mesa</> : <><RotateCcw size={18} /> Reactivar mesa</>}</Button>
        </div>
      </Modal>}
    </Page>
  );
}
