-- Interne helpers waren aanroepbaar met de anon-key.
--
-- De oorspronkelijke regels trokken EXECUTE in bij anon en authenticated, en
-- dat slaagde ook. Alleen geeft Postgres EXECUTE op een nieuwe functie
-- standaard óók aan PUBLIC, en dat recht bleef staan — dus erfden dezelfde
-- rollen het langs de andere kant weer terug. Een revoke die slaagt maar niets
-- dichtdoet is lastiger te zien dan een fout.
--
-- Gevolg: _skills_json(uuid) gaf de assen van elke sessie terug zonder enige
-- controle, en _session_by_admin(text,text) gaf bij een kloppende sleutel de
-- hele sessierij terug, inclusief de bcrypt-hash van die sleutel. De elf
-- functies die de app aanroept blijven open; deze vijf horen dat niet te zijn.
--
-- Veilig om vaker te draaien.

revoke execute on function public._session_by_admin(text,text) from public, anon, authenticated;
revoke execute on function public._skills_json(uuid)           from public, anon, authenticated;
revoke execute on function public.new_token()                  from public, anon, authenticated;
revoke execute on function public.default_skills()             from public, anon, authenticated;
revoke execute on function public.default_scale()              from public, anon, authenticated;
