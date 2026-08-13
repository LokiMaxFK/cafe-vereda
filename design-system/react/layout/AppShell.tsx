import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { cn } from "../ui/cn";

export interface ShellNavItem {
  href: string;
  label: string;
  icon: ReactNode;
  group?: string;
  exact?: boolean;
}

export interface ShellBrand {
  name: string;
  subtitle?: string;
  logoUrl?: string;
  fallback?: ReactNode;
}

export interface ShellUser {
  name: string;
  role: string;
  avatar?: ReactNode;
}

export interface ShellStatus {
  label: string;
  tone: "success" | "danger" | "neutral";
  onPress?: () => void;
}

export interface ShellLinkRenderArgs {
  item: ShellNavItem;
  active: boolean;
  className: string;
  children: ReactNode;
  onNavigate?: () => void;
}

export interface AppShellProps {
  brand: ShellBrand;
  user: ShellUser;
  navItems: ShellNavItem[];
  currentPath: string;
  children: ReactNode;
  status?: ShellStatus;
  onLogout?: () => void;
  logoutIcon?: ReactNode;
  moreIcon?: ReactNode;
  closeIcon?: ReactNode;
  renderLink?: (args: ShellLinkRenderArgs) => ReactNode;
}

function itemIsActive(path: string, item: ShellNavItem) {
  return item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`);
}

function DefaultLink({ item, className, children, onNavigate, active }: ShellLinkRenderArgs) {
  return (
    <a href={item.href} className={className} aria-current={active ? "page" : undefined} onClick={onNavigate}>
      {children}
    </a>
  );
}

function BrandMark({ brand, compact = false }: { brand: ShellBrand; compact?: boolean }) {
  const size = compact ? "h-9 w-9" : "h-11 w-11";
  return (
    <div className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary text-on-primary", size)}>
      {brand.logoUrl ? <img src={brand.logoUrl} alt={brand.name} className="h-full w-full object-cover" /> : brand.fallback}
    </div>
  );
}

export function AppShell({
  brand,
  user,
  navItems,
  currentPath,
  children,
  status,
  onLogout,
  logoutIcon,
  moreIcon = "•••",
  closeIcon = "×",
  renderLink = DefaultLink
}: AppShellProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const groups = useMemo(() => {
    const result = new Map<string, ShellNavItem[]>();
    navItems.forEach((item) => {
      const group = item.group ?? "Principal";
      result.set(group, [...(result.get(group) ?? []), item]);
    });
    return result;
  }, [navItems]);

  useEffect(() => setMoreOpen(false), [currentPath]);
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  const hasMore = navItems.length > 4;
  const mobileItems = hasMore ? navItems.slice(0, 3) : navItems;
  const moreItems = hasMore ? navItems.slice(3) : [];
  const moreActive = moreItems.some((item) => itemIsActive(currentPath, item));

  function link(item: ShellNavItem, className: string, content: ReactNode, onNavigate?: () => void) {
    return renderLink({ item, active: itemIsActive(currentPath, item), className, children: content, onNavigate });
  }

  return (
    <div className="min-h-screen bg-background text-on-background">
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-sidebar-width flex-col border-r border-outline-variant/25 bg-surface-container-low lg:flex">
        <div className="flex min-h-24 items-center gap-3 px-6">
          <BrandMark brand={brand} />
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-on-surface">{brand.name}</p>
            <p className="text-xs text-on-surface-variant">{brand.subtitle}</p>
          </div>
        </div>

        <nav aria-label="Navegación principal" className="custom-scrollbar flex-1 overflow-y-auto pb-4">
          {[...groups.entries()].map(([group, items], index) => (
            <div key={group} className={index === 0 ? "" : "mx-3 mt-4 border-t border-outline-variant/25 pt-4"}>
              <p className="px-3 pb-2 text-xs font-bold text-outline">{group}</p>
              <div className="space-y-1">
                {items.map((item) => {
                  const active = itemIsActive(currentPath, item);
                  return (
                    <div key={item.href}>
                      {link(
                        item,
                        cn(
                          "flex min-h-touch-target-min items-center gap-3 rounded-xl px-3.5 text-sm font-semibold transition-colors",
                          active
                            ? "bg-primary-fixed text-on-primary-fixed-variant"
                            : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                        ),
                        <><span className="text-[22px]">{item.icon}</span><span>{item.label}</span></>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {status && (
          <button
            type="button"
            onClick={status.onPress}
            className="mx-3 mb-2 flex min-h-10 items-center gap-2 rounded-xl px-3 text-left text-xs font-semibold text-on-surface-variant hover:bg-surface-container-high"
          >
            <span className={cn("h-2.5 w-2.5 rounded-full", status.tone === "success" ? "bg-tertiary" : status.tone === "danger" ? "bg-error" : "bg-outline")} />
            <span className="truncate">{status.label}</span>
          </button>
        )}

        <div className="m-3 mt-0 flex items-center gap-3 rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-fixed font-bold text-on-primary-fixed">
            {user.avatar ?? user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-on-surface">{user.name}</p>
            <p className="text-xs text-on-surface-variant">{user.role}</p>
          </div>
          {onLogout && <Button onClick={onLogout} variant="ghost" size="icon" aria-label="Cerrar sesión">{logoutIcon ?? "↪"}</Button>}
        </div>
      </aside>

      <div className="min-h-screen lg:ml-sidebar-width">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-outline-variant/25 bg-background/95 px-4 backdrop-blur-sm lg:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark brand={brand} compact />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-on-surface">{brand.name}</p>
              <p className="text-xs text-on-surface-variant">{user.role}</p>
            </div>
          </div>
          {onLogout && <Button onClick={onLogout} variant="ghost" size="icon" aria-label="Cerrar sesión">{logoutIcon ?? "↪"}</Button>}
        </header>

        <main className="flex min-h-screen flex-col pb-24 lg:pb-0">{children}</main>
      </div>

      <nav className="safe-area-bottom fixed inset-x-0 bottom-0 z-50 border-t border-outline-variant/30 bg-surface-container-lowest px-2 pt-2 shadow-bottom-nav lg:hidden">
        <div className="mx-auto flex max-w-lg items-stretch justify-around">
          {mobileItems.map((item) => {
            const active = itemIsActive(currentPath, item);
            return (
              <div key={item.href} className="flex flex-1">
                {link(
                  item,
                  cn(
                    "flex min-h-14 min-w-16 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-semibold transition-colors",
                    active ? "bg-primary-fixed text-on-primary-fixed-variant" : "text-on-surface-variant"
                  ),
                  <><span className="text-[22px]">{item.icon}</span><span className="max-w-full truncate">{item.label}</span></>
                )}
              </div>
            );
          })}
          {hasMore && (
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-controls="mobile-more-menu"
              onClick={() => setMoreOpen((open) => !open)}
              className={cn(
                "flex min-h-14 min-w-16 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-semibold transition-colors",
                moreActive || moreOpen ? "bg-primary-fixed text-on-primary-fixed-variant" : "text-on-surface-variant"
              )}
            >
              <span className="text-[22px]">{moreIcon}</span>
              <span>Más</span>
            </button>
          )}
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button type="button" aria-label="Cerrar menú" className="absolute inset-0 bg-inverse-surface/25" onClick={() => setMoreOpen(false)} />
          <section id="mobile-more-menu" aria-label="Más opciones" className="safe-area-bottom absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-outline-variant/30 bg-surface-container-lowest p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-on-surface">Más opciones</h2>
                <p className="text-sm text-on-surface-variant">Navegación secundaria</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setMoreOpen(false)} aria-label="Cerrar menú">{closeIcon}</Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {moreItems.map((item) => {
                const active = itemIsActive(currentPath, item);
                return (
                  <div key={item.href}>
                    {link(
                      item,
                      cn(
                        "flex min-h-20 flex-col justify-between rounded-xl border p-3 text-sm font-semibold",
                        active
                          ? "border-primary/30 bg-primary-fixed text-on-primary-fixed-variant"
                          : "border-outline-variant/35 bg-surface text-on-surface"
                      ),
                      <><span className="text-2xl">{item.icon}</span><span>{item.label}</span></>,
                      () => setMoreOpen(false)
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
