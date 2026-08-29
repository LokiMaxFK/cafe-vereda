import { describe, expect, it } from "vitest";
import { connectionBadge } from "./connection";

const base = { online: true, syncStatus: "synced" as const, pendingCount: 0, liveStatus: "live" as const };

describe("connectionBadge", () => {
  it("dice «Todo sincronizado» sólo cuando todo está al día", () => {
    expect(connectionBadge(base)).toEqual({ label: "Todo sincronizado", tone: "success" });
  });

  it("sin conexión gana a cualquier otro estado y cuenta los cambios sin subir", () => {
    expect(connectionBadge({ ...base, online: false, pendingCount: 3, syncStatus: "review_required", liveStatus: "down" }))
      .toEqual({ label: "3 cambios · Sin conexión", tone: "danger" });
  });

  it("prioriza la revisión pendiente sobre el conteo de cambios", () => {
    expect(connectionBadge({ ...base, syncStatus: "review_required", pendingCount: 2 }))
      .toEqual({ label: "Hay operaciones por revisar", tone: "danger" });
  });

  it("avisa del tiempo real caído aunque la cola de subida esté al día (F16-05)", () => {
    expect(connectionBadge({ ...base, liveStatus: "down" }))
      .toEqual({ label: "Sin actualización en vivo · recarga la página", tone: "danger" });
  });

  it("no avisa mientras el canal aún se está conectando", () => {
    expect(connectionBadge({ ...base, liveStatus: "connecting" }))
      .toEqual({ label: "Todo sincronizado", tone: "success" });
  });

  it("una sincronización en curso tapa el aviso de tiempo real", () => {
    expect(connectionBadge({ ...base, syncStatus: "syncing", liveStatus: "down" }))
      .toEqual({ label: "Sincronizando cambios", tone: "neutral" });
  });

  it("muestra el conteo de pendientes cuando los hay y el resto está sano", () => {
    expect(connectionBadge({ ...base, pendingCount: 5 }))
      .toEqual({ label: "5 cambios pendientes", tone: "success" });
  });
});
