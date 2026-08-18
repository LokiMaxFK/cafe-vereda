-- Inventory is intentionally count-based. Sales never change a counted balance;
-- recipes only create immutable theoretical-consumption evidence at preparation time.

alter table public.inventory_items
  add column if not exists tolerance_quantity numeric(12,3) not null default 0;

create table public.inventory_recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  variant_name text not null default '',
  active boolean not null default true,
  updated_by uuid references public.staff_profiles(id),
  updated_at timestamptz not null default now(),
  unique (product_id, variant_name)
);

create table public.inventory_recipe_lines (
  recipe_id uuid not null references public.inventory_recipes(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  primary key (recipe_id, inventory_item_id)
);

create table public.inventory_counts (
  id uuid primary key,
  counted_at timestamptz not null,
  note text,
  recorded_by uuid not null references public.staff_profiles(id),
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index inventory_counts_time_idx on public.inventory_counts(counted_at desc);

create table public.inventory_count_lines (
  count_id uuid not null references public.inventory_counts(id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity >= 0),
  primary key (count_id, inventory_item_id)
);

create table public.inventory_usage_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid not null unique references public.order_items(id) on delete restrict,
  recipe_id uuid references public.inventory_recipes(id) on delete set null,
  product_name text not null,
  variant_name text,
  product_quantity integer not null check (product_quantity > 0),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index inventory_usage_events_time_idx on public.inventory_usage_events(occurred_at desc);

create table public.inventory_usage_lines (
  usage_event_id uuid not null references public.inventory_usage_events(id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  inventory_item_name text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  primary key (usage_event_id, inventory_item_id)
);

create or replace function public.replace_inventory_recipe(p_product_id uuid, p_variant_name text, p_lines jsonb)
returns public.inventory_recipes language plpgsql security definer set search_path = '' as $$
declare v_recipe public.inventory_recipes; v_line jsonb;
begin
  if auth.uid() is null or not private.is_manager() then raise exception 'Manager role required'; end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'Recipe lines must be an array'; end if;
  insert into public.inventory_recipes(product_id, variant_name, updated_by)
  values (p_product_id, coalesce(p_variant_name, ''), auth.uid())
  on conflict (product_id, variant_name) do update set active = true, updated_by = auth.uid(), updated_at = now()
  returning * into v_recipe;
  delete from public.inventory_recipe_lines where recipe_id = v_recipe.id;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into public.inventory_recipe_lines(recipe_id, inventory_item_id, quantity)
    values (v_recipe.id, (v_line->>'inventoryItemId')::uuid, (v_line->>'quantity')::numeric);
  end loop;
  return v_recipe;
end;
$$;

create or replace function public.record_inventory_count(p_count_id uuid, p_counted_at timestamptz, p_note text, p_lines jsonb, p_idempotency_key text)
returns public.inventory_counts language plpgsql security definer set search_path = '' as $$
declare v_count public.inventory_counts; v_line jsonb;
begin
  if auth.uid() is null or not private.is_manager() then raise exception 'Manager role required'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'At least one count line is required'; end if;
  select * into v_count from public.inventory_counts where idempotency_key = p_idempotency_key;
  if found then return v_count; end if;
  insert into public.inventory_counts(id, counted_at, note, recorded_by, idempotency_key)
  values (p_count_id, p_counted_at, nullif(trim(coalesce(p_note, '')), ''), auth.uid(), p_idempotency_key)
  returning * into v_count;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into public.inventory_count_lines(count_id, inventory_item_id, quantity)
    values (v_count.id, (v_line->>'itemId')::uuid, (v_line->>'quantity')::numeric);
  end loop;
  return v_count;
end;
$$;

create or replace function public.record_inventory_movement(p_movement_id uuid, p_item_id uuid, p_type public.inventory_movement_type, p_quantity numeric, p_note text, p_recorded_at timestamptz, p_idempotency_key text)
returns public.inventory_movements language plpgsql security definer set search_path = '' as $$
declare v_movement public.inventory_movements;
begin
  if auth.uid() is null or not private.is_manager() then raise exception 'Manager role required'; end if;
  if p_type not in ('entry', 'waste') then raise exception 'Only entry and waste movements are allowed'; end if;
  if p_quantity is null or p_quantity <= 0 or coalesce(length(trim(p_note)), 0) = 0 then raise exception 'Quantity and note are required'; end if;
  select * into v_movement from public.inventory_movements where idempotency_key = p_idempotency_key;
  if found then return v_movement; end if;
  insert into public.inventory_movements(id, inventory_item_id, movement_type, quantity, signed_quantity, note, recorded_by, created_at, idempotency_key)
  values (p_movement_id, p_item_id, p_type, p_quantity, case when p_type = 'entry' then p_quantity else -p_quantity end, trim(p_note), auth.uid(), coalesce(p_recorded_at, now()), p_idempotency_key)
  returning * into v_movement;
  return v_movement;
end;
$$;

create or replace function private.capture_recipe_usage()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_recipe public.inventory_recipes; v_event_id uuid;
begin
  if new.status <> 'prepared' or (TG_OP = 'UPDATE' and old.status = 'prepared') then return new; end if;
  select * into v_recipe from public.inventory_recipes
    where product_id = new.product_id and variant_name = coalesce(new.variant_name, '') and active = true;
  if not found then return new; end if;
  insert into public.inventory_usage_events(order_id, order_item_id, recipe_id, product_name, variant_name, product_quantity, occurred_at)
  values (new.order_id, new.id, v_recipe.id, new.product_name, new.variant_name, new.quantity, new.updated_at)
  on conflict (order_item_id) do nothing returning id into v_event_id;
  if v_event_id is not null then
    insert into public.inventory_usage_lines(usage_event_id, inventory_item_id, inventory_item_name, quantity)
    select v_event_id, ii.id, ii.name, rl.quantity * new.quantity
    from public.inventory_recipe_lines rl join public.inventory_items ii on ii.id = rl.inventory_item_id
    where rl.recipe_id = v_recipe.id;
  end if;
  return new;
end;
$$;

drop trigger if exists capture_recipe_usage on public.order_items;
create trigger capture_recipe_usage after insert or update on public.order_items
for each row execute function private.capture_recipe_usage();

alter table public.inventory_recipes enable row level security;
alter table public.inventory_recipe_lines enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.inventory_count_lines enable row level security;
alter table public.inventory_usage_events enable row level security;
alter table public.inventory_usage_lines enable row level security;

create policy "managers manage inventory recipes" on public.inventory_recipes for all to authenticated using (private.is_manager()) with check (private.is_manager());
create policy "managers manage inventory recipe lines" on public.inventory_recipe_lines for all to authenticated using (private.is_manager()) with check (private.is_manager());
create policy "managers read inventory counts" on public.inventory_counts for select to authenticated using (private.is_manager());
create policy "managers read inventory count lines" on public.inventory_count_lines for select to authenticated using (private.is_manager());
create policy "managers read inventory usage" on public.inventory_usage_events for select to authenticated using (private.is_manager());
create policy "managers read inventory usage lines" on public.inventory_usage_lines for select to authenticated using (private.is_manager());

revoke insert, update, delete on public.inventory_counts, public.inventory_count_lines, public.inventory_usage_events, public.inventory_usage_lines from authenticated;
grant select, insert, update, delete on public.inventory_recipes, public.inventory_recipe_lines to authenticated;
grant execute on function public.replace_inventory_recipe(uuid, text, jsonb), public.record_inventory_count(uuid, timestamptz, text, jsonb, text), public.record_inventory_movement(uuid, uuid, public.inventory_movement_type, numeric, text, timestamptz, text) to authenticated;
