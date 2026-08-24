import type { CashMovement, CashSession } from "../domain/types";
import { supabase } from "./supabase";

export function mapCashSession(row: Record<string, unknown>): CashSession {
  return {
    id: String(row.id),
    openedBy: String(row.opened_by),
    openingFund: Number(row.opening_fund_cents) / 100,
    openedAt: String(row.opened_at),
    closedBy: row.closed_by ? String(row.closed_by) : undefined,
    closedAt: row.closed_at ? String(row.closed_at) : undefined,
    countedCash: row.counted_cash_cents != null ? Number(row.counted_cash_cents) / 100 : undefined,
    expectedCash: row.expected_cash_cents != null ? Number(row.expected_cash_cents) / 100 : undefined,
    difference: row.difference_cents != null ? Number(row.difference_cents) / 100 : undefined
  };
}

export function mapCashMovement(row: Record<string, unknown>): CashMovement {
  return {
    id: String(row.id),
    cashSessionId: String(row.cash_session_id),
    type: row.movement_type as CashMovement["type"],
    amount: Number(row.amount_cents) / 100,
    note: row.note ? String(row.note) : undefined,
    recordedBy: String(row.recorded_by),
    createdAt: String(row.created_at)
  };
}

/**
 * Devuelve el turno abierto, o `null` si no hay ninguno. Un error de red se propaga como
 * `undefined` para que quien llama conserve la última copia local en vez de tomar el fallo
 * como “caja cerrada” y bloquear la operación por un problema de conexión.
 */
export async function fetchOpenCashSession(): Promise<CashSession | null | undefined> {
  if (!supabase || !navigator.onLine) return undefined;
  const { data, error } = await supabase.from("cash_sessions").select("*").is("closed_at", null).maybeSingle();
  if (error) return undefined;
  return data ? mapCashSession(data as Record<string, unknown>) : null;
}
