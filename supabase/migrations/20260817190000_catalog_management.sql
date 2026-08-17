-- La edición de asignaciones de extras reemplaza las relaciones existentes.
-- La política RLS de gerencia ya limita esta operación a managers.
grant delete on public.product_modifiers to authenticated;

create or replace function private.broadcast_catalog_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.broadcast_changes('branch:main', TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, new, old);
  return coalesce(new, old);
end;
$$;

create trigger broadcast_products
after insert or update or delete on public.products
for each row execute function private.broadcast_catalog_changes();

create trigger broadcast_product_variants
after insert or update or delete on public.product_variants
for each row execute function private.broadcast_catalog_changes();

create trigger broadcast_modifiers
after insert or update or delete on public.modifiers
for each row execute function private.broadcast_catalog_changes();

create trigger broadcast_product_modifiers
after insert or update or delete on public.product_modifiers
for each row execute function private.broadcast_catalog_changes();
