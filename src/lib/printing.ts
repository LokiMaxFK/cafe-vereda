import { itemTotal, mxn, orderTotal } from "../domain/money";
import type { Order, OrderItem } from "../domain/types";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char);
}

function openPrintDocument(title: string, body: string, paper: "58" | "80" = "80") {
  const popup = window.open("", "_blank", "width=420,height=720");
  if (!popup) throw new Error("Permite ventanas emergentes para imprimir.");
  popup.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>@page{size:${paper}mm auto;margin:4mm}*{box-sizing:border-box}body{font:12px ui-monospace,SFMono-Regular,monospace;color:#111;margin:0}.center{text-align:center}.row{display:flex;justify-content:space-between;gap:8px}.muted{color:#555}.line{border-top:1px dashed #111;margin:10px 0}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:0 0 10px}p{margin:4px 0}.item{margin:8px 0}.copy{border:2px solid #111;padding:4px;font-weight:700;text-align:center}</style></head><body>${body}<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}<\/script></body></html>`);
  popup.document.close();
}

export function printCommand(order: Order, items: OrderItem[], copyNumber = 0, cancellation = false, paper: "58" | "80" = "80") {
  const context = order.type === "table" ? `MESA ${order.tableId?.replace("t", "")}` : `PARA LLEVAR · ${escapeHtml(order.customerName || "Sin nombre")}`;
  openPrintDocument(`Comanda ${order.folio}`, `
    ${copyNumber ? `<div class="copy">COPIA ${copyNumber}</div>` : ""}
    ${cancellation ? `<div class="copy">CANCELACIÓN</div>` : ""}
    <div class="center"><h1>VEREDA CAFÉ</h1><h2>COMANDA #${order.folio}</h2></div>
    <div class="row"><strong>${context}</strong><span>${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</span></div>
    <div class="line"></div>
    ${items.map((item) => `<div class="item"><strong>${item.quantity} × ${escapeHtml(item.name)}</strong>${item.variant ? `<p>${escapeHtml(item.variant)}</p>` : ""}${item.notes ? `<p>NOTA: ${escapeHtml(item.notes)}</p>` : ""}</div>`).join("")}
    <div class="line"></div><p class="center muted">Lote inmutable · ${items[0]?.dispatchBatchId?.slice(0, 8) || "nuevo"}</p>
  `, paper);
}

export function printTicket(order: Order, paper: "58" | "80" = "80") {
  openPrintDocument(`Ticket ${order.folio}`, `
    <div class="center"><h1>VEREDA CAFÉ</h1><p>Gracias por caminar con nosotros</p><h2>TICKET NO FISCAL #${order.folio}</h2></div>
    <div class="row"><span>${order.type === "table" ? `Mesa ${order.tableId?.replace("t", "")}` : order.customerName || "Para llevar"}</span><span>${new Date(order.openedAt).toLocaleString("es-MX")}</span></div>
    <div class="line"></div>
    ${order.items.filter((item) => item.status !== "cancelled").map((item) => `<div class="row item"><span>${item.quantity} × ${escapeHtml(item.name)}</span><strong>${mxn.format(itemTotal(item))}</strong></div>`).join("")}
    <div class="line"></div>${order.discount ? `<div class="row"><span>Descuento</span><span>-${mxn.format(order.discount)}</span></div>` : ""}<div class="row"><strong>TOTAL</strong><strong>${mxn.format(orderTotal(order))}</strong></div>
    ${order.payments.map((payment) => `<div class="row muted"><span>${payment.method.toUpperCase()}</span><span>${mxn.format(payment.amount)}</span></div>`).join("")}
    <div class="line"></div><p class="center">Precios finales en MXN · vereda_cafe</p>
  `, paper);
}
