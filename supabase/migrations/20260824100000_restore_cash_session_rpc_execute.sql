-- Reparación: producción perdió el ACL EXECUTE de los RPC de caja.
--
-- El 18/08 el catálogo remoto capturado por el CLI y la prueba en vivo de Caja
-- confirmaban que estos RPC tenían EXECUTE para `authenticated`; sin embargo,
-- producción ahora responde "permission denied for function open_cash_session".
-- No existe una migración posterior que revoque, elimine o redefina
-- open_cash_session/record_cash_movement, de modo que el esquema remoto derivó
-- después de que la migración 20260817200000 quedó registrada como aplicada.
--
-- GRANT es idempotente y restituye únicamente la capacidad que los RPC ya
-- validan internamente con auth.uid(), sin depender del proceso externo que
-- haya alterado el ACL remoto.

grant execute on function public.open_cash_session(integer) to authenticated;
grant execute on function public.record_cash_movement(uuid, public.cash_movement_type, integer, text, text) to authenticated;
grant execute on function public.close_cash_session(uuid, integer) to authenticated;
