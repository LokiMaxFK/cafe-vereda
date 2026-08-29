import { itemTotal, orderSubtotal, orderTotal, paidTotal, roundToCents } from "./money";
import type { Order, OrderItem, OrderItemShare, OrderSubaccount } from "./types";

/**
 * Reparto de una cuenta entre varias personas.
 *
 * La regla que sostiene todo este módulo es una sola: **la suma de los totales de las subcuentas
 * tiene que dar exactamente el total de la cuenta**. No es una cuestión de estética. `closeOrder`
 * exige `paidTotal >= orderTotal` y el trigger `validate_order_close` del servidor recalcula el
 * total en SQL y rechaza el cierre con "Insufficient payment", así que un centavo perdido al
 * dividir no se ve por ningún lado hasta que la mesa ya se fue y la cuenta no cierra.
 *
 * Por eso ni el reparto en partes iguales ni el prorrateo del descuento se conforman con redondear
 * cada parte por su lado: ambos reparten el residuo y lo comprueban contra el total.
 */

/** Lo mínimo de una cuenta que hace falta para calcular lo que debe cada persona. */
export type SplitOrder = Pick<Order, "items" | "itemShares" | "discount" | "subaccounts" | "splitMode">;

/** Nombre por defecto de cada persona; el cajero lo cambia por el del cliente si le sirve. */
export function defaultSubaccountLabel(position: number) {
  return `Persona ${position}`;
}

export function createSubaccounts(count: number, newId: () => string = () => crypto.randomUUID()): OrderSubaccount[] {
  if (!Number.isInteger(count) || count < 2) return [];
  return Array.from({ length: count }, (_unused, index) => ({
    id: newId(),
    label: defaultSubaccountLabel(index + 1),
    position: index + 1
  }));
}

/**
 * Reparte `total` en `count` partes que suman `total` **exactamente**.
 *
 * Se trabaja en centavos enteros —dividir pesos con decimales es justo lo que deja el residuo
 * suelto— y el sobrante se le carga a la última persona. Con $100 entre 3 salen $33.33, $33.33 y
 * $33.34: nadie paga de menos y la cuenta cierra.
 */
export function evenSplitAmounts(total: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 1) return [];
  const totalCents = Math.round(roundToCents(total) * 100);
  const share = Math.floor(totalCents / count);
  const remainder = totalCents - share * count;
  return Array.from({ length: count }, (_unused, index) => (index === count - 1 ? share + remainder : share) / 100);
}

/** Unidades de un renglón que ya tienen dueño. */
export function assignedUnits(itemId: string, shares: OrderItemShare[]) {
  return shares.filter((share) => share.itemId === itemId).reduce((sum, share) => sum + share.units, 0);
}

/** Unidades de un renglón que todavía no son de nadie. */
export function unassignedUnits(item: Pick<OrderItem, "id" | "quantity">, shares: OrderItemShare[]) {
  return Math.max(0, item.quantity - assignedUnits(item.id, shares));
}

/**
 * Fija en `units` las unidades de `itemId` que son de `subaccountId`.
 *
 * Es un "poner", no un "sumar": la pantalla manda el número final que quiere ver. Se recorta a lo
 * que queda libre en la línea para que ninguna asignación pueda reclamar unidades que no existen
 * —sin ese tope, la suma de las subcuentas superaría el total de la cuenta y el cierre fallaría.
 */
export function assignUnits(shares: OrderItemShare[], item: Pick<OrderItem, "id" | "quantity">, subaccountId: string, units: number): OrderItemShare[] {
  const others = shares.filter((share) => !(share.itemId === item.id && share.subaccountId === subaccountId));
  const takenByOthers = others.filter((share) => share.itemId === item.id).reduce((sum, share) => sum + share.units, 0);
  const capped = Math.min(Math.max(0, Math.trunc(units)), item.quantity - takenByOthers);
  if (capped <= 0) return others;
  return [...others, { itemId: item.id, subaccountId, units: capped }];
}

/**
 * Quita del reparto las participaciones de renglones que ya no existen, que se cancelaron o que
 * encogieron.
 *
 * El recorte es por renglón, no por participación: se va repartiendo lo que queda de la línea entre
 * las participaciones en orden y las que ya no caben se descartan. Toparlas una a una contra
 * `item.quantity` no bastaba —dos personas con una unidad cada una de una línea que bajó a una
 * sobrevivían ambas—, y ahí la suma de las subcuentas pasaba a ser mayor que el total de la cuenta,
 * que es justo lo que impide cerrarla.
 */
export function pruneShares(items: OrderItem[], shares: OrderItemShare[]): OrderItemShare[] {
  const free = new Map<string, number>();
  return shares.flatMap((share) => {
    const item = items.find((candidate) => candidate.id === share.itemId && candidate.status !== "cancelled");
    if (!item) return [];
    const available = free.get(item.id) ?? item.quantity;
    const units = Math.min(share.units, available);
    free.set(item.id, available - units);
    return units > 0 ? [{ ...share, units }] : [];
  });
}

/**
 * Cuántas unidades le tocan a una persona en el siguiente toque sobre su botón del reparto.
 *
 * Cada toque suma una unidad y vuelve a cero cuando ya no queda ninguna libre. El tope es lo que
 * queda **de la línea**, no la línea entera: con dos cafés repartidos uno a cada quien, comparar
 * contra `item.quantity` daba 2, `assignUnits` lo recortaba de vuelta a 1 y el botón dejaba de
 * responder, así que una unidad mal asignada no se podía soltar sin deshacer el reparto completo.
 */
export function nextAssignedUnits(item: Pick<OrderItem, "id" | "quantity">, shares: OrderItemShare[], subaccountId: string) {
  const own = shares.filter((share) => share.itemId === item.id && share.subaccountId === subaccountId).reduce((sum, share) => sum + share.units, 0);
  const takenByOthers = assignedUnits(item.id, shares) - own;
  return own + 1 > item.quantity - takenByOthers ? 0 : own + 1;
}

/**
 * Los artículos de una persona, cada uno con la cantidad que le tocó.
 *
 * Devuelve `OrderItem` de verdad —no una forma nueva— para que su ticket pueda reutilizar tal cual
 * `itemTotal` y el maquetado de `createTicketDocument`.
 */
export function subaccountItems(order: Pick<Order, "items" | "itemShares">, subaccountId: string): OrderItem[] {
  const shares = order.itemShares ?? [];
  return order.items
    .filter((item) => item.status !== "cancelled")
    .flatMap((item) => {
      const units = shares.filter((share) => share.itemId === item.id && share.subaccountId === subaccountId).reduce((sum, share) => sum + share.units, 0);
      return units > 0 ? [{ ...item, quantity: units }] : [];
    });
}

export function subaccountSubtotal(order: Pick<Order, "items" | "itemShares">, subaccountId: string) {
  return roundToCents(subaccountItems(order, subaccountId).reduce((sum, item) => sum + itemTotal(item), 0));
}

/**
 * La parte del descuento que le toca a una persona, en proporción a lo que consumió.
 *
 * El residuo del prorrateo se le carga a la última subcuenta, igual que en `evenSplitAmounts`, para
 * que la suma de los descuentos dé el descuento de la cuenta y ni el negocio ni el cliente pongan
 * un centavo de más.
 *
 * En partes iguales no hay consumo del que prorratear —nadie tiene artículos asignados—, así que el
 * descuento se parte en partes iguales como el total. Prorratearlo por consumo ahí dejaba a todos en
 * cero y el residuo entero, o sea el descuento completo, impreso en el ticket de la última persona.
 */
export function subaccountDiscount(order: Pick<Order, "items" | "itemShares" | "discount" | "subaccounts" | "splitMode">, subaccountId: string) {
  const subaccounts = order.subaccounts ?? [];
  const discountCents = Math.round(roundToCents(order.discount) * 100);
  const subtotal = orderSubtotal(order);
  if (!discountCents || !subtotal || !subaccounts.length) return 0;

  const ordered = [...subaccounts].sort((a, b) => a.position - b.position);
  if (order.splitMode === "even") {
    const index = ordered.findIndex((subaccount) => subaccount.id === subaccountId);
    return index === -1 ? 0 : evenSplitAmounts(order.discount, ordered.length)[index] ?? 0;
  }
  const shares = ordered.map((subaccount) => Math.floor((discountCents * subaccountSubtotal(order, subaccount.id)) / subtotal));
  const assigned = shares.reduce((sum, value) => sum + value, 0);
  const index = ordered.findIndex((subaccount) => subaccount.id === subaccountId);
  if (index === -1) return 0;
  const cents = index === ordered.length - 1 ? shares[index] + (discountCents - assigned) : shares[index];
  return roundToCents(Math.max(0, cents) / 100);
}

/** Lo que debe pagar una persona. */
export function subaccountTotal(order: SplitOrder, subaccountId: string) {
  const subaccounts = order.subaccounts ?? [];
  const index = [...subaccounts].sort((a, b) => a.position - b.position).findIndex((subaccount) => subaccount.id === subaccountId);
  if (index === -1) return 0;
  if (order.splitMode === "even") return evenSplitAmounts(orderTotal(order), subaccounts.length)[index] ?? 0;
  return Math.max(0, roundToCents(subaccountSubtotal(order, subaccountId) - subaccountDiscount(order, subaccountId)));
}

export function subaccountPaid(order: Pick<Order, "payments">, subaccountId: string) {
  return roundToCents(order.payments.filter((payment) => payment.subaccountId === subaccountId).reduce((sum, payment) => sum + payment.amount, 0));
}

export function subaccountTip(order: Pick<Order, "payments">, subaccountId: string) {
  return roundToCents(order.payments.filter((payment) => payment.subaccountId === subaccountId).reduce((sum, payment) => sum + payment.tip, 0));
}

export function subaccountBalance(order: SplitOrder & Pick<Order, "payments">, subaccountId: string) {
  return Math.max(0, roundToCents(subaccountTotal(order, subaccountId) - subaccountPaid(order, subaccountId)));
}

export function isSubaccountSettled(order: SplitOrder & Pick<Order, "payments">, subaccountId: string) {
  return subaccountBalance(order, subaccountId) <= 0;
}

export function isSplit(order: Pick<Order, "splitMode" | "subaccounts">) {
  return Boolean(order.splitMode && (order.subaccounts?.length ?? 0) > 0);
}

/** Renglones con unidades sin dueño; mientras quede uno, el cobro por producto no puede empezar. */
export function pendingAssignments(order: Pick<Order, "items" | "itemShares">) {
  const shares = order.itemShares ?? [];
  return order.items
    .filter((item) => item.status !== "cancelled")
    .flatMap((item) => {
      const units = unassignedUnits(item, shares);
      return units > 0 ? [{ item, units }] : [];
    });
}

/** En modo "partes iguales" no hay nada que asignar; en "por producto" no puede faltar ni una unidad. */
export function splitIsComplete(order: Pick<Order, "items" | "itemShares" | "splitMode" | "subaccounts">) {
  if (!isSplit(order)) return false;
  if (order.splitMode === "even") return true;
  return pendingAssignments(order).length === 0;
}

/** Una división ya no se puede deshacer ni rehacer en cuanto alguien pagó. */
export function hasSubaccountPayments(order: Pick<Order, "payments">) {
  return order.payments.some((payment) => Boolean(payment.subaccountId));
}

/**
 * Si el reparto está cobrado y la cuenta se puede cerrar.
 *
 * No basta con que todas las personas estén saldadas. Recién dividida en «por producto» nadie tiene
 * artículos, así que todas deben cero y todas figuran saldadas con la cuenta intacta: el modal
 * ofrecía «Cerrar la cuenta», `closeOrder` no hacía nada —el pago era insuficiente— y el cajero
 * volvía al salón convencido de haber cobrado una venta que seguía abierta y en cero.
 *
 * Por eso se exige además que el reparto esté completo y que lo cobrado cubra el total de la cuenta,
 * que es la misma condición que `closeOrder` y el trigger `validate_order_close` van a comprobar.
 */
export function splitIsSettled(order: SplitOrder & Pick<Order, "payments">) {
  if (!splitIsComplete(order)) return false;
  if (!(order.subaccounts ?? []).every((subaccount) => isSubaccountSettled(order, subaccount.id))) return false;
  return paidTotal(order) >= orderTotal(order);
}
