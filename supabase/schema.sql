-- =====================================================================
-- UX Skill Matrix  ·  Supabase schema
-- Gebaseerd op het NN/g UX Skill Mapping template (Rachel Krause).
--
-- Beveiligingsmodel
--   RLS staat aan op alle tabellen en er zijn GEEN policies: de anon-key
--   kan dus niets rechtstreeks lezen of schrijven. Alle toegang loopt via
--   de SECURITY DEFINER functies onderaan dit bestand, die eerst een
--   deelnemers-token of de admin-sleutel van de sessie verifiëren.
--
-- Draai dit bestand één keer in de Supabase SQL Editor.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- tabellen

-- Los functietje zodat het token-default niet afhangt van het schema waarin
-- pgcrypto toevallig geïnstalleerd staat.
create or replace function new_token() returns text
language sql volatile security definer set search_path = public, extensions as $$
  select encode(gen_random_bytes(12), 'hex');
$$;

create table if not exists sessions (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  admin_key_hash text not null,
  scale          jsonb not null,
  created_at     timestamptz not null default now()
);

create table if not exists skills (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  label       text not null,
  description text not null default '',
  -- Wat "dit heb ik zelfstandig gedaan" (niveau 3) op déze as concreet
  -- betekent. Eén anker per as is genoeg: niveau 1 en 2 spreken voor zich en
  -- niveau 4 is overal hetzelfde (je kunt het overdragen).
  anchor      text not null default '',
  sort_order  int  not null default 0
);
create index if not exists skills_session_idx on skills(session_id, sort_order);

create table if not exists participants (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id) on delete cascade,
  name         text not null,
  role         text not null default '',
  token        text not null unique default new_token(),
  submitted_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists participants_session_idx on participants(session_id, created_at);

create table if not exists ratings (
  participant_id uuid not null references participants(id) on delete cascade,
  skill_id       uuid not null references skills(id) on delete cascade,
  state          text not null check (state in ('current','future')),
  value          int  not null check (value between 1 and 5),
  updated_at     timestamptz not null default now(),
  primary key (participant_id, skill_id, state)
);

alter table sessions     enable row level security;
alter table skills       enable row level security;
alter table participants enable row level security;
alter table ratings      enable row level security;

-- ---------------------------------------------------------------- defaults

-- De tien assen. Elke as is geformuleerd als iets wat je kunt opleveren, niet
-- als een vakgebied: "kleur" of "typografie" is geen skill waarop iemand
-- zichzelf een cijfer kan geven, "een scherm ontwerpen binnen een
-- designsysteem" wel.
--
-- Het anker beschrijft wat één keer "dit gedaan hebben" op déze as concreet
-- is. Het hangt bewust niet aan één niveau: het geeft bij elke trede dezelfde
-- eenheid werk om jezelf langs te leggen.
create or replace function default_skills() returns jsonb
language sql immutable as $$
  select jsonb_build_array(
    jsonb_build_object('label','Kwalitatief onderzoek',
      'description','Interviews en usability tests opzetten, uitvoeren en de bevindingen terugbrengen.',
      'anchor','een testronde met een handvol deelnemers, van opzet tot terugkoppeling'),
    jsonb_build_object('label','Kwantitatief onderzoek',
      'description','Een vragenlijst of analytics-vraag opzetten en de uitkomst juist interpreteren.',
      'anchor','een vragenlijst of een analytics-vraag, van vraag tot conclusie'),
    jsonb_build_object('label','Informatiearchitectuur',
      'description','Structuur en navigatie ontwerpen en toetsen met een card sort of tree test.',
      'anchor','een navigatiestructuur ontwerpen én toetsen, niet alleen bedenken'),
    jsonb_build_object('label','Interaction Design',
      'description','Flows, states en randgevallen uitwerken tot iets wat een developer kan bouwen.',
      'anchor','een flow uitwerken inclusief lege, fout- en laadstates'),
    jsonb_build_object('label','UI Design',
      'description','Schermen ontwerpen binnen een designsysteem: hiërarchie, componentkeuze, states.',
      'anchor','een scherm opleveren dat het designsysteem volgt'),
    jsonb_build_object('label','Prototyping',
      'description','Een klikbaar prototype maken op het detailniveau dat de vraag vraagt.',
      'anchor','een prototype waarmee iemand anders kon testen'),
    jsonb_build_object('label','UX Writing',
      'description','Interfaceteksten schrijven en aanscherpen: labels, knoppen, foutmeldingen.',
      'anchor','de teksten van een hele flow, tot en met de foutmeldingen'),
    jsonb_build_object('label','Toegankelijkheid (WCAG)',
      'description','Een ontwerp toetsen aan WCAG 2.2 AA: contrast, focusvolgorde, koppenstructuur, alt-teksten, foutafhandeling.',
      'anchor','een ontwerp toetsen en er concrete bevindingen uit opleveren'),
    jsonb_build_object('label','Faciliteren',
      'description','Een sessie met stakeholders begeleiden en er een besluit uit halen.',
      'anchor','een sessie begeleiden waar een besluit uit komt'),
    jsonb_build_object('label','Presenteren & overtuigen',
      'description','Onderzoek zo brengen dat er een beslissing uit volgt.',
      'anchor','onderzoek presenteren aan mensen die er anders in staan')
  );
$$;

-- De schaal meet hoeveel vangnet er onder het werk lag, niet óf je het ooit
-- hebt gedaan. Bij een team dat nog geen jaar draait is "heb je dit weleens
-- zelfstandig gedaan" geen onderscheidende vraag — dan is het overal "ja,
-- soort van" en staat iedereen op 3.
--
-- De grens die er wél toe doet ligt tussen 3 en 4: kun je zelf beoordelen of
-- het goed genoeg was? Dat is het verschil tussen een half jaar en twee jaar.
--
-- Het aantal keren zit in de treden zelf verwerkt ("een enkele keer" op 3,
-- "regelmatig" op 4) in plaats van als aparte vraag. Zo doet de frequentie
-- mee in het onderscheid zonder dat er per as een tweede invoer bij komt.
create or replace function default_scale() returns jsonb
language sql immutable as $$
  select jsonb_build_array(
    jsonb_build_object('level',1,'label','Nooit gedaan', 'description','Je weet wat het is, maar je hebt het nog niet gedaan.'),
    jsonb_build_object('level',2,'label','Meegelopen',   'description','Je hebt een keer meegedaan; iemand anders trok het.'),
    jsonb_build_object('level',3,'label','Met vangnet',  'description','Je hebt dit een enkele keer zelf gedaan, met iemand die meekeek of achteraf corrigeerde.'),
    jsonb_build_object('level',4,'label','Zelfstandig',  'description','Je doet dit regelmatig alleen én je ziet zelf of het goed genoeg is.'),
    jsonb_build_object('level',5,'label','Vraagbaak',    'description','Anderen komen bij jou; je kunt het uitleggen en verbeteren.')
  );
$$;

-- ---------------------------------------------------------------- helpers

create or replace function _session_by_admin(p_code text, p_admin_key text)
returns sessions
language plpgsql security definer set search_path = public, extensions as $$
declare s sessions;
begin
  select * into s from sessions where code = upper(trim(p_code));
  if s.id is null then
    raise exception 'invalid_credentials' using errcode = '42501';
  end if;
  if s.admin_key_hash <> crypt(p_admin_key, s.admin_key_hash) then
    raise exception 'invalid_credentials' using errcode = '42501';
  end if;
  return s;
end;
$$;

create or replace function _skills_json(p_session uuid) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'label', label, 'description', description,
           'anchor', anchor, 'sort_order', sort_order
         ) order by sort_order, label), '[]'::jsonb)
  from skills where session_id = p_session;
$$;

-- ---------------------------------------------------------------- sessie aanmaken

create or replace function create_session(p_name text, p_admin_key text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s_id  uuid;
  s_code text;
  sk    jsonb;
  i     int;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name_required' using errcode = '22000';
  end if;
  if length(coalesce(p_admin_key, '')) < 8 then
    raise exception 'admin_key_too_short' using errcode = '22000';
  end if;

  -- korte, leesbare sessiecode (zonder makkelijk te verwarren tekens)
  loop
    s_code := (
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                               1 + floor(random() * 32)::int, 1), '')
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from sessions where code = s_code);
  end loop;

  insert into sessions (code, name, admin_key_hash, scale)
  values (s_code, trim(p_name), crypt(p_admin_key, gen_salt('bf')), default_scale())
  returning id into s_id;

  sk := default_skills();
  for i in 0 .. jsonb_array_length(sk) - 1 loop
    insert into skills (session_id, label, description, anchor, sort_order)
    values (s_id, sk->i->>'label', sk->i->>'description', coalesce(sk->i->>'anchor', ''), i);
  end loop;

  return jsonb_build_object('id', s_id, 'code', s_code, 'name', trim(p_name));
end;
$$;

-- ---------------------------------------------------------------- deelnemer

-- Alles wat een deelnemer nodig heeft, in één call. Bevat bewust geen
-- gegevens van andere deelnemers.
create or replace function get_participant(p_token text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p participants; s sessions;
begin
  select * into p from participants where token = p_token;
  if p.id is null then
    raise exception 'invalid_token' using errcode = '42501';
  end if;
  select * into s from sessions where id = p.session_id;

  return jsonb_build_object(
    'session', jsonb_build_object('name', s.name, 'code', s.code, 'scale', s.scale),
    'participant', jsonb_build_object(
      'id', p.id, 'name', p.name, 'role', p.role, 'submitted_at', p.submitted_at),
    'skills', _skills_json(s.id),
    'ratings', coalesce((
      select jsonb_agg(jsonb_build_object('skill_id', r.skill_id, 'state', r.state, 'value', r.value))
      from ratings r where r.participant_id = p.id), '[]'::jsonb)
  );
end;
$$;

create or replace function set_rating(p_token text, p_skill uuid, p_state text, p_value int)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare p participants;
begin
  select * into p from participants where token = p_token;
  if p.id is null then
    raise exception 'invalid_token' using errcode = '42501';
  end if;
  -- skill moet bij dezelfde sessie horen
  if not exists (select 1 from skills where id = p_skill and session_id = p.session_id) then
    raise exception 'unknown_skill' using errcode = '42501';
  end if;

  if p_value is null then
    delete from ratings where participant_id = p.id and skill_id = p_skill and state = p_state;
  else
    insert into ratings (participant_id, skill_id, state, value)
    values (p.id, p_skill, p_state, p_value)
    on conflict (participant_id, skill_id, state)
    do update set value = excluded.value, updated_at = now();
  end if;
end;
$$;

create or replace function set_participant_name(p_token text, p_name text, p_role text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update participants
     set name = coalesce(nullif(trim(p_name), ''), name),
         role = coalesce(trim(p_role), '')
   where token = p_token;
  if not found then
    raise exception 'invalid_token' using errcode = '42501';
  end if;
end;
$$;

create or replace function set_submitted(p_token text, p_submitted boolean)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update participants
     set submitted_at = case when p_submitted then now() else null end
   where token = p_token;
  if not found then
    raise exception 'invalid_token' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------- admin

create or replace function admin_get(p_code text, p_admin_key text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s sessions;
begin
  s := _session_by_admin(p_code, p_admin_key);
  return jsonb_build_object(
    'session', jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name, 'scale', s.scale),
    'skills', _skills_json(s.id),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pa.id, 'name', pa.name, 'role', pa.role, 'token', pa.token,
               'submitted_at', pa.submitted_at, 'created_at', pa.created_at)
             order by pa.created_at)
      from participants pa where pa.session_id = s.id), '[]'::jsonb),
    'ratings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'participant_id', r.participant_id, 'skill_id', r.skill_id,
               'state', r.state, 'value', r.value))
      from ratings r
      join participants pa on pa.id = r.participant_id
      where pa.session_id = s.id), '[]'::jsonb)
  );
end;
$$;

create or replace function admin_update_session(p_code text, p_admin_key text, p_name text, p_scale jsonb)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s sessions;
begin
  s := _session_by_admin(p_code, p_admin_key);
  update sessions
     set name  = coalesce(nullif(trim(p_name), ''), name),
         scale = coalesce(p_scale, scale)
   where id = s.id;
end;
$$;

-- Vervangt de volledige skill-lijst van de sessie in één transactie.
-- p_skills: [{id?, label, description, sort_order}]  — id weglaten = nieuwe skill.
-- Skills die niet in de lijst voorkomen worden verwijderd (inclusief hun scores).
create or replace function admin_set_skills(p_code text, p_admin_key text, p_skills jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s      sessions;
  item   jsonb;
  keep   uuid[] := '{}';
  new_id uuid;
  i      int := 0;
begin
  s := _session_by_admin(p_code, p_admin_key);
  if jsonb_typeof(p_skills) <> 'array' or jsonb_array_length(p_skills) = 0 then
    raise exception 'at_least_one_skill' using errcode = '22000';
  end if;

  for item in select * from jsonb_array_elements(p_skills) loop
    if coalesce(trim(item->>'label'), '') = '' then
      raise exception 'label_required' using errcode = '22000';
    end if;
    if item ? 'id' and (item->>'id') is not null and (item->>'id') <> '' then
      update skills
         set label = trim(item->>'label'),
             description = coalesce(item->>'description', ''),
             anchor = coalesce(item->>'anchor', ''),
             sort_order = i
       where id = (item->>'id')::uuid and session_id = s.id
      returning id into new_id;
      if new_id is null then
        raise exception 'unknown_skill' using errcode = '42501';
      end if;
    else
      insert into skills (session_id, label, description, anchor, sort_order)
      values (s.id, trim(item->>'label'), coalesce(item->>'description', ''),
              coalesce(item->>'anchor', ''), i)
      returning id into new_id;
    end if;
    keep := keep || new_id;
    i := i + 1;
  end loop;

  delete from skills where session_id = s.id and not (id = any(keep));
  return _skills_json(s.id);
end;
$$;

create or replace function admin_add_participant(p_code text, p_admin_key text, p_name text, p_role text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s sessions; p participants;
begin
  s := _session_by_admin(p_code, p_admin_key);
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name_required' using errcode = '22000';
  end if;
  insert into participants (session_id, name, role)
  values (s.id, trim(p_name), coalesce(trim(p_role), ''))
  returning * into p;
  return jsonb_build_object('id', p.id, 'name', p.name, 'role', p.role,
                            'token', p.token, 'submitted_at', p.submitted_at,
                            'created_at', p.created_at);
end;
$$;

create or replace function admin_update_participant(p_code text, p_admin_key text, p_id uuid, p_name text, p_role text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s sessions;
begin
  s := _session_by_admin(p_code, p_admin_key);
  update participants
     set name = coalesce(nullif(trim(p_name), ''), name),
         role = coalesce(trim(p_role), '')
   where id = p_id and session_id = s.id;
end;
$$;

create or replace function admin_delete_participant(p_code text, p_admin_key text, p_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s sessions;
begin
  s := _session_by_admin(p_code, p_admin_key);
  delete from participants where id = p_id and session_id = s.id;
end;
$$;

-- Alle sessies die bij deze adminsleutel horen. Eén sleutel kan meerdere
-- sessies beheren; dat is bewust, zodat een facilitator één credential heeft
-- in plaats van een code-plus-sleutel per sessie.
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

create or replace function admin_delete_session(p_code text, p_admin_key text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s sessions;
begin
  s := _session_by_admin(p_code, p_admin_key);
  delete from sessions where id = s.id;
end;
$$;

-- ---------------------------------------------------------------- rechten

revoke all on all tables in schema public from anon, authenticated;

do $$
declare fn text;
begin
  foreach fn in array array[
    'create_session(text,text)',
    'get_participant(text)',
    'set_rating(text,uuid,text,int)',
    'set_participant_name(text,text,text)',
    'set_submitted(text,boolean)',
    'admin_get(text,text)',
    'admin_update_session(text,text,text,jsonb)',
    'admin_set_skills(text,text,jsonb)',
    'admin_add_participant(text,text,text,text)',
    'admin_update_participant(text,text,uuid,text,text)',
    'admin_delete_participant(text,text,uuid)',
    'admin_delete_session(text,text)',
    'admin_list_sessions(text)'
  ] loop
    execute format('grant execute on function public.%s to anon, authenticated', fn);
  end loop;
end $$;

-- interne helpers blijven dicht
revoke execute on function public._session_by_admin(text,text) from anon, authenticated;
revoke execute on function public._skills_json(uuid) from anon, authenticated;
revoke execute on function public.new_token() from anon, authenticated;
