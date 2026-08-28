import { SelectField, TextField } from "../../design-system/react";
import { compatibleUnits } from "../domain/units";
import type { InventoryUnit } from "../domain/types";

/**
 * Cantidad + unidad. El insumo guarda todo en una sola unidad canónica, pero obligar a capturar en
 * ella hace que registrar 250 ml de un insumo medido en litros dependa de que el usuario divida de
 * cabeza. Aquí elige la unidad que le resulta natural dentro de la misma familia y la conversión
 * ocurre una sola vez, al leer `quantityIn(...)`.
 */
export function QuantityField({ base, value, unit, onChange, min = "0", step = "0.001", placeholder, disabled }: {
  base: InventoryUnit | "";
  value: string;
  unit: InventoryUnit | "";
  onChange: (next: { value: string; unit: InventoryUnit | "" }) => void;
  min?: string;
  step?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const options = base ? compatibleUnits(base) : [];
  // Con una sola unidad compatible (pza, paquete, bolsa) el selector no ofrece ninguna decisión:
  // se degrada a una etiqueta para no simular una elección que no existe.
  const single = options.length <= 1;
  return (
    <div className="mt-1 flex items-stretch gap-2">
      <div className="min-w-0 flex-1">
        <TextField className="mt-0" type="number" min={min} step={step} value={value} placeholder={placeholder} disabled={disabled || !base}
          onChange={(event) => onChange({ value: event.target.value, unit })} />
      </div>
      <div className="w-[104px] shrink-0">
        {single
          ? <span className="flex h-full min-h-touch-target-min items-center justify-center rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 text-sm font-semibold text-on-surface-variant">{unit || base || "—"}</span>
          : <SelectField className="mt-0" value={unit} disabled={disabled || !base} aria-label="Unidad"
              onChange={(event) => onChange({ value, unit: event.target.value as InventoryUnit })}>
              {options.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
            </SelectField>}
      </div>
    </div>
  );
}
