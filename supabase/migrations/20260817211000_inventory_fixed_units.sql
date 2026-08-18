alter table public.inventory_items
  add constraint inventory_items_unit_check
  check (unit in ('g', 'kg', 'ml', 'L', 'pza', 'paquete', 'bolsa'));
