-- Migratie 02 — inloggen met alleen de adminsleutel
create or replace function admin_list_sessions(p_admin_key text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare result jsonb;
begin
  if length(coalesce(p_admin_key, '')) < 8 then
    raise exception 'invalid_credentials' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb)
    into result
  from (
    select jsonb_build_object(
      'code', s.code,
      'name', s.name,
      'created_at', s.created_at,
      'participants', (select count(*) from participants p where p.session_id = s.id),
      'submitted', (select count(*) from participants p
                     where p.session_id = s.id and p.submitted_at is not null)
    ) as x
    from sessions s
    where s.admin_key_hash = crypt(p_admin_key, s.admin_key_hash)
  ) t;

  return result;
end;
$$;

grant execute on function public.admin_list_sessions(text) to anon, authenticated;
