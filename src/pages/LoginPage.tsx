import { useState, type FormEvent } from "react";
import { ArrowRight, Coffee, Eye, EyeOff, ShieldCheck, WifiOff } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button, FieldLabel, InlineAlert, TextField } from "../../design-system/react";
import { useApp } from "../state/AppContext";

export function LoginPage() {
  const { session, login, online, demoMode } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState("gerente");
  const [pin, setPin] = useState("2468");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  if (session) return <Navigate to="/salon" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setLoading(true);
    try { await login(username, pin); navigate("/salon"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo iniciar sesión."); }
    finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden overflow-hidden bg-primary p-12 text-on-primary lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full border border-on-primary/10" />
        <div className="absolute -bottom-28 -left-28 h-[420px] w-[420px] rounded-full border border-on-primary/10" />
        <div className="relative flex items-center gap-4"><img src="/logo.png" alt="Vereda Café" className="h-16 w-16 rounded-2xl bg-[#E6DCC2] object-contain p-1" /><div><p className="text-xl font-bold">Vereda Café</p><p className="text-sm text-on-primary/70">Punto de venta</p></div></div>
        <div className="relative max-w-xl"><span className="mb-6 inline-flex rounded-full bg-on-primary/10 px-4 py-2 text-xs font-bold uppercase tracking-[.18em]">Una sucursal · un solo camino</span><h1 className="text-5xl font-bold leading-[1.08] xl:text-6xl">Cada pedido, en su lugar.</h1><p className="mt-6 max-w-lg text-lg leading-8 text-on-primary/75">Salón, comandas, cobros y caja conectados para que el equipo se concentre en la hospitalidad.Prueba despliegue</p></div>
        <div className="relative flex gap-8 text-sm text-on-primary/70"><span className="flex items-center gap-2"><ShieldCheck size={18} /> Operación auditada</span><span className="flex items-center gap-2"><WifiOff size={18} /> Continúa sin conexión</span></div>
      </section>
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden"><img src="/logo.png" alt="" className="h-14 w-14 rounded-2xl bg-[#E6DCC2] object-contain p-1" /><div><p className="font-bold">Vereda Café</p><p className="text-xs text-on-surface-variant">Punto de venta</p></div></div>
          <div className="mb-7"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-fixed text-primary"><Coffee size={24} /></div><h2 className="text-3xl font-bold text-on-surface">Hola de nuevo</h2><p className="mt-2 text-on-surface-variant">Ingresa con tu usuario y PIN personal.</p></div>
          {!online && <div className="mb-4"><InlineAlert>Sin conexión. Sólo una sesión que ya estaba abierta puede continuar operando.</InlineAlert></div>}
          {error && <div className="mb-4"><InlineAlert>{error}</InlineAlert></div>}
          <form className="space-y-5" onSubmit={submit}>
            <FieldLabel label="Usuario"><TextField value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus required /></FieldLabel>
            <FieldLabel label="PIN personal">
              <div className="relative"><TextField className="pr-12" type={showPin ? "text" : "password"} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoComplete="current-password" required /><button type="button" onClick={() => setShowPin((value) => !value)} className="absolute right-1 top-2 flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant" aria-label={showPin ? "Ocultar PIN" : "Mostrar PIN"}>{showPin ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            </FieldLabel>
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading || !online}>{loading ? "Validando…" : <>Entrar <ArrowRight size={18} /></>}</Button>
          </form>
          {demoMode && <div className="mt-6 rounded-2xl border border-outline-variant/40 bg-surface-container-low p-4 text-sm text-on-surface-variant"><p className="font-bold text-on-surface">Acceso de demostración</p><p className="mt-1">Gerente: <strong>gerente / 2468</strong> · Barista: <strong>ana / 1234</strong></p></div>}
          <p className="mt-8 text-center text-xs text-outline">Acceso interno · No compartas tu PIN</p>
        </div>
      </section>
    </main>
  );
}
