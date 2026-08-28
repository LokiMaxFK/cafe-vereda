-- Administración de insumos y descuento de existencias al vender.
--
-- Esta migración DEROGA la invariante que encabeza 20260817210000_inventory_counting_and_recipes.sql
-- («Sales never change a counted balance»). Aquella decisión dejaba el inventario como un registro
-- puramente contable: los conteos eran la única verdad y las recetas sólo producían evidencia
-- teórica. En la operación real el gerente necesita ver bajar la existencia conforme se vende, así
-- que a partir de aquí una orden cerrada descuenta de cada insumo lo que dice su receta.
--
-- Tres piezas:
--   1. Unidades con familia (masa g/kg, volumen ml/L, conteo pza/paquete/bolsa). Cada insumo sigue
--      guardando TODO en su unidad canónica `inventory_items.unit`; la interfaz convierte antes de
--      enviar. Cambiar la unidad dentro de la misma familia reescala su histórico.
--   2. Alta, edición y baja de insumos como RPC, para que la aplicación pueda encolarlas offline
--      igual que ya hace con conteos y movimientos.
--   3. Un disparador sobre `orders` que inserta el consumo al cerrar y lo compensa al revertir.

-- ---------------------------------------------------------------------------------------------
-- 1. Unidades
-- ---------------------------------------------------------------------------------------------

-- Un gramo no se convierte en pieza. Devolver null para una unidad desconocida es, además, la
-- validación: no hace falta repetir la lista blanca en cada función.
create or replace function private.inventory_unit_family(p_unit text)
returns text language sql immutable set search_path = '' as $$
  select case p_unit
    when 'g' then 'masa'      when 'kg' then 'masa'
    when 'ml' then 'volumen'  when 'L' then 'volumen'
    when 'pza' then 'pza'     when 'paquete' then 'paquete'  when 'bolsa' then 'bolsa'
  end
$$;

-- Cuántas unidades base (g, ml) caben en una unidad. Las familias de conteo valen 1.
create or replace function private.inventory_unit_factor(p_unit text)
returns numeric language sql immutable set search_path = '' as $$
  select case p_unit when 'kg' then 1000 when 'L' then 1000 else 1 end
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Recetas: recordar en qué unidad se capturó cada renglón
-- ---------------------------------------------------------------------------------------------

-- Sólo presentación: la cantidad se sigue guardando en la unidad canónica del insumo. Sin esto,
-- quien escribe «180 ml» de un insumo medido en litros vuelve a abrir la receta y lee «0.18 L».
-- Nullable a propósito: las filas existentes ya significan «la unidad del insumo».
alter table public.inventory_recipe_lines
  add column if not exists unit text;

alter table public.inventory_recipe_lines
  drop constraint if exists inventory_recipe_lines_unit_check;
alter table public.inventory_recipe_lines
  add constraint inventory_recipe_lines_unit_check
  check (unit is null or unit in ('g', 'kg', 'ml', 'L', 'pza', 'paquete', 'bolsa'));

-- La unidad viaja dentro de `p_lines`, así que la firma no cambia y basta `create or replace`:
-- un `drop function` tiraría en silencio el `grant execute` de 20260817210000.
create or replace function public.replace_inventory_recipe(p_product_id uuid, p_variant_name text, p_lines jsonb)
returns public.inventory_recipes language plpgsql security definer set search_path = '' as $$
declare v_recipe public.inventory_recipes; v_line jsonb; v_unit text; v_item_unit text;
begin
  if auth.uid() is null or not private.is_manager() then raise exception 'Manager role required'; end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'Recipe lines must be an array'; end if;
  insert into public.inventory_recipes(product_id, variant_name, updated_by)
  values (p_product_id, coalesce(p_variant_name, ''), auth.uid())
  on conflict (product_id, variant_name) do update set active = true, updated_by = auth.uid(), updated_at = now()
  returning * into v_recipe;
  delete from public.inventory_recipe_lines where recipe_id = v_recipe.id;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_unit := nullif(trim(coalesce(v_line->>'unit', '')), '');
    -- Se valida la familia para que la unidad mostrada nunca pueda contradecir la cantidad guardada.
    if v_unit is not null then
      select ii.unit into v_item_unit from public.inventory_items ii where ii.id = (v_line->>'inventoryItemId')::uuid;
      if private.inventory_unit_family(v_unit) is distinct from private.inventory_unit_family(v_item_unit) then
        raise exception 'La unidad % no es compatible con el insumo (unidad %)', v_unit, v_item_unit;
      end if;
    end if;
    insert into public.inventory_recipe_lines(recipe_id, inventory_item_id, quantity, unit)
    values (v_recipe.id, (v_line->>'inventoryItemId')::uuid, (v_line->>'quantity')::numeric, v_unit);
  end loop;
  return v_recipe;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Alta, edición y baja de insumos
-- ---------------------------------------------------------------------------------------------

-- El alta pasa a ser RPC (antes era un `insert` directo desde el cliente, que fallaba sin conexión)
-- para poder encolarla offline. `p_idempotency_key` la hace segura ante un reenvío de la cola.
create or replace function public.create_inventory_item(
  p_id uuid, p_name text, p_unit text, p_minimum numeric, p_tolerance numeric, p_idempotency_key text)
returns public.inventory_items language plpgsql security definer set search_path = '' as $$
declare v_item public.inventory_items;
begin
  if auth.uid() is null or not private.is_manager() then raise exception 'Manager role required'; end if;
  if coalesce(length(trim(coalesce(p_name, ''))), 0) = 0 then raise exception 'El nombre del insumo es obligatorio'; end if;
  if private.inventory_unit_family(p_unit) is null then raise exception 'Unidad no válida: %', p_unit; end if;
  if coalesce(p_minimum, 0) < 0 or coalesce(p_tolerance, 0) < 0 then raise exception 'Mínimo y tolerancia no pueden ser negativos'; end if;

  -- El reenvío de la cola trae el mismo id; devolver la fila existente evita el error de duplicado.
  select * into v_item from public.inventory_items where id = p_id;
  if found then return v_item; end if;

  begin
    insert into public.inventory_items(id, name, unit, minimum_quantity, tolerance_quantity, active)
    values (p_id, trim(p_name), p_unit, coalesce(p_minimum, 0), coalesce(p_tolerance, 0), true)
    returning * into v_item;
  exception when unique_violation then
    raise exception 'Ya existe un insumo con el nombre "%"', trim(p_name);
  end;
  return v_item;
end;
$$;

create or replace function public.update_inventory_item(
  p_id uuid, p_name text, p_unit text, p_minimum numeric, p_tolerance numeric, p_active boolean)
returns public.inventory_items language plpgsql security definer set search_path = '' as $$
declare
  v_item public.inventory_items;
  v_old_unit text; v_old_family text; v_new_family text; v_factor numeric; v_has_history boolean;
begin
  if auth.uid() is null or not private.is_manager() then raise exception 'Manager role required'; end if;

  select * into v_item from public.inventory_items where id = p_id for update;
  if not found then raise exception 'Insumo no encontrado'; end if;

  if coalesce(length(trim(coalesce(p_name, ''))), 0) = 0 then raise exception 'El nombre del insumo es obligatorio'; end if;
  if coalesce(p_minimum, 0) < 0 or coalesce(p_tolerance, 0) < 0 then raise exception 'Mínimo y tolerancia no pueden ser negativos'; end if;

  v_old_unit := v_item.unit;
  v_old_family := private.inventory_unit_family(v_old_unit);
  v_new_family := private.inventory_unit_family(p_unit);
  if v_new_family is null then raise exception 'Unidad no válida: %', p_unit; end if;

  select exists (select 1 from public.inventory_movements    where inventory_item_id = p_id)
      or exists (select 1 from public.inventory_count_lines  where inventory_item_id = p_id)
      or exists (select 1 from public.inventory_recipe_lines where inventory_item_id = p_id)
      or exists (select 1 from public.inventory_usage_lines  where inventory_item_id = p_id)
    into v_has_history;

  v_factor := 1;
  if p_unit <> v_old_unit then
    if v_new_family <> v_old_family then
      -- Sin una equivalencia real, reescalar sería inventar cantidades.
      if v_has_history then
        raise exception 'No se puede cambiar de % a %: el insumo ya tiene conteos, movimientos, recetas o consumos registrados. Da de baja este insumo y crea uno nuevo.', v_old_unit, p_unit;
      end if;
    else
      v_factor := private.inventory_unit_factor(v_old_unit) / private.inventory_unit_factor(p_unit);
      -- Las columnas son numeric(12,3): al pasar a una unidad mayor (g -> kg) una cantidad pequeña
      -- redondearía a 0 y violaría los `check (quantity > 0)`. Se aborta antes de tocar nada.
      if v_factor < 1 and (
           exists (select 1 from public.inventory_movements    where inventory_item_id = p_id and round(quantity * v_factor, 3) <= 0)
        or exists (select 1 from public.inventory_recipe_lines where inventory_item_id = p_id and round(quantity * v_factor, 3) <= 0)
        or exists (select 1 from public.inventory_usage_lines  where inventory_item_id = p_id and round(quantity * v_factor, 3) <= 0)
      ) then
        raise exception 'Cambiar a % perdería cantidades registradas por redondeo (el histórico se guarda con 3 decimales).', p_unit;
      end if;

      update public.inventory_count_lines  set quantity = round(quantity * v_factor, 3) where inventory_item_id = p_id;
      update public.inventory_recipe_lines set quantity = round(quantity * v_factor, 3) where inventory_item_id = p_id;
      update public.inventory_usage_lines  set quantity = round(quantity * v_factor, 3) where inventory_item_id = p_id;
      update public.inventory_movements
         set quantity = round(quantity * v_factor, 3), signed_quantity = round(signed_quantity * v_factor, 3)
       where inventory_item_id = p_id;
      -- La unidad recordada en la receta deja de ser válida si pertenecía a la unidad vieja: se
      -- normaliza a la nueva unidad canónica para que la interfaz no muestre una equivalencia rara.
      update public.inventory_recipe_lines set unit = p_unit where inventory_item_id = p_id and unit is not null;
    end if;
  end if;

  begin
    update public.inventory_items set
      name               = trim(p_name),
      unit               = p_unit,
      minimum_quantity   = coalesce(p_minimum,   round(minimum_quantity   * v_factor, 3)),
      tolerance_quantity = coalesce(p_tolerance, round(tolerance_quantity * v_factor, 3)),
      active             = coalesce(p_active, active),
      updated_at         = now()
    where id = p_id
    returning * into v_item;
  exception when unique_violation then
    raise exception 'Ya existe un insumo con el nombre "%"', trim(p_name);
  end;

  -- Reescalar el histórico reescribe evidencia: debe quedar traza de quién lo hizo y con qué factor.
  if v_factor <> 1 then
    insert into public.audit_log(actor_id, action, entity_type, entity_id, before_data, after_data)
    values (auth.uid(), 'inventory_unit_rescale', 'inventory_items', p_id,
      jsonb_build_object('unit', v_old_unit),
      jsonb_build_object('unit', p_unit, 'factor', v_factor));
  end if;

  return v_item;
end;
$$;

-- Borrar de verdad sólo cuando no queda evidencia que dependa del insumo; en cualquier otro caso se
-- da de baja, porque los FK del histórico son `on delete restrict` a propósito.
create or replace function public.delete_inventory_item(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_used boolean;
begin
  if auth.uid() is null or not private.is_manager() then raise exception 'Manager role required'; end if;
  if not exists (select 1 from public.inventory_items where id = p_id) then return 'deleted'; end if;

  select exists (select 1 from public.inventory_movements    where inventory_item_id = p_id)
      or exists (select 1 from public.inventory_count_lines  where inventory_item_id = p_id)
      or exists (select 1 from public.inventory_recipe_lines where inventory_item_id = p_id)
      or exists (select 1 from public.inventory_usage_lines  where inventory_item_id = p_id)
    into v_used;

  if v_used then
    update public.inventory_items set active = false, updated_at = now() where id = p_id;
    return 'deactivated';
  end if;

  delete from public.inventory_items where id = p_id;
  return 'deleted';
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. La venta descuenta
-- ---------------------------------------------------------------------------------------------

-- Va en un disparador y no en `sync_offline_operations` porque una orden llega a 'closed' por varias
-- rutas —close_order(), el UPDATE genérico del sincronizador (que no tiene rama propia para cerrar:
-- cierra cualquier operación cuyo payload traiga status='closed') y las de reversión— y todas
-- terminan en un UPDATE de public.orders. Además, `sync_offline_operations` se ha reescrito entera
-- ocho veces; cualquier cosa que se metiera ahí se perdería en la novena.
--
-- Es `after`, así que corre detrás de los `before` immutable_sales y validate_order_close: sólo ve
-- cierres que ya pasaron las validaciones de pago y de atribución.
create or replace function private.apply_sale_inventory_consumption()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
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
    join public.inventory_recipes r
      on r.product_id = oi.product_id
     and r.variant_name = coalesce(oi.variant_name, '')
     and r.active
    join public.inventory_recipe_lines rl on rl.recipe_id = r.id
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
    -- entrada fantasma envenenaría esa predicción.
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

drop trigger if exists apply_sale_consumption on public.orders;
create trigger apply_sale_consumption after update on public.orders
for each row execute function private.apply_sale_inventory_consumption();

-- ---------------------------------------------------------------------------------------------
-- 5. Permisos
-- ---------------------------------------------------------------------------------------------

-- No se otorga `delete on public.inventory_items`: delete_inventory_item es security definer y ya
-- salta el grant y la RLS, igual que hace record_inventory_count con las tablas revocadas.
grant execute on function
  public.create_inventory_item(uuid, text, text, numeric, numeric, text),
  public.update_inventory_item(uuid, text, text, numeric, numeric, boolean),
  public.delete_inventory_item(uuid)
to authenticated;

notify pgrst, 'reload schema';
