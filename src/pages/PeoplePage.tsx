import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, MoreHorizontal, Plus, ShieldCheck, UserCheck } from "lucide-react";
import { Badge, Button, EmptyState, FieldLabel, InlineAlert, LoadingState, Page, PageHeader, Panel, SelectField, TextField } from "../../design-system/react";
import { Modal } from "../components/Modal";
import type { AppRole } from "../domain/types";
import { supabase } from "../lib/supabase";
import { useApp } from "../state/AppContext";

interface StaffRow {
  id: string;
  username: string;
  displayName: string;
  role: AppRole;
  active: boolean;
}

function initials(name: string) {
  return name.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase();
}

/**
 * Algunos errores llegan crudos desde Supabase Auth: en inglés y hablando del correo interno que
 * la aplicación fabrica a partir del usuario. Quien administra el personal nunca escribe un correo,
 * así que ese texto no le dice nada. Se traducen los casos conocidos al vocabulario de la pantalla.
 */
function readableError(message: string) {
  const raw = message.toLowerCase();
  if (raw.includes("already been registered") || raw.includes("already registered")) {
    return "Ya existe un acceso con ese usuario. Elige otro nombre de usuario.";
  }
  if (raw.includes("password should be at least")) {
    return "El PIN debe ser numérico, de 6 a 8 dígitos.";
  }
  return message;
}

async function invokeError(data: unknown, fallbackError: (Error & { context?: Response }) | null | undefined) {
  const direct = (data as { error?: string } | null)?.error;
  if (direct) return readableError(direct);
  if (fallbackError?.context) {
    try {
      const body = await fallbackError.context.clone().json();
      if (body?.error) return readableError(String(body.error));
    } catch {
      // response body wasn't JSON — fall through to the generic message
    }
  }
  return fallbackError?.message ? readableError(fallbackError.message) : "Ocurrió un error inesperado.";
}

function PinField({ pin, onChange }: { pin: string; onChange: (value: string) => void }) {
  const [showPin, setShowPin] = useState(false);
  return (
    <div className="relative">
      <TextField
        className="pr-12"
        type={showPin ? "text" : "password"}
        value={pin}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 8))}
        inputMode="numeric"
        autoComplete="new-password"
        required
      />
      <button
        type="button"
        onClick={() => setShowPin((value) => !value)}
        className="absolute right-1 top-2 flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant"
        aria-label={showPin ? "Ocultar PIN" : "Mostrar PIN"}
      >
        {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

function CreateStaffModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<AppRole>("barista");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setError("");
    setLoading(true);
    const { data, error: functionError } = await supabase.functions.invoke("manage-staff", {
      body: { action: "create", displayName: displayName.trim(), username: username.trim().toLowerCase(), role, pin }
    });
    setLoading(false);
    if (functionError || (data as { error?: string })?.error) { setError(await invokeError(data, functionError)); return; }
    onCreated();
  }

  return (
    <Modal title="Crear acceso" description="Se crea un usuario único con PIN personal." onClose={onClose}>
      {error && <div className="mb-4"><InlineAlert>{error}</InlineAlert></div>}
      <form className="space-y-4" onSubmit={submit}>
        <FieldLabel label="Nombre completo">
          <TextField value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoFocus required />
        </FieldLabel>
        <FieldLabel label="Usuario" hint="Minúsculas, números, puntos y guiones.">
          <TextField value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))} required />
        </FieldLabel>
        <FieldLabel label="Rol">
          <SelectField value={role} onChange={(event) => setRole(event.target.value as AppRole)}>
            <option value="barista">Barista</option>
            <option value="manager">Gerente</option>
          </SelectField>
        </FieldLabel>
        <FieldLabel label="PIN inicial" hint="6 a 8 dígitos.">
          <PinField pin={pin} onChange={setPin} />
        </FieldLabel>
        <Button type="submit" variant="primary" className="w-full" disabled={loading}>{loading ? "Creando…" : "Crear acceso"}</Button>
      </form>
    </Modal>
  );
}

function StaffActionsModal({
  person,
  isSelf,
  onClose,
  onToggleActive,
  onReset
}: {
  person: StaffRow;
  isSelf: boolean;
  onClose: () => void;
  onToggleActive: () => void;
  onReset: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function resetPin(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setError("");
    setLoading(true);
    const { data, error: functionError } = await supabase.functions.invoke("manage-staff", {
      body: { action: "reset_pin", staffId: person.id, pin }
    });
    setLoading(false);
    if (functionError || (data as { error?: string })?.error) { setError(await invokeError(data, functionError)); return; }
    onReset();
    onClose();
  }

  return (
    <Modal title={person.displayName} description={`@${person.username} · ${person.role === "manager" ? "Gerente" : "Barista"}`} onClose={onClose}>
      <div className="space-y-5">
        {error && <div><InlineAlert>{error}</InlineAlert></div>}
        <form className="space-y-4" onSubmit={resetPin}>
          <FieldLabel label="Restablecer PIN" hint="6 a 8 dígitos.">
            <PinField pin={pin} onChange={setPin} />
          </FieldLabel>
          <Button type="submit" variant="secondary" className="w-full" disabled={loading}>{loading ? "Guardando…" : "Restablecer PIN"}</Button>
        </form>
        <div className="border-t border-outline-variant/25 pt-5">
          <Button variant={person.active ? "danger" : "success"} className="w-full" onClick={onToggleActive} disabled={isSelf}>
            {person.active ? "Desactivar acceso" : "Activar acceso"}
          </Button>
          {isSelf && <p className="mt-2 text-xs text-on-surface-variant">No puedes desactivar tu propio acceso.</p>}
        </div>
      </div>
    </Modal>
  );
}

export function PeoplePage() {
  const { session } = useApp();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [resetCount, setResetCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<StaffRow | null>(null);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [{ data, error: fetchError }, { count }] = await Promise.all([
      supabase.from("staff_profiles").select("id, username, display_name, role, active").order("created_at"),
      supabase.from("audit_log").select("id", { count: "exact", head: true }).eq("entity_type", "staff_profiles").eq("action", "reset_pin")
    ]);
    if (fetchError) setError(fetchError.message);
    setStaff((data ?? []).map((row) => ({ id: row.id, username: row.username, displayName: row.display_name, role: row.role as AppRole, active: row.active })));
    setResetCount(count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleActive = useCallback(async (person: StaffRow) => {
    if (!supabase) return;
    const { error: updateError } = await supabase.from("staff_profiles").update({ active: !person.active }).eq("id", person.id);
    if (updateError) { setError(updateError.message); return; }
    setSelected(null);
    await load();
  }, [load]);

  if (!supabase) {
    return <Page size="wide"><EmptyState icon={<UserCheck />} title="Personal no disponible" description="Configura Supabase para administrar los accesos del equipo." /></Page>;
  }

  const activeCount = staff.filter((person) => person.active).length;
  const managerCount = staff.filter((person) => person.active && person.role === "manager").length;

  return (
    <Page size="wide">
      <PageHeader
        eyebrow="ACCESOS INTERNOS"
        title="Personal"
        description="Usuarios únicos con PIN personal. No existe registro público."
        action={<Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={18} /> Crear acceso</Button>}
      />
      {error && <div className="mb-4"><InlineAlert>{error}</InlineAlert></div>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Panel className="flex items-center gap-4 p-5"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-fixed text-primary"><UserCheck /></span><div><p className="text-sm text-on-surface-variant">Personal activo</p><p className="text-2xl font-bold">{activeCount}</p></div></Panel>
        <Panel className="flex items-center gap-4 p-5"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-tertiary-fixed text-tertiary"><ShieldCheck /></span><div><p className="text-sm text-on-surface-variant">Gerentes</p><p className="text-2xl font-bold">{managerCount}</p></div></Panel>
        <Panel className="flex items-center gap-4 p-5"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary-container"><KeyRound /></span><div><p className="text-sm text-on-surface-variant">PIN restablecido</p><p className="text-2xl font-bold">{resetCount}</p></div></Panel>
      </div>
      {loading ? (
        <div className="mt-6"><LoadingState label="Cargando personal…" /></div>
      ) : staff.length ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {staff.map((person) => (
            <Panel key={person.id} className="p-5">
              <div className="flex items-start justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-fixed text-lg font-bold text-primary">{initials(person.displayName)}</span>
                <Button size="icon" variant="ghost" aria-label="Más acciones" onClick={() => setSelected(person)}><MoreHorizontal /></Button>
              </div>
              <h2 className="mt-4 font-bold">{person.displayName}</h2>
              <p className="text-sm text-on-surface-variant">@{person.username}</p>
              <div className="mt-4 flex items-center justify-between">
                <Badge tone={person.role === "manager" ? "primary" : "neutral"}>{person.role === "manager" ? "Gerente" : "Barista"}</Badge>
                <Badge tone={person.active ? "success" : "danger"}>{person.active ? "Activo" : "Desactivado"}</Badge>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <div className="mt-6"><EmptyState icon={<UserCheck />} title="Sin accesos todavía" description="Crea el primer acceso para tu equipo." /></div>
      )}
      {createOpen && <CreateStaffModal onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); void load(); }} />}
      {selected && (
        <StaffActionsModal
          person={selected}
          isSelf={selected.id === session?.id}
          onClose={() => setSelected(null)}
          onToggleActive={() => void toggleActive(selected)}
          onReset={() => void load()}
        />
      )}
    </Page>
  );
}
