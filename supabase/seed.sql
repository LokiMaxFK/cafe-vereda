insert into public.categories (id, name, position, published) values
  ('10000000-0000-4000-8000-000000000001', 'Café', 1, true),
  ('10000000-0000-4000-8000-000000000002', 'Frías', 2, true),
  ('10000000-0000-4000-8000-000000000003', 'Almuerzos', 3, true),
  ('10000000-0000-4000-8000-000000000004', 'Bagels y chapatas', 4, true),
  ('10000000-0000-4000-8000-000000000005', 'Ensaladas', 5, true),
  ('10000000-0000-4000-8000-000000000006', 'Crepas', 6, true),
  ('10000000-0000-4000-8000-000000000007', 'Otros', 7, true)
on conflict (id) do nothing;

insert into public.modifiers (id, name, price_cents) values
  ('20000000-0000-4000-8000-000000000001', 'Bebida vegetal', 1500),
  ('20000000-0000-4000-8000-000000000002', 'Carga extra', 1500),
  ('20000000-0000-4000-8000-000000000003', 'Sabor extra', 1500)
on conflict (id) do nothing;

insert into public.products (id, category_id, name, description, price_cents, schedule_label) values
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Espresso',null,4800,null),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Americano',null,5500,null),
  ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Flat White',null,6500,null),
  ('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Cappuccino',null,7000,null),
  ('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','Latte',null,7000,null),
  ('30000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','Moka',null,9000,null),
  ('30000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','Chai',null,8000,null),
  ('30000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000001','Matcha',null,8000,null),
  ('30000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001','Taro',null,8000,null),
  ('30000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','Chocolate',null,8000,null),
  ('30000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000002','Jugo verde','Espinaca, apio, mango y piña',7000,null),
  ('30000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000002','Smoothie frutos','Frutos rojos y avena',8500,null),
  ('30000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000003','Chilaquiles','Salsa verde o roja, huevo y aguacate',12000,'Hasta 1:30 pm'),
  ('30000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000003','Chilaquiles Vereda','Con pollo, res, machacado o pastor',13000,'Hasta 1:30 pm'),
  ('30000000-0000-4000-8000-000000000015','10000000-0000-4000-8000-000000000003','Huevos divorciados',null,11500,'Hasta 1:30 pm'),
  ('30000000-0000-4000-8000-000000000016','10000000-0000-4000-8000-000000000004','Bagel serrano','Jamón serrano y ensalada dulce',14500,null),
  ('30000000-0000-4000-8000-000000000017','10000000-0000-4000-8000-000000000005','Ensalada Verde',null,11000,null),
  ('30000000-0000-4000-8000-000000000018','10000000-0000-4000-8000-000000000006','Crepa Nogal','Cajeta y nuez',9500,null),
  ('30000000-0000-4000-8000-000000000019','10000000-0000-4000-8000-000000000007','Galleta',null,3000,null),
  ('30000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000007','Pastel',null,5000,null)
on conflict (id) do nothing;

insert into public.product_variants (product_id, name, price_cents)
select id, 'Caliente', price_cents from public.products where name in ('Americano','Cappuccino','Latte','Moka','Chai','Matcha','Taro','Chocolate')
on conflict (product_id, name) do nothing;

insert into public.product_variants (product_id, name, price_cents)
select id, 'Frío / frappé', case name when 'Americano' then 6000 when 'Moka' then 9500 else 9000 end from public.products where name in ('Americano','Cappuccino','Latte','Moka','Chai','Matcha','Taro','Chocolate')
on conflict (product_id, name) do nothing;

insert into public.cafe_tables (id, number, seats, shape, x, y) values
  ('40000000-0000-4000-8000-000000000001',1,2,'round',8,14),
  ('40000000-0000-4000-8000-000000000002',2,4,'square',31,12),
  ('40000000-0000-4000-8000-000000000003',3,4,'square',57,12),
  ('40000000-0000-4000-8000-000000000004',4,6,'rectangular',78,14),
  ('40000000-0000-4000-8000-000000000005',5,2,'round',12,55),
  ('40000000-0000-4000-8000-000000000006',6,4,'square',38,52),
  ('40000000-0000-4000-8000-000000000007',7,4,'square',65,53),
  ('40000000-0000-4000-8000-000000000008',8,2,'round',88,56)
on conflict (id) do nothing;

insert into public.inventory_items (name, unit, current_quantity, minimum_quantity) values
  ('Café en grano','kg',8.4,3), ('Leche entera','L',14,8), ('Bebida de almendra','L',4,5),
  ('Hielo','bolsa',2,3), ('Vasos 12 oz','pza',86,40), ('Servilletas','paquete',6,4)
on conflict (name) do nothing;
