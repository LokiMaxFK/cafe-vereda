import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultPrinterSettings, loadPrinterSettings, normalizePrinterSettings, savePrinterSettings } from "./printerSettings";

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

describe("printer settings", () => {
  it("uses safe defaults for invalid saved values", () => {
    expect(normalizePrinterSettings({ paperWidthMm: 70 as 58, marginMm: 99, fontScale: "huge" as "normal", commandCopies: 9 as 1 })).toEqual({
      ...defaultPrinterSettings,
      marginMm: 8
    });
  });

  it("persists normalized settings per browser station", () => {
    savePrinterSettings({ ...defaultPrinterSettings, printerName: "Suzwip 58mm", printableWidthMm: 48, marginMm: 1.5, fontScale: "compact", commandCopies: 2, ticketFooterText: "Vuelve pronto" });
    expect(loadPrinterSettings()).toEqual({ ...defaultPrinterSettings, printerName: "Suzwip 58mm", printableWidthMm: 48, marginMm: 1.5, fontScale: "compact", commandCopies: 2, ticketFooterText: "Vuelve pronto" });
  });
});
