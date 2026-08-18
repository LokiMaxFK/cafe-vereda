-- La migración que agregó el estado "served" (20260817162350_order_served_status.sql)
-- actualizó las políticas de orders y payments para incluirlo, pero olvidó las de
-- order_items. sync_offline_operations vuelve a hacer upsert de los items en cada
-- operación (record_payment, close_order, etc.) sin importar el status objetivo, así
-- que sincronizar cualquier operación sobre una orden ya "served" violaba RLS.
drop policy if exists "staff add order items" on public.order_items;
create policy "staff add order items" on public.order_items for insert to authenticated
  with check (exists(select 1 from public.orders o where o.id = order_id and o.status in ('open','preparing','ready','served')));

drop policy if exists "staff update pending items" on public.order_items;
create policy "staff update pending items" on public.order_items for update to authenticated
  using (exists(select 1 from public.orders o where o.id = order_id and o.status in ('open','preparing','ready','served')))
  with check (true);

drop policy if exists "staff delete pending items" on public.order_items;
create policy "staff delete pending items" on public.order_items for delete to authenticated
  using (status = 'pending' and exists(select 1 from public.orders o where o.id = order_id and o.status in ('open','preparing','ready','served')));
