-- Migratie 01 — sessie kunnen verwijderen
create or replace function admin_delete_session(p_code text, p_admin_key text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s sessions;
begin
  s := _session_by_admin(p_code, p_admin_key);
  delete from sessions where id = s.id;
end;
$$;

grant execute on function public.admin_delete_session(text,text) to anon, authenticated;
