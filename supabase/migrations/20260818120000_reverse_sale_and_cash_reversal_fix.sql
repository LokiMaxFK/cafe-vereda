-- Dos correcciones sobre ventas revertidas.
--
-- 1) Revertir una venta nunca llegaba a escribirse.
--    sync_offline_operations hacía el upsert genérico de orders/order_items/payments ANTES de
--    aplicar la reversión, sin importar el tipo de operación. Para reverse_sale la orden ya está
--    en 'closed', así que ese upsert genérico chocaba con tres capas a la vez:
--      * el trigger immutable_sales (private.prevent_immutable_changes), que exige que cualquier
--        UPDATE sobre una orden cerrada la deje en 'reversed' con reversed_by y reversal_reason;
--        el upsert genérico no toca status, así que abortaba con
--        'Closed sales can only be reversed by a manager';
--      * las políticas RLS de orders, donde "staff update open orders" no incluye 'closed' y
--        "managers reverse closed orders" exige que la fila resultante quede en 'reversed';
--      * la política "staff update pending items" de order_items, que sólo permite órdenes en
--        open/preparing/ready/served -- el mismo fallo que 20260818000000 corrigió para 'served'.
--    Como todo corre dentro de una transacción, la excepción tiraba el lote completo: la reversión
--    se veía aplicada en el dispositivo pero la base nunca cambiaba, y la operación quedaba
--    reintentándose hasta caer en review_required.
--    Ahora reverse_sale se atiende en su propia rama, sin tocar los renglones ni los pagos (que
--    por definición ya no deben cambiar en una venta cerrada).
--
-- 2) El corte de caja contaba el efectivo de ventas revertidas o canceladas.
--    close_cash_session sumaba todos los pagos en efectivo desde la apertura del turno sin mirar
--    el estado de la orden, así que devolver una venta en efectivo dejaba un faltante fantasma por
--    el mismo importe. Se excluyen las órdenes en 'reversed' y 'cancelled'.

create or replace function public.sync_offline_operations(p_operations jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_operation jsonb; v_payload jsonb; v_item jsonb; v_payment jsonb; v_modifier jsonb;
  v_results jsonb := '[]'::jsonb; v_modifiers jsonb; v_batches uuid[] := array[]::uuid[];
  v_id uuid; v_device uuid; v_entity uuid; v_table_id uuid; v_product_id uuid; v_batch_id uuid;
  v_inserted boolean; v_target_status public.order_status; v_batch_number integer;
  v_type text; v_reversal_reason text;
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

    if v_type in ('create_order','add_order_item','update_order_item','dispatch_order_items','mark_order_ready','finalize_order','record_payment','apply_discount','cancel_dispatched_item','cancel_order','close_order') then
      v_target_status := (v_payload->>'status')::public.order_status;
      v_table_id := null;
      if v_payload->>'tableId' ~ '^t[0-9]+$' then
        select id into v_table_id from public.cafe_tables where number = substring(v_payload->>'tableId' from 2)::integer;
      end if;

      insert into public.orders as o (id, order_type, table_id, customer_name, status, opened_by, discount_cents, discount_reason, device_id, opened_at, updated_at, sync_status)
      values (v_entity, (v_payload->>'type')::public.order_type, v_table_id, nullif(v_payload->>'customerName',''), 'open', auth.uid(),
        round(coalesce((v_payload->>'discount')::numeric,0) * 100)::integer, nullif(v_payload->>'discountReason',''), v_device,
        (v_payload->>'openedAt')::timestamptz, (v_payload->>'updatedAt')::timestamptz, 'synced')
      on conflict (id) do update set
        customer_name = excluded.customer_name,
        discount_cents = excluded.discount_cents,
        -- cancelar no debe tocar discount_reason: su motivo vive en cancellation_reason.
        discount_reason = case when v_type = 'cancel_order' then o.discount_reason else excluded.discount_reason end,
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
          insert into public.incidents(order_id, order_item_id, incident_type, reason, amount_cents, created_by)
          select v_entity, (v_item->>'id')::uuid, 'item_cancellation', v_item->>'cancellationReason',
            round((v_item->>'unitPrice')::numeric * 100)::integer * (v_item->>'quantity')::integer, auth.uid()
          where not exists (select 1 from public.incidents where order_item_id = (v_item->>'id')::uuid and incident_type = 'item_cancellation');
        end if;
      end loop;

      delete from public.order_items oi
      where oi.order_id = v_entity and oi.status = 'pending'
        and not exists (select 1 from jsonb_array_elements(coalesce(v_payload->'items','[]'::jsonb)) item where item->>'id' = oi.id::text);

      for v_payment in select * from jsonb_array_elements(coalesce(v_payload->'payments','[]'::jsonb)) loop
        insert into public.payments(id, order_id, method, amount_cents, tip_cents, recorded_by, idempotency_key, created_at)
        values ((v_payment->>'id')::uuid, v_entity, (v_payment->>'method')::public.payment_method,
          round((v_payment->>'amount')::numeric * 100)::integer, round(coalesce((v_payment->>'tip')::numeric,0) * 100)::integer,
          auth.uid(), (v_operation->>'idempotencyKey') || ':payment:' || (v_payment->>'id'), (v_payment->>'createdAt')::timestamptz)
        on conflict (id) do nothing;
      end loop;

      if v_target_status = 'cancelled' then
        update public.orders set status = 'cancelled', cancellation_reason = nullif(v_payload->>'cancellationReason',''), updated_at = (v_payload->>'updatedAt')::timestamptz, sync_status = 'synced'
        where id = v_entity and status <> 'closed';
        insert into public.incidents(order_id, incident_type, reason, amount_cents, created_by)
        select v_entity, 'order_cancellation',
          coalesce(nullif(v_payload->>'cancellationReason',''), 'Cancelación'),
          coalesce((select sum(unit_price_cents * quantity) from public.order_items where order_id = v_entity and status <> 'cancelled'), 0),
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

create or replace function public.close_cash_session(p_cash_session_id uuid, p_counted_cash_cents integer)
returns public.cash_sessions language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_session public.cash_sessions;
  v_cash_sales_cents bigint;
  v_withdrawals_cents bigint;
  v_expected_cents bigint;
  v_difference_cents bigint;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_counted_cash_cents is null or p_counted_cash_cents < 0 then raise exception 'Invalid counted amount'; end if;

  select * into v_session
    from public.cash_sessions
    where id = p_cash_session_id
    for update;

  if not found then raise exception 'Cash session not found'; end if;
  if v_session.closed_at is not null then
    if v_session.closed_by = v_user and v_session.counted_cash_cents = p_counted_cash_cents then
      return v_session;
    end if;
    raise exception 'Cash session already closed';
  end if;

  -- Las ventas revertidas o canceladas conservan sus pagos como registro histórico, pero ese
  -- efectivo ya salió de la caja: contarlo produciría un faltante inexistente en el corte.
  select coalesce(sum(p.amount_cents), 0) into v_cash_sales_cents
    from public.payments p
    join public.orders o on o.id = p.order_id
    where p.method = 'cash'
      and p.created_at >= v_session.opened_at
      and o.status not in ('reversed', 'cancelled');

  select coalesce(sum(amount_cents), 0) into v_withdrawals_cents
    from public.cash_movements
    where cash_session_id = p_cash_session_id
      and movement_type in ('withdrawal', 'adjustment');

  v_expected_cents := v_session.opening_fund_cents::bigint + v_cash_sales_cents - v_withdrawals_cents;
  v_difference_cents := p_counted_cash_cents::bigint - v_expected_cents;

  if v_expected_cents not between -2147483648 and 2147483647
    or v_difference_cents not between -2147483648 and 2147483647 then
    raise exception 'Cash totals exceed supported range';
  end if;

  update public.cash_sessions
    set closed_by = v_user,
        closed_at = now(),
        counted_cash_cents = p_counted_cash_cents,
        expected_cash_cents = v_expected_cents::integer,
        difference_cents = v_difference_cents::integer
    where id = p_cash_session_id
    returning * into v_session;

  insert into public.cash_movements(cash_session_id, movement_type, amount_cents, note, recorded_by, idempotency_key)
  values (p_cash_session_id, 'closing', p_counted_cash_cents, 'Corte de caja', v_user, 'closing:' || p_cash_session_id::text);

  return v_session;
end;
$$;
