create extension if not exists pgcrypto;

create type public.app_role as enum ('barista', 'manager');
create type public.order_type as enum ('table', 'takeaway');
create type public.order_status as enum ('open', 'preparing', 'ready', 'closed', 'cancelled', 'reversed');
create type public.order_item_status as enum ('pending', 'dispatched', 'prepared', 'cancelled');
create type public.payment_method as enum ('cash', 'card', 'transfer');
create type public.cash_movement_type as enum ('opening', 'withdrawal', 'adjustment', 'closing');
create type public.inventory_movement_type as enum ('entry', 'daily_consumption', 'waste', 'withdrawal', 'adjustment');
create type public.sync_status as enum ('pending', 'syncing', 'synced', 'review_required');

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.staff_profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  username text not null unique check (username ~ '^[a-z0-9._-]{2,40}$'),
  display_name text not null,
  role public.app_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.devices (
  id uuid primary key,
  name text not null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position integer not null default 0,
  active boolean not null default true,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id),
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  available boolean not null default true,
  active boolean not null default true,
  schedule_label text,
  available_from time,
  available_until time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  active boolean not null default true,
  unique (product_id, name)
);

create table public.modifiers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price_cents integer not null check (price_cents >= 0),
  active boolean not null default true
);

create table public.product_modifiers (
  product_id uuid not null references public.products(id) on delete cascade,
  modifier_id uuid not null references public.modifiers(id) on delete cascade,
  primary key (product_id, modifier_id)
);

create table public.cafe_tables (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique check (number > 0),
  seats integer not null check (seats > 0),
  shape text not null check (shape in ('round', 'square', 'rectangular')),
  x numeric(5,2) not null check (x between 0 and 100),
  y numeric(5,2) not null check (y between 0 and 100),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create sequence public.order_folio_seq start 1000;

create table public.orders (
  id uuid primary key,
  folio bigint not null unique default nextval('public.order_folio_seq'),
  order_type public.order_type not null,
  table_id uuid references public.cafe_tables(id),
  customer_name text,
  status public.order_status not null default 'open',
  opened_by uuid not null references public.staff_profiles(id),
  closed_by uuid references public.staff_profiles(id),
  reversed_by uuid references public.staff_profiles(id),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  discount_reason text,
  reversal_reason text,
  device_id uuid not null references public.devices(id),
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  reversed_at timestamptz,
  sync_status public.sync_status not null default 'synced',
  check ((order_type = 'table' and table_id is not null) or (order_type = 'takeaway' and table_id is null)),
  check ((discount_cents = 0 and discount_reason is null) or (discount_cents > 0 and length(trim(discount_reason)) > 0))
);

create unique index one_active_order_per_table on public.orders(table_id)
  where table_id is not null and status in ('open', 'preparing', 'ready');
create index orders_status_updated_idx on public.orders(status, updated_at desc);
create index orders_opened_by_idx on public.orders(opened_by, opened_at desc);

create table public.order_items (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid references public.products(id),
  product_name text not null,
  variant_name text,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  modifiers jsonb not null default '[]'::jsonb check (jsonb_typeof(modifiers) = 'array'),
  notes text,
  status public.order_item_status not null default 'pending',
  cancelled_by uuid references public.staff_profiles(id),
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index order_items_order_idx on public.order_items(order_id, created_at);

create table public.dispatch_batches (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  batch_number integer not null check (batch_number > 0),
  batch_type text not null default 'command' check (batch_type in ('command', 'cancellation')),
  created_by uuid not null references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  unique (order_id, batch_number)
);

create table public.dispatch_batch_items (
  batch_id uuid not null references public.dispatch_batches(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  immutable_snapshot jsonb not null,
  primary key (batch_id, order_item_id)
);

create table public.print_events (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.dispatch_batches(id),
  order_id uuid not null references public.orders(id),
  document_type text not null check (document_type in ('command', 'cancellation', 'ticket')),
  copy_number integer not null default 0 check (copy_number >= 0),
  printed_by uuid not null references public.staff_profiles(id),
  printed_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  method public.payment_method not null,
  amount_cents integer not null check (amount_cents > 0),
  tip_cents integer not null default 0 check (tip_cents >= 0),
  recorded_by uuid not null references public.staff_profiles(id),
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid not null references public.staff_profiles(id),
  opening_fund_cents integer not null check (opening_fund_cents >= 0),
  opened_at timestamptz not null default now(),
  closed_by uuid references public.staff_profiles(id),
  closed_at timestamptz,
  counted_cash_cents integer check (counted_cash_cents >= 0),
  expected_cash_cents integer,
  difference_cents integer
);
create unique index one_open_cash_session on public.cash_sessions((true)) where closed_at is null;

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references public.cash_sessions(id),
  movement_type public.cash_movement_type not null,
  amount_cents integer not null check (amount_cents >= 0),
  note text,
  recorded_by uuid not null references public.staff_profiles(id),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  check (movement_type not in ('withdrawal', 'adjustment') or length(trim(note)) > 0)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit text not null,
  current_quantity numeric(12,3) not null default 0,
  minimum_quantity numeric(12,3) not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id),
  movement_type public.inventory_movement_type not null,
  quantity numeric(12,3) not null check (quantity > 0),
  signed_quantity numeric(12,3) not null,
  note text not null check (length(trim(note)) > 0),
  recorded_by uuid not null references public.staff_profiles(id),
  idempotency_key text unique,
  created_at timestamptz not null default now()
);
create index inventory_movements_item_idx on public.inventory_movements(inventory_item_id, created_at desc);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  order_item_id uuid references public.order_items(id),
  incident_type text not null check (incident_type in ('item_cancellation', 'order_cancellation', 'sale_reversal', 'refund')),
  reason text not null check (length(trim(reason)) > 0),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  created_by uuid not null references public.staff_profiles(id),
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.staff_profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  idempotency_key text,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log(entity_type, entity_id, created_at desc);

create table public.offline_operations (
  id uuid primary key,
  idempotency_key text not null unique,
  device_id uuid not null references public.devices(id),
  operation_type text not null,
  entity_id uuid not null,
  payload jsonb not null,
  submitted_by uuid not null references public.staff_profiles(id),
  status public.sync_status not null default 'synced',
  error_message text,
  created_at timestamptz not null,
  processed_at timestamptz not null default now()
);

create or replace function private.current_role()
returns public.app_role language sql stable set search_path = '' as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role')::public.app_role, 'barista'::public.app_role)
$$;

create or replace function private.is_manager()
returns boolean language sql stable set search_path = '' as $$
  select private.current_role() = 'manager'::public.app_role
$$;

create or replace function private.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log(actor_id, action, entity_type, entity_id, before_data, after_data)
  values (auth.uid(), lower(TG_OP), TG_TABLE_NAME, coalesce(new.id, old.id),
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;

create trigger audit_orders after insert or update or delete on public.orders for each row execute function private.audit_row();
create trigger audit_order_items after insert or update or delete on public.order_items for each row execute function private.audit_row();
create trigger audit_payments after insert or update or delete on public.payments for each row execute function private.audit_row();
create trigger audit_cash_movements after insert or update or delete on public.cash_movements for each row execute function private.audit_row();
create trigger audit_incidents after insert or update or delete on public.incidents for each row execute function private.audit_row();

create or replace function private.prevent_immutable_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'DELETE' and old.status in ('closed', 'reversed') then raise exception 'Closed or reversed sales are immutable'; end if;
  if TG_OP = 'UPDATE' and old.status = 'reversed' then raise exception 'Reversed sales are immutable'; end if;
  if TG_OP = 'UPDATE' and old.status = 'closed' and not (new.status = 'reversed' and private.is_manager() and new.reversed_by = auth.uid() and coalesce(length(trim(new.reversal_reason)),0) > 0) then
    raise exception 'Closed sales can only be reversed by a manager';
  end if;
  return new;
end;
$$;
create trigger immutable_sales before update or delete on public.orders for each row execute function private.prevent_immutable_changes();

create or replace function private.validate_order_close()
returns trigger language plpgsql set search_path = '' as $$
declare v_total bigint; v_paid bigint;
begin
  if new.status = 'closed' and old.status <> 'closed' then
    if new.closed_by <> auth.uid() or new.closed_at is null then raise exception 'Invalid close attribution'; end if;
    select coalesce(sum(quantity * (unit_price_cents + coalesce((select sum((m->>'price')::integer) from jsonb_array_elements(modifiers) m),0))),0) - new.discount_cents
      into v_total from public.order_items where order_id = new.id and status <> 'cancelled';
    select coalesce(sum(amount_cents),0) into v_paid from public.payments where order_id = new.id;
    if v_paid < v_total then raise exception 'Insufficient payment'; end if;
  end if;
  return new;
end;
$$;
create trigger validate_order_close before update on public.orders for each row execute function private.validate_order_close();

create or replace function private.prevent_batch_mutation()
returns trigger language plpgsql set search_path = '' as $$ begin raise exception 'Dispatch batches are immutable'; end; $$;
create trigger immutable_dispatch_batches before update or delete on public.dispatch_batches for each row execute function private.prevent_batch_mutation();
create trigger immutable_dispatch_items before update or delete on public.dispatch_batch_items for each row execute function private.prevent_batch_mutation();

create or replace function public.open_cash_session(p_opening_fund_cents integer)
returns public.cash_sessions language plpgsql security invoker set search_path = '' as $$
declare v_session public.cash_sessions;
begin
  if not private.is_manager() then raise exception 'Manager role required'; end if;
  if p_opening_fund_cents < 0 then raise exception 'Invalid opening fund'; end if;
  insert into public.cash_sessions(opened_by, opening_fund_cents) values (auth.uid(), p_opening_fund_cents) returning * into v_session;
  insert into public.cash_movements(cash_session_id, movement_type, amount_cents, note, recorded_by, idempotency_key)
  values (v_session.id, 'opening', p_opening_fund_cents, 'Fondo inicial', auth.uid(), 'opening:' || v_session.id::text);
  return v_session;
end;
$$;

create or replace function public.record_cash_movement(p_cash_session_id uuid, p_type public.cash_movement_type, p_amount_cents integer, p_note text, p_idempotency_key text)
returns public.cash_movements language plpgsql security invoker set search_path = '' as $$
declare v_movement public.cash_movements;
begin
  if p_type in ('opening','closing') and not private.is_manager() then raise exception 'Manager role required'; end if;
  if p_type in ('withdrawal','adjustment') and coalesce(length(trim(p_note)),0) = 0 then raise exception 'Note required'; end if;
  insert into public.cash_movements(cash_session_id, movement_type, amount_cents, note, recorded_by, idempotency_key)
  values (p_cash_session_id, p_type, p_amount_cents, p_note, auth.uid(), p_idempotency_key)
  on conflict (idempotency_key) do update set idempotency_key = excluded.idempotency_key returning * into v_movement;
  return v_movement;
end;
$$;

create or replace function public.dispatch_order_items(p_order_id uuid, p_item_ids uuid[], p_batch_id uuid)
returns public.dispatch_batches language plpgsql security invoker set search_path = '' as $$
declare v_batch public.dispatch_batches; v_count integer;
begin
  select count(*) into v_count from public.order_items where order_id = p_order_id and id = any(p_item_ids) and status = 'pending';
  if v_count <> cardinality(p_item_ids) then raise exception 'Only new pending items can be dispatched'; end if;
  insert into public.dispatch_batches(id, order_id, batch_number, created_by)
  select p_batch_id, p_order_id, coalesce(max(batch_number),0)+1, auth.uid() from public.dispatch_batches where order_id = p_order_id returning * into v_batch;
  insert into public.dispatch_batch_items(batch_id, order_item_id, immutable_snapshot)
  select p_batch_id, oi.id, jsonb_build_object('id',oi.id,'name',oi.product_name,'variant',oi.variant_name,'quantity',oi.quantity,'unit_price_cents',oi.unit_price_cents,'modifiers',oi.modifiers,'notes',oi.notes)
  from public.order_items oi where oi.order_id = p_order_id and oi.id = any(p_item_ids);
  update public.order_items set status = 'dispatched', updated_at = now() where id = any(p_item_ids);
  update public.orders set status = 'preparing', updated_at = now() where id = p_order_id and status in ('open','preparing');
  return v_batch;
end;
$$;

create or replace function public.close_order(p_order_id uuid)
returns public.orders language plpgsql security invoker set search_path = '' as $$
declare v_order public.orders; v_total bigint; v_paid bigint;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.status in ('closed','reversed','cancelled') then raise exception 'Order cannot be closed'; end if;
  select coalesce(sum(quantity * (unit_price_cents + coalesce((select sum((m->>'price')::integer) from jsonb_array_elements(modifiers) m),0))),0) - v_order.discount_cents
    into v_total from public.order_items where order_id = p_order_id and status <> 'cancelled';
  select coalesce(sum(amount_cents),0) into v_paid from public.payments where order_id = p_order_id;
  if v_paid < v_total then raise exception 'Insufficient payment'; end if;
  update public.orders set status = 'closed', closed_by = auth.uid(), closed_at = now(), updated_at = now() where id = p_order_id returning * into v_order;
  return v_order;
end;
$$;

create or replace function public.reverse_sale(p_order_id uuid, p_reason text)
returns public.orders language plpgsql security invoker set search_path = '' as $$
declare v_order public.orders;
begin
  if not private.is_manager() then raise exception 'Manager role required'; end if;
  if coalesce(length(trim(p_reason)),0) = 0 then raise exception 'Reason required'; end if;
  select * into v_order from public.orders where id = p_order_id and status = 'closed' for update;
  if not found then raise exception 'Closed order not found'; end if;
  update public.orders set status = 'reversed', reversed_by = auth.uid(), reversed_at = now(), reversal_reason = trim(p_reason), updated_at = now() where id = p_order_id returning * into v_order;
  insert into public.incidents(order_id, incident_type, reason, amount_cents, created_by)
  select p_order_id, 'sale_reversal', trim(p_reason), coalesce(sum(amount_cents),0), auth.uid() from public.payments where order_id = p_order_id;
  return v_order;
end;
$$;

create or replace function public.sync_offline_operations(p_operations jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_operation jsonb; v_payload jsonb; v_item jsonb; v_payment jsonb; v_modifier jsonb;
  v_results jsonb := '[]'::jsonb; v_modifiers jsonb; v_batches uuid[] := array[]::uuid[];
  v_id uuid; v_device uuid; v_entity uuid; v_table_id uuid; v_product_id uuid; v_batch_id uuid;
  v_inserted boolean; v_target_status public.order_status; v_batch_number integer;
begin
  if jsonb_typeof(p_operations) <> 'array' then raise exception 'Operations must be an array'; end if;
  for v_operation in select * from jsonb_array_elements(p_operations) order by (value->>'createdAt')::timestamptz loop
    v_id := (v_operation->>'id')::uuid; v_device := (v_operation->>'deviceId')::uuid; v_entity := (v_operation->>'entityId')::uuid;
    insert into public.devices(id, name, last_seen_at) values (v_device, 'Dispositivo POS', now())
      on conflict (id) do update set last_seen_at = excluded.last_seen_at;
    insert into public.offline_operations(id, idempotency_key, device_id, operation_type, entity_id, payload, submitted_by, created_at)
    values (v_id, v_operation->>'idempotencyKey', v_device, v_operation->>'type', v_entity, v_operation->'payload', auth.uid(), (v_operation->>'createdAt')::timestamptz)
    on conflict (idempotency_key) do nothing;
    v_inserted := found;
    if not v_inserted then
      v_results := v_results || jsonb_build_array(jsonb_build_object('id',v_id,'status','synced','duplicate',true));
      continue;
    end if;

    v_payload := v_operation->'payload';
    if v_operation->>'type' in ('create_order','add_order_item','update_order_item','dispatch_order_items','mark_order_ready','record_payment','apply_discount','cancel_dispatched_item','cancel_order','reverse_sale','close_order') then
      v_target_status := (v_payload->>'status')::public.order_status;
      v_table_id := null;
      if v_payload->>'tableId' ~ '^t[0-9]+$' then
        select id into v_table_id from public.cafe_tables where number = substring(v_payload->>'tableId' from 2)::integer;
      end if;

      insert into public.orders(id, order_type, table_id, customer_name, status, opened_by, discount_cents, discount_reason, device_id, opened_at, updated_at, sync_status)
      values (v_entity, (v_payload->>'type')::public.order_type, v_table_id, nullif(v_payload->>'customerName',''), 'open', auth.uid(),
        round(coalesce((v_payload->>'discount')::numeric,0) * 100)::integer, nullif(v_payload->>'discountReason',''), v_device,
        (v_payload->>'openedAt')::timestamptz, (v_payload->>'updatedAt')::timestamptz, 'synced')
      on conflict (id) do update set
        customer_name = excluded.customer_name,
        discount_cents = excluded.discount_cents,
        discount_reason = excluded.discount_reason,
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

      if v_target_status = 'reversed' then
        if not private.is_manager() then raise exception 'Manager role required'; end if;
        update public.orders set status = 'reversed', reversed_by = auth.uid(), reversed_at = (v_payload->>'updatedAt')::timestamptz,
          reversal_reason = replace(coalesce(v_payload->>'discountReason','Reversión'), 'Reversión: ', ''), updated_at = (v_payload->>'updatedAt')::timestamptz, sync_status = 'synced'
        where id = v_entity and status = 'closed';
        insert into public.incidents(order_id, incident_type, reason, amount_cents, created_by)
        select v_entity, 'sale_reversal', replace(coalesce(v_payload->>'discountReason','Reversión'), 'Reversión: ', ''), coalesce(sum(amount_cents),0), auth.uid()
        from public.payments where order_id = v_entity
        having not exists (select 1 from public.incidents where order_id = v_entity and incident_type = 'sale_reversal');
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

do $$ declare t text; begin
  foreach t in array array['staff_profiles','devices','categories','products','product_variants','modifiers','product_modifiers','cafe_tables','orders','order_items','dispatch_batches','dispatch_batch_items','print_events','payments','cash_sessions','cash_movements','inventory_items','inventory_movements','incidents','audit_log','offline_operations'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy "staff read own profile managers read all" on public.staff_profiles for select to authenticated using (id = auth.uid() or private.is_manager());
create policy "managers manage staff profiles" on public.staff_profiles for all to authenticated using (private.is_manager()) with check (private.is_manager());
create policy "authenticated read catalog" on public.categories for select to authenticated using (true);
create policy "authenticated read products" on public.products for select to authenticated using (true);
create policy "authenticated read variants" on public.product_variants for select to authenticated using (true);
create policy "authenticated read modifiers" on public.modifiers for select to authenticated using (true);
create policy "authenticated read product modifiers" on public.product_modifiers for select to authenticated using (true);
create policy "managers manage categories" on public.categories for all to authenticated using (private.is_manager()) with check (private.is_manager());
create policy "managers manage products" on public.products for all to authenticated using (private.is_manager()) with check (private.is_manager());
create policy "managers manage variants" on public.product_variants for all to authenticated using (private.is_manager()) with check (private.is_manager());
create policy "managers manage modifiers" on public.modifiers for all to authenticated using (private.is_manager()) with check (private.is_manager());
create policy "managers manage product modifiers" on public.product_modifiers for all to authenticated using (private.is_manager()) with check (private.is_manager());
create policy "authenticated read tables" on public.cafe_tables for select to authenticated using (true);
create policy "managers manage tables" on public.cafe_tables for all to authenticated using (private.is_manager()) with check (private.is_manager());
create policy "authenticated manage devices" on public.devices for all to authenticated using (true) with check (true);
create policy "authenticated read orders" on public.orders for select to authenticated using (true);
create policy "authenticated create orders" on public.orders for insert to authenticated with check (opened_by = auth.uid());
create policy "staff update open orders" on public.orders for update to authenticated using (status in ('open','preparing','ready')) with check (status in ('open','preparing','ready','cancelled','closed') and (discount_cents = 0 or private.is_manager()) and (status <> 'closed' or closed_by = auth.uid()));
create policy "managers reverse closed orders" on public.orders for update to authenticated using (status = 'closed' and private.is_manager()) with check (status = 'reversed' and reversed_by = auth.uid() and private.is_manager());
create policy "authenticated read order items" on public.order_items for select to authenticated using (true);
create policy "staff add order items" on public.order_items for insert to authenticated with check (exists(select 1 from public.orders o where o.id = order_id and o.status in ('open','preparing','ready')));
create policy "staff update pending items" on public.order_items for update to authenticated using (exists(select 1 from public.orders o where o.id = order_id and o.status in ('open','preparing','ready'))) with check (true);
create policy "staff delete pending items" on public.order_items for delete to authenticated using (status = 'pending' and exists(select 1 from public.orders o where o.id = order_id and o.status in ('open','preparing','ready')));
create policy "authenticated read dispatches" on public.dispatch_batches for select to authenticated using (true);
create policy "authenticated create dispatches" on public.dispatch_batches for insert to authenticated with check (created_by = auth.uid());
create policy "authenticated read dispatch items" on public.dispatch_batch_items for select to authenticated using (true);
create policy "authenticated create dispatch items" on public.dispatch_batch_items for insert to authenticated with check (true);
create policy "authenticated read print events" on public.print_events for select to authenticated using (true);
create policy "authenticated log print events" on public.print_events for insert to authenticated with check (printed_by = auth.uid());
create policy "authenticated read payments" on public.payments for select to authenticated using (true);
create policy "authenticated record payments" on public.payments for insert to authenticated with check (recorded_by = auth.uid() and exists(select 1 from public.orders o where o.id = order_id and o.status in ('open','preparing','ready')));
create policy "authenticated read cash sessions" on public.cash_sessions for select to authenticated using (true);
create policy "managers manage cash sessions" on public.cash_sessions for all to authenticated using (private.is_manager()) with check (private.is_manager());
create policy "authenticated read cash movements" on public.cash_movements for select to authenticated using (true);
create policy "staff record withdrawals managers all" on public.cash_movements for insert to authenticated with check (recorded_by = auth.uid() and (movement_type = 'withdrawal' or private.is_manager()));
create policy "managers read inventory" on public.inventory_items for select to authenticated using (private.is_manager());
create policy "managers manage inventory" on public.inventory_items for all to authenticated using (private.is_manager()) with check (private.is_manager());
create policy "managers read inventory movements" on public.inventory_movements for select to authenticated using (private.is_manager());
create policy "managers create inventory movements" on public.inventory_movements for insert to authenticated with check (private.is_manager() and recorded_by = auth.uid());
create policy "authenticated read incidents" on public.incidents for select to authenticated using (true);
create policy "staff create incidents" on public.incidents for insert to authenticated with check (created_by = auth.uid());
create policy "managers read audit" on public.audit_log for select to authenticated using (private.is_manager());
create policy "authenticated read own offline operations" on public.offline_operations for select to authenticated using (submitted_by = auth.uid() or private.is_manager());
create policy "authenticated create offline operations" on public.offline_operations for insert to authenticated with check (submitted_by = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update on public.orders to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;
grant select, insert on public.payments, public.dispatch_batches, public.dispatch_batch_items, public.print_events, public.incidents, public.offline_operations to authenticated;
grant select, insert, update on public.devices to authenticated;
grant select on public.categories, public.products, public.product_variants, public.modifiers, public.product_modifiers, public.cafe_tables, public.staff_profiles, public.cash_sessions, public.cash_movements, public.inventory_items, public.inventory_movements, public.audit_log to authenticated;
grant insert, update on public.categories, public.products, public.product_variants, public.modifiers, public.product_modifiers, public.cafe_tables, public.staff_profiles, public.cash_sessions, public.inventory_items to authenticated;
grant insert on public.cash_movements, public.inventory_movements to authenticated;
grant usage, select on sequence public.order_folio_seq to authenticated;
grant usage on schema private to authenticated;
grant execute on function private.current_role(), private.is_manager() to authenticated;
grant execute on function public.open_cash_session(integer), public.record_cash_movement(uuid,public.cash_movement_type,integer,text,text), public.dispatch_order_items(uuid,uuid[],uuid), public.close_order(uuid), public.reverse_sale(uuid,text), public.sync_offline_operations(jsonb) to authenticated;

alter table realtime.messages enable row level security;
create policy "authenticated receive branch broadcasts" on realtime.messages for select to authenticated using ((select realtime.topic()) = 'branch:main');

create or replace function private.broadcast_order_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.broadcast_changes('branch:main', TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, new, old);
  return coalesce(new, old);
end;
$$;
create trigger broadcast_orders after insert or update or delete on public.orders for each row execute function private.broadcast_order_changes();
create trigger broadcast_order_items after insert or update or delete on public.order_items for each row execute function private.broadcast_order_changes();
create trigger broadcast_tables after insert or update or delete on public.cafe_tables for each row execute function private.broadcast_order_changes();
