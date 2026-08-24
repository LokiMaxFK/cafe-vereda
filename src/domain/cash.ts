export interface CashMovementAmount {
  type: string;
  amount: number;
}

export interface CashSummaryInput {
  openingFund: number;
  cashSales: number;
  movements: CashMovementAmount[];
}

export interface CashSummary {
  withdrawals: number;
  withdrawalCount: number;
  expected: number;
}

export type CashDifferenceStatus = "exact" | "surplus" | "shortage";

export interface CashDifference {
  difference: number;
  status: CashDifferenceStatus;
}

export function calculateCashSummary({ openingFund, cashSales, movements }: CashSummaryInput): CashSummary {
  const withdrawals = movements.filter((movement) => movement.type === "withdrawal" || movement.type === "adjustment");
  const withdrawn = withdrawals.reduce((sum, movement) => sum + movement.amount, 0);

  return {
    withdrawals: withdrawn,
    withdrawalCount: withdrawals.length,
    expected: openingFund + cashSales - withdrawn
  };
}

export function calculateCashDifference(counted: number, expected: number): CashDifference {
  const difference = counted - expected;
  return {
    difference,
    status: difference === 0 ? "exact" : difference > 0 ? "surplus" : "shortage"
  };
}

export const CASH_SESSION_REQUIRED_MESSAGE =
  "Abre la caja antes de tomar pedidos: registra el fondo inicial del turno en la pantalla de Caja.";

export interface OrderGateInput {
  /** Falso en modo demo (sin Supabase), donde no existe la tabla de turnos de caja. */
  required: boolean;
  session: { closedAt?: string } | null;
}

/**
 * Un pedido sólo puede abrirse con un turno de caja vivo: sin él, el efectivo cobrado no
 * pertenece a ningún arqueo y el corte del día nunca cuadra.
 */
export function canTakeOrders({ required, session }: OrderGateInput): boolean {
  if (!required) return true;
  return Boolean(session && !session.closedAt);
}
