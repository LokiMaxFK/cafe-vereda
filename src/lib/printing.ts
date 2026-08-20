import { itemTotal, mxn, orderTotal, paymentMethodLabel } from "../domain/money";
import type { Order, OrderItem } from "../domain/types";
import { printWithBrowser, type ThermalPrintDocument } from "./browserPrinting";
import { defaultPrinterSettings, loadPrinterSettings, mergeTicketDesign, type PrintFontScale, type PrinterSettings, type PaperWidthMm } from "./printerSettings";
import { loadUniversalTicketDesign } from "./ticketDesign";

export type PrintPaper = "58" | "80";
type PrintLayoutOptions = Pick<PrinterSettings, "marginMm" | "fontScale" | "printableWidthMm">;

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char);
}

function fontSize(fontScale: PrintFontScale) {
  return fontScale === "compact" ? "10px" : fontScale === "large" ? "12px" : "11px";
}

function printDocument(title: string, body: string, paper: PrintPaper, options: Partial<PrintLayoutOptions> = {}): ThermalPrintDocument {
  const paperWidth = paper === "58" ? 58 : 80;
  const fallbackPrintableWidth = paper === "58" ? 48 : 72;
  const printableWidth = Math.max(32, Math.min(paperWidth - 4, options.printableWidthMm ?? fallbackPrintableWidth));
  const bodyFont = fontSize(options.fontScale ?? "normal");
  return {
    title,
    html: `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{size:${printableWidth}mm auto;margin:0}*{box-sizing:border-box}html,body{width:${printableWidth}mm;min-width:${printableWidth}mm}body{font:${bodyFont} ui-monospace,SFMono-Regular,Menlo,monospace;color:#111;margin:0;padding:${Math.max(2, options.marginMm ?? 2)}mm 0 ${Math.max(4, options.marginMm ?? 2)}mm;overflow-wrap:anywhere}.center{text-align:center}.row{display:flex;justify-content:space-between;align-items:flex-start;gap:4px}.row>span:first-child,.row>strong:first-child{min-width:0;overflow-wrap:anywhere}.row>span.pay-method{overflow-wrap:normal;white-space:nowrap}.tip-row>span:first-child{padding-left:6px}.row>span:last-child,.row>strong:last-child{flex:none;text-align:right}.muted{color:#555}.line{border-top:1px dashed #111;margin:8px 0}h1{font-size:16px;margin:0 0 3px}h2{font-size:13px;margin:0 0 8px}p{margin:3px 0}.item{margin:7px 0}.item-detail{margin:2px 0 0;color:#444}.copy{border:2px solid #111;padding:4px;font-weight:700;text-align:center}.ticket-image{display:block;width:36mm;height:38mm;margin:0 auto 5px;object-fit:contain;filter:grayscale(1) contrast(2.4)}.ticket-qr{display:block;width:25mm;height:25mm;margin:0 auto 3px;image-rendering:pixelated}.qr-caption{font-size:9px;margin:0}</style></head><body>${body}</body></html>`
  };
}

export async function printDocumentLocally(document: ThermalPrintDocument) {
  await printWithBrowser(document);
}

export function createCommandDocument(order: Order, items: OrderItem[], copyNumber = 0, cancellation = false, paper: PrintPaper = "80", options?: Partial<PrintLayoutOptions>) {
  const context = order.type === "table" ? `MESA ${order.tableId?.replace("t", "")}` : `PARA LLEVAR · ${escapeHtml(order.customerName || "Sin nombre")}`;
  return printDocument(`Comanda ${order.folio}`, `
    ${copyNumber ? `<div class="copy">COPIA ${copyNumber}</div>` : ""}
    ${cancellation ? `<div class="copy">CANCELACIÓN</div>` : ""}
    <div class="center"><h1>VEREDA CAFÉ</h1><h2>COMANDA #${order.folio}</h2></div>
    <div class="row"><strong>${context}</strong><span>${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</span></div>
    <div class="line"></div>
    ${items.map((item) => `<div class="item"><strong>${item.quantity} × ${escapeHtml(item.name)}</strong>${item.variant ? `<p>${escapeHtml(item.variant)}</p>` : ""}${item.modifiers.length ? `<p>${item.modifiers.map((modifier) => `+ ${escapeHtml(modifier.name)}`).join(" · ")}</p>` : ""}${item.notes ? `<p>NOTA: ${escapeHtml(item.notes)}</p>` : ""}${item.cancellationReason ? `<p>MOTIVO: ${escapeHtml(item.cancellationReason)}</p>` : ""}</div>`).join("")}
    <div class="line"></div><p class="center muted">Lote inmutable · ${items[0]?.dispatchBatchId?.slice(0, 8) || "nuevo"}</p>
  `, paper, options);
}

function ticketItem(item: OrderItem, settings: PrinterSettings) {
  const description = `${settings.ticketShowQuantity ? `${item.quantity} × ` : ""}${escapeHtml(item.name)}`;
  return `<div class="item"><div class="row"><strong>${description}</strong>${settings.ticketShowLineTotal ? `<strong>${mxn.format(itemTotal(item))}</strong>` : ""}</div>${settings.ticketShowUnitPrice ? `<p class="item-detail">Precio unitario: ${mxn.format(item.unitPrice)}</p>` : ""}${settings.ticketShowVariant && item.variant ? `<p class="item-detail">${escapeHtml(item.variant)}</p>` : ""}${settings.ticketShowModifiers && item.modifiers.length ? `<p class="item-detail">${item.modifiers.map((modifier) => `+ ${escapeHtml(modifier.name)}`).join(" · ")}</p>` : ""}${settings.ticketShowNotes && item.notes ? `<p class="item-detail">NOTA: ${escapeHtml(item.notes)}</p>` : ""}</div>`;
}

export function createTicketDocument(order: Order, paper: PrintPaper = "80", options?: Partial<PrinterSettings>) {
  const settings: PrinterSettings = { ...defaultPrinterSettings, ...options };
  const footer = settings.ticketFooterText ? `<div class="line"></div><p class="center">${escapeHtml(settings.ticketFooterText)}</p>` : "";
  const qr = settings.ticketQrDataUrl ? `<div class="line"></div><div class="center"><img class="ticket-qr" src="${escapeHtml(settings.ticketQrDataUrl)}" alt="Código QR"><p class="qr-caption">Escanea para visitarnos</p></div>` : "";
  return printDocument(`Ticket ${order.folio}`, `
    <div class="center">${settings.ticketImageDataUrl ? `<img class="ticket-image" src="${escapeHtml(settings.ticketImageDataUrl)}" alt="Imagen del negocio">` : ""}<h1>VEREDA CAFÉ</h1><h2>TICKET NO FISCAL #${order.folio}</h2></div>
    <div class="row"><span>${order.type === "table" ? `Mesa ${order.tableId?.replace("t", "")}` : escapeHtml(order.customerName || "Para llevar")}</span><span>${new Date(order.openedAt).toLocaleString("es-MX")}</span></div>
    <div class="line"></div>
    ${order.items.filter((item) => item.status !== "cancelled").map((item) => ticketItem(item, settings)).join("")}
    <div class="line"></div>${order.discount > 0 ? `<div class="row"><span>Descuento${order.discountReason ? ` · ${escapeHtml(order.discountReason)}` : ""}</span><span>-${mxn.format(order.discount)}</span></div>` : ""}<div class="row"><strong>TOTAL</strong><strong>${mxn.format(orderTotal(order))}</strong></div>
    ${order.payments.map((payment) => `<div class="row muted"><span class="pay-method">${escapeHtml(paymentMethodLabel[payment.method] ?? payment.method).toUpperCase()}</span><span>${mxn.format(payment.amount)}</span></div>${payment.tip > 0 ? `<div class="row muted tip-row"><span class="pay-method">Propina</span><span>${mxn.format(payment.tip)}</span></div>` : ""}`).join("")}
    ${qr}${footer}
  `, paper, settings);
}

export async function printCommand(order: Order, items: OrderItem[], copyNumber = 0, cancellation = false, paper?: PrintPaper) {
  const settings = loadPrinterSettings();
  const resolvedPaper = paper ?? paperFromWidth(settings.paperWidthMm);
  const document = createCommandDocument(order, items, copyNumber, cancellation, resolvedPaper, settings);
  await printDocumentLocally(document);
}

export async function printTicket(order: Order, paper?: PrintPaper) {
  const localSettings = loadPrinterSettings();
  const design = await loadUniversalTicketDesign().catch(() => undefined);
  const settings = design ? mergeTicketDesign(localSettings, design) : localSettings;
  const document = createTicketDocument(order, paper ?? paperFromWidth(settings.paperWidthMm), settings);
  await printDocumentLocally(document);
}

export function paperFromWidth(width: PaperWidthMm): PrintPaper {
  return String(width) as PrintPaper;
}
