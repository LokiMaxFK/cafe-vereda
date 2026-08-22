-- Reparación: en producción `branch_settings` no existe.
--
-- La migración 20260817000000_branch_ticket_design.sql figura como aplicada en el
-- historial, pero su DDL nunca llegó a ejecutarse: la tabla no está en la base y
-- PostgREST responde PGRST205 ("Could not find the table 'public.branch_settings'
-- in the schema cache"). El efecto visible es que el diseño del ticket —logo, textos,
-- márgenes— sólo se guarda en la estación donde se configura y nunca se comparte con
-- las demás.
--
-- Se recrea sólo si falta, para que en una base nueva (donde la migración original sí
-- corre) esto sea un no-op y ambos caminos terminen en el mismo esquema.

do $$
begin
  if to_regclass('public.branch_settings') is not null then
    return;
  end if;

  execute $ddl$
    create table public.branch_settings (
      key text primary key check (key = 'ticket_design'),
      value jsonb not null check (jsonb_typeof(value) = 'object'),
      updated_at timestamptz not null default now(),
      updated_by uuid references public.staff_profiles(id)
    )
  $ddl$;

  execute 'alter table public.branch_settings enable row level security';

  execute $ddl$
    create policy "authenticated read branch settings"
      on public.branch_settings for select to authenticated using (true)
  $ddl$;

  execute $ddl$
    create policy "managers create branch settings"
      on public.branch_settings for insert to authenticated
      with check (private.is_manager())
  $ddl$;

  execute $ddl$
    create policy "managers update branch settings"
      on public.branch_settings for update to authenticated
      using (private.is_manager())
      with check (private.is_manager())
  $ddl$;

  execute 'grant select, insert, update on public.branch_settings to authenticated';
end
$$;

-- PostgREST cachea el esquema: sin esto la tabla existiría pero la API seguiría
-- respondiendo 404 hasta el siguiente reinicio.
notify pgrst, 'reload schema';
