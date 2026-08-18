import { describe, expect, it } from "vitest";
import { elapsedMinutes, isCancellable, isTracked, orderDestination, tableStatus } from "./order";
import type { Order, OrderStatus } from "./types";

const allStatuses: OrderStatus[] = ["open", "preparing", "ready", "served", "closed", "cancelled", "reversed"];

describe("order tracking", () => {
  it("tracks exactly the statuses that still occupy the floor", () => {
    expect(allStatuses.filter((status) => isTracked({ status } as Order))).toEqual(["open", "preparing", "ready", "served"]);
  });

  it("allows cancelling every live status and refuses settled ones", () => {
    expect(allStatuses.filter((status) => isCancellable({ status }))).toEqual(["open", "preparing", "ready", "served"]);
    expect(isCancellable({ status: "closed" })).toBe(false);
    expect(isCancellable({ status: "reversed" })).toBe(false);
  });
});

describe("tableStatus", () => {
  it("reports a free table when nothing is open on it", () => {
    expect(tableStatus(undefined)).toBe("free");
  });

  it("maps a served order to billing so the floor plan shows it as ready to charge", () => {
    expect(tableStatus({ status: "served" })).toBe("billing");
  });

  it("maps the kitchen statuses one to one", () => {
    expect(tableStatus({ status: "ready" })).toBe("ready");
    expect(tableStatus({ status: "preparing" })).toBe("preparing");
    expect(tableStatus({ status: "open" })).toBe("open");
  });
});

describe("orderDestination", () => {
  it("names the table for dine-in orders", () => {
    expect(orderDestination({ type: "table", tableId: "t12" })).toBe("Mesa 12");
  });

  it("prefers the customer name for takeaway and falls back when it is missing", () => {
    expect(orderDestination({ type: "takeaway", customerName: "Mariana" })).toBe("Mariana");
    expect(orderDestination({ type: "takeaway" })).toBe("Para llevar");
    expect(orderDestination({ type: "takeaway", customerName: "" })).toBe("Para llevar");
  });
});

describe("elapsedMinutes", () => {
  const opened = "2026-08-18T10:00:00.000Z";

  it("rounds to whole minutes", () => {
    expect(elapsedMinutes(opened, Date.parse("2026-08-18T10:24:00.000Z"))).toBe(24);
    expect(elapsedMinutes(opened, Date.parse("2026-08-18T10:24:40.000Z"))).toBe(25);
  });

  it("never reports less than a minute, so a fresh order still shows a wait", () => {
    expect(elapsedMinutes(opened, Date.parse("2026-08-18T10:00:01.000Z"))).toBe(1);
  });

  it("never goes negative when a device clock runs behind", () => {
    expect(elapsedMinutes(opened, Date.parse("2026-08-18T09:30:00.000Z"))).toBe(1);
  });
});
