-- Cuentas separadas: una cuenta puede repartirse entre varias personas.
--
-- El reparto NO se modela como varias órdenes hermanas. El índice one_active_order_per_table
-- impide que una mesa tenga más de una orden activa, así que dos comensales de la mesa 4 nunca
-- podrían tener una orden cada uno. Las subcuentas cuelgan de la orden: la cuenta sigue siendo
-- una, el folio sigue siendo uno y el arqueo de caja sigue viendo los mismos pagos.
--
-- Qué se agrega:
--   - order_subaccounts: las personas entre las que se reparte una cuenta.
--   - order_item_shares: cuántas unidades de cada renglón son de cada persona. Va aparte de
--     order_items porque una línea de 3 cafés puede repartirse entre 3 personas distintas, y
--     porque order_items viaja tal cual a las comandas inmutables de la barra.
--   - orders.split_mode: 'even' (partes iguales) o 'items' (por producto).
--   - payments.subaccount_id: de quién es cada pago, para que cada persona ponga su propia
--     propina y su ticket salga con lo suyo.
--
-- El importe que debe cada persona NO se guarda: se deriva en el cliente (src/domain/splitBill.ts).
-- Guardarlo lo dejaría desincronizado en cuanto cambiara el descuento, y la suma de las partes
-- tiene que dar el total exacto o validate_order_close rechaza el cierre con 'Insufficient payment'.

create table if not exists public.order_subaccounts (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  label text not null check (length(trim(label)) > 0),
  position integer not null check (position > 0),
  created_at timestamptz not null default now(),
  unique (order_id, position)
);
create index if not exists order_subaccounts_order_idx on public.order_subaccounts(order_id, position);

-- on delete cascade a propósito: sync_offline_operations borra los order_items 'pending' que no
-- vengan en el payload, y sin el cascade ese borrado reventaría por la llave foránea.
-- La llave propia no es decorativa: private.audit_row() escribe coalesce(new.id, old.id) en
-- audit_log.entity_id, así que una tabla auditada sin columna `id` haría fallar el trigger en
-- cada escritura con «record "new" has no field "id"». El par (order_item_id, subaccount_id)
-- sigue siendo único, que es contra lo que concilia el `on conflict` de sync_offline_operations.
create table if not exists public.order_item_shares (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  subaccount_id uuid not null references public.order_subaccounts(id) on delete cascade,
  units integer not null check (units > 0),
  unique (order_item_id, subaccount_id)
);
create index if not exists order_item_shares_subaccount_idx on public.order_item_shares(subaccount_id);

alter table public.orders   add column if not exists split_mode text;
alter table public.payments add column if not exists subaccount_id uuid references public.order_subaccounts(id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_split_mode_check') then
    alter table public.orders add constraint orders_split_mode_check check (split_mode in ('even','items'));
  end if;
end $$;

-- El check de incidents es inline en la migración inicial, así que Postgres lo nombró solo. Se
-- localiza por la tabla y por el texto de la condición en vez de dar por hecho el nombre.
do $$ declare v_name text; begin
  select con.conname into v_name from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public' and rel.relname = 'incidents' and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%incident_type%';
  if v_name is not null then
    execute format('alter table public.incidents drop constraint %I', v_name);
  end if;
  alter table public.incidents add constraint incidents_incident_type_check
    check (incident_type in ('item_cancellation', 'order_cancellation', 'sale_reversal', 'refund', 'split_reassignment'));
end $$;

alter table public.order_subaccounts enable row level security;
alter table public.order_item_shares enable row level security;

-- Mismas condiciones que order_items: se puede repartir mientras la cuenta siga viva. 'served' es
-- justo el estado en el que se reparte, porque la división ocurre al ir a cobrar.
drop policy if exists "authenticated read subaccounts" on public.order_subaccounts;
create policy "authenticated read subaccounts" on public.order_subaccounts for select to authenticated using (true);

drop policy if exists "staff manage subaccounts" on public.order_subaccounts;
create policy "staff manage subaccounts" on public.order_subaccounts for insert to authenticated
  with check (exists (select 1 from public.orders o where o.id = order_id and o.status in ('open','preparing','ready','served')));

drop policy if exists "staff update subaccounts" on public.order_subaccounts;
create policy "staff update subaccounts" on public.order_subaccounts for update to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.status in ('open','preparing','ready','served')))
  with check (true);

drop policy if exists "staff delete subaccounts" on public.order_subaccounts;
create policy "staff delete subaccounts" on public.order_subaccounts for delete to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.status in ('open','preparing','ready','served')));

drop policy if exists "authenticated read item shares" on public.order_item_shares;
create policy "authenticated read item shares" on public.order_item_shares for select to authenticated using (true);

drop policy if exists "staff manage item shares" on public.order_item_shares;
create policy "staff manage item shares" on public.order_item_shares for insert to authenticated
  with check (exists (select 1 from public.order_subaccounts sub join public.orders o on o.id = sub.order_id
                      where sub.id = subaccount_id and o.status in ('open','preparing','ready','served')));

drop policy if exists "staff update item shares" on public.order_item_shares;
create policy "staff update item shares" on public.order_item_shares for update to authenticated
  using (exists (select 1 from public.order_subaccounts sub join public.orders o on o.id = sub.order_id
                 where sub.id = subaccount_id and o.status in ('open','preparing','ready','served')))
  with check (true);

drop policy if exists "staff delete item shares" on public.order_item_shares;
create policy "staff delete item shares" on public.order_item_shares for delete to authenticated
  using (exists (select 1 from public.order_subaccounts sub join public.orders o on o.id = sub.order_id
                 where sub.id = subaccount_id and o.status in ('open','preparing','ready','served')));

grant select, insert, update, delete on public.order_subaccounts, public.order_item_shares to authenticated;

-- Auditoría y realtime, como las demás tablas del ciclo de la orden. Sin el broadcast, una
-- estación no vería el reparto que otra está armando en la misma mesa.
drop trigger if exists audit_order_subaccounts on public.order_subaccounts;
create trigger audit_order_subaccounts after insert or update or delete on public.order_subaccounts for each row execute function private.audit_row();
drop trigger if exists audit_order_item_shares on public.order_item_shares;
create trigger audit_order_item_shares after insert or update or delete on public.order_item_shares for each row execute function private.audit_row();

drop trigger if exists broadcast_order_subaccounts on public.order_subaccounts;
create trigger broadcast_order_subaccounts after insert or update or delete on public.order_subaccounts for each row execute function private.broadcast_order_changes();
drop trigger if exists broadcast_order_item_shares on public.order_item_shares;
create trigger broadcast_order_item_shares after insert or update or delete on public.order_item_shares for each row execute function private.broadcast_order_changes();

-- Séptima reescritura de sync_offline_operations. Respecto a la versión anterior
-- (20260818140000_incident_amount_includes_modifiers.sql) sólo cambia lo relativo al reparto:
--   - cuatro tipos de operación nuevos: split_order, assign_split_units, reassign_split_item y clear_split;
--   - orders.split_mode entra en el upsert;
--   - subcuentas y participaciones se sincronizan desde el payload ANTES de los pagos, porque
--     payments.subaccount_id las referencia;
--   - los pagos guardan a qué persona pertenecen;
--   - reasignar un artículo con cobros ya hechos exige gerencia y levanta una incidencia.
-- El resto del cuerpo se copia sin cambios.
create or replace function public.sync_offline_operations(p_operations jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_operation jsonb; v_payload jsonb; v_item jsonb; v_payment jsonb; v_modifier jsonb;
  v_results jsonb := '[]'::jsonb; v_modifiers jsonb; v_batches uuid[] := array[]::uuid[];
  v_id uuid; v_device uuid; v_entity uuid; v_table_id uuid; v_product_id uuid; v_batch_id uuid;
  v_inserted boolean; v_target_status public.order_status; v_batch_number integer;
  v_type text; v_reversal_reason text; v_folio bigint;
  v_subaccount jsonb; v_share jsonb; v_moved_cents integer;
begin
  if jsonb_typeof(p_operations) <> 'array' then raise exception 'Operations must be an array'; end if;
  for v_operation in select * from jsonb_array_elements(p_operations) order by (value->>'createdAt')::timestamptz loop
    v_id := (v_operation->>'id')::uuid; v_device := (v_operation->>'deviceId')::uuid; v_entity := (v_operation->>'entityId')::uuid;
    v_type := v_operation->>'type';
    insert into public.devices(id, name, last_seen_at) values (v_device, 'Dispositivo POS', now())
      on conflict (id) do update set last_seen_at = excluded.last_seen_at;
    insert into public.offline_operations(id, idempotency_key, device_id, operation_type, entity_id, payload, submitted_by, created_at)
    values (v_id, v_operation->>'idempotencyKey', v_device, v_type, v_entity, v_operation->'payload', auth.uid(), (v_operation->>'createdAt')::timestamptz)
    on conflict (idempotency_key) do nothing;
    v_inserted := found;
    if not v_inserted then
      v_results := v_results || jsonb_build_array(jsonb_build_object('id',v_id,'status','synced','duplicate',true));
      continue;
    end if;

    v_payload := v_operation->'payload';

    if v_type = 'reverse_sale' then
      -- Una venta cerrada es inmutable salvo por la reversión misma: no se reescriben renglones
      -- ni pagos, sólo se marca la orden y se levanta la incidencia con el importe cobrado.
      if not private.is_manager() then raise exception 'Manager role required'; end if;
      v_reversal_reason := nullif(trim(replace(coalesce(v_payload->>'discountReason', ''), 'Reversión: ', '')), '');
      if v_reversal_reason is null then raise exception 'Reason required'; end if;

      update public.orders set
        status = 'reversed',
        reversed_by = auth.uid(),
        reversed_at = (v_payload->>'updatedAt')::timestamptz,
        reversal_reason = v_reversal_reason,
        updated_at = (v_payload->>'updatedAt')::timestamptz,
        sync_status = 'synced'
      where id = v_entity and status = 'closed';

      insert into public.incidents(order_id, incident_type, reason, amount_cents, created_by)
      select v_entity, 'sale_reversal', v_reversal_reason, coalesce(sum(amount_cents),0), auth.uid()
      from public.payments where order_id = v_entity
      having not exists (select 1 from public.incidents where order_id = v_entity and incident_type = 'sale_reversal');

      v_results := v_results || jsonb_build_array(jsonb_build_object('id',v_id,'status','synced'));
      continue;
    end if;

    if v_type in ('create_order','add_order_item','update_order_item','dispatch_order_items','mark_order_ready','finalize_order','record_payment','apply_discount','cancel_dispatched_item','cancel_order','close_order',
                    'split_order','assign_split_units','reassign_split_item','clear_split') then
      v_target_status := (v_payload->>'status')::public.order_status;
      v_table_id := null;
      if v_payload->>'tableId' ~ '^t[0-9]+$' then
        select id into v_table_id from public.cafe_tables where number = substring(v_payload->>'tableId' from 2)::integer;
      end if;

      -- El cliente reserva su folio con next_order_folio() al abrir la cuenta, para que el
      -- folio impreso en la comanda sea ya el definitivo. Si viene vacío (cuenta creada sin
      -- conexión) o si ya lo ocupa otra orden, se cae de vuelta a la secuencia.
      v_folio := nullif(v_payload->>'folio','')::bigint;
      if v_folio is not null and exists (select 1 from public.orders where folio = v_folio and id <> v_entity) then
        v_folio := null;
      end if;

      insert into public.orders as o (id, folio, order_type, table_id, customer_name, status, opened_by, discount_cents, discount_reason, split_mode, device_id, opened_at, updated_at, sync_status)
      values (v_entity, coalesce(v_folio, nextval('public.order_folio_seq')), (v_payload->>'type')::public.order_type, v_table_id, nullif(v_payload->>'customerName',''), 'open', auth.uid(),
        round(coalesce((v_payload->>'discount')::numeric,0) * 100)::integer, nullif(v_payload->>'discountReason',''), nullif(v_payload->>'splitMode',''), v_device,
        (v_payload->>'openedAt')::timestamptz, (v_payload->>'updatedAt')::timestamptz, 'synced')
      on conflict (id) do update set
        customer_name = excluded.customer_name,
        discount_cents = excluded.discount_cents,
        -- cancelar no debe tocar discount_reason: su motivo vive en cancellation_reason.
        discount_reason = case when v_type = 'cancel_order' then o.discount_reason else excluded.discount_reason end,
        split_mode = excluded.split_mode,
        device_id = excluded.device_id,
        updated_at = excluded.updated_at,
        sync_status = 'synced';

      for v_item in select * from jsonb_array_elements(coalesce(v_payload->'items','[]'::jsonb)) loop
        v_product_id := null;
        if v_item->>'productId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
          select id into v_product_id from public.products where id = (v_item->>'productId')::uuid;
        end if;
        v_modifiers := '[]'::jsonb;
        for v_modifier in select * from jsonb_array_elements(coalesce(v_item->'modifiers','[]'::jsonb)) loop
          v_modifiers := v_modifiers || jsonb_build_array(jsonb_build_object(
            'id', v_modifier->>'id', 'name', v_modifier->>'name',
            'price', round(coalesce((v_modifier->>'price')::numeric,0) * 100)::integer));
        end loop;
        insert into public.order_items(id, order_id, product_id, product_name, variant_name, quantity, unit_price_cents, modifiers, notes, status, cancelled_by, cancellation_reason, created_at, updated_at)
        values ((v_item->>'id')::uuid, v_entity, v_product_id, v_item->>'name', nullif(v_item->>'variant',''),
          (v_item->>'quantity')::integer, round((v_item->>'unitPrice')::numeric * 100)::integer, v_modifiers,
          nullif(v_item->>'notes',''), (v_item->>'status')::public.order_item_status,
          case when v_item->>'status' = 'cancelled' then auth.uid() else null end, nullif(v_item->>'cancellationReason',''),
          (v_payload->>'openedAt')::timestamptz, (v_payload->>'updatedAt')::timestamptz)
        on conflict (id) do update set
          quantity = excluded.quantity, modifiers = excluded.modifiers, notes = excluded.notes,
          status = excluded.status, cancelled_by = excluded.cancelled_by, cancellation_reason = excluded.cancellation_reason, updated_at = excluded.updated_at;

        if nullif(v_item->>'dispatchBatchId','') is not null then
          v_batch_id := (v_item->>'dispatchBatchId')::uuid;
          if not v_batch_id = any(v_batches) then
            v_batches := array_append(v_batches, v_batch_id);
            select coalesce(max(batch_number),0)+1 into v_batch_number from public.dispatch_batches where order_id = v_entity;
            insert into public.dispatch_batches(id, order_id, batch_number, created_by)
            values (v_batch_id, v_entity, v_batch_number, auth.uid()) on conflict (id) do nothing;
          end if;
          insert into public.dispatch_batch_items(batch_id, order_item_id, immutable_snapshot)
          values (v_batch_id, (v_item->>'id')::uuid, v_item) on conflict (batch_id, order_item_id) do nothing;
        end if;
        if nullif(v_item->>'cancellationBatchId','') is not null then
          v_batch_id := (v_item->>'cancellationBatchId')::uuid;
          if not v_batch_id = any(v_batches) then
            v_batches := array_append(v_batches, v_batch_id);
            select coalesce(max(batch_number),0)+1 into v_batch_number from public.dispatch_batches where order_id = v_entity;
            insert into public.dispatch_batches(id, order_id, batch_number, batch_type, created_by)
            values (v_batch_id, v_entity, v_batch_number, 'cancellation', auth.uid()) on conflict (id) do nothing;
          end if;
          insert into public.dispatch_batch_items(batch_id, order_item_id, immutable_snapshot)
          values (v_batch_id, (v_item->>'id')::uuid, v_item) on conflict (batch_id, order_item_id) do nothing;
          -- Importe = (precio unitario + suma de extras) × cantidad, igual que itemTotal() en el
          -- cliente (src/domain/money.ts). Antes sólo se usaba el precio unitario.
          insert into public.incidents(order_id, order_item_id, incident_type, reason, amount_cents, created_by)
          select v_entity, (v_item->>'id')::uuid, 'item_cancellation', v_item->>'cancellationReason',
            (round((v_item->>'unitPrice')::numeric * 100)::integer
              + coalesce((select sum((m->>'price')::integer) from jsonb_array_elements(v_modifiers) m), 0)
            ) * (v_item->>'quantity')::integer,
            auth.uid()
          where not exists (select 1 from public.incidents where order_item_id = (v_item->>'id')::uuid and incident_type = 'item_cancellation');
        end if;
      end loop;

      delete from public.order_items oi
      where oi.order_id = v_entity and oi.status = 'pending'
        and not exists (select 1 from jsonb_array_elements(coalesce(v_payload->'items','[]'::jsonb)) item where item->>'id' = oi.id::text);

      -- Subcuentas y reparto. Van antes que los pagos porque payments.subaccount_id las referencia.
      -- Igual que con los renglones, el payload del cliente es la fuente de verdad: lo que no venga
      -- en él se borra. La única excepción es una subcuenta que ya cobró, que no se puede borrar
      -- sin dejar su pago huérfano: ahí gana la base, no el payload.
      for v_subaccount in select * from jsonb_array_elements(coalesce(v_payload->'subaccounts','[]'::jsonb)) loop
        insert into public.order_subaccounts(id, order_id, label, position)
        values ((v_subaccount->>'id')::uuid, v_entity, v_subaccount->>'label', (v_subaccount->>'position')::integer)
        on conflict (id) do update set label = excluded.label, position = excluded.position;
      end loop;

      delete from public.order_item_shares s
      using public.order_subaccounts sub
      where s.subaccount_id = sub.id and sub.order_id = v_entity
        and not exists (
          select 1 from jsonb_array_elements(coalesce(v_payload->'itemShares','[]'::jsonb)) share
          where (share->>'itemId')::uuid = s.order_item_id and (share->>'subaccountId')::uuid = s.subaccount_id);

      delete from public.order_subaccounts s
      where s.order_id = v_entity
        and not exists (
          select 1 from jsonb_array_elements(coalesce(v_payload->'subaccounts','[]'::jsonb)) sub
          where (sub->>'id')::uuid = s.id)
        and not exists (select 1 from public.payments p where p.subaccount_id = s.id);

      for v_share in select * from jsonb_array_elements(coalesce(v_payload->'itemShares','[]'::jsonb)) loop
        insert into public.order_item_shares(order_item_id, subaccount_id, units)
        values ((v_share->>'itemId')::uuid, (v_share->>'subaccountId')::uuid, (v_share->>'units')::integer)
        on conflict (order_item_id, subaccount_id) do update set units = excluded.units;
      end loop;

      -- Mover un artículo de una persona a otra cuando alguien del reparto ya pagó reescribe una
      -- cuenta que el cliente dio por cerrada: exige gerencia y queda como incidencia, igual que
      -- una reversión de venta.
      if v_type = 'reassign_split_item' then
        if exists (select 1 from public.payments p join public.order_subaccounts sub on sub.id = p.subaccount_id where sub.order_id = v_entity) then
          if not private.is_manager() then raise exception 'Manager role required'; end if;
        end if;
        if nullif(trim(coalesce(v_payload->>'splitReassignmentReason','')), '') is null then raise exception 'Reason required'; end if;
        v_moved_cents := round(coalesce((v_payload->>'splitReassignmentAmount')::numeric, 0) * 100)::integer;
        insert into public.incidents(order_id, incident_type, reason, amount_cents, created_by)
        values (v_entity, 'split_reassignment', trim(v_payload->>'splitReassignmentReason'), greatest(v_moved_cents, 0), auth.uid());
      end if;

      for v_payment in select * from jsonb_array_elements(coalesce(v_payload->'payments','[]'::jsonb)) loop
        insert into public.payments(id, order_id, method, amount_cents, tip_cents, subaccount_id, recorded_by, idempotency_key, created_at)
        values ((v_payment->>'id')::uuid, v_entity, (v_payment->>'method')::public.payment_method,
          round((v_payment->>'amount')::numeric * 100)::integer, round(coalesce((v_payment->>'tip')::numeric,0) * 100)::integer,
          nullif(v_payment->>'subaccountId','')::uuid,
          auth.uid(), (v_operation->>'idempotencyKey') || ':payment:' || (v_payment->>'id'), (v_payment->>'createdAt')::timestamptz)
        on conflict (id) do nothing;
      end loop;

      if v_target_status = 'cancelled' then
        update public.orders set status = 'cancelled', cancellation_reason = nullif(v_payload->>'cancellationReason',''), updated_at = (v_payload->>'updatedAt')::timestamptz, sync_status = 'synced'
        where id = v_entity and status <> 'closed';
        -- Importe = suma por renglón no cancelado de (precio unitario + extras) × cantidad, para
        -- que coincida con lo que la cuenta mostraba en pantalla en el momento de cancelarla.
        insert into public.incidents(order_id, incident_type, reason, amount_cents, created_by)
        select v_entity, 'order_cancellation',
          coalesce(nullif(v_payload->>'cancellationReason',''), 'Cancelación'),
          coalesce((
            select sum(
              (oi.unit_price_cents + coalesce((select sum((m->>'price')::integer) from jsonb_array_elements(oi.modifiers) m), 0))
              * oi.quantity
            )
            from public.order_items oi where oi.order_id = v_entity and oi.status <> 'cancelled'
          ), 0),
          auth.uid()
        where not exists (select 1 from public.incidents where order_id = v_entity and incident_type = 'order_cancellation');
      else
        update public.orders set
          status = v_target_status,
          closed_by = case when v_target_status = 'closed' then auth.uid() else closed_by end,
          closed_at = case when v_target_status = 'closed' then (v_payload->>'updatedAt')::timestamptz else closed_at end,
          updated_at = (v_payload->>'updatedAt')::timestamptz,
          sync_status = 'synced'
        where id = v_entity and status <> 'closed';
      end if;
    end if;
    v_results := v_results || jsonb_build_array(jsonb_build_object('id',v_id,'status','synced'));
  end loop;
  return v_results;
end;
$$;

notify pgrst, 'reload schema';
