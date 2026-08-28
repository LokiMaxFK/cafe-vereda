-- ROLLBACK de 20260826090000_inventory_item_admin_and_sale_consumption.sql
--
-- LEE ESTO ANTES DE EJECUTAR
--
-- 1. Este script deshace el ESQUEMA, no los DATOS. Dos cosas que la migración pudo escribir
--    sobreviven y hay que tratarlas aparte, en las secciones 5 y 6:
--      a) los movimientos de consumo que el disparador insertó al cerrar ventas;
--      b) el reescalado de cantidades que provoca cambiar la unidad de un insumo.
--    (b) es el peligroso: multiplicó el histórico de ese insumo y ningún `drop function` lo revierte.
--
-- 2. El código del cliente en la rama `feat/insumos-unidades-y-consumo` DEPENDE de lo que este
--    script borra. Si haces rollback del SQL, vuelve también el frontend:
--      git checkout main            (o el commit anterior a la rama)
--    Con la rama nueva y el esquema viejo, el editor de recetas y el alta de insumos fallan.
--
-- 3. Ejecuta todo dentro de una transacción para que un error no te deje a medias:
--      begin;  <pega el script>  commit;
--    Y para la migración original, lo mismo — así un fallo se revierte solo.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. El disparador que descuenta al vender
-- ---------------------------------------------------------------------------------------------
drop trigger if exists apply_sale_consumption on public.orders;
drop function if exists private.apply_sale_inventory_consumption();

-- ---------------------------------------------------------------------------------------------
-- 2. Las RPC de administración de insumos (el `grant execute` se va con la función)
-- ---------------------------------------------------------------------------------------------
drop function if exists public.create_inventory_item(uuid, text, text, numeric, numeric, text);
drop function if exists public.update_inventory_item(uuid, text, text, numeric, numeric, boolean);
drop function if exists public.delete_inventory_item(uuid);

-- ---------------------------------------------------------------------------------------------
-- 3. replace_inventory_recipe vuelve a su cuerpo original (20260817210000)
-- ---------------------------------------------------------------------------------------------
-- Se restaura ANTES de tirar la columna `unit`, y con `create or replace` para no perder el
-- `grant execute` que un `drop function` se llevaría en silencio.
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

-- ---------------------------------------------------------------------------------------------
-- 4. La columna de presentación de las recetas y los ayudantes de unidad
-- ---------------------------------------------------------------------------------------------
-- Sólo guardaba en qué unidad se escribió cada renglón; la cantidad nunca dependió de ella.
alter table public.inventory_recipe_lines drop column if exists unit;

drop function if exists private.inventory_unit_family(text);
drop function if exists private.inventory_unit_factor(text);

notify pgrst, 'reload schema';

commit;

-- ---------------------------------------------------------------------------------------------
-- 5. DATOS · movimientos generados por ventas  (OPCIONAL — revisa antes de borrar)
-- ---------------------------------------------------------------------------------------------
-- Con el disparador ya eliminado no se crean más, pero los que se escribieron siguen ahí y siguen
-- restando en la existencia derivada. El cliente viejo los ignora (filtra a entry/waste), así que
-- puedes dejarlos como evidencia. Bórralos sólo si quieres el inventario exactamente como antes.
--
-- Primero MIRA qué hay:
--   select movement_type, count(*), min(created_at), max(created_at)
--     from public.inventory_movements
--    where idempotency_key like 'sale:%' or idempotency_key like 'sale-reversal:%'
--    group by movement_type;
--
-- Y si decides borrarlos, quita el comentario:
-- delete from public.inventory_movements
--  where idempotency_key like 'sale:%' or idempotency_key like 'sale-reversal:%';

-- ---------------------------------------------------------------------------------------------
-- 6. DATOS · reescalados de unidad  (ESTO NO SE DESHACE SOLO)
-- ---------------------------------------------------------------------------------------------
-- update_inventory_item multiplica el histórico del insumo cuando cambias su unidad dentro de la
-- misma familia (L -> ml multiplica por 1000). Dropear la función no revierte esas cantidades.
--
-- ¿Ocurrió alguno?
--   select id, created_at, actor_id, entity_id,
--          before_data->>'unit' as unidad_vieja,
--          after_data->>'unit'  as unidad_nueva,
--          after_data->>'factor' as factor
--     from public.audit_log
--    where action = 'inventory_unit_rescale'
--    order by created_at;
--
-- Si la lista sale vacía, no hay nada que hacer: has terminado.
--
-- Si sale con filas, deshaz CADA UNA en orden inverso (de la más reciente a la más antigua),
-- sustituyendo :item por entity_id y :factor por el factor de esa fila:
--
--   begin;
--   update public.inventory_count_lines  set quantity = round(quantity / :factor, 3) where inventory_item_id = :item;
--   update public.inventory_recipe_lines set quantity = round(quantity / :factor, 3) where inventory_item_id = :item;
--   update public.inventory_usage_lines  set quantity = round(quantity / :factor, 3) where inventory_item_id = :item;
--   update public.inventory_movements
--      set quantity = round(quantity / :factor, 3), signed_quantity = round(signed_quantity / :factor, 3)
--    where inventory_item_id = :item;
--   update public.inventory_items
--      set unit = :unidad_vieja,
--          minimum_quantity   = round(minimum_quantity   / :factor, 3),
--          tolerance_quantity = round(tolerance_quantity / :factor, 3)
--    where id = :item;
--   commit;
--
-- AVISO: si el reescalado fue de unidad grande a chica (L -> ml, factor 1000) la vuelta es exacta.
-- Si fue de chica a grande (ml -> L, factor 0.001) hubo redondeo a 3 decimales y la vuelta NO
-- recupera el valor original al milímetro. La migración aborta ese caso cuando detecta que algo
-- redondearía a cero, pero las pérdidas menores sí pasan. Compara contra un respaldo si te importa.
