-- Quitar una mesa desde el croquis la elimina de verdad cuando nunca tuvo pedidos.
-- La política RLS «managers manage tables» (for all) ya limita el borrado a gerencia.
-- Si la mesa tiene historial, la llave foránea de orders.table_id lo impide y el cliente
-- la archiva (active = false) para no perder la referencia en ventas pasadas.
grant delete on public.cafe_tables to authenticated;
