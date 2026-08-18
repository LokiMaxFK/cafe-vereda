import { useState } from "react";
import { Button, TextField } from "../../design-system/react";
import { orderDestination } from "../domain/order";
import type { Order } from "../domain/types";
import { useApp } from "../state/AppContext";
import { Modal } from "./Modal";

export function CancelOrderModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const { cancelOrder } = useApp();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function confirm() {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await cancelOrder(order.id, reason);
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
