-- Allow any authenticated staff member (not just managers) to open, operate, and close a cash session.
-- Adds close_cash_session, the missing piece to actually cut/close a shift with a computed difference.

create or replace function public.open_cash_session(p_opening_fund_cents integer)
returns public.cash_sessions language plpgsql security invoker set search_path = '' as $$
declare v_session public.cash_sessions;
begin
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
  if p_type not in ('withdrawal', 'adjustment') then raise exception 'Use open_cash_session or close_cash_session for this movement type'; end if;
  if coalesce(length(trim(p_note)),0) = 0 then raise exception 'Note required'; end if;
  insert into public.cash_movements(cash_session_id, movement_type, amount_cents, note, recorded_by, idempotency_key)
  values (p_cash_session_id, p_type, p_amount_cents, p_note, auth.uid(), p_idempotency_key)
  on conflict (idempotency_key) do update set idempotency_key = excluded.idempotency_key returning * into v_movement;
  return v_movement;
end;
$$;

create or replace function public.close_cash_session(p_cash_session_id uuid, p_counted_cash_cents integer)
returns public.cash_sessions language plpgsql security invoker set search_path = '' as $$
declare
  v_session public.cash_sessions;
  v_cash_sales_cents bigint;
  v_withdrawals_cents bigint;
  v_expected_cents integer;
begin
  select * into v_session from public.cash_sessions where id = p_cash_session_id for update;
  if not found then raise exception 'Cash session not found'; end if;
  if v_session.closed_at is not null then raise exception 'Cash session already closed'; end if;
  if p_counted_cash_cents < 0 then raise exception 'Invalid counted amount'; end if;

  select coalesce(sum(amount_cents),0) into v_cash_sales_cents
    from public.payments where method = 'cash' and created_at >= v_session.opened_at;

  select coalesce(sum(amount_cents),0) into v_withdrawals_cents
    from public.cash_movements where cash_session_id = p_cash_session_id and movement_type in ('withdrawal','adjustment');

  v_expected_cents := v_session.opening_fund_cents + v_cash_sales_cents - v_withdrawals_cents;

  update public.cash_sessions
    set closed_by = auth.uid(), closed_at = now(), counted_cash_cents = p_counted_cash_cents,
        expected_cash_cents = v_expected_cents, difference_cents = p_counted_cash_cents - v_expected_cents
    where id = p_cash_session_id
    returning * into v_session;

  insert into public.cash_movements(cash_session_id, movement_type, amount_cents, note, recorded_by, idempotency_key)
  values (p_cash_session_id, 'closing', p_counted_cash_cents, 'Corte de caja', auth.uid(), 'closing:' || p_cash_session_id::text);

  return v_session;
end;
$$;

drop policy if exists "managers manage cash sessions" on public.cash_sessions;
create policy "authenticated open cash sessions" on public.cash_sessions
  for insert to authenticated with check (opened_by = auth.uid());
create policy "authenticated close cash sessions" on public.cash_sessions
  for update to authenticated using (closed_at is null) with check (closed_by = auth.uid());

drop policy if exists "staff record withdrawals managers all" on public.cash_movements;
create policy "authenticated record cash movements" on public.cash_movements
  for insert to authenticated with check (recorded_by = auth.uid());

grant execute on function public.close_cash_session(uuid, integer) to authenticated;
