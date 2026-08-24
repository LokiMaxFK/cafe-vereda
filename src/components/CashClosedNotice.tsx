import { WalletCards } from "lucide-react";
import { Link } from "react-router-dom";
import { InlineAlert } from "../../design-system/react";
import { useApp } from "../state/AppContext";

/**
 * Aviso de caja cerrada para las pantallas desde las que se arrancan pedidos. No se muestra
 * nada cuando la caja está abierta ni en modo demo, donde no existen los turnos.
 */
export function CashClosedNotice({ className = "" }: { className?: string }) {
  const { canTakeOrders } = useApp();
  if (canTakeOrders) return null;
  return (
    <div className={className}>
      <InlineAlert>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <WalletCards size={16} className="shrink-0" />
          <strong>La caja está cerrada.</strong>
          No se pueden tomar pedidos hasta abrir el turno con su fondo inicial.
          <Link to="/caja" className="font-bold underline underline-offset-2">Abrir caja</Link>
        </span>
      </InlineAlert>
    </div>
  );
}
