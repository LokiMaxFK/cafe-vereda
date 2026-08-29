import { useEffect, useState } from "react";
import { Banknote, Check, CreditCard, Minus, Plus, Printer, Smartphone, Users } from "lucide-react";
import { Badge, Button, InlineAlert, SegmentedControl, TextField } from "../../design-system/react";
import { mxn, orderTotal, paidTotal } from "../domain/money";
import {
  hasSubaccountPayments, isSubaccountSettled, nextAssignedUnits, pendingAssignments, splitIsComplete,
  splitIsSettled, subaccountBalance, subaccountPaid, subaccountTip, subaccountTotal, unassignedUnits
} from "../domain/splitBill";
import type { Order, OrderSubaccount, PaymentMethod, SplitMode } from "../domain/types";
import { Modal } from "./Modal";
import { printErrorMessage } from "../lib/browserPrinting";
import { printTicket, ticketContextFor } from "../lib/printing";
import { useApp } from "../state/AppContext";

const paymentOptions: Array<{ value: PaymentMethod; label: string; icon: typeof Banknote }> = [
  { value: "cash", label: "Efectivo", icon: Banknote },
  { value: "card", label: "Tarjeta", icon: CreditCard },
  { value: "transfer", label: "Transferencia", icon: Smartphone }
];

const MAX_PEOPLE = 12;

export function SplitBillModal({ order, onClose, onSettled }: { order: Order; onClose: () => void; onSettled: () => void }) {
  const { splitOrder, renameSubaccount, assignItemUnits, reassignItemUnits, clearSplit, addPayment, closeOrder, session } = useApp();
  const subaccounts = [...(order.subaccounts ?? [])].sort((a, b) => a.position - b.position);
  const started = subaccounts.length > 0;

  const [mode, setMode] = useState<SplitMode>(order.splitMode ?? "items");
  const [people, setPeople] = useState(Math.max(2, subaccounts.length || 2));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [chargingId, setChargingId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState("");
  const [tip, setTip] = useState("0");
  const [pendingPrintId, setPendingPrintId] = useState<string | null>(null);
  const [reassign, setReassign] = useState<{ itemId: string; fromId: string; toId: string; name: string } | null>(null);
  const [reassignReason, setReassignReason] = useState("");

  const pending = pendingAssignments(order);
  const ready = splitIsComplete(order);
  const frozen = hasSubaccountPayments(order);
  const allSettled = started && splitIsSettled(order);

  async function run(action: () => Promise<void>) {
    setError("");
    try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo completar la acción."); }
  }

  async function startSplit() {
    await run(async () => {
      await splitOrder(order.id, mode, people);
      setMessage(mode === "even" ? `Cuenta dividida en ${people} partes iguales.` : `Cuenta dividida entre ${people} personas. Asigna cada artículo.`);
    });
  }

  async function charge(subaccount: OrderSubaccount) {
    const value = Number(amount);
    if (!value || value <= 0) return;
    await run(async () => {
      // La propina se saca del mismo campo que ve el cajero, pero un importe negativo restaría de
      // lo que Reportes y el arqueo dan por propinas del turno.
      await addPayment(order.id, method, value, Math.max(0, Number(tip) || 0), subaccount.id);
      setAmount(""); setTip("0"); setChargingId(null);
      // No se imprime aquí: `order` todavía es la copia anterior al pago y el ticket saldría sin
      // él. Se marca y lo imprime el efecto de abajo, ya con la orden actualizada.
      setPendingPrintId(subaccount.id);
    });
  }

  async function printFor(subaccount: OrderSubaccount, current: Order) {
    try { await printTicket(current, undefined, ticketContextFor(current, subaccount)); }
    catch (reason) { setMessage(`Cobro registrado, pero no se pudo imprimir el ticket: ${printErrorMessage(reason)}`); }
  }

  // El ticket sale solo en cuanto la persona queda cubierta, con la orden ya actualizada por el
  // contexto. Si el cobro fue parcial no se imprime todavía: aún debe.
  useEffect(() => {
    if (!pendingPrintId) return;
    const subaccount = (order.subaccounts ?? []).find((candidate) => candidate.id === pendingPrintId);
    if (!subaccount || !isSubaccountSettled(order, pendingPrintId)) { setPendingPrintId(null); return; }
    setPendingPrintId(null);
    void printFor(subaccount, order);
    }, [order, pendingPrintId]);

  // `closeOrder` no cierra una cuenta que no esté cubierta y no avisa de ello, así que se comprueba
  // aquí antes de dar la venta por terminada y devolver al cajero al salón.
  async function finishAll() {
    await run(async () => {
      if (!splitIsSettled(order)) throw new Error("Todavía falta cobrar parte de la cuenta.");
      await closeOrder(order.id);
      onSettled();
    });
  }

  async function applyReassign() {
    if (!reassign || !reassignReason.trim()) return;
    await run(async () => {
      await reassignItemUnits(order.id, reassign.itemId, reassign.fromId, reassign.toId, 1, reassignReason);
      setReassign(null); setReassignReason("");
      setMessage("Artículo reasignado. Quedó registrado como incidencia.");
    });
  }

  const description = started
    ? "Cobra a cada persona por separado. La cuenta se cierra sola cuando la última quede cubierta."
    : "Divide la cuenta entre varias personas. Cada una paga lo suyo y deja su propia propina.";

  return (
    <Modal title={`Cuentas separadas · orden #${order.folio}`} description={description} onClose={onClose} width="max-w-2xl">
      {error && <div className="mb-4"><InlineAlert>{error}</InlineAlert></div>}
      {message && <div className="mb-4"><InlineAlert tone="success">{message}</InlineAlert></div>}

      {!started ? (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold">¿Cómo se divide?</p>
            <div className="mt-2">
              <SegmentedControl
                label="Modo de división"
                value={mode}
                onChange={setMode}
                options={[{ value: "even", label: "Partes iguales" }, { value: "items", label: "Por producto" }]}
              />
            </div>
            <p className="mt-2 text-xs text-on-surface-variant">
              {mode === "even"
                ? `El total de ${mxn.format(orderTotal(order))} se reparte en partes iguales.`
                : "Decides qué artículos son de cada persona; el descuento se reparte en proporción a lo que consumió cada quien."}
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold">¿Entre cuántas personas?</p>
            <div className="mt-2 flex items-center gap-3">
              <button type="button" onClick={() => setPeople((value) => Math.max(2, value - 1))} disabled={people <= 2} className="flex h-11 w-11 items-center justify-center rounded-lg border border-outline-variant/50 disabled:opacity-40" aria-label="Una persona menos"><Minus size={17} /></button>
              <span className="min-w-16 text-center text-2xl font-bold" aria-live="polite">{people}</span>
              <button type="button" onClick={() => setPeople((value) => Math.min(MAX_PEOPLE, value + 1))} disabled={people >= MAX_PEOPLE} className="flex h-11 w-11 items-center justify-center rounded-lg border border-outline-variant/50 disabled:opacity-40" aria-label="Una persona más"><Plus size={17} /></button>
            </div>
          </div>

          <Button variant="primary" size="lg" className="w-full" onClick={() => void startSplit()}><Users size={18} /> Dividir en {people}</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {order.splitMode === "items" && pending.length > 0 && (
            <InlineAlert>
              Faltan por asignar: {pending.map((entry) => `${entry.units} × ${entry.item.name}`).join(" · ")}
            </InlineAlert>
          )}

          {order.splitMode === "items" && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-outline">Reparto</p>
              {order.items.filter((item) => item.status !== "cancelled").map((item) => {
                const free = unassignedUnits(item, order.itemShares ?? []);
                return (
                  <div key={item.id} className="rounded-xl border border-outline-variant/30 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold leading-5">{item.quantity} × {item.name}</p>
                        {item.variant && <p className="text-xs text-on-surface-variant">{item.variant}</p>}
                      </div>
                      {free > 0 ? <Badge tone="danger">{free} sin asignar</Badge> : <Badge tone="success">Asignado</Badge>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {subaccounts.map((subaccount) => {
                        const units = (order.itemShares ?? []).filter((share) => share.itemId === item.id && share.subaccountId === subaccount.id).reduce((sum, share) => sum + share.units, 0);
                        const locked = order.payments.some((payment) => payment.subaccountId === subaccount.id);
                        return (
                          <button
                            key={subaccount.id}
                            type="button"
                            disabled={!frozen && locked}
                            title={frozen ? "Reasignar con motivo" : undefined}
                            onClick={() => {
                              // Con la cuenta ya cobrándose, tocar a otra persona no reparte: mueve
                              // una unidad de quien la tiene, y eso exige gerencia y motivo.
                              if (frozen) {
                                const owner = (order.itemShares ?? []).find((share) => share.itemId === item.id && share.subaccountId !== subaccount.id && share.units > 0);
                                if (!owner) return;
                                setReassign({ itemId: item.id, fromId: owner.subaccountId, toId: subaccount.id, name: item.name });
                                setReassignReason("");
                                return;
                              }
                              void run(() => assignItemUnits(order.id, item.id, subaccount.id, nextAssignedUnits(item, order.itemShares ?? [], subaccount.id)));
                            }}
                            className={`min-h-10 rounded-lg border px-3 text-xs font-bold disabled:opacity-40 ${units > 0 ? "border-primary bg-primary-fixed text-primary" : "border-outline-variant/50"}`}
                          >
                            {subaccount.label}{units > 0 ? ` · ${units}` : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-outline">Personas</p>
            {subaccounts.map((subaccount) => {
              const total = subaccountTotal(order, subaccount.id);
              const paid = subaccountPaid(order, subaccount.id);
              const balance = subaccountBalance(order, subaccount.id);
              // Mientras falten unidades por asignar, deber cero no es haber pagado: es no tener
              // todavía nada encima. Darlo por saldado ahí anunciaba «Pagado» y ofrecía su ticket a
              // las tres personas de una cuenta recién dividida en la que nadie había puesto un peso.
              const settled = ready && balance <= 0;
              return (
                <div key={subaccount.id} className="rounded-xl border border-outline-variant/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <TextField
                        value={subaccount.label}
                        aria-label={`Nombre de ${subaccount.label}`}
                        className="h-9 w-36"
                        onChange={(event) => void run(() => renameSubaccount(order.id, subaccount.id, event.target.value))}
                      />
                      {settled ? <Badge tone="success"><Check size={13} /> Pagado</Badge> : <Badge tone="neutral">{mxn.format(balance)} por cobrar</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-primary">{mxn.format(total)}</span>
                      {!settled && ready && <Button size="sm" variant="primary" onClick={() => { setChargingId(subaccount.id); setAmount(balance.toFixed(2)); setTip("0"); }}>Cobrar</Button>}
                    </div>
                  </div>
                  {subaccountTip(order, subaccount.id) > 0 && <p className="mt-1 text-xs text-on-surface-variant">Propina {mxn.format(subaccountTip(order, subaccount.id))}</p>}
                  {paid > 0 && !settled && <p className="mt-1 text-xs text-on-surface-variant">Abonado {mxn.format(paid)}</p>}

                  {chargingId === subaccount.id && (
                    <div className="mt-3 space-y-3 border-t border-outline-variant/30 pt-3">
                      <div className="grid grid-cols-3 gap-2">
                        {paymentOptions.map((option) => {
                          const Icon = option.icon;
                          return (
                            <button key={option.value} type="button" onClick={() => setMethod(option.value)} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-bold ${method === option.value ? "border-primary bg-primary-fixed text-primary" : "border-outline-variant/40"}`}>
                              <Icon size={18} />{option.label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-sm font-semibold">Importe<TextField type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} />
                          {Number(amount) > balance && <span className="mt-1 block text-xs font-medium text-tertiary">Cambio: {mxn.format(Number(amount) - balance)}</span>}
                        </label>
                        <label className="text-sm font-semibold">Propina<TextField type="number" min="0" value={tip} onChange={(event) => setTip(event.target.value)} /></label>
                      </div>
                      <div className="flex gap-2">
                        <Button className="flex-1" onClick={() => setChargingId(null)}>Cancelar</Button>
                        <Button className="flex-1" variant="primary" disabled={!Number(amount)} onClick={() => void charge(subaccount)}>Registrar cobro</Button>
                      </div>
                    </div>
                  )}

                  {settled && (
                    <Button size="sm" className="mt-2" onClick={() => void printFor(subaccount, order)}><Printer size={15} /> Imprimir su ticket</Button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl bg-primary p-4 text-on-primary">
            <div className="flex items-center justify-between text-sm">
              <span className="text-on-primary/70">Cobrado de la cuenta</span>
              <span className="font-bold">{mxn.format(paidTotal(order))} de {mxn.format(orderTotal(order))}</span>
            </div>
          </div>

          {allSettled ? (
            <Button variant="primary" size="lg" className="w-full" onClick={() => void finishAll()}><Check size={18} /> Cerrar la cuenta</Button>
          ) : (
            !frozen && <Button className="w-full" onClick={() => void run(() => clearSplit(order.id))}>Volver a juntar la cuenta</Button>
          )}

          {frozen && session?.role === "manager" && order.splitMode === "items" && (
            <p className="text-xs text-on-surface-variant">
              La cuenta ya tiene cobros. Para mover un artículo entre personas usa la reasignación gerencial: quedará registrada como incidencia.
            </p>
          )}
        </div>
      )}

      {reassign && (
        <Modal title={`Reasignar ${reassign.name}`} description="La cuenta ya tiene cobros, así que el cambio queda registrado como incidencia." onClose={() => setReassign(null)}>
          <div className="space-y-4">
            <p className="text-sm text-on-surface-variant">
              Se mueve una unidad de <strong className="text-on-surface">{subaccounts.find((candidate) => candidate.id === reassign.fromId)?.label}</strong> a <strong className="text-on-surface">{subaccounts.find((candidate) => candidate.id === reassign.toId)?.label}</strong>.
            </p>
            <label className="block text-sm font-semibold">Motivo obligatorio<TextField value={reassignReason} onChange={(event) => setReassignReason(event.target.value)} autoFocus /></label>
            <Button variant="danger" className="w-full" disabled={!reassignReason.trim()} onClick={() => void applyReassign()}>Reasignar</Button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
