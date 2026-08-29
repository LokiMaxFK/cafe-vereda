import { describe, expect, it } from "vitest";
import { orderTotal } from "./money";
import {
  assignUnits, createSubaccounts, evenSplitAmounts, hasSubaccountPayments, isSplit, isSubaccountSettled,
  nextAssignedUnits, pendingAssignments, pruneShares, splitIsComplete, splitIsSettled, subaccountBalance,
  subaccountDiscount, subaccountItems, subaccountPaid, subaccountSubtotal, subaccountTip, subaccountTotal,
  unassignedUnits
} from "./splitBill";
import type { Order, OrderItemShare } from "./types";

const ana = { id: "ana", label: "Ana", position: 1 };
const beto = { id: "beto", label: "Beto", position: 2 };
const caro = { id: "caro", label: "Caro", position: 3 };

/** Latte ×2 a $60, chilaquiles $145, jugo $55 y un pan cancelado. Subtotal $320. */
const order: Order = {
  id: "order", folio: 1052, type: "table", tableId: "t4", status: "served",
  openedBy: "staff", openedAt: "2026-08-24T10:00:00Z", updatedAt: "2026-08-24T10:00:00Z", syncStatus: "synced",
  discount: 0,
  items: [
    { id: "latte", productId: "p-latte", name: "Latte", quantity: 2, unitPrice: 60, modifiers: [], status: "prepared" },
    { id: "chilaquiles", productId: "p-chi", name: "Chilaquiles", quantity: 1, unitPrice: 145, modifiers: [], status: "prepared" },
    { id: "jugo", productId: "p-jugo", name: "Jugo", quantity: 1, unitPrice: 55, modifiers: [], status: "prepared" },
    { id: "pan", productId: "p-pan", name: "Pan", quantity: 1, unitPrice: 40, modifiers: [], status: "cancelled" }
  ],
  payments: [],
  splitMode: "items",
  subaccounts: [ana, beto, caro],
  itemShares: [
    { itemId: "latte", subaccountId: "ana", units: 1 },
    { itemId: "latte", subaccountId: "beto", units: 1 },
    { itemId: "chilaquiles", subaccountId: "beto", units: 1 },
    { itemId: "jugo", subaccountId: "caro", units: 1 }
  ]
};

const sumOfSubaccounts = (target: Order) =>
  Math.round((target.subaccounts ?? []).reduce((sum, sub) => sum + subaccountTotal(target, sub.id), 0) * 100) / 100;

describe("evenSplitAmounts", () => {
  it("splits an exact amount evenly", () => expect(evenSplitAmounts(300, 3)).toEqual([100, 100, 100]));

  // El caso que rompe la cuenta si se redondea cada parte por su lado.
  it("gives the leftover cent to the last person", () => {
    expect(evenSplitAmounts(100, 3)).toEqual([33.33, 33.33, 33.34]);
  });

  it("always adds up to exactly the total", () => {
    for (const total of [100, 0.01, 335, 0.05, 1234.56, 999.99, 10]) {
      for (const count of [2, 3, 4, 5, 6, 7]) {
        const parts = evenSplitAmounts(total, count);
        expect(parts).toHaveLength(count);
        expect(Math.round(parts.reduce((sum, part) => sum + part, 0) * 100)).toBe(Math.round(total * 100));
      }
    }
  });

  it("hands the whole cent to the last one when there is less than one cent each", () => {
    expect(evenSplitAmounts(0.01, 2)).toEqual([0, 0.01]);
  });

  it("returns nothing for a nonsensical head count", () => {
    expect(evenSplitAmounts(100, 0)).toEqual([]);
    expect(evenSplitAmounts(100, 1.5)).toEqual([]);
  });
});

describe("createSubaccounts", () => {
  let counter = 0;
  const ids = () => `id-${++counter}`;

  it("numbers the people from one", () => {
    counter = 0;
    expect(createSubaccounts(3, ids)).toEqual([
      { id: "id-1", label: "Persona 1", position: 1 },
      { id: "id-2", label: "Persona 2", position: 2 },
      { id: "id-3", label: "Persona 3", position: 3 }
    ]);
  });

  it("refuses to split a bill in fewer than two", () => {
    expect(createSubaccounts(1)).toEqual([]);
    expect(createSubaccounts(0)).toEqual([]);
  });
});

describe("assigning units", () => {
  const latte = { id: "latte", quantity: 2 };

  it("sets the units of one person without touching the others", () => {
    const next = assignUnits(order.itemShares ?? [], latte, "ana", 1);
    expect(next.filter((share) => share.itemId === "latte")).toEqual([
      { itemId: "latte", subaccountId: "beto", units: 1 },
      { itemId: "latte", subaccountId: "ana", units: 1 }
    ]);
  });

  it("never hands out more units than the line has", () => {
    const next = assignUnits(order.itemShares ?? [], latte, "ana", 99);
    expect(next.find((share) => share.itemId === "latte" && share.subaccountId === "ana")?.units).toBe(1);
  });

  it("drops the share when it goes down to zero", () => {
    const next = assignUnits(order.itemShares ?? [], latte, "ana", 0);
    expect(next.some((share) => share.itemId === "latte" && share.subaccountId === "ana")).toBe(false);
  });

  it("counts what is still unassigned", () => {
    const shares: OrderItemShare[] = [{ itemId: "latte", subaccountId: "ana", units: 1 }];
    expect(unassignedUnits(latte, shares)).toBe(1);
    expect(unassignedUnits(latte, [])).toBe(2);
  });

  it("forgets shares of lines that were cancelled or shrank", () => {
    const shares: OrderItemShare[] = [
      { itemId: "pan", subaccountId: "ana", units: 1 },
      { itemId: "latte", subaccountId: "ana", units: 5 }
    ];
    expect(pruneShares(order.items, shares)).toEqual([{ itemId: "latte", subaccountId: "ana", units: 2 }]);
  });

  // Cancelar una unidad de un renglón repartido lo encoge: si cada participación sólo se topa
  // contra la línea entera, las dos sobreviven y entre ambas reclaman más de lo que queda.
  it("never leaves a line handing out more units than it has left", () => {
    const shrunk = order.items.map((item) => item.id === "latte" ? { ...item, quantity: 1 } : item);
    const shares: OrderItemShare[] = [
      { itemId: "latte", subaccountId: "ana", units: 1 },
      { itemId: "latte", subaccountId: "beto", units: 1 }
    ];
    const pruned = pruneShares(shrunk, shares);
    expect(pruned.reduce((sum, share) => sum + share.units, 0)).toBe(1);
    expect(pruned).toEqual([{ itemId: "latte", subaccountId: "ana", units: 1 }]);
  });

  it("keeps the split adding up to the bill after part of a line is cancelled", () => {
    const shrunk: Order = {
      ...order,
      items: order.items.map((item) => item.id === "latte" ? { ...item, quantity: 1 } : item)
    };
    const pruned: Order = { ...shrunk, itemShares: pruneShares(shrunk.items, shrunk.itemShares ?? []) };
    expect(sumOfSubaccounts(pruned)).toBe(orderTotal(pruned));
  });
});

describe("the next tap on a person's button", () => {
  const latte = { id: "latte", quantity: 2 };

  it("hands them one more unit while the line has free ones", () => {
    expect(nextAssignedUnits(latte, [], "ana")).toBe(1);
    expect(nextAssignedUnits(latte, [{ itemId: "latte", subaccountId: "ana", units: 1 }], "ana")).toBe(2);
  });

  // El caso que dejaba una unidad mal asignada sin forma de soltarse.
  it("lets go of their units when the rest of the line already has owners", () => {
    const shares: OrderItemShare[] = [
      { itemId: "latte", subaccountId: "ana", units: 1 },
      { itemId: "latte", subaccountId: "beto", units: 1 }
    ];
    expect(nextAssignedUnits(latte, shares, "ana")).toBe(0);
  });

  it("lets go of the whole line when one person took it all", () => {
    expect(nextAssignedUnits(latte, [{ itemId: "latte", subaccountId: "ana", units: 2 }], "ana")).toBe(0);
  });

  it("ignores the units of other lines", () => {
    const shares: OrderItemShare[] = [{ itemId: "jugo", subaccountId: "beto", units: 1 }];
    expect(nextAssignedUnits(latte, shares, "ana")).toBe(1);
  });
});

describe("what each person owes", () => {
  it("gives each person only their own items", () => {
    expect(subaccountItems(order, "beto").map((item) => `${item.quantity}×${item.name}`)).toEqual(["1×Latte", "1×Chilaquiles"]);
  });

  it("leaves cancelled lines out of every subaccount", () => {
    expect(subaccountItems(order, "ana").some((item) => item.name === "Pan")).toBe(false);
  });

  it("adds up one person's consumption", () => {
    expect(subaccountSubtotal(order, "ana")).toBe(60);
    expect(subaccountSubtotal(order, "beto")).toBe(205);
    expect(subaccountSubtotal(order, "caro")).toBe(55);
  });

  it("adds up to the whole bill with no discount", () => {
    expect(orderTotal(order)).toBe(320);
    expect(sumOfSubaccounts(order)).toBe(320);
  });
});

describe("prorated discount", () => {
  const discounted: Order = { ...order, discount: 50, discountReason: "cortesía por demora" };

  it("charges the discount in proportion to what each one ate", () => {
    expect(subaccountDiscount(discounted, "ana")).toBe(9.37);
    expect(subaccountDiscount(discounted, "beto")).toBe(32.03);
    expect(subaccountDiscount(discounted, "caro")).toBe(8.6);
  });

  it("adds up to exactly the discount of the bill", () => {
    const parts = (discounted.subaccounts ?? []).map((sub) => subaccountDiscount(discounted, sub.id));
    expect(Math.round(parts.reduce((sum, part) => sum + part, 0) * 100)).toBe(5000);
  });

  it("keeps the subaccounts adding up to the discounted total", () => {
    expect(orderTotal(discounted)).toBe(270);
    expect(sumOfSubaccounts(discounted)).toBe(270);
  });

  it("adds up for any discount, which is what lets the bill close", () => {
    for (const discount of [0.01, 1, 33.33, 50, 100, 199.99, 320]) {
      const target: Order = { ...order, discount, discountReason: "prueba" };
      expect(sumOfSubaccounts(target)).toBe(orderTotal(target));
    }
  });

  it("is zero when the bill has no discount", () => {
    expect(subaccountDiscount(order, "ana")).toBe(0);
  });
});

describe("even split mode", () => {
  const even: Order = { ...order, splitMode: "even", itemShares: [], discount: 20, discountReason: "cortesía" };

  it("ignores who ordered what", () => {
    expect(subaccountTotal(even, "ana")).toBe(100);
    expect(subaccountTotal(even, "beto")).toBe(100);
    expect(subaccountTotal(even, "caro")).toBe(100);
  });

  it("still adds up to the total", () => {
    expect(sumOfSubaccounts(even)).toBe(orderTotal(even));
  });

  it("needs nothing assigned to be ready to charge", () => {
    expect(splitIsComplete(even)).toBe(true);
  });

  // Sin artículos que prorratear, el reparto por consumo dejaba a todos en cero y le imprimía el
  // descuento entero a la última persona, que era la única que se llevaba el residuo.
  it("splits the discount evenly too, instead of dumping it on the last person", () => {
    expect(subaccountDiscount(even, "ana")).toBe(6.66);
    expect(subaccountDiscount(even, "beto")).toBe(6.66);
    expect(subaccountDiscount(even, "caro")).toBe(6.68);
  });

  it("still adds up to exactly the discount of the bill", () => {
    const parts = (even.subaccounts ?? []).map((sub) => subaccountDiscount(even, sub.id));
    expect(Math.round(parts.reduce((sum, part) => sum + part, 0) * 100)).toBe(2000);
  });
});

describe("payments per person", () => {
  const paid: Order = {
    ...order,
    payments: [
      { id: "p1", method: "cash", amount: 60, tip: 10, createdAt: "2026-08-24T11:00:00Z", subaccountId: "ana" },
      { id: "p2", method: "card", amount: 100, tip: 0, createdAt: "2026-08-24T11:01:00Z", subaccountId: "beto" }
    ]
  };

  it("counts only the payments of that person", () => {
    expect(subaccountPaid(paid, "ana")).toBe(60);
    expect(subaccountPaid(paid, "caro")).toBe(0);
  });

  it("keeps each tip with its own person", () => {
    expect(subaccountTip(paid, "ana")).toBe(10);
    expect(subaccountTip(paid, "beto")).toBe(0);
  });

  it("leaves the balance of a part payment pending", () => {
    expect(subaccountBalance(paid, "beto")).toBe(105);
    expect(isSubaccountSettled(paid, "beto")).toBe(false);
  });

  it("settles a person who paid in full", () => {
    expect(subaccountBalance(paid, "ana")).toBe(0);
    expect(isSubaccountSettled(paid, "ana")).toBe(true);
  });

  it("knows when someone already paid, which freezes the split", () => {
    expect(hasSubaccountPayments(paid)).toBe(true);
    expect(hasSubaccountPayments(order)).toBe(false);
  });
});

describe("readiness to charge", () => {
  it("blocks while a unit has no owner", () => {
    const partial: Order = { ...order, itemShares: [{ itemId: "latte", subaccountId: "ana", units: 1 }] };
    expect(pendingAssignments(partial).map((entry) => `${entry.item.name}:${entry.units}`)).toEqual(["Latte:1", "Chilaquiles:1", "Jugo:1"]);
    expect(splitIsComplete(partial)).toBe(false);
  });

  it("clears once every unit has an owner", () => {
    expect(pendingAssignments(order)).toEqual([]);
    expect(splitIsComplete(order)).toBe(true);
  });

  it("does not count cancelled lines as pending", () => {
    expect(pendingAssignments(order).some((entry) => entry.item.name === "Pan")).toBe(false);
  });

  it("is not split at all without subaccounts", () => {
    expect(isSplit({ splitMode: undefined, subaccounts: [] })).toBe(false);
    expect(isSplit(order)).toBe(true);
  });
});

describe("when the split can be closed", () => {
  const settled: Order = {
    ...order,
    payments: [
      { id: "p1", method: "cash", amount: 60, tip: 0, createdAt: "2026-08-24T11:00:00Z", subaccountId: "ana" },
      { id: "p2", method: "card", amount: 205, tip: 0, createdAt: "2026-08-24T11:01:00Z", subaccountId: "beto" },
      { id: "p3", method: "cash", amount: 55, tip: 0, createdAt: "2026-08-24T11:02:00Z", subaccountId: "caro" }
    ]
  };

  // La trampa del módulo: recién dividida en «por producto» nadie tiene artículos, así que todas las
  // personas deben cero y todas figuran saldadas con la cuenta intacta. Ahí el modal ofrecía cerrar
  // una venta que nadie había pagado.
  it("is not settled just because nobody has been assigned anything yet", () => {
    const fresh: Order = { ...order, itemShares: [], payments: [] };
    expect((fresh.subaccounts ?? []).every((sub) => isSubaccountSettled(fresh, sub.id))).toBe(true);
    expect(splitIsSettled(fresh)).toBe(false);
  });

  it("is not settled while somebody still owes their part", () => {
    expect(splitIsSettled({ ...settled, payments: settled.payments.slice(0, 2) })).toBe(false);
  });

  // El otro camino al mismo agujero: un cobro anterior al reparto hace que lo cobrado cubra el total
  // aunque una persona siga con saldo, porque su cobro se topó contra el saldo de la cuenta.
  it("is not settled when the bill is covered but a person was left owing", () => {
    const preceded: Order = {
      ...order,
      payments: [
        { id: "p0", method: "cash", amount: 100, tip: 0, createdAt: "2026-08-24T10:50:00Z" },
        { id: "p1", method: "cash", amount: 60, tip: 0, createdAt: "2026-08-24T11:00:00Z", subaccountId: "ana" },
        { id: "p2", method: "card", amount: 160, tip: 0, createdAt: "2026-08-24T11:01:00Z", subaccountId: "beto" }
      ]
    };
    expect(orderTotal(preceded)).toBe(320);
    expect(subaccountBalance(preceded, "caro")).toBe(55);
    expect(splitIsSettled(preceded)).toBe(false);
  });

  it("is settled once every person paid their own part", () => {
    expect(splitIsSettled(settled)).toBe(true);
  });

  it("lets a person with nothing assigned pay nothing, as long as the bill is covered", () => {
    const nobodysItems: Order = {
      ...order,
      itemShares: (order.itemShares ?? []).map((share) => ({ ...share, subaccountId: share.subaccountId === "caro" ? "beto" : share.subaccountId })),
      payments: [
        { id: "p1", method: "cash", amount: 60, tip: 0, createdAt: "2026-08-24T11:00:00Z", subaccountId: "ana" },
        { id: "p2", method: "card", amount: 260, tip: 0, createdAt: "2026-08-24T11:01:00Z", subaccountId: "beto" }
      ]
    };
    expect(subaccountTotal(nobodysItems, "caro")).toBe(0);
    expect(splitIsSettled(nobodysItems)).toBe(true);
  });
});
