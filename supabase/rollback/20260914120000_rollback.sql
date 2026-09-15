-- ROLLBACK de 20260914120000_cafe_tables_delete.sql
--
-- Las mesas que ya se borraron no vuelven: el rollback sólo retira el permiso. Sin él, el cliente
-- recibe un error de permisos al quitar una mesa y cae al archivado (active = false).
revoke delete on public.cafe_tables from authenticated;
