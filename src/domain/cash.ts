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
