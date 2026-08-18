import { useRef, useState } from "react";
import { Users } from "lucide-react";
import type { TableStatus } from "../domain/order";
import type { CafeTable } from "../domain/types";
import { tableStatusSurface } from "./tableStatusTone";

const DRAG_THRESHOLD = 6;
/** Paso de la retícula de fondo, en píxeles. Debe coincidir con el bg-[size:32px_32px] del contenedor. */
const GRID_PX = 32;
/** Distancia máxima, en porcentaje, para que una mesa se magnetice a la línea de otra. */
const ALIGN_TOLERANCE = 1.2;

export interface TableFloorPlanProps {
  tables: CafeTable[];
  getStatus?: (table: CafeTable) => TableStatus;
  getBadge?: (table: CafeTable) => string | undefined;
  selectedId?: string;
  disabledIds?: Set<string>;
  onSelect?: (table: CafeTable) => void;
  draggable?: boolean;
  /** Alinea a la retícula y a las mesas vecinas al arrastrar. Activo por defecto cuando draggable. */
  snap?: boolean;
  onReposition?: (table: CafeTable, x: number, y: number) => void;
}

// Las posiciones de las mesas son porcentajes del contenedor, pero éste no mide lo mismo en
// todas las pantallas (en Salón comparte fila con el carril de "para llevar", en Mesas ocupa
// todo el ancho). Si el tamaño de la mesa fuera fijo en píxeles, el mismo croquis se vería
// apretado —o hasta traslapado— en el contenedor angosto aunque en el ancho quepa perfecto.
// clamp(mín, %-del-contenedor, máx) hace que el tamaño escale junto con las posiciones.
const shapeClass: Record<CafeTable["shape"], string> = {
  round: "w-[clamp(72px,10.5cqw,128px)] h-[clamp(72px,10.5cqw,128px)] rounded-full",
  square: "w-[clamp(72px,10.5cqw,128px)] h-[clamp(72px,10.5cqw,128px)] rounded-2xl",
  rectangular: "w-[clamp(92px,13.5cqw,164px)] h-[clamp(62px,9cqw,112px)] rounded-2xl"
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Devuelve la coordenada de la mesa vecina más cercana dentro de la tolerancia, o undefined. */
function nearestGuide(value: number, others: number[]) {
  let best: number | undefined;
  let bestDistance = ALIGN_TOLERANCE;
  for (const other of others) {
    const distance = Math.abs(other - value);
    if (distance < bestDistance) { best = other; bestDistance = distance; }
  }
  return best;
}

export function TableFloorPlan({ tables, getStatus, getBadge, selectedId, disabledIds, onSelect, draggable, snap, onReposition }: TableFloorPlanProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [livePosition, setLivePosition] = useState<{ id: string; x: number; y: number } | null>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const movedRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const snapping = snap ?? draggable;

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>, table: CafeTable) {
    if (!draggable) return;
    movedRef.current = false;
    startRef.current = { x: event.clientX, y: event.clientY };
    setDragId(table.id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: React.PointerEvent) {
    if (!dragId || !containerRef.current || !startRef.current) return;
    if (!movedRef.current) {
      const dx = event.clientX - startRef.current.x; const dy = event.clientY - startRef.current.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      movedRef.current = true;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 4, 96);
    const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 4, 96);
    const nextGuides: { x?: number; y?: number } = {};

    // Durante el arrastre la mesa sigue el cursor 1:1; solo se "imanta" cuando queda muy
    // cerca de otra mesa, para dar una referencia visual sin interrumpir el movimiento.
    if (snapping) {
      const others = tables.filter((table) => table.id !== dragId);
      const guideX = nearestGuide(x, others.map((table) => table.x));
      const guideY = nearestGuide(y, others.map((table) => table.y));
      if (guideX !== undefined) nextGuides.x = guideX;
      if (guideY !== undefined) nextGuides.y = guideY;
    }

    setGuides(nextGuides);
    setLivePosition({ id: dragId, x: nextGuides.x ?? x, y: nextGuides.y ?? y });
  }
  function endDrag() {
    setDragId(null); setLivePosition(null); setGuides({});
    movedRef.current = false; startRef.current = null;
  }
  function onPointerUp(table: CafeTable) {
    if (!draggable || dragId !== table.id) return;
    if (movedRef.current && livePosition && containerRef.current) {
      // El snap a cuadrícula se aplica solo al soltar, para que el arrastre en sí sea fluido.
      const rect = containerRef.current.getBoundingClientRect();
      const others = tables.filter((candidate) => candidate.id !== table.id);
      const guideX = nearestGuide(livePosition.x, others.map((candidate) => candidate.x));
      const guideY = nearestGuide(livePosition.y, others.map((candidate) => candidate.y));
      const x = guideX ?? (Math.round(((livePosition.x / 100) * rect.width) / GRID_PX) * GRID_PX / rect.width) * 100;
      const y = guideY ?? (Math.round(((livePosition.y / 100) * rect.height) / GRID_PX) * GRID_PX / rect.height) * 100;
      onReposition?.(table, clamp(x, 4, 96), clamp(y, 4, 96));
    }
    else if (!disabledIds?.has(table.id)) onSelect?.(table);
    endDrag();
  }
  function onClick(table: CafeTable) {
    if (draggable || disabledIds?.has(table.id)) return;
    onSelect?.(table);
  }

  return (
    <div ref={containerRef} onPointerMove={onPointerMove} className="@container relative min-h-[420px] w-full overflow-hidden rounded-2xl bg-[linear-gradient(rgba(90,58,27,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(90,58,27,.035)_1px,transparent_1px)] bg-[size:32px_32px]">
      {guides.x !== undefined && <div className="pointer-events-none absolute top-0 z-20 h-full w-px bg-primary/60" style={{ left: `${guides.x}%` }} />}
      {guides.y !== undefined && <div className="pointer-events-none absolute left-0 z-20 h-px w-full bg-primary/60" style={{ top: `${guides.y}%` }} />}
      {tables.map((table) => {
        const position = livePosition?.id === table.id ? livePosition : table;
        const status = getStatus?.(table) ?? "free";
        const disabled = disabledIds?.has(table.id);
        const selected = selectedId === table.id;
        const tone = disabled ? "border-outline-variant/30 bg-surface-container-highest/60 text-on-surface-variant opacity-50"
          : selected ? "border-primary bg-primary text-on-primary shadow-brand"
          : tableStatusSurface[status];
        return (
          <button
            key={table.id}
            type="button"
            disabled={disabled && !draggable}
            onPointerDown={(event) => onPointerDown(event, table)}
            onPointerUp={() => onPointerUp(table)}
            onPointerCancel={endDrag}
            onClick={() => onClick(table)}
            style={{ left: `${position.x}%`, top: `${position.y}%`, touchAction: draggable ? "none" : undefined }}
            className={`absolute flex -translate-x-1/2 flex-col items-center justify-center border-2 shadow-panel transition ${draggable ? "cursor-grab active:cursor-grabbing" : "hover:-translate-y-1 hover:shadow-panel-hover"} ${shapeClass[table.shape]} ${tone} ${!table.active ? "opacity-40" : ""}`}
          >
            <span className="text-xs font-bold uppercase tracking-wider opacity-70">Mesa</span>
            <span className="text-2xl font-bold">{table.number}</span>
            <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold"><Users size={13} /> {table.seats}{getBadge?.(table) ? ` · ${getBadge(table)}` : ""}</span>
          </button>
        );
      })}
    </div>
  );
}
