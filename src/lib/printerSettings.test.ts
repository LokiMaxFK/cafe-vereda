import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultPrinterSettings, loadPrinterSettings, MAX_BOTTOM_MARGIN_MM, normalizePrinterSettings, savePrinterSettings } from "./printerSettings";

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
    expect(normalizePrinterSettings({ paperWidthMm: 70 as 58, marginMm: 99, fontScale: "huge" as "normal" })).toEqual({
      ...defaultPrinterSettings,
      marginMm: 8,
      bottomMarginMm: 8
    });
  });

  it("recreates the printed bottom margin for settings saved before the field existed", () => {
    expect(normalizePrinterSettings({ marginMm: 1 }).bottomMarginMm).toBe(4);
    expect(normalizePrinterSettings({ marginMm: 6 }).bottomMarginMm).toBe(6);
  });

  it("keeps an explicit bottom margin, including zero, and clamps out-of-range values", () => {
    expect(normalizePrinterSettings({ marginMm: 6, bottomMarginMm: 0 }).bottomMarginMm).toBe(0);
    expect(normalizePrinterSettings({ bottomMarginMm: 12 }).bottomMarginMm).toBe(12);
    expect(normalizePrinterSettings({ bottomMarginMm: 99 }).bottomMarginMm).toBe(MAX_BOTTOM_MARGIN_MM);
    expect(normalizePrinterSettings({ bottomMarginMm: -5 }).bottomMarginMm).toBe(0);
  });

  it("persists normalized settings per browser station", () => {
    savePrinterSettings({ ...defaultPrinterSettings, printableWidthMm: 48, marginMm: 1.5, fontScale: "compact", ticketFooterText: "Vuelve pronto" });
    expect(loadPrinterSettings()).toEqual({ ...defaultPrinterSettings, printableWidthMm: 48, marginMm: 1.5, fontScale: "compact", ticketFooterText: "Vuelve pronto" });
  });
});
