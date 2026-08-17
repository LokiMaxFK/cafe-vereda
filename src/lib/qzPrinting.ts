import * as qz from "qz-tray";
import type { PrinterSettings } from "./printerSettings";
import { supabase } from "./supabase";

export type QzConnectionState = "disconnected" | "connecting" | "connected" | "error";

export interface ThermalPrintDocument {
  title: string;
  html: string;
}

let signingConfigured = false;

async function configureSigning() {
  const certificate = import.meta.env.VITE_QZ_CERTIFICATE?.replace(/\\n/g, "\n").trim();
  if (!certificate || !supabase || signingConfigured) return Boolean(certificate && signingConfigured);
  const supabaseClient = supabase;
  qz.security.setCertificatePromise((resolve) => resolve(certificate));
  qz.security.setSignatureAlgorithm("SHA512");
  qz.security.setSignaturePromise(async (request) => {
    const { data, error } = await supabaseClient.functions.invoke("qz-sign", { body: { request } });
    if (error || !data?.signature) throw new Error("No se pudo firmar la solicitud de QZ Tray.");
    return data.signature as string;
  });
  signingConfigured = true;
  return true;
}

export function qzSigningIsConfigured() {
  return Boolean(import.meta.env.VITE_QZ_CERTIFICATE && signingConfigured);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No fue posible comunicarse con QZ Tray.";
}

export function qzIsConnected() {
  return qz.websocket.isActive();
}

export async function connectQzTray() {
  await configureSigning();
  if (!qz.websocket.isActive()) await qz.websocket.connect();
  const found = await qz.printers.find();
  return (Array.isArray(found) ? found : [found]).filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));
}

export async function printWithQz(settings: PrinterSettings, document: ThermalPrintDocument) {
  if (!settings.printerName) throw new Error("Selecciona una impresora antes de imprimir.");
  await configureSigning();
  if (!qz.websocket.isActive()) await qz.websocket.connect();

  const config = qz.configs.create(settings.printerName, {
    units: "mm",
    size: { width: settings.printableWidthMm, height: null },
    margins: 0,
    copies: 1,
    colorType: "grayscale",
    scaleContent: false,
    jobName: document.title
  });
  await qz.print(config, [{
    type: "pixel",
    format: "html",
    flavor: "plain",
    data: document.html
  }]);
}

export function qzErrorMessage(error: unknown) {
  const message = errorMessage(error);
  if (/websocket|connect|refused|closed/i.test(message)) {
    return "No se pudo conectar con QZ Tray. Confirma que está instalado y abierto en esta computadora.";
  }
  return message;
}
