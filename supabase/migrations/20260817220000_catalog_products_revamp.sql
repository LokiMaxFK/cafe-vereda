-- Los extras dejan de estar acoplados a productos específicos: todo extra
-- activo aplica a cualquier producto. Se retira la relación product_modifiers.
drop trigger if exists broadcast_product_modifiers on public.product_modifiers;
drop table public.product_modifiers;

-- El horario nunca filtró nada en la venta, era sólo texto decorativo.
-- Se agregan temporada e imagen, que sí tienen efecto en catálogo y venta.
alter table public.products
  drop column schedule_label,
  add column seasonal boolean not null default false,
  add column image_url text;

-- Quitar un tamaño desde el formulario de producto es borrado físico
-- (a diferencia de productos/extras/categorías, que se dan de baja lógica).
grant delete on public.product_variants to authenticated;

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "public read product images" on storage.objects
  for select to public using (bucket_id = 'product-images');

create policy "managers upload product images" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images' and private.is_manager());

create policy "managers update product images" on storage.objects
  for update to authenticated using (bucket_id = 'product-images' and private.is_manager())
  with check (bucket_id = 'product-images' and private.is_manager());

create policy "managers delete product images" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and private.is_manager());
