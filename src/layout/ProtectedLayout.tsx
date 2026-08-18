import { useState } from "react";
import { BarChart3, BookOpen, Boxes, ClipboardList, Coffee, HandCoins, Home, LayoutGrid, LayoutTemplate, LogOut, Plus, Settings, Users, WalletCards } from "lucide-react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { AppShell, InlineAlert } from "../../design-system/react";
import { useApp } from "../state/AppContext";

export function ProtectedLayout() {
  const { session, hydrated, logout, online, syncStatus, pendingCount } = useApp();
  const location = useLocation();
  const [logoutError, setLogoutError] = useState("");
  if (!hydrated) return <div className="flex min-h-screen items-center justify-center bg-background text-on-surface-variant">Cargando…</div>;
  if (!session) return <Navigate to="/" replace state={{ from: location.pathname + location.search }} />;
  const manager = session.role === "manager";
  const navItems = [
    { href: "/venta/nueva", label: "Nuevo Pedido", icon: <Plus size={21} />, group: "Operación" },
    { href: "/inicio", label: "Inicio", icon: <Home size={21} />, group: "Operación", exact: true },
    { href: "/salon", label: "Salón", icon: <LayoutGrid size={21} />, group: "Operación" },
    { href: "/preparacion", label: "Preparación", icon: <ClipboardList size={21} />, group: "Operación" },
    { href: "/pedidos", label: "Pedidos", icon: <Coffee size={21} />, group: "Operación" },
    { href: "/cobros", label: "Cobros", icon: <HandCoins size={21} />, group: "Operación" },
    { href: "/caja", label: "Caja", icon: <WalletCards size={21} />, group: "Operación" },
    ...(manager ? [
      { href: "/catalogo", label: "Catálogo", icon: <BookOpen size={21} />, group: "Gestión" },
      { href: "/mesas", label: "Mesas", icon: <LayoutTemplate size={21} />, group: "Gestión" },
      { href: "/insumos", label: "Insumos", icon: <Boxes size={21} />, group: "Gestión" },
      { href: "/reportes", label: "Reportes", icon: <BarChart3 size={21} />, group: "Gestión" },
      { href: "/personal", label: "Personal", icon: <Users size={21} />, group: "Administración" },
      { href: "/configuracion", label: "Configuración", icon: <Settings size={21} />, group: "Administración" }
    ] : [])
  ];
  const status = !online ? { label: `${pendingCount} cambios · Sin conexión`, tone: "danger" as const } : syncStatus === "syncing" ? { label: "Sincronizando cambios", tone: "neutral" as const } : syncStatus === "review_required" ? { label: "Hay operaciones por revisar", tone: "danger" as const } : { label: pendingCount ? `${pendingCount} cambios pendientes` : "Todo sincronizado", tone: "success" as const };
  return (
    <AppShell
      brand={{ name: "Vereda Café", subtitle: "Punto de venta", logoUrl: "/logo.png", fallback: "V" }}
      user={{ name: session.name, role: session.role === "manager" ? "Gerente" : "Barista" }}
      navItems={navItems}
      currentPath={location.pathname}
      status={status}
      logoutIcon={<LogOut size={18} />}
      onLogout={() => void logout().catch((error: Error) => setLogoutError(error.message))}
      renderLink={({ item, className, children, active, onNavigate }) => <Link to={item.href} className={className} aria-current={active ? "page" : undefined} onClick={onNavigate}>{children}</Link>}
    >
      {logoutError && <div className="fixed right-4 top-4 z-[90] max-w-sm"><InlineAlert>{logoutError}</InlineAlert></div>}
      <Outlet />
    </AppShell>
  );
}
