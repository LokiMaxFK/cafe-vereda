export interface ThermalPrintDocument {
  title: string;
  html: string;
}

function printFrameHtml(printable: ThermalPrintDocument) {
  const parsed = new DOMParser().parseFromString(printable.html, "text/html");
  parsed.title = printable.title;
  const printSafety = parsed.createElement("style");
  printSafety.textContent = `
    @media screen { html, body { background: #fff; } }
    @media print { html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  `;
  parsed.head.append(printSafety);
  return `<!doctype html>${parsed.documentElement.outerHTML}`;
}

const CSS_PX_PER_MM = 96 / 25.4;

function toMm(pixels: number) {
  return pixels / CSS_PX_PER_MM;
}

/**
 * Fija el tamaño de página con el alto real del ticket ya maquetado.
 *
 * El rollo es continuo, así que no hay un alto de papel correcto de antemano: si no se
 * declara, Windows usa el del driver y corta el ticket donde termine esa hoja. Se mide
 * después de cargar tipografías e imágenes, cuando la altura ya es definitiva.
 */
function lockPageToContent(frameDocument: Document) {
  const { body } = frameDocument;
  const widthMm = toMm(Math.max(body.scrollWidth, body.getBoundingClientRect().width));
  // Sólo el body: documentElement.scrollHeight nunca baja del alto del viewport del
  // iframe, así que mediría el iframe en lugar del ticket.
  const heightMm = toMm(Math.max(body.scrollHeight, body.getBoundingClientRect().height));
  if (!(widthMm > 0) || !(heightMm > 0)) return;
  // Se redondea hacia arriba: quedarse corto por un decimal empuja la última línea a una
  // segunda página, que en un rollo continuo sale como un ticket extra casi vacío.
  const pageSize = frameDocument.createElement("style");
  pageSize.textContent = `@page{size:${Math.ceil(widthMm)}mm ${Math.ceil(heightMm)}mm;margin:0}`;
  frameDocument.head.append(pageSize);
}

function waitForFrame(frame: HTMLIFrameElement) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("La vista de impresión tardó demasiado en abrir.")), 10_000);
    frame.addEventListener("load", () => {
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}

async function waitForImages(frameDocument: Document) {
  const pendingImages = Array.from(frameDocument.images).filter((image) => !image.complete);
  if (!pendingImages.length) return;
  await Promise.all(pendingImages.map((image) => new Promise<void>((resolve) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => resolve(), { once: true });
  })));
}

export async function printWithBrowser(printable: ThermalPrintDocument) {
  const frame = document.createElement("iframe");
  frame.title = `Imprimir ${printable.title}`;
  frame.setAttribute("aria-hidden", "true");
  // Fuera de pantalla en vez de 1×1 transparente: el ticket necesita maquetarse a su
  // ancho real para poder medir el alto que se le dará a la página.
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.width = "420px";
  frame.style.height = "1200px";
  frame.style.border = "0";
  frame.srcdoc = printFrameHtml(printable);

  const loaded = waitForFrame(frame);
  document.body.append(frame);
  try {
    await loaded;
    const frameWindow = frame.contentWindow;
    const frameDocument = frame.contentDocument;
    if (!frameWindow || !frameDocument) throw new Error("El navegador no pudo preparar la impresión.");
    await frameDocument.fonts?.ready;
    await waitForImages(frameDocument);
    lockPageToContent(frameDocument);
    frameWindow.focus();
    frameWindow.print();
  } finally {
    window.setTimeout(() => frame.remove(), 1_000);
  }
}

export function printErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo abrir la impresión del navegador.";
}
