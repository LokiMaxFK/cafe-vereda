import { useRef, useState } from "react";
import { Users } from "lucide-react";
import type { CafeTable } from "../domain/types";

const DRAG_THRESHOLD = 6;

export interface TableFloorPlanProps {
  tables: CafeTable[];
  getStatus?: (table: CafeTable) => "free" | "occupied" | "ready";
  getBadge?: (table: CafeTable) => string | undefined;
  selectedId?: string;
  disabledIds?: Set<string>;
  onSelect?: (table: CafeTable) => void;
  draggable?: boolean;
  onReposition?: (table: CafeTable, x: number, y: number) => void;
}

const shapeClass: Record<CafeTable["shape"], string> = {
  round: "h-28 w-28 rounded-full",
  square: "h-28 w-28 rounded-2xl",
  rectangular: "h-24 w-36 rounded-2xl"
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function TableFloorPlan({ tables, getStatus, getBadge, selectedId, disabledIds, onSelect, draggable, onReposition }: TableFloorPlanProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [livePosition, setLivePosition] = useState<{ id: string; x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

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
    setLivePosition({ id: dragId, x, y });
  }
  function onPointerUp(table: CafeTable) {
    if (!draggable || dragId !== table.id) return;
    if (movedRef.current && livePosition) onReposition?.(table, livePosition.x, livePosition.y);
    else if (!disabledIds?.has(table.id)) onSelect?.(table);
    setDragId(null); setLivePosition(null); movedRef.current = false; startRef.current = null;
  }
  function onClick(table: CafeTable) {
    if (draggable || disabledIds?.has(table.id)) return;
    onSelect?.(table);
  }

  return (
    <div ref={containerRef} onPointerMove={onPointerMove} className="relative min-h-[420px] w-full overflow-hidden rounded-2xl bg-[linear-gradient(rgba(90,58,27,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(90,58,27,.035)_1px,transparent_1px)] bg-[size:32px_32px]">
      {tables.map((table) => {
        const position = livePosition?.id === table.id ? livePosition : table;
        const status = getStatus?.(table) ?? "free";
        const disabled = disabledIds?.has(table.id);
        const selected = selectedId === table.id;
        const tone = disabled ? "border-outline-variant/30 bg-surface-container-highest/60 text-on-surface-variant opacity-50"
          : selected ? "border-primary bg-primary text-on-primary shadow-brand"
          : status === "ready" ? "border-tertiary bg-tertiary-fixed text-on-tertiary-fixed"
          : status === "occupied" ? "border-primary bg-primary-fixed text-on-primary-fixed"
          : "border-outline-variant/50 bg-surface-container-lowest text-on-surface";
        return (
          <button
            key={table.id}
            type="button"
            disabled={disabled && !draggable}
            onPointerDown={(event) => onPointerDown(event, table)}
            onPointerUp={() => onPointerUp(table)}
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
