import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, ImagePlus, PlugZap, Printer, RefreshCw, Save, TestTube2, Trash2 } from "lucide-react";
import QRCode from "qrcode";
import { Button, FieldLabel, InlineAlert, Page, PageHeader, Panel, SelectField, TextField } from "../../design-system/react";
import type { Order } from "../domain/types";
import { createCommandDocument, createTicketDocument, paperFromWidth } from "../lib/printing";
import { connectQzTray, printWithQz, qzCertificateConfigured, qzErrorMessage, qzIsConnected, type QzConnectionState } from "../lib/qzPrinting";
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

const connectionCopy: Record<QzConnectionState, { label: string; tone: "neutral" | "success" | "danger" }> = {
  disconnected: { label: "Sin conectar", tone: "neutral" },
  connecting: { label: "Conectando…", tone: "neutral" },
  connected: { label: "QZ Tray conectado", tone: "success" },
  error: { label: "Conexión no disponible", tone: "danger" }
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
  const [printers, setPrinters] = useState<string[]>([]);
  const [connection, setConnection] = useState<QzConnectionState>(() => qzIsConnected() ? "connected" : "disconnected");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [printing, setPrinting] = useState<"command" | "ticket" | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const paper = paperFromWidth(settings.paperWidthMm);
  const status = connectionCopy[connection];
  const selectedPrinterMissing = Boolean(settings.printerName && printers.length && !printers.includes(settings.printerName));
  const previewWidth = settings.paperWidthMm === 58 ? "230px" : "310px";

  const preview = useMemo(() => createTicketDocument(testOrder, paper, settings), [paper, settings]);

  useEffect(() => {
    if (qzIsConnected()) void refreshPrinters();
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

  async function refreshPrinters() {
    setConnection("connecting");
    setError("");
    try {
      const found = await connectQzTray();
      setPrinters(found);
      setConnection("connected");
      if (!found.length) setError("QZ Tray está conectado, pero Windows no reportó impresoras disponibles.");
    } catch (reason) {
      setConnection("error");
      setError(qzErrorMessage(reason));
    }
  }

  async function save() {
    try {
      const prepared = await prepareTicketSettings(settings);
      const normalized = savePrinterSettings(prepared);
      setSettings(normalized);
      await saveUniversalTicketDesign(ticketDesignFrom(normalized));
      setSuccess("Diseño del ticket guardado para todo el café. La impresora permanece configurada solo en esta estación.");
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
      await printWithQz(printableSettings, document);
      setConnection("connected");
      setSuccess(`${kind === "command" ? "Comanda" : "Ticket"} de prueba enviado a ${normalized.printerName}.`);
    } catch (reason) {
      setConnection(qzIsConnected() ? "connected" : "error");
      setError(qzErrorMessage(reason));
    } finally {
      setPrinting(null);
    }
  }

  return <Page size="default">
    <PageHeader
      eyebrow="ESTACIÓN DE IMPRESIÓN"
      title="Probar impresora térmica"
      description="La impresora se elige por computadora; el diseño del ticket se comparte con todo el café al guardar."
      action={<><Button variant="secondary" onClick={() => void refreshPrinters()} disabled={connection === "connecting"}><RefreshCw size={18} className={connection === "connecting" ? "animate-spin" : ""} /> Buscar impresoras</Button><Button variant="primary" onClick={() => void save()}><Save size={18} /> Guardar</Button></>}
    />

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <Panel className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-fixed text-primary"><PlugZap /></span><div><h2 className="font-bold">Conexión con QZ Tray</h2><p className="mt-1 text-sm text-on-surface-variant">QZ Tray detecta las impresoras instaladas por Windows y les envía el trabajo directamente.</p></div></div>
            <span className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${status.tone === "success" ? "bg-tertiary-fixed text-tertiary" : status.tone === "danger" ? "bg-error-container text-error" : "bg-surface-container-high text-on-surface-variant"}`}>{status.tone === "success" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}{status.label}</span>
          </div>
          {!qzCertificateConfigured() && <div className="mt-4"><InlineAlert>Este despliegue no tiene configurado el certificado de firma de QZ Tray (falta <code>VITE_QZ_CERTIFICATE</code> en el build). No es una falla de la impresora: sin certificado, QZ Tray funciona pero pide autorizar manualmente cada estación con «Allow» + «Remember this decision», y puede quedarse esperando esa autorización si nadie la confirma. Configura la variable y despliega la función <code>qz-sign</code> con el secreto <code>QZ_PRIVATE_KEY</code> para impresión firmada — ver docs/IMPRESION_TERMICA.md.</InlineAlert></div>}
          {error && <div className="mt-4"><InlineAlert>{error}</InlineAlert></div>}
          {success && <div className="mt-4"><InlineAlert tone="success">{success}</InlineAlert></div>}
          {connection !== "connected" && <div className="mt-5 flex flex-wrap gap-3"><Button variant="primary" onClick={() => void refreshPrinters()} disabled={connection === "connecting"}><PlugZap size={18} /> Conectar QZ Tray</Button><a className="inline-flex min-h-touch-target-min items-center gap-2 px-2 text-sm font-semibold text-primary underline" href="https://qz.io/download" target="_blank" rel="noreferrer">Descargar QZ Tray <ExternalLink size={15} /></a></div>}
        </Panel>

        <Panel className="p-5">
          <div className="mb-5 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-fixed text-primary"><Printer /></span><div><h2 className="font-bold">Impresora y formato</h2><p className="text-sm text-on-surface-variant">Compatible con la Suzwip de 58 mm y con cualquier impresora disponible en Windows.</p></div></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldLabel label="Impresora de esta estación" hint={selectedPrinterMissing ? "La impresora guardada ya no aparece. Selecciona otra antes de probar." : "El nombre viene directamente de Windows."}>
              <SelectField value={settings.printerName} onChange={(event) => updateSettings({ printerName: event.target.value })} disabled={!printers.length}>
                <option value="">{printers.length ? "Selecciona una impresora" : "Conecta QZ Tray para buscar"}</option>
                {selectedPrinterMissing && <option value={settings.printerName}>{settings.printerName} (no disponible)</option>}
                {printers.map((printer) => <option key={printer} value={printer}>{printer}</option>)}
              </SelectField>
            </FieldLabel>
            <FieldLabel label="Ancho de papel"><SelectField value={settings.paperWidthMm} onChange={(event) => updateSettings({ paperWidthMm: Number(event.target.value) as 58 | 80, printableWidthMm: Number(event.target.value) === 58 ? 48 : 72 })}><option value="58">58 mm</option><option value="80">80 mm</option></SelectField></FieldLabel>
            <FieldLabel label="Ancho útil de impresión (mm)" hint="58 mm suele imprimir solo 48 mm útiles. Reduce este valor si se corta a la derecha."><TextField type="number" min="32" max={settings.paperWidthMm - 4} step="0.5" value={settings.printableWidthMm} onChange={(event) => updateSettings({ printableWidthMm: Number(event.target.value) })} /></FieldLabel>
            <FieldLabel label="Margen superior (mm)" hint="Espacio antes y después del contenido."><TextField type="number" min="0" max="8" step="0.5" value={settings.marginMm} onChange={(event) => updateSettings({ marginMm: Number(event.target.value) })} /></FieldLabel>
            <FieldLabel label="Tamaño de texto"><SelectField value={settings.fontScale} onChange={(event) => updateSettings({ fontScale: event.target.value as PrinterSettings["fontScale"] })}><option value="compact">Compacto</option><option value="normal">Normal</option><option value="large">Grande</option></SelectField></FieldLabel>
            <FieldLabel label="Copias predeterminadas de comanda" hint="Se imprimen automáticamente al enviar una comanda a preparación."><SelectField value={settings.commandCopies} onChange={(event) => updateSettings({ commandCopies: Number(event.target.value) as 1 | 2 })}><option value="1">1 copia</option><option value="2">2 copias</option></SelectField></FieldLabel>
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
          <div className="grid gap-3 sm:grid-cols-2"><Button variant="primary" size="lg" onClick={() => void printTest("command")} disabled={!settings.printerName || printing !== null}><TestTube2 size={18} /> {printing === "command" ? "Enviando…" : "Imprimir comanda"}</Button><Button variant="success" size="lg" onClick={() => void printTest("ticket")} disabled={!settings.printerName || printing !== null}><Printer size={18} /> {printing === "ticket" ? "Enviando…" : "Imprimir ticket"}</Button></div>
          {!settings.printerName && <p className="mt-3 text-sm text-on-surface-variant">Selecciona una impresora para habilitar las pruebas.</p>}
        </Panel>
      </div>

      <Panel className="h-fit p-5 xl:sticky xl:top-6"><div className="mb-4"><p className="text-xs font-bold uppercase tracking-wider text-primary">Vista previa</p><h2 className="mt-1 font-bold">Ticket de prueba</h2><p className="mt-1 text-sm text-on-surface-variant">La impresión final usa este mismo formato.</p></div><div className="overflow-auto rounded-xl bg-surface-container-low p-5"><iframe title="Vista previa de ticket" srcDoc={preview.html} className="mx-auto block min-h-[470px] border-0 bg-white shadow-panel" style={{ width: previewWidth }} /></div></Panel>
    </div>
  </Page>;
}
