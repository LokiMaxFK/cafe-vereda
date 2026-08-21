import { useState } from "react";
import { Button, InlineAlert, TextField } from "../../design-system/react";
import { orderDestination } from "../domain/order";
import type { Order } from "../domain/types";
import { cancelOrderNotifyingBar } from "../lib/orderCancellation";
import { useApp } from "../state/AppContext";
import { Modal } from "./Modal";

export function CancelOrderModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const { cancelOrder } = useApp();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [printError, setPrintError] = useState("");

  async function confirm() {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      // Cancelar y avisar a la barra van juntos: este modal se usa desde Pedidos y desde el Salón,
      // y antes ninguno de los dos imprimía la comanda de cancelación (hallazgo F08-05).
      const { printError: failure } = await cancelOrderNotifyingBar(order, reason, cancelOrder);
      if (failure) { setPrintError(failure); return; }
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={`Cancelar ${orderDestination(order)}`}
      description="Se registrará como incidencia para que gerencia lo revise. La cuenta seguirá visible en el historial."
      onClose={onClose}
    >
      <div className="space-y-4">
        {printError && <InlineAlert>Cuenta cancelada, pero no se pudo imprimir la incidencia para la barra: {printError}. Avisa a la cocina a mano.</InlineAlert>}
        <label className="block text-sm font-semibold">
          Motivo obligatorio
          <TextField value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ej. el cliente se fue" autoFocus />
        </label>
        <Button variant="danger" className="w-full" disabled={!reason.trim() || submitting} onClick={() => void confirm()}>
          Cancelar pedido
        </Button>
      </div>
    </Modal>
  );
}
