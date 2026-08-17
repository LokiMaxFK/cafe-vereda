export type PaperWidthMm = 58 | 80;
export type PrintFontScale = "compact" | "normal" | "large";

export interface PrinterSettings {
  paperWidthMm: PaperWidthMm;
  printableWidthMm: number;
  marginMm: number;
  fontScale: PrintFontScale;
  ticketImageDataUrl: string;
  ticketQrUrl: string;
  ticketQrDataUrl: string;
  ticketFooterText: string;
  ticketShowQuantity: boolean;
  ticketShowVariant: boolean;
  ticketShowModifiers: boolean;
  ticketShowNotes: boolean;
  ticketShowUnitPrice: boolean;
  ticketShowLineTotal: boolean;
}

export type TicketDesign = Pick<PrinterSettings,
  "paperWidthMm" | "printableWidthMm" | "marginMm" | "fontScale" |
  "ticketImageDataUrl" | "ticketQrUrl" | "ticketQrDataUrl" | "ticketFooterText" | "ticketShowQuantity" |
  "ticketShowVariant" | "ticketShowModifiers" | "ticketShowNotes" |
  "ticketShowUnitPrice" | "ticketShowLineTotal"
>;

const STORAGE_KEY = "vereda-printer-settings:v3";
const PREVIOUS_STORAGE_KEY = "vereda-printer-settings:v2";
const LEGACY_STORAGE_KEY = "vereda-printer-settings:v1";
const TICKET_DESIGN_STORAGE_KEY = "vereda-ticket-design:v1";

export const defaultPrinterSettings: PrinterSettings = {
  paperWidthMm: 58,
  printableWidthMm: 48,
  marginMm: 2,
  fontScale: "normal",
  ticketImageDataUrl: "",
  ticketQrUrl: "",
  ticketQrDataUrl: "",
  ticketFooterText: "Gracias por caminar con nosotros",
  ticketShowQuantity: true,
  ticketShowVariant: true,
  ticketShowModifiers: true,
  ticketShowNotes: true,
  ticketShowUnitPrice: false,
  ticketShowLineTotal: true
};

function isPaperWidth(value: unknown): value is PaperWidthMm {
  return value === 58 || value === 80;
}

function isFontScale(value: unknown): value is PrintFontScale {
  return value === "compact" || value === "normal" || value === "large";
}

function isImageDataUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/(png|jpeg);base64,/i.test(value) && value.length <= 700_000;
}

function isTicketUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length > 500) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function boolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizePrinterSettings(value: Partial<PrinterSettings> | null | undefined): PrinterSettings {
  const paperWidthMm = isPaperWidth(value?.paperWidthMm) ? value.paperWidthMm : defaultPrinterSettings.paperWidthMm;
  const margin = Number(value?.marginMm);
  const printableWidth = Number(value?.printableWidthMm);
  const maxPrintableWidth = paperWidthMm - 4;
  const defaultPrintableWidth = paperWidthMm === 58 ? 48 : 72;
  const ticketQrUrl = isTicketUrl(value?.ticketQrUrl) ? value.ticketQrUrl.trim() : "";
  return {
    paperWidthMm,
    printableWidthMm: Number.isFinite(printableWidth) ? Math.max(32, Math.min(maxPrintableWidth, printableWidth)) : defaultPrintableWidth,
    marginMm: Number.isFinite(margin) ? Math.max(0, Math.min(8, margin)) : defaultPrinterSettings.marginMm,
    fontScale: isFontScale(value?.fontScale) ? value.fontScale : defaultPrinterSettings.fontScale,
    ticketImageDataUrl: isImageDataUrl(value?.ticketImageDataUrl) ? value.ticketImageDataUrl : "",
    ticketQrUrl,
    ticketQrDataUrl: ticketQrUrl && isImageDataUrl(value?.ticketQrDataUrl) ? value.ticketQrDataUrl : "",
    ticketFooterText: typeof value?.ticketFooterText === "string" ? value.ticketFooterText.trim().slice(0, 240) : defaultPrinterSettings.ticketFooterText,
    ticketShowQuantity: boolean(value?.ticketShowQuantity, defaultPrinterSettings.ticketShowQuantity),
    ticketShowVariant: boolean(value?.ticketShowVariant, defaultPrinterSettings.ticketShowVariant),
    ticketShowModifiers: boolean(value?.ticketShowModifiers, defaultPrinterSettings.ticketShowModifiers),
    ticketShowNotes: boolean(value?.ticketShowNotes, defaultPrinterSettings.ticketShowNotes),
    ticketShowUnitPrice: boolean(value?.ticketShowUnitPrice, defaultPrinterSettings.ticketShowUnitPrice),
    ticketShowLineTotal: boolean(value?.ticketShowLineTotal, defaultPrinterSettings.ticketShowLineTotal)
  };
}

export function loadPrinterSettings(): PrinterSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(PREVIOUS_STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    return stored ? normalizePrinterSettings(JSON.parse(stored) as Partial<PrinterSettings>) : defaultPrinterSettings;
  } catch {
    return defaultPrinterSettings;
  }
}

export function savePrinterSettings(settings: PrinterSettings): PrinterSettings {
  const normalized = normalizePrinterSettings(settings);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function ticketDesignFrom(settings: PrinterSettings): TicketDesign {
  return { ...settings };
}

export function mergeTicketDesign(settings: PrinterSettings, design: Partial<TicketDesign>): PrinterSettings {
  return normalizePrinterSettings({ ...settings, ...design });
}

export function loadCachedTicketDesign(): TicketDesign {
  try {
    const stored = localStorage.getItem(TICKET_DESIGN_STORAGE_KEY);
    return ticketDesignFrom(normalizePrinterSettings(stored ? JSON.parse(stored) as Partial<TicketDesign> : null));
  } catch {
    return ticketDesignFrom(defaultPrinterSettings);
  }
}

export function saveCachedTicketDesign(design: TicketDesign): TicketDesign {
  const normalized = ticketDesignFrom(normalizePrinterSettings(design));
  localStorage.setItem(TICKET_DESIGN_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}
