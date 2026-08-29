import { REPORT_TIME_ZONE } from "../domain/reports";
import { isInventoryVarianceAlert, type InventoryAnalysisRow } from "../domain/inventory";

const amount = (value: number, unit: string) => `${Number(value.toFixed(3))} ${unit}`;
const formatCountedAt = (value: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short", timeZone: REPORT_TIME_ZONE }).format(new Date(value));

/** Qué tramo mide la fila: sin esto, un físico en «—» no dice si falta un conteo o falta el segundo. */
function windowLabel(row: InventoryAnalysisRow) {
  if (row.physical !== undefined) return `Entre los conteos del ${formatCountedAt(row.openingAt ?? "")} y el ${formatCountedAt(row.closingAt ?? "")}`;
  if (row.openingAt) return `Desde el conteo del ${formatCountedAt(row.openingAt)} · falta un segundo conteo para medir el físico`;
  return "Sin conteos: sólo lo registrado en el periodo";
}

/**
 * La comparación de consumo contado contra receta teórica. Vive en un componente porque Insumos y
 * Reportes pintan la misma tabla sobre el mismo `createInventoryAnalysis`: cuando eran dos copias,
 * Reportes se quedó sin la columna de entradas y sin las fechas de los conteos, y las dos pantallas
 * enseñaban números distintos del mismo insumo sin explicar por qué.
 */
export function InventoryAnalysisTable({ rows }: { rows: InventoryAnalysisRow[] }) {
  return (
    <div className="table-scroll-x">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-surface-container-low text-xs uppercase tracking-wider text-on-surface-variant">
          <tr>
            <th className="px-5 py-3">Insumo</th>
            <th className="px-5 py-3 text-right">Entradas</th>
            <th className="px-5 py-3 text-right">Mermas</th>
            <th className="px-5 py-3 text-right">Físico</th>
            <th className="px-5 py-3 text-right">Teórico</th>
            <th className="px-5 py-3 text-right">Diferencia</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/25">
          {rows.map((row) => (
            <tr key={row.item.id}>
              <td className="px-5 py-4">
                <p className="font-semibold">
                  {row.item.name}
                  {/* Un insumo dado de baja sólo llega hasta aquí si sigue moviéndose: casi siempre
                      porque una receta lo nombra todavía y cada venta lo descuenta. */}
                  {!row.item.active && <span className="ml-2 rounded-md bg-error-container px-1.5 py-0.5 align-middle text-[11px] font-bold uppercase tracking-wide text-error">Dado de baja</span>}
                </p>
                <p className="text-xs text-on-surface-variant">{windowLabel(row)}</p>
              </td>
              <td className="px-5 py-4 text-right">{amount(row.entries, row.item.unit)}</td>
              <td className="px-5 py-4 text-right">{amount(row.waste, row.item.unit)}</td>
              <td className="px-5 py-4 text-right font-semibold">{row.physical === undefined ? "—" : amount(row.physical, row.item.unit)}</td>
              <td className="px-5 py-4 text-right">{amount(row.theoretical, row.item.unit)}</td>
              <td className={`px-5 py-4 text-right font-bold ${isInventoryVarianceAlert(row) ? "text-error" : ""}`}>
                {row.variance === undefined ? "—" : `${row.variance > 0 ? "+" : ""}${amount(row.variance, row.item.unit)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
