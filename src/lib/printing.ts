import { itemTotal, mxn, orderChange, orderTotal, paymentMethodLabel, roundToCents } from "../domain/money";
import { subaccountDiscount, subaccountItems, subaccountTotal } from "../domain/splitBill";
import type { Order, OrderItem, OrderSubaccount, Payment } from "../domain/types";
import { printWithBrowser, type ThermalPrintDocument } from "./browserPrinting";
import { defaultPrinterSettings, loadPrinterSettings, mergeTicketDesign, MAX_BOTTOM_MARGIN_MM, type PrintFontScale, type PrinterSettings, type PaperWidthMm } from "./printerSettings";
import { loadUniversalTicketDesign } from "./ticketDesign";

export type PrintPaper = "58" | "80";

// Las estaciones corren Windows y la pila anterior sólo nombraba tipografías de macOS
// (ui-monospace, SFMono-Regular, Menlo), así que caía en la monoespaciada genérica.
// Consolas y Courier New existen en Windows y traen los acentos y la “ñ”.
const MONOSPACE_STACK = 'Consolas,"Courier New",ui-monospace,SFMono-Regular,Menlo,monospace';
type PrintLayoutOptions = Pick<PrinterSettings, "marginMm" | "bottomMarginMm" | "fontScale" | "printableWidthMm">;

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
  const topMargin = Math.max(2, options.marginMm ?? 2);
  const bottomMargin = Math.max(0, Math.min(MAX_BOTTOM_MARGIN_MM, options.bottomMarginMm ?? 4));
  return {
    title,
    // El alto de página no se declara aquí: "size:${printableWidth}mm auto" es sintaxis
    // inválida y Chrome descartaba la regla entera, así que el ticket se imprimía con el
    // papel por defecto del driver y se cortaba. printWithBrowser mide el contenido ya
    // maquetado y escribe un @page válido con el alto exacto del ticket.
    html: `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{margin:0}*{box-sizing:border-box}html,body{width:${printableWidth}mm;min-width:${printableWidth}mm}body{font:${bodyFont} ${MONOSPACE_STACK};color:#111;margin:0;padding:${topMargin}mm 0 ${bottomMargin}mm;overflow-wrap:anywhere}.center{text-align:center}.row{display:flex;justify-content:space-between;align-items:flex-start;gap:4px}.row>span:first-child,.row>strong:first-child{min-width:0;overflow-wrap:anywhere}.row>span.pay-method{overflow-wrap:normal;white-space:nowrap}.tip-row>span:first-child{padding-left:6px}.row>span:last-child,.row>strong:last-child{flex:none;text-align:right}.muted{color:#555}.line{border-top:1px dashed #111;margin:8px 0}h1{font-size:16px;margin:0 0 3px}h2{font-size:13px;margin:0 0 8px}p{margin:3px 0}.item{margin:7px 0}.item-detail{margin:2px 0 0;color:#444}.copy{border:2px solid #111;padding:4px;font-weight:700;text-align:center}.ticket-image{display:block;width:36mm;height:38mm;margin:0 auto 5px;object-fit:contain;filter:grayscale(1) contrast(2.4)}.ticket-qr{display:block;width:25mm;height:25mm;margin:0 auto 3px;image-rendering:pixelated}.qr-caption{font-size:9px;margin:0}</style></head><body>${body}</body></html>`
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

function paymentRows(payment: Order["payments"][number]) {
  return `<div class="row muted"><span class="pay-method">${escapeHtml(paymentMethodLabel[payment.method] ?? payment.method).toUpperCase()}</span><span>${mxn.format(payment.amount)}</span></div>`
    + (payment.tip > 0 ? `<div class="row muted tip-row"><span class="pay-method">Propina</span><span>${mxn.format(payment.tip)}</span></div>` : "");
}

/**
 * Desglose del efectivo al pie del ticket: cuánto entregó el cliente, cuánto se aplicó a la cuenta
 * y el cambio total que se le devolvió. Antes el cambio salía en un renglón `muted` pegado a cada
 * pago y era fácil no verlo; ahora se agrupa —sumando todos los pagos en efectivo si el cobro se
 * dividió— para que el cambio total quede claro de un vistazo. Sólo aparece cuando hay cambio.
 */
function cashChangeSummary(payments: Payment[]) {
  const totalChange = orderChange({ payments });
  if (totalChange <= 0) return "";
  const received = roundToCents(payments.reduce((sum, payment) => sum + (payment.method === "cash" ? payment.received ?? 0 : 0), 0));
  return `<div class="line"></div>`
    + `<div class="row"><span>Efectivo recibido</span><span>${mxn.format(received)}</span></div>`
    + `<div class="row muted"><span>Aplicado a la cuenta</span><span>${mxn.format(roundToCents(received - totalChange))}</span></div>`
    + `<div class="row"><strong>CAMBIO TOTAL</strong><strong>${mxn.format(totalChange)}</strong></div>`;
}

/**
 * Lo que distingue al ticket de una persona del de la cuenta entera. Se recibe ya calculado, en vez
 * de derivarlo aquí, porque el reparto y el prorrateo viven en `src/domain/splitBill.ts` y este
 * módulo sólo maqueta: así el importe impreso es exactamente el que la pantalla cobró.
 */
export interface TicketSubaccountContext {
  label: string;
  position: number;
  count: number;
  items: OrderItem[];
  discount: number;
  total: number;
  payments: Payment[];
}

/**
 * Arma el contexto del ticket de una persona a partir de la orden. Vive aquí y no en la pantalla
 * para que reimprimir desde cualquier punto produzca exactamente el mismo ticket que se entregó.
 */
export function ticketContextFor(order: Order, subaccount: OrderSubaccount): TicketSubaccountContext {
  const ordered = [...(order.subaccounts ?? [])].sort((a, b) => a.position - b.position);
  return {
    label: subaccount.label,
    position: ordered.findIndex((candidate) => candidate.id === subaccount.id) + 1,
    count: ordered.length,
    items: subaccountItems(order, subaccount.id),
    discount: subaccountDiscount(order, subaccount.id),
    total: subaccountTotal(order, subaccount.id),
    payments: order.payments.filter((payment) => payment.subaccountId === subaccount.id)
  };
}

export function createTicketDocument(order: Order, paper: PrintPaper = "80", options?: Partial<PrinterSettings>, subaccount?: TicketSubaccountContext) {
  const settings: PrinterSettings = { ...defaultPrinterSettings, ...options };
  const items = subaccount ? subaccount.items : order.items.filter((item) => item.status !== "cancelled");
  const discount = subaccount ? subaccount.discount : order.discount;
  const discountLabel = subaccount ? "Descuento (prorrateado)" : `Descuento${order.discountReason ? ` · ${escapeHtml(order.discountReason)}` : ""}`;
  const total = subaccount ? subaccount.total : orderTotal(order);
  const payments = subaccount ? subaccount.payments : order.payments;
  const heading = subaccount ? `TICKET NO FISCAL #${order.folio} (${subaccount.position}/${subaccount.count})` : `TICKET NO FISCAL #${order.folio}`;
  const footer = settings.ticketFooterText ? `<div class="line"></div><p class="center">${escapeHtml(settings.ticketFooterText)}</p>` : "";
  const qr = settings.ticketQrDataUrl ? `<div class="line"></div><div class="center"><img class="ticket-qr" src="${escapeHtml(settings.ticketQrDataUrl)}" alt="Código QR"><p class="qr-caption">Escanea para visitarnos</p></div>` : "";
  return printDocument(`Ticket ${order.folio}`, `
    <div class="center">${settings.ticketImageDataUrl ? `<img class="ticket-image" src="${escapeHtml(settings.ticketImageDataUrl)}" alt="Imagen del negocio">` : ""}<h1>VEREDA CAFÉ</h1><h2>${heading}</h2></div>
    ${subaccount ? `<div class="center"><p class="copy">${escapeHtml(subaccount.label)}</p></div>` : ""}
    <div class="row"><span>${order.type === "table" ? `Mesa ${order.tableId?.replace("t", "")}` : escapeHtml(order.customerName || "Para llevar")}</span><span>${new Date(order.openedAt).toLocaleString("es-MX")}</span></div>
    <div class="line"></div>
    ${items.map((item) => ticketItem(item, settings)).join("")}
    <div class="line"></div>${discount > 0 ? `<div class="row"><span>${discountLabel}</span><span>-${mxn.format(discount)}</span></div>` : ""}<div class="row"><strong>TOTAL</strong><strong>${mxn.format(total)}</strong></div>
    ${payments.map((payment) => paymentRows(payment)).join("")}
    ${cashChangeSummary(payments)}
    ${qr}${footer}
  `, paper, settings);
}

export async function printCommand(order: Order, items: OrderItem[], copyNumber = 0, cancellation = false, paper?: PrintPaper) {
  const settings = loadPrinterSettings();
  const resolvedPaper = paper ?? paperFromWidth(settings.paperWidthMm);
  const document = createCommandDocument(order, items, copyNumber, cancellation, resolvedPaper, settings);
  await printDocumentLocally(document);
}

export async function printTicket(order: Order, paper?: PrintPaper, subaccount?: TicketSubaccountContext) {
  const localSettings = loadPrinterSettings();
  const design = await loadUniversalTicketDesign().catch(() => undefined);
  const settings = design ? mergeTicketDesign(localSettings, design) : localSettings;
  const document = createTicketDocument(order, paper ?? paperFromWidth(settings.paperWidthMm), settings, subaccount);
  await printDocumentLocally(document);
}

export function paperFromWidth(width: PaperWidthMm): PrintPaper {
  return String(width) as PrintPaper;
}
