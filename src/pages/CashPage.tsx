import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowDownLeft, Banknote, Calculator, LockKeyhole, Plus, WalletCards } from "lucide-react";
import { Button, EmptyState, FieldLabel, InlineAlert, LoadingState, MetricCard, Page, PageHeader, Panel, TextField } from "../../design-system/react";
import { mxn } from "../domain/money";
import type { CashMovement, CashSession } from "../domain/types";
import { Modal } from "../components/Modal";
import { supabase } from "../lib/supabase";
import { useApp } from "../state/AppContext";

function mapCashSession(row: Record<string, unknown>): CashSession {
  return {
    id: String(row.id),
    openedBy: String(row.opened_by),
    openingFund: Number(row.opening_fund_cents) / 100,
    openedAt: String(row.opened_at),
    closedBy: row.closed_by ? String(row.closed_by) : undefined,
    closedAt: row.closed_at ? String(row.closed_at) : undefined,
    countedCash: row.counted_cash_cents != null ? Number(row.counted_cash_cents) / 100 : undefined,
    expectedCash: row.expected_cash_cents != null ? Number(row.expected_cash_cents) / 100 : undefined,
    difference: row.difference_cents != null ? Number(row.difference_cents) / 100 : undefined
  };
}

function mapCashMovement(row: Record<string, unknown>): CashMovement {
  return {
    id: String(row.id),
    cashSessionId: String(row.cash_session_id),
    type: row.movement_type as CashMovement["type"],
    amount: Number(row.amount_cents) / 100,
    note: row.note ? String(row.note) : undefined,
    recordedBy: String(row.recorded_by),
    createdAt: String(row.created_at)
  };
}

function rpcErrorMessage(error: { message?: string } | null) {
  if (!error) return "Ocurrió un error inesperado.";
  if (error.message?.includes("Note required")) return "El motivo o insumo es obligatorio.";
  if (error.message?.includes("one_open_cash_session")) return "Ya hay un turno abierto.";
  return error.message ?? "Ocurrió un error inesperado.";
}

function OpenSessionModal({ onClose, onOpen }: { onClose: () => void; onOpen: (fund: number) => Promise<string | null> }) {
  const [fund, setFund] = useState("500");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const result = await onOpen(Number(fund));
    setLoading(false);
    if (result) setError(result);
  }

  return (
    <Modal title="Abrir turno" description="Registra el fondo inicial con el que arrancas la caja." onClose={onClose}>
      {error && <div className="mb-4"><InlineAlert>{error}</InlineAlert></div>}
      <form className="space-y-4" onSubmit={submit}>
        <FieldLabel label="Fondo inicial">
          <TextField type="number" min="0" value={fund} onChange={(event) => setFund(event.target.value)} autoFocus required />
        </FieldLabel>
        <Button type="submit" variant="primary" className="w-full" disabled={loading || !Number(fund) && fund !== "0"}>
          {loading ? "Abriendo…" : "Abrir turno"}
        </Button>
      </form>
    </Modal>
  );
}

function WithdrawModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (amount: number, note: string) => Promise<string | null> }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError("");
    setLoading(true);
    const result = await onSubmit(Number(amount), note.trim());
    setLoading(false);
    if (result) setError(result);
  }

  return (
    <Modal title="Retiro parcial" description="El importe y la nota son obligatorios." onClose={onClose}>
      <div className="space-y-4">
        {error && <InlineAlert>{error}</InlineAlert>}
        <FieldLabel label="Importe">
          <TextField type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </FieldLabel>
        <FieldLabel label="Motivo o insumo">
          <TextField value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej. compra de hielo" />
        </FieldLabel>
        <Button variant="primary" className="w-full" disabled={loading || !Number(amount) || !note.trim()} onClick={submit}>
          <Plus size={18} /> {loading ? "Registrando…" : "Registrar retiro"}
        </Button>
      </div>
    </Modal>
  );
}

function CloseSessionModal({ expected, onClose, onSubmit }: { expected: number; onClose: () => void; onSubmit: (counted: number) => Promise<CashSession | string> }) {
  const [counted, setCounted] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CashSession | null>(null);

  async function submit() {
    setError("");
    setLoading(true);
    const outcome = await onSubmit(Number(counted));
    setLoading(false);
    if (typeof outcome === "string") setError(outcome);
    else setResult(outcome);
  }

  if (result) {
    const difference = result.difference ?? 0;
    return (
      <Modal title="Corte realizado" onClose={onClose}>
        <div className="space-y-4">
          <InlineAlert tone={difference === 0 ? "success" : "error"}>
            {difference === 0
              ? "El conteo coincide exactamente con lo esperado."
              : difference > 0
                ? `Sobrante de ${mxn.format(difference)} respecto a lo esperado.`
                : `Faltante de ${mxn.format(Math.abs(difference))} respecto a lo esperado.`}
          </InlineAlert>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-on-surface-variant">Esperado</span><strong>{mxn.format(result.expectedCash ?? 0)}</strong></div>
            <div className="flex justify-between"><span className="text-on-surface-variant">Contado</span><strong>{mxn.format(result.countedCash ?? 0)}</strong></div>
          </div>
          <Button variant="primary" className="w-full" onClick={onClose}>Cerrar</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Hacer corte" description="Cuenta el efectivo físico en caja e ingresa el total." onClose={onClose}>
      <div className="space-y-4">
        {error && <InlineAlert>{error}</InlineAlert>}
        <p className="text-sm text-on-surface-variant">Esperado antes del conteo: <strong className="text-on-surface">{mxn.format(expected)}</strong></p>
        <FieldLabel label="Efectivo contado">
          <TextField type="number" min="0" value={counted} onChange={(event) => setCounted(event.target.value)} autoFocus />
        </FieldLabel>
        <Button variant="primary" className="w-full" disabled={loading || (!Number(counted) && counted !== "0")} onClick={submit}>
          <LockKeyhole size={18} /> {loading ? "Cerrando…" : "Confirmar corte"}
        </Button>
      </div>
    </Modal>
  );
}

export function CashPage() {
  const { session } = useApp();
  const [cashSession, setCashSession] = useState<CashSession | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [cashSalesCents, setCashSalesCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openModalOpen, setOpenModalOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    setError("");
    const { data: sessionRow, error: sessionError } = await supabase.from("cash_sessions").select("*").is("closed_at", null).maybeSingle();
    if (sessionError) { setError(sessionError.message); setLoading(false); return; }
    if (!sessionRow) { setCashSession(null); setMovements([]); setCashSalesCents(0); setLoading(false); return; }
    const session = mapCashSession(sessionRow);
    const [{ data: movementRows, error: movementError }, { data: paymentRows, error: paymentError }] = await Promise.all([
      supabase.from("cash_movements").select("*").eq("cash_session_id", session.id).order("created_at", { ascending: false }),
      supabase.from("payments").select("amount_cents").eq("method", "cash").gte("created_at", session.openedAt)
    ]);
    if (movementError) setError(movementError.message);
    else if (paymentError) setError(paymentError.message);
    setCashSession(session);
    setMovements((movementRows ?? []).map(mapCashMovement));
    setCashSalesCents((paymentRows ?? []).reduce((sum, row) => sum + Number(row.amount_cents), 0));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openSession = useCallback(async (fund: number) => {
    if (!supabase) return "Caja no disponible sin conexión a Supabase.";
    if (!navigator.onLine) return "Necesitas conexión a internet para abrir un turno.";
    const { error: rpcError } = await supabase.rpc("open_cash_session", { p_opening_fund_cents: Math.round(fund * 100) });
    if (rpcError) return rpcErrorMessage(rpcError);
    setOpenModalOpen(false);
    await load();
    return null;
  }, [load]);

  const recordWithdrawal = useCallback(async (amount: number, note: string) => {
    if (!supabase || !cashSession) return "Caja no disponible sin conexión a Supabase.";
    if (!navigator.onLine) return "Necesitas conexión a internet para registrar un retiro.";
    const { error: rpcError } = await supabase.rpc("record_cash_movement", {
      p_cash_session_id: cashSession.id, p_type: "withdrawal", p_amount_cents: Math.round(amount * 100), p_note: note, p_idempotency_key: crypto.randomUUID()
    });
    if (rpcError) return rpcErrorMessage(rpcError);
    setWithdrawOpen(false);
    await load();
    return null;
  }, [cashSession, load]);

  const closeSession = useCallback(async (counted: number): Promise<CashSession | string> => {
    if (!supabase || !cashSession) return "Caja no disponible sin conexión a Supabase.";
    if (!navigator.onLine) return "Necesitas conexión a internet para hacer el corte.";
    const { data, error: rpcError } = await supabase.rpc("close_cash_session", { p_cash_session_id: cashSession.id, p_counted_cash_cents: Math.round(counted * 100) });
    if (rpcError || !data) return rpcErrorMessage(rpcError);
    await load();
    return mapCashSession(data as Record<string, unknown>);
  }, [cashSession, load]);

  if (!supabase) {
    return <Page size="wide"><EmptyState icon={<WalletCards />} title="Caja no disponible" description="Configura Supabase para operar el arqueo de caja." /></Page>;
  }

  if (loading) {
    return <Page size="wide"><LoadingState label="Cargando turno de caja…" /></Page>;
  }

  if (!cashSession) {
    return (
      <Page size="wide">
        <PageHeader eyebrow="CONTROL DE EFECTIVO" title="Caja" description="No hay un turno abierto." />
        {error && <div className="mb-4"><InlineAlert>{error}</InlineAlert></div>}
        <EmptyState
          icon={<WalletCards />}
          title="Sin turno abierto"
          description="Abre un turno con tu fondo inicial para empezar a registrar movimientos de caja."
          action={<Button variant="primary" onClick={() => setOpenModalOpen(true)}><WalletCards size={18} /> Abrir turno</Button>}
        />
        {openModalOpen && <OpenSessionModal onClose={() => setOpenModalOpen(false)} onOpen={openSession} />}
      </Page>
    );
  }

  const withdrawn = movements.filter((movement) => movement.type === "withdrawal" || movement.type === "adjustment").reduce((sum, movement) => sum + movement.amount, 0);
  const cash = cashSalesCents / 100;
  const expected = cashSession.openingFund + cash - withdrawn;
  const openedByMe = cashSession.openedBy === session?.id;

  return (
    <Page size="wide">
      <PageHeader
        eyebrow="CONTROL DE EFECTIVO"
        title="Caja"
        description={`Turno abierto por ${openedByMe ? "ti" : "otro miembro del equipo"} · ${new Date(cashSession.openedAt).toLocaleString("es-MX", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}`}
        action={<><Button onClick={() => setWithdrawOpen(true)}><ArrowDownLeft size={18} /> Registrar retiro</Button><Button variant="primary" onClick={() => setCloseModalOpen(true)}><LockKeyhole size={18} /> Hacer corte</Button></>}
      />
      {error && <div className="mb-4"><InlineAlert>{error}</InlineAlert></div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<WalletCards />} label="Fondo inicial" value={mxn.format(cashSession.openingFund)} tone="primary" />
        <MetricCard icon={<Banknote />} label="Efectivo en ventas" value={mxn.format(cash)} detail="Desde la apertura del turno" tone="success" />
        <MetricCard icon={<ArrowDownLeft />} label="Retiros" value={mxn.format(withdrawn)} detail={`${movements.filter((m) => m.type === "withdrawal" || m.type === "adjustment").length} movimientos`} tone="danger" />
        <MetricCard icon={<Calculator />} label="Efectivo esperado" value={mxn.format(expected)} detail="Antes del conteo" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <Panel className="p-5">
          <h2 className="text-lg font-bold">Movimientos del turno</h2>
          {movements.length ? (
            <div className="mt-4 divide-y divide-outline-variant/25">
              {movements.filter((movement) => movement.type === "withdrawal" || movement.type === "adjustment").map((movement) => (
                <div className="flex items-center justify-between py-4" key={movement.id}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-error-container text-error"><ArrowDownLeft size={18} /></span>
                    <div>
                      <p className="font-semibold">Retiro de efectivo</p>
                      <p className="text-xs text-on-surface-variant">{new Date(movement.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} · {movement.note}</p>
                    </div>
                  </div>
                  <span className="font-bold text-error">-{mxn.format(movement.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-on-surface-variant">Sin movimientos todavía.</p>
          )}
        </Panel>
        <Panel className="bg-primary p-6 text-on-primary">
          <p className="text-xs font-bold uppercase tracking-wider text-on-primary/65">Resumen del arqueo</p>
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between"><span>Fondo inicial</span><strong>{mxn.format(cashSession.openingFund)}</strong></div>
            <div className="flex justify-between"><span>+ Ventas efectivo</span><strong>{mxn.format(cash)}</strong></div>
            <div className="flex justify-between"><span>- Retiros</span><strong>{mxn.format(withdrawn)}</strong></div>
            <div className="border-t border-on-primary/20 pt-4">
              <div className="flex items-end justify-between"><span className="font-bold">Esperado</span><strong className="text-3xl">{mxn.format(expected)}</strong></div>
            </div>
          </div>
          <p className="mt-6 text-xs leading-5 text-on-primary/65">El conteo real y la diferencia se registran al hacer el corte. El historial queda bloqueado después del cierre.</p>
        </Panel>
      </div>
      {withdrawOpen && <WithdrawModal onClose={() => setWithdrawOpen(false)} onSubmit={recordWithdrawal} />}
      {closeModalOpen && <CloseSessionModal expected={expected} onClose={() => setCloseModalOpen(false)} onSubmit={closeSession} />}
    </Page>
  );
}
