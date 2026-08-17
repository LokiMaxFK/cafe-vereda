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
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.border = "0";
  frame.style.opacity = "0";
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
    frameWindow.focus();
    frameWindow.print();
  } finally {
    window.setTimeout(() => frame.remove(), 1_000);
  }
}

export function printErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo abrir la impresión del navegador.";
}
