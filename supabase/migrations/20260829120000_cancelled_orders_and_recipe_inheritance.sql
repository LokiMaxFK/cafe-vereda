-- Cuentas canceladas inmutables, y la receta base heredada por las presentaciones.
--
-- Tres fallos que comparten desenlace: el servidor aceptaba en silencio algo que no debía, o
-- descontaba en silencio algo que nadie pidió.
--
-- 1. Una cuenta cancelada se podía volver a finalizar y cobrar. La única defensa era la política RLS
--    "staff update open orders", cuyo `using` no alcanza una fila cancelada: el UPDATE afectaba cero
--    filas **sin lanzar excepción**, sync_offline_operations devolvía 'synced' y el dispositivo daba
--    por cerrada una venta que aquí sigue cancelada. Ticket impreso, efectivo en el cajón, ningún
--    registro que lo respalde. Ahora el estado terminal se comprueba antes de escribir, y
--    prevent_immutable_changes trata 'cancelled' como ya trataba 'closed' y 'reversed'.
--
-- 2. El disparador de consumo descontaba insumos en cualquier cierre, sin mirar de qué estado venía:
--    cerrar una cuenta cancelada restaba producto real del inventario por una venta anulada.
--
-- 3. La receta capturada en «Sin presentación / receta base» no se aplicaba a las presentaciones. El
--    join exigía `r.variant_name = coalesce(oi.variant_name,'')`, así que un producto vendido siempre
--    como «Chico»/«Grande» con receta sólo en la base **no descontaba nada**: el consumo teórico
--    salía en cero y la tabla de indicadores achacaba toda la merma a la diferencia. La interfaz ya
--    llamaba «base» a esa receta; ahora el servidor cumple lo que la etiqueta promete.

-- ---------------------------------------------------------------------------------------------
-- 1. Una cuenta cancelada es tan inmutable como una cerrada
-- ---------------------------------------------------------------------------------------------

create or replace function private.prevent_immutable_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'DELETE' and old.status in ('closed', 'reversed', 'cancelled') then raise exception 'Closed, reversed or cancelled sales are immutable'; end if;
  if TG_OP = 'UPDATE' and old.status = 'reversed' then raise exception 'Reversed sales are immutable'; end if;
  -- Cancelar es terminal: el registro se conserva para auditoría y no vuelve a la vida. Todas las
  -- escrituras del cliente pasan por sync_offline_operations o por una RPC, así que no hay ninguna
  -- ruta legítima que necesite actualizar una cuenta ya cancelada.
  if TG_OP = 'UPDATE' and old.status = 'cancelled' then raise exception 'Cancelled orders are immutable'; end if;
  if TG_OP = 'UPDATE' and old.status = 'closed' and not (new.status = 'reversed' and private.is_manager() and new.reversed_by = auth.uid() and coalesce(length(trim(new.reversal_reason)),0) > 0) then
    raise exception 'Closed sales can only be reversed by a manager';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. El sincronizador rechaza con motivo en vez de callar
-- ---------------------------------------------------------------------------------------------

-- Se reescribe entera partiendo de 20260824120000 (la versión vigente): la función no admite parches
-- parciales. El único cambio es la guarda de estado terminal marcada más abajo.

create or replace function public.sync_offline_operations(p_operations jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_operation jsonb; v_payload jsonb; v_item jsonb; v_payment jsonb; v_modifier jsonb;
  v_results jsonb := '[]'::jsonb; v_modifiers jsonb; v_batches uuid[] := array[]::uuid[];
  v_id uuid; v_device uuid; v_entity uuid; v_table_id uuid; v_product_id uuid; v_batch_id uuid;
  v_inserted boolean; v_target_status public.order_status; v_batch_number integer;
  v_type text; v_reversal_reason text; v_folio bigint;
  v_subaccount jsonb; v_share jsonb; v_moved_cents integer;
  v_current_status public.order_status;
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

      -- Una cuenta liquidada no se reabre. Antes esto lo sostenía sola la política RLS "staff update
      -- open orders": la operación entraba, el UPDATE no alcanzaba la fila, afectaba cero filas **sin
      -- lanzar**, y la función devolvía 'synced'. El dispositivo daba por cobrada y cerrada una cuenta
      -- que el servidor sigue teniendo por cancelada, con el ticket impreso y el efectivo en el cajón.
      -- Se comprueba antes de tocar nada para que el rechazo llegue con un motivo y la operación caiga
      -- en 'review_required' con su lastError, en vez de desaparecer de la cola.
      select o.status into v_current_status from public.orders o where o.id = v_entity;
      if v_current_status in ('closed','cancelled','reversed') then
        if v_current_status is distinct from v_target_status then
          raise exception 'La cuenta ya está en estado % y no admite la operación % (destino %)', v_current_status, v_type, v_target_status;
        end if;
        -- Ya está en ese estado —dos dispositivos cancelaron la misma cuenta, por ejemplo—: no hay
        -- nada que escribir, y seguir adelante chocaría contra prevent_immutable_changes por un
        -- duplicado inofensivo. Se da por aplicada y se pasa a la siguiente operación.
        v_results := v_results || jsonb_build_array(jsonb_build_object('id',v_id,'status','synced'));
        continue;
      end if;

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
        insert into public.payments(id, order_id, method, amount_cents, tip_cents, received_cents, subaccount_id, recorded_by, idempotency_key, created_at)
        values ((v_payment->>'id')::uuid, v_entity, (v_payment->>'method')::public.payment_method,
          round((v_payment->>'amount')::numeric * 100)::integer, round(coalesce((v_payment->>'tip')::numeric,0) * 100)::integer,
          round(nullif(v_payment->>'received','')::numeric * 100)::integer,
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

-- ---------------------------------------------------------------------------------------------
-- 3. El consumo sólo lo genera una venta viva, y la receta base se hereda
-- ---------------------------------------------------------------------------------------------

create or replace function private.apply_sale_inventory_consumption()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;
begin
  -- Se exige el estado de partida, no sólo que el destino sea 'closed': un cierre venido de
  -- 'cancelled' descontaría producto real por una venta anulada. Con la sección 1 esa transición ya
  -- no llega hasta aquí, pero el disparador es la última línea antes de tocar el inventario y no
  -- debe depender de que otro la haya frenado.
  if new.status = 'closed' and old.status in ('open','preparing','ready','served') then
    -- validate_order_close ya exige closed_by = auth.uid(); el coalesce es cinturón y tirantes,
    -- porque recorded_by es NOT NULL y opened_by nunca lo es.
    v_actor := coalesce(new.closed_by, auth.uid(), new.opened_by);

    insert into public.inventory_movements(
      inventory_item_id, movement_type, quantity, signed_quantity, note, recorded_by, created_at, idempotency_key)
    select
      rl.inventory_item_id,
      'daily_consumption'::public.inventory_movement_type,
       round(sum(rl.quantity * oi.quantity), 3),
      -round(sum(rl.quantity * oi.quantity), 3),
      'Venta folio ' || new.folio::text,
      v_actor,
      coalesce(new.closed_at, now()),
      'sale:' || new.id::text || ':' || rl.inventory_item_id::text
    from public.order_items oi
    -- Una receta por renglón: la de su presentación si existe, y si no la base (variant_name = '').
    -- El `order by ... desc` es lo que da la prioridad, y el `limit 1` lo que impide que un producto
    -- con receta propia **y** base descuente las dos. Sin receta el lateral no devuelve filas y el
    -- renglón desaparece del cálculo, que es justo lo que debe pasar.
    cross join lateral (
      select r.id
        from public.inventory_recipes r
       where r.product_id = oi.product_id
         and r.active
         and r.variant_name in (coalesce(oi.variant_name, ''), '')
       order by (r.variant_name = coalesce(oi.variant_name, '')) desc
       limit 1
    ) recipe
    join public.inventory_recipe_lines rl on rl.recipe_id = recipe.id
    where oi.order_id = new.id
      and oi.status <> 'cancelled'
      and oi.product_id is not null
    group by rl.inventory_item_id
    having round(sum(rl.quantity * oi.quantity), 3) > 0
    -- Un movimiento agregado por (orden, insumo): el group by es lo que hace única la clave.
    on conflict (idempotency_key) do nothing;

    return new;
  end if;

  if old.status = 'closed' and new.status is distinct from 'closed' then
    -- Reversión de una venta ya cerrada: se compensa con un movimiento positivo por cada consumo que
    -- esta orden generó. Nunca se borra el movimiento original. Es 'adjustment' y no 'entry' porque
    -- analyzeRestockPattern promedia los intervalos entre entradas para predecir recargas, y una
    -- entrada fantasma envenenaría esa predicción. Lee los movimientos ya escritos, así que la
    -- herencia de receta de arriba no le afecta: compensa exactamente lo que se descontó.
    v_actor := coalesce(new.reversed_by, auth.uid(), new.opened_by);

    insert into public.inventory_movements(
      inventory_item_id, movement_type, quantity, signed_quantity, note, recorded_by, created_at, idempotency_key)
    select
      m.inventory_item_id,
      'adjustment'::public.inventory_movement_type,
      m.quantity,
      m.quantity,
      'Reversión de venta folio ' || new.folio::text,
      v_actor,
      coalesce(new.reversed_at, now()),
      'sale-reversal:' || new.id::text || ':' || m.inventory_item_id::text
    from public.inventory_movements m
    where m.movement_type = 'daily_consumption'
      and m.idempotency_key like 'sale:' || new.id::text || ':%'
    on conflict (idempotency_key) do nothing;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
