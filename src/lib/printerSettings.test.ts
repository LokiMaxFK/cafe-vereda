import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultPrinterSettings, loadPrinterSettings, MAX_BOTTOM_MARGIN_MM, mergeTicketDesign, normalizePrinterSettings, savePrinterSettings, ticketDesignFrom, type TicketDesign } from "./printerSettings";

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
      marginMm: 8
    });
  });

  it("gives settings saved before the field existed the current default bottom margin", () => {
    expect(normalizePrinterSettings({ marginMm: 1 }).bottomMarginMm).toBe(defaultPrinterSettings.bottomMarginMm);
    expect(normalizePrinterSettings({ marginMm: 8 }).bottomMarginMm).toBe(defaultPrinterSettings.bottomMarginMm);
  });

  it("keeps an explicit bottom margin, including zero, and clamps out-of-range values", () => {
    expect(normalizePrinterSettings({ marginMm: 6, bottomMarginMm: 0 }).bottomMarginMm).toBe(0);
    expect(normalizePrinterSettings({ bottomMarginMm: 12 }).bottomMarginMm).toBe(12);
    expect(normalizePrinterSettings({ bottomMarginMm: 99 }).bottomMarginMm).toBe(MAX_BOTTOM_MARGIN_MM);
    expect(normalizePrinterSettings({ bottomMarginMm: -5 }).bottomMarginMm).toBe(0);
  });

  it("no comparte el margen inferior en el diseño universal", () => {
    // Depende de la distancia entre el cabezal y la barra de corte de cada impresora.
    expect(ticketDesignFrom({ ...defaultPrinterSettings, bottomMarginMm: 18 })).not.toHaveProperty("bottomMarginMm");
  });

  it("ignora el margen inferior que traigan los diseños guardados antes del cambio", () => {
    // El diseño que ya está en Supabase conserva el campo dentro del JSON: si ganara,
    // el ticket seguiría saliendo con el margen viejo por más que se suba el de la estación.
    const almacenado = { ...ticketDesignFrom(defaultPrinterSettings), bottomMarginMm: 4 } as TicketDesign;
    const estacion = { ...defaultPrinterSettings, bottomMarginMm: 18 };
    expect(mergeTicketDesign(estacion, almacenado).bottomMarginMm).toBe(18);
  });

  it("sigue adoptando el resto del diseño universal", () => {
    const design = { ...ticketDesignFrom(defaultPrinterSettings), marginMm: 5, ticketFooterText: "Vuelve pronto" };
    const merged = mergeTicketDesign({ ...defaultPrinterSettings, marginMm: 1, bottomMarginMm: 18 }, design);
    expect(merged.marginMm).toBe(5);
    expect(merged.ticketFooterText).toBe("Vuelve pronto");
    expect(merged.bottomMarginMm).toBe(18);
  });

  it("persists normalized settings per browser station", () => {
    savePrinterSettings({ ...defaultPrinterSettings, printableWidthMm: 48, marginMm: 1.5, fontScale: "compact", ticketFooterText: "Vuelve pronto" });
    expect(loadPrinterSettings()).toEqual({ ...defaultPrinterSettings, printableWidthMm: 48, marginMm: 1.5, fontScale: "compact", ticketFooterText: "Vuelve pronto" });
  });
});
