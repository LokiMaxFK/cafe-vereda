-- Keep the cash ledger auditable: authenticated staff use the RPCs, while direct
-- inserts and updates remain unavailable to browser clients.

create or replace function public.open_cash_session(p_opening_fund_cents integer)
returns public.cash_sessions language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_session public.cash_sessions;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_opening_fund_cents is null or p_opening_fund_cents < 0 then raise exception 'Invalid opening fund'; end if;

  insert into public.cash_sessions(opened_by, opening_fund_cents)
  values (v_user, p_opening_fund_cents)
  returning * into v_session;

  insert into public.cash_movements(cash_session_id, movement_type, amount_cents, note, recorded_by, idempotency_key)
  values (v_session.id, 'opening', p_opening_fund_cents, 'Fondo inicial', v_user, 'opening:' || v_session.id::text);

  return v_session;
end;
$$;

create or replace function public.record_cash_movement(
  p_cash_session_id uuid,
  p_type public.cash_movement_type,
  p_amount_cents integer,
  p_note text,
  p_idempotency_key text
)
returns public.cash_movements language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_movement public.cash_movements;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_type not in ('withdrawal', 'adjustment') then
    raise exception 'Use open_cash_session or close_cash_session for this movement type';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if coalesce(length(trim(p_note)), 0) = 0 then raise exception 'Note required'; end if;
  if coalesce(length(trim(p_idempotency_key)), 0) = 0 then raise exception 'Idempotency key required'; end if;

  -- A retry with the same key and payload returns the original movement.
  select * into v_movement
    from public.cash_movements
    where idempotency_key = p_idempotency_key;

  if found then
    if v_movement.cash_session_id <> p_cash_session_id
      or v_movement.recorded_by <> v_user
      or v_movement.movement_type <> p_type
      or v_movement.amount_cents <> p_amount_cents
      or v_movement.note is distinct from p_note then
      raise exception 'Idempotency key already used';
    end if;
    return v_movement;
  end if;

  perform 1 from public.cash_sessions
    where id = p_cash_session_id and closed_at is null;
  if not found then raise exception 'Cash session not open'; end if;

  insert into public.cash_movements(cash_session_id, movement_type, amount_cents, note, recorded_by, idempotency_key)
  values (p_cash_session_id, p_type, p_amount_cents, p_note, v_user, p_idempotency_key)
  returning * into v_movement;

  return v_movement;
exception
  when unique_violation then
    raise exception 'Idempotency key already used';
end;
$$;

create or replace function public.close_cash_session(p_cash_session_id uuid, p_counted_cash_cents integer)
returns public.cash_sessions language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_session public.cash_sessions;
  v_cash_sales_cents bigint;
  v_withdrawals_cents bigint;
  v_expected_cents bigint;
  v_difference_cents bigint;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_counted_cash_cents is null or p_counted_cash_cents < 0 then raise exception 'Invalid counted amount'; end if;

  select * into v_session
    from public.cash_sessions
    where id = p_cash_session_id
    for update;

  if not found then raise exception 'Cash session not found'; end if;
  if v_session.closed_at is not null then
    if v_session.closed_by = v_user and v_session.counted_cash_cents = p_counted_cash_cents then
      return v_session;
    end if;
    raise exception 'Cash session already closed';
  end if;

  select coalesce(sum(amount_cents), 0) into v_cash_sales_cents
    from public.payments
    where method = 'cash' and created_at >= v_session.opened_at;

  select coalesce(sum(amount_cents), 0) into v_withdrawals_cents
    from public.cash_movements
    where cash_session_id = p_cash_session_id
      and movement_type in ('withdrawal', 'adjustment');

  v_expected_cents := v_session.opening_fund_cents::bigint + v_cash_sales_cents - v_withdrawals_cents;
  v_difference_cents := p_counted_cash_cents::bigint - v_expected_cents;

  if v_expected_cents not between -2147483648 and 2147483647
    or v_difference_cents not between -2147483648 and 2147483647 then
    raise exception 'Cash totals exceed supported range';
  end if;

  update public.cash_sessions
    set closed_by = v_user,
        closed_at = now(),
        counted_cash_cents = p_counted_cash_cents,
        expected_cash_cents = v_expected_cents::integer,
        difference_cents = v_difference_cents::integer
    where id = p_cash_session_id
    returning * into v_session;

  insert into public.cash_movements(cash_session_id, movement_type, amount_cents, note, recorded_by, idempotency_key)
  values (p_cash_session_id, 'closing', p_counted_cash_cents, 'Corte de caja', v_user, 'closing:' || p_cash_session_id::text);

  return v_session;
end;
$$;

drop policy if exists "managers manage cash sessions" on public.cash_sessions;
drop policy if exists "authenticated open cash sessions" on public.cash_sessions;
drop policy if exists "authenticated close cash sessions" on public.cash_sessions;
drop policy if exists "staff record withdrawals managers all" on public.cash_movements;
drop policy if exists "authenticated record cash movements" on public.cash_movements;

revoke insert, update on public.cash_sessions from authenticated;
revoke insert on public.cash_movements from authenticated;

revoke execute on function public.open_cash_session(integer) from public, anon;
revoke execute on function public.record_cash_movement(uuid, public.cash_movement_type, integer, text, text) from public, anon;
revoke execute on function public.close_cash_session(uuid, integer) from public, anon;

grant execute on function public.open_cash_session(integer) to authenticated;
grant execute on function public.record_cash_movement(uuid, public.cash_movement_type, integer, text, text) to authenticated;
grant execute on function public.close_cash_session(uuid, integer) to authenticated;
