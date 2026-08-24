import { describe, expect, it } from "vitest";
import { calculateCashDifference, calculateCashSummary, canTakeOrders } from "./cash";

describe("cash summary", () => {
  it("uses the opening fund as expected cash for a newly opened session", () => {
    expect(calculateCashSummary({ openingFund: 1_000, cashSales: 0, movements: [] })).toEqual({
      withdrawals: 0,
      withdrawalCount: 0,
      expected: 1_000
    });
  });

  it("allows withdrawals to make the expected cash negative", () => {
    expect(calculateCashSummary({
      openingFund: 500,
      cashSales: 0,
      movements: [{ type: "withdrawal", amount: 650 }]
    }).expected).toBe(-150);
  });

  it("adds cash sales and subtracts withdrawals and adjustments", () => {
    expect(calculateCashSummary({
      openingFund: 500,
      cashSales: 875,
      movements: [
        { type: "opening", amount: 500 },
        { type: "withdrawal", amount: 100 },
        { type: "adjustment", amount: 25 }
      ]
    })).toEqual({ withdrawals: 125, withdrawalCount: 2, expected: 1_250 });
  });
});

describe("cash count difference", () => {
  it("classifies an exact count", () => {
    expect(calculateCashDifference(1_250, 1_250)).toEqual({ difference: 0, status: "exact" });
  });

  it("classifies a shortage", () => {
    expect(calculateCashDifference(1_200, 1_250)).toEqual({ difference: -50, status: "shortage" });
  });

  it("classifies a surplus", () => {
    expect(calculateCashDifference(1_300, 1_250)).toEqual({ difference: 50, status: "surplus" });
  });
});

describe("order gate by cash session", () => {
  it("blocks orders when there is no cash session at all", () => {
    expect(canTakeOrders({ required: true, session: null })).toBe(false);
  });

  it("blocks orders when the only cash session is already closed", () => {
    expect(canTakeOrders({ required: true, session: { closedAt: "2026-08-24T02:00:00.000Z" } })).toBe(false);
  });

  it("allows orders with an open cash session", () => {
    expect(canTakeOrders({ required: true, session: {} })).toBe(true);
  });

  it("does not block the demo mode, where cash sessions do not exist", () => {
    expect(canTakeOrders({ required: false, session: null })).toBe(true);
  });
});
