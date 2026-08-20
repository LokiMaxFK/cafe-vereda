import { describe, expect, it } from "vitest";
import { mxn } from "../domain/money";
import type { Order } from "../domain/types";
import { defaultPrinterSettings } from "./printerSettings";
import { createCommandDocument, createTicketDocument } from "./printing";

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

  it("imprime el método de pago en español, no el valor crudo de la base", () => {
    // El ticket que se entrega al cliente decía "CASH" / "CARD" / "TRANSFER".
    expect(createTicketDocument(order).html).toContain("TARJETA");
    expect(createTicketDocument(order).html).not.toContain("CARD");
    const efectivo = createTicketDocument({ ...order, payments: [{ ...order.payments[0], method: "cash" }] }).html;
    expect(efectivo).toContain("EFECTIVO");
    expect(efectivo).not.toContain("CASH");
    const transferencia = createTicketDocument({ ...order, payments: [{ ...order.payments[0], method: "transfer" }] }).html;
    expect(transferencia).toContain("TRANSFERENCIA");
  });

  it("includes an embedded QR image when configured", () => {
    const qr = "data:image/png;base64,aGVsbG8=";
    const document = createTicketDocument(order, "58", { ...defaultPrinterSettings, ticketQrUrl: "https://veredacafe.mx", ticketQrDataUrl: qr });
    expect(document.html).toContain('class="ticket-qr"');
    expect(document.html).toContain(qr);
  });

  it("includes and escapes the discount reason", () => {
    const html = createTicketDocument({ ...order, discount: 10, discountReason: "Cortesía <cliente>" }).html;
    expect(html).toContain("Descuento · Cortesía &lt;cliente&gt;");
    expect(html).toContain(`-${mxn.format(10)}`);
  });

  it("prints a discount without an empty or undefined reason", () => {
    const html = createTicketDocument({ ...order, discount: 10, discountReason: undefined }).html;
    expect(html).toContain("<span>Descuento</span>");
    expect(html).not.toContain("Descuento ·");
    expect(html).not.toContain("undefined");
  });

  it("imprime la propina en su propio renglón, no pegada al importe", () => {
    // A 58 mm el importe y la propina en la misma línea no caben: el nombre del método se partía
    // letra por letra ("TA / RJ / ET / A"). La propina va ahora en un renglón aparte.
    const html = createTicketDocument({ ...order, payments: [{ ...order.payments[0], tip: 20 }] }).html;
    expect(html).toContain("Propina");
    expect(html).toContain(mxn.format(20));
    expect(html).not.toContain(`${mxn.format(140)} + ${mxn.format(20)} propina`);
  });

  it("no deja que el nombre del método de pago se parta a mitad de palabra", () => {
    const html = createTicketDocument(order).html;
    expect(html).toContain('class="pay-method"');
    expect(html).toContain("white-space:nowrap");
  });

  it("deja que un nombre larguísimo se ajuste sin desbordar el papel", () => {
    // 58 mm son 48 mm útiles: un nombre largo tiene que partirse, no salirse del ticket.
    const largo = "Frappé de caramelo salado con doble carga de espresso y crema batida";
    const html = createTicketDocument({ ...order, items: [{ ...order.items[0], name: largo }] }, "58", { ...defaultPrinterSettings, printableWidthMm: 48 }).html;
    expect(html).toContain(largo);
    // el contenedor del nombre permite el ajuste; el importe se queda fijo a la derecha
    expect(html).toContain("overflow-wrap:anywhere");
    expect(html).toContain(".row>span:last-child,.row>strong:last-child{flex:none;text-align:right}");
  });

  it("imprime juntos el descuento con motivo y la propina", () => {
    const html = createTicketDocument({
      ...order,
      discount: 15,
      discountReason: "Cortesía",
      payments: [{ ...order.payments[0], tip: 25 }]
    }, "58").html;
    expect(html).toContain("Descuento · Cortesía");
    expect(html).toContain(`-${mxn.format(15)}`);
    expect(html).toContain("Propina");
    expect(html).toContain(mxn.format(25));
  });

  it("usa los valores por defecto cuando no se le pasa configuración", () => {
    const html = createTicketDocument(order).html;
    expect(html).toContain(defaultPrinterSettings.ticketFooterText);
    // Detalle a tener presente: la firma toma papel de 80 mm por defecto, pero la configuración
    // por defecto fija 48 mm útiles (los de la impresora de 58 mm). Gana la configuración, que es
    // la opción conservadora: nunca se imprime más ancho del que el papel real admite.
    expect(html).toContain("@page{size:48mm auto;margin:0}");
    expect(defaultPrinterSettings.printableWidthMm).toBe(48);
  });

  it("omits the tip wording when a payment tip is zero or absent", () => {
    const zeroTipHtml = createTicketDocument(order).html;
    const absentTipHtml = createTicketDocument({
      ...order,
      payments: [{ id: "without-tip", method: "cash", amount: 140, createdAt: "2026-08-17T15:31:00Z" } as Order["payments"][number]]
    }).html;
    expect(zeroTipHtml).not.toContain("propina");
    expect(absentTipHtml).not.toContain("propina");
  });
});

describe("command printing", () => {
  /**
   * La comanda es la única instrucción que recibe la barra. Todo lo que cambie cómo se prepara
   * la bebida tiene que aparecer aquí: si un extra se cobra pero no se imprime, el cliente paga
   * algo que nadie le va a preparar.
   */
  it("imprime cantidad, variante, extras y nota de cada línea", () => {
    const document = createCommandDocument(order, order.items, 1, false, "58");
    expect(document.html).toContain("2 × Café de especialidad");
    expect(document.html).toContain("Frío");
    expect(document.html).toContain("+ Leche de avena");
    expect(document.html).toContain("NOTA: Poco hielo");
  });

  it("separa varios extras de una misma línea", () => {
    const items = [{ ...order.items[0], modifiers: [{ id: "oat", name: "Leche de avena", price: 15 }, { id: "shot", name: "Carga extra", price: 15 }] }];
    expect(createCommandDocument(order, items, 0, false, "58").html).toContain("+ Leche de avena · + Carga extra");
  });

  it("omite el bloque de extras cuando la línea no tiene", () => {
    const items = [{ ...order.items[0], modifiers: [], variant: undefined, notes: undefined }];
    const html = createCommandDocument(order, items, 0, false, "58").html;
    expect(html).toContain("2 × Café de especialidad");
    expect(html).not.toContain("+ ");
    expect(html).not.toContain("NOTA:");
  });

  it("imprime el motivo en la comanda de cancelación", () => {
    // El requisito del cliente es que toda cancelación quede registrada: el papel que llega a la
    // barra tiene que decir por qué se canceló, no sólo qué.
    const items = [{ ...order.items[0], status: "cancelled" as const, cancellationReason: "Cliente cambió de opinión" }];
    const html = createCommandDocument(order, items, 0, true, "58").html;
    expect(html).toContain("CANCELACIÓN");
    expect(html).toContain("MOTIVO: Cliente cambió de opinión");
  });

  it("no imprime línea de motivo cuando el artículo no está cancelado", () => {
    expect(createCommandDocument(order, order.items, 0, false, "58").html).not.toContain("MOTIVO:");
  });

  it("marca la copia y la cancelación cuando corresponde", () => {
    expect(createCommandDocument(order, order.items, 1, false, "58").html).toContain("COPIA 1");
    expect(createCommandDocument(order, order.items, 0, true, "58").html).toContain("CANCELACIÓN");
    expect(createCommandDocument(order, order.items, 0, false, "58").html).not.toContain("COPIA");
  });

  it("la comanda de cancelación lista sólo lo que se retira de la barra", () => {
    const items = [
      { ...order.items[0], name: "Latte", status: "cancelled" as const, cancellationReason: "Se derramó" }
    ];
    const html = createCommandDocument(order, items, 0, true, "58").html;
    expect(html).toContain("CANCELACIÓN");
    expect(html).toContain("2 × Latte");
    expect(html).toContain("MOTIVO: Se derramó");
    // la comanda nunca lleva precios: la barra no cobra
    expect(html).not.toContain("$");
  });

  it("escapa el nombre del cliente y del producto", () => {
    const hostile = { ...order, customerName: "<script>x</script>" };
    const items = [{ ...order.items[0], name: "Té <b>verde</b>" }];
    const html = createCommandDocument(hostile, items, 0, false, "58").html;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Té &lt;b&gt;verde&lt;/b&gt;");
  });
});
