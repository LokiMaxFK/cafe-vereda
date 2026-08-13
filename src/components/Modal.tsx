import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Button } from "../../design-system/react";

export function Modal({ title, description, children, onClose, width = "max-w-lg" }: { title: string; description?: string; children: ReactNode; onClose: () => void; width?: string }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-inverse-surface/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Cerrar" className="absolute inset-0" onClick={onClose} />
      <section className={`relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-2xl sm:rounded-2xl sm:p-6 ${width}`}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div><h2 className="text-xl font-bold text-on-surface">{title}</h2>{description && <p className="mt-1 text-sm text-on-surface-variant">{description}</p>}</div>
          <Button variant="ghost" size="icon" aria-label="Cerrar" onClick={onClose}><X size={20} /></Button>
        </div>
        {children}
      </section>
    </div>
  );
}
