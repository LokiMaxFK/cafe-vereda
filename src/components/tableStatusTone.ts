import type { BadgeTone } from "../../design-system/react";
import type { TableStatus } from "../domain/order";

export const tableStatusLabel: Record<TableStatus, string> = {
  free: "Libre",
  open: "Cuenta abierta",
  preparing: "En preparación",
  ready: "Lista para entregar",
  billing: "Por cobrar"
};

/** Relleno y borde de la mesa en el croquis y de la tarjeta en el carril. */
export const tableStatusSurface: Record<TableStatus, string> = {
  free: "border-outline-variant/50 bg-surface-container-lowest text-on-surface",
  open: "border-secondary/40 bg-secondary-fixed-dim text-on-secondary-fixed",
  preparing: "border-primary bg-primary-fixed text-on-primary-fixed",
  ready: "border-tertiary bg-tertiary-fixed text-on-tertiary-fixed",
  billing: "border-error/50 bg-error-container text-on-error-container"
};

/** Punto de color de la leyenda y de las tarjetas para llevar. */
export const tableStatusDot: Record<TableStatus, string> = {
  free: "bg-surface-container-highest",
  open: "bg-secondary",
  preparing: "bg-primary",
  ready: "bg-tertiary",
  billing: "bg-error"
};

export const tableStatusBadge: Record<TableStatus, BadgeTone> = {
  free: "neutral",
  open: "neutral",
  preparing: "primary",
  ready: "success",
  billing: "danger"
};

/** Orden de la leyenda y de la tira de métricas. */
export const tableStatusOrder: TableStatus[] = ["free", "open", "preparing", "ready", "billing"];
