import { describe, expect, it } from "vitest";
import { calculateCashDifference, calculateCashSummary } from "./cash";

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
