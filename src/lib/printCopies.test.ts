import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextCopyNumber, peekCopyNumber, resetCopyNumber } from "./printCopies";

let storage = new Map<string, string>();

beforeEach(() => {
  storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      clear: () => storage.clear()
    }
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

describe("print copy numbering", () => {

  it("starts at COPIA 1 and grows with every reprint", () => {
    expect(nextCopyNumber("order-1")).toBe(1);
    expect(nextCopyNumber("order-1")).toBe(2);
    expect(nextCopyNumber("order-1")).toBe(3);
  });

  it("counts each order separately", () => {
    nextCopyNumber("order-1");
    nextCopyNumber("order-1");
    expect(nextCopyNumber("order-2")).toBe(1);
  });

  it("peeks without consuming the number", () => {
    nextCopyNumber("order-1");
    expect(peekCopyNumber("order-1")).toBe(2);
    expect(peekCopyNumber("order-1")).toBe(2);
    expect(nextCopyNumber("order-1")).toBe(2);
  });

  it("restarts the count when the order sends a brand new command", () => {
    nextCopyNumber("order-1");
    nextCopyNumber("order-1");
    resetCopyNumber("order-1");
    expect(nextCopyNumber("order-1")).toBe(1);
  });

  it("survives corrupt storage", () => {
    localStorage.setItem("vereda-print-copies", "{not json");
    expect(nextCopyNumber("order-1")).toBe(1);
  });
});
