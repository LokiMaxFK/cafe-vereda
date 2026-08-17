import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ImagePlus, Printer, Save, TestTube2, Trash2 } from "lucide-react";
import QRCode from "qrcode";
import { Button, FieldLabel, InlineAlert, Page, PageHeader, Panel, SelectField, TextField } from "../../design-system/react";
import type { Order } from "../domain/types";
import { printErrorMessage } from "../lib/browserPrinting";
import { createCommandDocument, createTicketDocument, paperFromWidth, printDocumentLocally } from "../lib/printing";
import { loadPrinterSettings, mergeTicketDesign, savePrinterSettings, ticketDesignFrom, type PrinterSettings } from "../lib/printerSettings";
import { loadUniversalTicketDesign, saveUniversalTicketDesign } from "../lib/ticketDesign";

const testOrder: Order = {
  id: "print-test-order",
  folio: 1050,
  type: "table",
  tableId: "t4",
  status: "preparing",
  openedBy: "print-test",
  openedAt: "2026-08-17T15:30:00.000Z",
  updatedAt: "2026-08-17T15:30:00.000Z",
  syncStatus: "synced",
  discount: 10,
  items: [
    { id: "test-latte", productId: "latte", name: "Latte avellana", quantity: 2, unitPrice: 85, variant: "Frío", modifiers: [], notes: "Poco hielo · leche de avena", status: "dispatched", dispatchBatchId: "prueba-001" },
    { id: "test-toast", productId: "toast", name: "Toast de aguacate", quantity: 1, unitPrice: 110, modifiers: [], status: "dispatched", dispatchBatchId: "prueba-001" }
  ],
  payments: [{ id: "test-payment", method: "card", amount: 270, tip: 20, createdAt: "2026-08-17T15:32:00.000Z" }]
};

function isValidTicketUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function createTicketQr(url: string) {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
    color: { dark: "#000000", light: "#ffffff" }
  });
}

async function createThermalLogo(imageBlob: Blob) {
  const source = URL.createObjectURL(imageBlob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = source;
    });
    // El encabezado del ticket ya muestra “VEREDA CAFÉ”. Recortamos ese texto del
    // raster para dedicar los píxeles útiles al emblema que sí debe leerse en 58 mm.
    const sourceWidth = image.width * 0.72;
    const sourceHeight = image.height * 0.77;
    const sourceX = (image.width - sourceWidth) / 2;
    const sourceY = image.height * 0.05;
    const longestSide = 384;
    const scale = Math.min(1, longestSide / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas no disponible");
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const alpha = pixels.data[index + 3];
      const brightness = (pixels.data[index] * 0.299) + (pixels.data[index + 1] * 0.587) + (pixels.data[index + 2] * 0.114);
      const tone = alpha < 20 || brightness > 190 ? 255 : 0;
      pixels.data[index] = tone;
      pixels.data[index + 1] = tone;
      pixels.data[index + 2] = tone;
      pixels.data[index + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(source);
  }
}

export function PrinterSettingsPage() {
  const [settings, setSettings] = useState<PrinterSettings>(() => loadPrinterSettings());
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [printing, setPrinting] = useState<"command" | "ticket" | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const paper = paperFromWidth(settings.paperWidthMm);
  const previewWidth = settings.paperWidthMm === 58 ? "230px" : "310px";

  const preview = useMemo(() => createTicketDocument(testOrder, paper, settings), [paper, settings]);

  useEffect(() => {
    void loadUniversalTicketDesign().then((design) => setSettings((current) => mergeTicketDesign(current, design))).catch((reason: Error) => setError(reason.message));
  }, []);

  useEffect(() => {
    const destination = settings.ticketQrUrl.trim();
    if (!destination || !isValidTicketUrl(destination)) return;
    let active = true;
    void createTicketQr(destination).then((ticketQrDataUrl) => {
      if (active) setSettings((current) => current.ticketQrUrl.trim() === destination ? { ...current, ticketQrDataUrl } : current);
    }).catch(() => active && setError("No se pudo generar el código QR."));
    return () => { active = false; };
  }, [settings.ticketQrUrl]);

  function updateSettings(change: Partial<PrinterSettings>) {
    setSettings((current) => ({ ...current, ...change }));
    setSuccess("");
  }

  async function save() {
    try {
      const prepared = await prepareTicketSettings(settings);
      const normalized = savePrinterSettings(prepared);
      setSettings(normalized);
      await saveUniversalTicketDesign(ticketDesignFrom(normalized));
      setSuccess("Diseño del ticket guardado. El navegador usará la impresora que elijas en el diálogo de Windows.");
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar la configuración del ticket.");
    }
  }

  function selectTicketImage(file: File | undefined) {
    if (!file) return;
    if (!/image\/(png|jpeg)/.test(file.type)) {
      setError("La imagen del ticket debe ser PNG o JPG.");
      return;
    }
    if (file.size > 500_000) {
      setError("La imagen debe pesar menos de 500 KB para que imprima de forma confiable.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateSettings({ ticketImageDataUrl: typeof reader.result === "string" ? reader.result : "" });
      setError("");
    };
    reader.onerror = () => setError("No se pudo leer la imagen seleccionada.");
    reader.readAsDataURL(file);
  }

  async function useCafeVeredaLogo() {
    try {
      const response = await fetch("/logo-termico.png");
      if (!response.ok) throw new Error();
      const image = await response.blob();
      const ticketImageDataUrl = await createThermalLogo(image);
      const normalized = savePrinterSettings({ ...settings, ticketImageDataUrl });
      setSettings(normalized);
      try {
        await saveUniversalTicketDesign(ticketDesignFrom(normalized));
        setSuccess("Logo de Café Vereda optimizado para papel térmico y guardado.");
        setError("");
      } catch (reason) {
        setSuccess("Logo de Café Vereda optimizado y guardado en esta estación.");
        setError(reason instanceof Error ? reason.message : "No se pudo compartir el logo con otras estaciones.");
      }
    } catch {
      setError("No se pudo cargar el logo de Café Vereda.");
    }
  }

  async function prepareTicketSettings(current: PrinterSettings) {
    const ticketQrUrl = current.ticketQrUrl.trim();
    if (!ticketQrUrl) return { ...current, ticketQrDataUrl: "" };
    if (!isValidTicketUrl(ticketQrUrl)) throw new Error("La URL del código QR debe comenzar con http:// o https://.");
    return { ...current, ticketQrUrl, ticketQrDataUrl: await createTicketQr(ticketQrUrl) };
  }

  async function printTest(kind: "command" | "ticket") {
    setPrinting(kind);
    setError("");
    setSuccess("");
    try {
      const prepared = await prepareTicketSettings(settings);
      const normalized = savePrinterSettings(prepared);
      setSettings(normalized);
      const printableSettings = normalized;
      const document = kind === "command"
        ? createCommandDocument(testOrder, testOrder.items, 0, false, paperFromWidth(printableSettings.paperWidthMm), printableSettings)
        : createTicketDocument(testOrder, paperFromWidth(printableSettings.paperWidthMm), printableSettings);
      await printDocumentLocally(document);
      setSuccess(`Se abrió el diálogo para imprimir ${kind === "command" ? "la comanda" : "el ticket"} de prueba.`);
    } catch (reason) {
      setError(printErrorMessage(reason));
    } finally {
      setPrinting(null);
    }
  }

  return <Page size="default">
    <PageHeader
      eyebrow="ESTACIÓN DE IMPRESIÓN"
      title="Probar impresora térmica"
      description="Imprime con el diálogo nativo del navegador; no requiere QZ Tray, certificados ni servicios locales adicionales."
      action={<Button variant="primary" onClick={() => void save()}><Save size={18} /> Guardar</Button>}
    />

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <Panel className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-fixed text-primary"><Printer /></span><div><h2 className="font-bold">Impresión local del navegador</h2><p className="mt-1 text-sm text-on-surface-variant">El ticket se genera en esta computadora y Windows se encarga de enviarlo a la impresora.</p></div></div>
            <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-tertiary-fixed px-3 py-1.5 text-xs font-bold text-tertiary"><CheckCircle2 size={15} /> Lista para imprimir</span>
          </div>
          <p className="mt-4 text-sm text-on-surface-variant">Al imprimir, elige la Suzwip en el diálogo de Windows, usa el tamaño de papel correcto y desactiva encabezados y pies de página. Chrome normalmente conserva la última impresora seleccionada.</p>
          {error && <div className="mt-4"><InlineAlert>{error}</InlineAlert></div>}
          {success && <div className="mt-4"><InlineAlert tone="success">{success}</InlineAlert></div>}
        </Panel>

        <Panel className="p-5">
          <div className="mb-5 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-fixed text-primary"><Printer /></span><div><h2 className="font-bold">Impresora y formato</h2><p className="text-sm text-on-surface-variant">Compatible con la Suzwip de 58 mm y con cualquier impresora disponible en Windows.</p></div></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldLabel label="Ancho de papel"><SelectField value={settings.paperWidthMm} onChange={(event) => updateSettings({ paperWidthMm: Number(event.target.value) as 58 | 80, printableWidthMm: Number(event.target.value) === 58 ? 48 : 72 })}><option value="58">58 mm</option><option value="80">80 mm</option></SelectField></FieldLabel>
            <FieldLabel label="Ancho útil de impresión (mm)" hint="58 mm suele imprimir solo 48 mm útiles. Reduce este valor si se corta a la derecha."><TextField type="number" min="32" max={settings.paperWidthMm - 4} step="0.5" value={settings.printableWidthMm} onChange={(event) => updateSettings({ printableWidthMm: Number(event.target.value) })} /></FieldLabel>
            <FieldLabel label="Margen superior (mm)" hint="Espacio antes y después del contenido."><TextField type="number" min="0" max="8" step="0.5" value={settings.marginMm} onChange={(event) => updateSettings({ marginMm: Number(event.target.value) })} /></FieldLabel>
            <FieldLabel label="Tamaño de texto"><SelectField value={settings.fontScale} onChange={(event) => updateSettings({ fontScale: event.target.value as PrinterSettings["fontScale"] })}><option value="compact">Compacto</option><option value="normal">Normal</option><option value="large">Grande</option></SelectField></FieldLabel>
          </div>
        </Panel>

        <Panel className="p-5">
          <div className="mb-5 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-tertiary-fixed text-tertiary"><ImagePlus /></span><div><h2 className="font-bold">Contenido del ticket final</h2><p className="text-sm text-on-surface-variant">Estos ajustes se aplican al ticket al cerrar una venta y a la prueba de ticket.</p></div></div>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              <FieldLabel label="Imagen superior" hint="PNG o JPG de máximo 500 KB. Al guardar se comparte con todas las estaciones.">
                <input ref={imageInputRef} className="mt-1 block w-full text-sm text-on-surface-variant file:mr-3 file:rounded-lg file:border-0 file:bg-primary-fixed file:px-3 file:py-2 file:font-semibold file:text-primary" type="file" accept="image/png,image/jpeg" onChange={(event) => selectTicketImage(event.target.files?.[0])} />
              </FieldLabel>
              <Button size="sm" variant="secondary" onClick={() => void useCafeVeredaLogo()}><ImagePlus size={16} /> Usar logo Café Vereda</Button>
              {settings.ticketImageDataUrl && <div className="flex items-center gap-3 rounded-xl bg-surface-container-low p-3"><img src={settings.ticketImageDataUrl} alt="Imagen configurada para ticket" className="h-16 w-24 rounded-lg object-contain" /><Button size="sm" variant="danger" onClick={() => { updateSettings({ ticketImageDataUrl: "" }); if (imageInputRef.current) imageInputRef.current.value = ""; }}><Trash2 size={16} /> Quitar</Button></div>}
              <FieldLabel label="Texto al final del ticket" hint="Máximo 240 caracteres."><TextField maxLength={240} value={settings.ticketFooterText} onChange={(event) => updateSettings({ ticketFooterText: event.target.value })} placeholder="Ej. Gracias por tu visita" /></FieldLabel>
              <FieldLabel label="URL para código QR" hint="Usa una dirección http:// o https://. El QR se genera y se guarda dentro del ticket.">
                <TextField type="url" value={settings.ticketQrUrl} onChange={(event) => updateSettings({ ticketQrUrl: event.target.value, ticketQrDataUrl: "" })} placeholder="https://veredacafe.mx" />
              </FieldLabel>
              {settings.ticketQrDataUrl && <div className="flex items-center gap-3 rounded-xl bg-surface-container-low p-3"><img src={settings.ticketQrDataUrl} alt="Código QR configurado" className="h-20 w-20 bg-white p-1" /><p className="text-xs text-on-surface-variant">El QR se incluirá al final de cada ticket.</p></div>}
            </div>
            <fieldset><legend className="text-sm font-semibold text-on-surface-variant">Datos por artículo</legend><p className="mt-1 text-xs text-on-surface-variant">El nombre del producto siempre se muestra.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{([
              ["ticketShowQuantity", "Cantidad"],
              ["ticketShowVariant", "Presentación o variante"],
              ["ticketShowModifiers", "Extras"],
              ["ticketShowNotes", "Notas"],
              ["ticketShowUnitPrice", "Precio unitario"],
              ["ticketShowLineTotal", "Total por artículo"]
            ] as Array<[keyof Pick<PrinterSettings, "ticketShowQuantity" | "ticketShowVariant" | "ticketShowModifiers" | "ticketShowNotes" | "ticketShowUnitPrice" | "ticketShowLineTotal">, string]>).map(([key, label]) => <label key={key} className="flex min-h-11 items-center gap-3 rounded-xl border border-outline-variant/35 px-3 text-sm font-semibold"><input type="checkbox" checked={settings[key]} onChange={(event) => updateSettings({ [key]: event.target.checked } as Partial<PrinterSettings>)} className="rounded border-outline-variant text-primary focus:ring-primary" />{label}</label>)}</div></fieldset>
          </div>
        </Panel>

        <Panel className="p-5">
          <div className="mb-5"><h2 className="font-bold">Pruebas de impresión</h2><p className="mt-1 text-sm text-on-surface-variant">No modifican órdenes ni pagos. Verifica acentos, notas, cantidades, totales y el ancho del papel.</p></div>
          <div className="grid gap-3 sm:grid-cols-2"><Button variant="primary" size="lg" onClick={() => void printTest("command")} disabled={printing !== null}><TestTube2 size={18} /> {printing === "command" ? "Abriendo…" : "Imprimir comanda"}</Button><Button variant="success" size="lg" onClick={() => void printTest("ticket")} disabled={printing !== null}><Printer size={18} /> {printing === "ticket" ? "Abriendo…" : "Imprimir ticket"}</Button></div>
        </Panel>
      </div>

      <Panel className="h-fit p-5 xl:sticky xl:top-6"><div className="mb-4"><p className="text-xs font-bold uppercase tracking-wider text-primary">Vista previa</p><h2 className="mt-1 font-bold">Ticket de prueba</h2><p className="mt-1 text-sm text-on-surface-variant">La impresión final usa este mismo formato.</p></div><div className="overflow-auto rounded-xl bg-surface-container-low p-5"><iframe title="Vista previa de ticket" srcDoc={preview.html} className="mx-auto block min-h-[470px] border-0 bg-white shadow-panel" style={{ width: previewWidth }} /></div></Panel>
    </div>
  </Page>;
}
