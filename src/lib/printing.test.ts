import { describe, expect, it } from "vitest";
import type { Order } from "../domain/types";
import { defaultPrinterSettings } from "./printerSettings";
import { createTicketDocument } from "./printing";

const order: Order = {
  id: "ticket", folio: 1, type: "takeaway", customerName: "María", status: "closed", openedBy: "staff", openedAt: "2026-08-17T15:30:00Z", updatedAt: "2026-08-17T15:31:00Z", syncStatus: "synced", discount: 0,
  items: [{ id: "item", productId: "coffee", name: "Café de especialidad", quantity: 2, unitPrice: 70, variant: "Frío", modifiers: [{ id: "oat", name: "Leche de avena", price: 15 }], notes: "Poco hielo", status: "prepared" }],
  payments: [{ id: "payment", method: "card", amount: 140, tip: 0, createdAt: "2026-08-17T15:31:00Z" }]
};

describe("ticket printing", () => {
  it("uses a safe printable width for 58 mm paper", () => {
    const document = createTicketDocument(order, "58", { ...defaultPrinterSettings, printableWidthMm: 48 });
    expect(document.html).toContain("@page{size:48mm auto;margin:0}");
    expect(document.html).toContain("html,body{width:48mm;min-width:48mm}");
  });

  it("honors configured ticket fields and footer", () => {
    const document = createTicketDocument(order, "58", { ...defaultPrinterSettings, ticketFooterText: "Gracias, vuelve pronto", ticketShowVariant: false, ticketShowModifiers: false, ticketShowNotes: false, ticketShowUnitPrice: true });
    expect(document.html).toContain("Gracias, vuelve pronto");
    expect(document.html).toContain("Precio unitario");
    expect(document.html).not.toContain("Leche de avena");
    expect(document.html).not.toContain("Poco hielo");
  });

  it("includes an embedded QR image when configured", () => {
    const qr = "data:image/png;base64,aGVsbG8=";
    const document = createTicketDocument(order, "58", { ...defaultPrinterSettings, ticketQrUrl: "https://veredacafe.mx", ticketQrDataUrl: qr });
    expect(document.html).toContain('class="ticket-qr"');
    expect(document.html).toContain(qr);
  });
});
