import { barItemsForCancellation } from "../domain/order";
import type { Order } from "../domain/types";
import { printErrorMessage } from "./browserPrinting";
import { printCommand } from "./printing";

/**
 * Cancela una cuenta completa **y** avisa a la barra de lo que ya estaba en marcha.
 *
 * Las dos cosas van juntas a propósito. Antes la impresión vivía sólo dentro de la pantalla de la
 * venta, así que cancelar desde el listado de Pedidos o desde la vista previa del Salón dejaba a la
 * cocina preparando algo ya cancelado (hallazgo F08-05). Al pasar por aquí, cualquier punto de
 * entrada —incluido uno que se añada mañana— hereda el aviso.
 *
 * Devuelve el fallo de impresión en vez de lanzarlo: la cancelación ya quedó registrada y no debe
 * deshacerse porque la impresora esté apagada, pero quien llama sí tiene que poder decírselo al
 * usuario en lugar de tragárselo.
 */
export async function cancelOrderNotifyingBar(
  order: Order,
  reason: string,
  cancelOrder: (orderId: string, reason: string) => Promise<void>
): Promise<{ printError?: string }> {
  const barItems = barItemsForCancellation(order.items, reason);
  await cancelOrder(order.id, reason);
  if (!barItems.length) return {};
  try {
    await printCommand(order, barItems, 0, true);
    return {};
  } catch (failure) {
    return { printError: printErrorMessage(failure) };
  }
}
