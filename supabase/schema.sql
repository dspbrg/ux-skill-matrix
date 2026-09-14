-- =====================================================================
-- UX Skill Matrix  ·  Supabase schema
-- Gebaseerd op het NN/g UX Skill Mapping template (Rachel Krause).
--
-- Beveiligingsmodel
--   RLS staat aan op alle tabellen en er zijn GEEN policies: de anon-key
--   kan dus niets rechtstreeks lezen of schrijven. Alle toegang loopt via
--   de SECURITY DEFINER functies onderaan dit bestand.
--
--   Twee soorten toegang, en ze lijken niet op elkaar:
--     · De deelnemer heeft een token in zijn link en verder niets. Geen
--       account, geen inlog — iemand die op locatie staat in te vullen moet
--       niet eerst een wachtwoord hoeven bedenken.
--     · De facilitator is een ingelogd account. De sessie heeft een eigenaar
--       (sessions.owner) en de adminfuncties kijken naar auth.uid().
--
--   Dat was eerst een adminsleutel: acht tekens, door een mens verzonnen,
--   ingetypt op een publieke pagina, en daarmee het enige wat het zelfbeeld
--   van een heel team afschermde. Een gedeeld geheim is het verkeerde
--   gereedschap als er maar één facilitator is.
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
  owner          uuid references auth.users(id) on delete cascade,
  scale          jsonb not null,
  -- Welk thema de deelnemers van deze sessie te zien krijgen. Een sessie is
  -- één team bij één opdrachtgever, dus daar hoort het thuis: niet per persoon
  -- (dan zet je het vier keer) en niet per browser (dan hangt het ervan af wie
  -- er toevallig eerder op dat apparaat heeft ingevuld).
  theme          text not null default 'eigen'
                 constraint sessions_theme_check check (theme in ('eigen', 'coa')),
  created_at     timestamptz not null default now()
);

-- Voor een database die de sleutelversie al draaide. Op een verse database
-- doen deze twee regels niets.
alter table sessions drop column if exists admin_key_hash;
alter table sessions add  column if not exists owner uuid references auth.users(id) on delete cascade;
alter table sessions add  column if not exists theme text not null default 'eigen';
do $$ begin
  alter table sessions add constraint sessions_theme_check check (theme in ('eigen', 'coa'));
exception when duplicate_object then null; end $$;
create index if not exists sessions_owner_idx on sessions(owner);

create table if not exists skills (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  label       text not null,
  description text not null default '',
  -- Wat "dit heb ik zelfstandig gedaan" (niveau 3) op déze as concreet
  -- betekent. Eén anker per as is genoeg: niveau 1 en 2 spreken voor zich en
  -- niveau 4 is overal hetzelfde (je kunt het overdragen).
  -- Twee ankers, want elke as wordt langs een andere lijn senior: onderzoek
  -- langs repertoire, toegankelijkheid langs diepte, faciliteren langs schaal.
  -- Eén generieke ladder meet alleen zelfstandigheid, en dan scoort iemand die
  -- alleen contrast kan controleren een vier op toegankelijkheid.
  anchor        text not null default '',   -- de instap
  anchor_senior text not null default '',   -- waar het heen groeit
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
  -- Negen posities: de vijf benoemde treden staan op 1, 3, 5, 7 en 9, de vier
  -- even posities betekenen "hier tussenin". Acht benoemde treden bestaan niet
  -- -- je zou onderscheidingen moeten verzinnen die niemand kan toepassen --
  -- maar tussen twee dingen die je wél kunt benoemen kun je prima staan.
  value          int  not null check (value between 1 and 9),
  updated_at     timestamptz not null default now(),
  primary key (participant_id, skill_id, state)
);

alter table sessions     enable row level security;
alter table skills       enable row level security;
alter table participants enable row level security;
alter table ratings      enable row level security;

-- ---------------------------------------------------------------- defaults

-- De elf assen. Elke as heeft twee ankers: waar je instapt en waar het heen
-- groeit. Die tweede is per as iets anders -- onderzoek groeit langs
-- repertoire, toegankelijkheid langs diepte, faciliteren langs schaal,
-- presenteren langs publiek.
create or replace function default_skills() returns jsonb
language sql immutable as $$
  select jsonb_build_array(
    -- Strategie staat vooraan omdat het in het werk ook vooraan staat: de
    -- vraag scherp krijgen gaat aan het onderzoek vooraf. Deze as ontbrak en
    -- dat was het enige echte gat tegenover de achttien van Daniel Birch —
    -- wij maten wat iemand maakt en onderzoekt, niet of iemand de vraag achter
    -- de vraag boven tafel krijgt. Voor een lead is dat de belangrijkste.
    jsonb_build_object('label','Strategie & planning',      'description','',
      'anchor','inschatten wat een vraag aan UX-werk kost en wat je daarvoor nodig hebt',
      'anchor_senior','de vraag achter de vraag boven tafel krijgen, en de UX-agenda voor een half jaar uitzetten'),
    jsonb_build_object('label','Kwalitatief onderzoek',     'description','',
      'anchor','een usability test draaien die iemand anders bedacht',
      'anchor_senior','de methode kiezen die bij de vraag past, en de hypothese scherpstellen'),
    jsonb_build_object('label','Kwantitatief onderzoek',    'description','',
      'anchor','een vragenlijst uitzetten en de uitkomsten samenvatten',
      'anchor_senior','een hypothese toetsbaar maken, en zien wanneer een cijfer niets zegt'),
    jsonb_build_object('label','Informatiearchitectuur',    'description','',
      'anchor','een menu of paginastructuur voorstellen',
      'anchor_senior','een structuur ontwerpen én toetsen met een card sort of tree test'),
    jsonb_build_object('label','Interaction Design',        'description','',
      'anchor','het gelukkige pad uittekenen',
      'anchor_senior','alle states uitwerken: leeg, fout, laden en de randgevallen'),
    jsonb_build_object('label','UI Design',                 'description','',
      'anchor','een scherm samenstellen uit bestaande componenten',
      'anchor_senior','een bestand opleveren waar een developer niet uit hoeft te gokken: auto-layout, componenten, tokens en states'),
    jsonb_build_object('label','Prototyping',               'description','',
      'anchor','een klikbaar prototype maken van schermen die er al zijn',
      'anchor_senior','het detailniveau kiezen dat de vraag vraagt, en niet meer bouwen dan dat'),
    jsonb_build_object('label','UX Writing',                'description','',
      'anchor','losse labels en knopteksten schrijven',
      'anchor_senior','de teksten van een hele flow, inclusief fout- en randgevallen'),
    jsonb_build_object('label','Toegankelijkheid (WCAG)',   'description','',
      'anchor','contrast en alt-teksten controleren',
      'anchor_senior','focusvolgorde, aria en toetsenbordpaden beoordelen'),
    jsonb_build_object('label','Faciliteren',               'description','',
      'anchor','een sessie met een handjevol mensen begeleiden',
      'anchor_senior','een volle zaal, met werkvormen die je zelf kiest'),
    jsonb_build_object('label','Presenteren & overtuigen',  'description','',
      'anchor','je bevindingen delen in het team',
      'anchor_senior','een zaal met belanghebbenden meekrijgen, met eigen materiaal')
  );
$$;

-- De treden zijn werkwoorden en geen voltooide deelwoorden. "Meegedaan" en
-- "Zelf gedaan" lazen als een stickerkaart — dat vraag je een kind over een
-- tekening, niet een collega over zijn vak. Een werkwoord benoemt wat je op dat
-- niveau doet in plaats van wat je hebt afgevinkt, en het houdt de schaal weg
-- van bijvoeglijke naamwoorden als "bekwaam" of "ervaren", die over de persoon
-- gaan in plaats van over het werk.
--
-- De schaal gaat over het werk, niet over de persoon. Twee eerdere versies
-- gingen daar onderuit: "met vangnet" zette de invuller neer als iemand die
-- beschermd moest worden, en "met review" maakte een omstandigheid tot
-- maatstaf — of er iemand meekeek hangt af van wie die week beschikbaar was,
-- niet van wat je kunt. Wie in een klein team iets één keer alleen deed
-- zonder dat iemand ernaar keek, viel daardoor door de ladder heen.
--
-- De grens die er wél toe doet ligt tussen 3 en 4, en hij gaat over wie de
-- aanpak bepaalt. Bewust niet over zekerheid: een zin als "of het goed was
-- weet je niet" is een uitspraak over iemands twijfel, en die lees je hardop
-- naast je collega.
--
-- Halverwege verandert de ladder van maatstaf, en dat is opzet. De onderste
-- helft telt blootstelling: heb je het gedaan, en wie trok het. Die vraag is
-- op bij trede 3 — daarboven heeft iedereen met een paar jaar ervaring hem
-- allang beantwoord, en een schaal die daar doortelt loopt vol op 5.
-- De bovenste helft meet daarom repertoire en overdracht: heb je het in
-- verschillende situaties gedaan en kies jij de aanpak als de vraag nog niet
-- vaststaat (4), en kan iemand anders het van je overnemen (5). Zo blijft er
-- boven een half jaar ervaring nog iets te gaan, en betekent een 5 iets
-- anders dan "doet het al een tijdje".
--
-- Bewust geen aantal in trede 4, al ligt "drie keer gedaan" voor de hand. Een
-- telling meet waar iemand op stond en niet wat hij kan: wie dit jaar op het
-- onderzoekszware traject zat telt hoger dan wie de beheerstroom draaide. Ze
-- schaalt ook niet over de assen — drie usability tests is veel, drie keer een
-- knoptekst schrijven is dinsdag — en ze dwingt per as een definitie af van
-- wat meetelt. Dat zijn tien definities die erbij uitgelegd moeten worden, en
-- juist dat hoeft hier niet.
--
-- Om dezelfde reden staat er nergens "ken de theorie". Dat is een andere as,
-- geen lagere trede: wie zes sessies faciliteerde zonder een boek open te
-- slaan zou eronder komen te staan.
--
-- Trede 3 is daarmee bewust begrensd: één keer of tien keer zelf gedraaid
-- zitten er allebei in, maar allebei bij een vraag die al scherp was.
create or replace function default_scale() returns jsonb
language sql immutable as $$
  select jsonb_build_array(
    jsonb_build_object('level',1,'label','Nog niet',  'description','Je hebt hier nog niet aan gewerkt.'),
    jsonb_build_object('level',2,'label','Meewerken', 'description','Je draagt bij; iemand anders richt het werk in.'),
    jsonb_build_object('level',3,'label','Uitvoeren', 'description','Je voert het zelfstandig uit, bij een vraag die al scherp is.'),
    jsonb_build_object('level',4,'label','Bepalen',   'description','Je bepaalt de aanpak zelf, ook bij een open vraag, in uiteenlopende situaties.'),
    jsonb_build_object('level',5,'label','Overdragen','description','Collega''s schakelen je in, en je maakt je werkwijze overdraagbaar.')
  );
$$;

-- ---------------------------------------------------------------- helpers

-- Oude signaturen van vóór het inloggen met een account. Postgres vervangt een
-- functie alleen als de parameterlijst gelijk is; anders komt de nieuwe naast
-- de oude te staan en blijft de sleutelversie gewoon aanroepbaar. Op een verse
-- database doet dit blok niets.
drop function if exists _session_by_admin(text,text);
drop function if exists create_session(text,text);
drop function if exists admin_get(text,text);
drop function if exists admin_update_session(text,text,text,jsonb);
drop function if exists admin_update_session(text,text,jsonb);
drop function if exists admin_set_skills(text,text,jsonb);
drop function if exists admin_add_participant(text,text,text,text);
drop function if exists admin_delete_participant(text,text,uuid);
drop function if exists admin_list_sessions(text);
drop function if exists admin_delete_session(text,text);

create or replace function _session_owned(p_code text)
returns sessions
language plpgsql security definer set search_path = public, extensions as $$
declare s sessions;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select * into s from sessions where code = upper(trim(p_code));
  -- Bestaat niet en niet van jou geven hetzelfde antwoord. Verschil maken zou
  -- van dit scherm een manier maken om te ontdekken wélke codes bestaan.
  if s.id is null or s.owner is distinct from auth.uid() then
    raise exception 'no_access' using errcode = '42501';
  end if;
  return s;
end;
$$;

create or replace function _skills_json(p_session uuid) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'label', label, 'description', description,
           'anchor', anchor, 'anchor_senior', anchor_senior, 'sort_order', sort_order
         ) order by sort_order, label), '[]'::jsonb)
  from skills where session_id = p_session;
$$;

-- ---------------------------------------------------------------- sessie aanmaken

create or replace function create_session(p_name text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s_id  uuid;
  s_code text;
  sk    jsonb;
  i     int;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name_required' using errcode = '22000';
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

  insert into sessions (code, name, owner, scale)
  values (s_code, trim(p_name), auth.uid(), default_scale())
  returning id into s_id;

  sk := default_skills();
  for i in 0 .. jsonb_array_length(sk) - 1 loop
    insert into skills (session_id, label, description, anchor, anchor_senior, sort_order)
    values (s_id, sk->i->>'label', sk->i->>'description',
            coalesce(sk->i->>'anchor', ''), coalesce(sk->i->>'anchor_senior', ''), i);
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
    'session', jsonb_build_object('name', s.name, 'code', s.code, 'scale', s.scale, 'theme', s.theme),
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
    -- Een doel lager dan waar je nu staat is geen ontwikkeldoel. Dat stond
    -- alleen in de interface, en die is niet de enige weg naar deze functie:
    -- twee tabbladen naast elkaar, of een half mislukt schrijfpaar, en het
    -- staat er alsnog.
    if p_state = 'future' then
      if exists (
        select 1 from ratings r
        where r.participant_id = p.id and r.skill_id = p_skill
          and r.state = 'current' and r.value > p_value
      ) then
        raise exception 'future_below_current' using errcode = '22000';
      end if;
    else
      -- gaat het huidige niveau omhoog, dan schuift een lager doel mee
      update ratings set value = p_value, updated_at = now()
       where participant_id = p.id and skill_id = p_skill
         and state = 'future' and value < p_value;
    end if;

    insert into ratings (participant_id, skill_id, state, value)
    values (p.id, p_skill, p_state, p_value)
    on conflict (participant_id, skill_id, state)
    do update set value = excluded.value, updated_at = now();
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

create or replace function admin_get(p_code text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s sessions;
begin
  s := _session_owned(p_code);
  return jsonb_build_object(
    'session', jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name, 'scale', s.scale, 'theme', s.theme),
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

create or replace function admin_update_session(p_code text, p_name text, p_scale jsonb, p_theme text default null)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s sessions;
begin
  s := _session_owned(p_code);

  -- Vijf benoemde treden worden negen posities, en negen is wat de
  -- waardecontrole op ratings aankan. Meer treden liet de interface toe en
  -- leverde deelnemers een onvertaalde databasefout op zodra ze een hoge
  -- positie aanklikten; minder treden maakte bestaande scores onbereikbaar.
  if p_scale is not null then
    if jsonb_typeof(p_scale) <> 'array'
       or jsonb_array_length(p_scale) < 2
       or jsonb_array_length(p_scale) > 5 then
      raise exception 'scale_out_of_range' using errcode = '22000';
    end if;
    if exists (
      select 1 from ratings r
      join participants pa on pa.id = r.participant_id
      where pa.session_id = s.id
        and r.value > jsonb_array_length(p_scale) * 2 - 1
    ) then
      raise exception 'scale_too_small_for_scores' using errcode = '22000';
    end if;
  end if;

  if p_theme is not null and p_theme not in ('eigen', 'coa') then
    raise exception 'unknown_theme' using errcode = '22000';
  end if;

  update sessions
     set name  = coalesce(nullif(trim(p_name), ''), name),
         scale = coalesce(p_scale, scale),
         theme = coalesce(p_theme, theme)
   where id = s.id;
end;
$$;

-- Vervangt de volledige skill-lijst van de sessie in één transactie.
-- p_skills: [{id?, label, description, sort_order}]  — id weglaten = nieuwe skill.
-- Skills die niet in de lijst voorkomen worden verwijderd (inclusief hun scores).
create or replace function admin_set_skills(p_code text, p_skills jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s      sessions;
  item   jsonb;
  keep   uuid[] := '{}';
  new_id uuid;
  i      int := 0;
begin
  s := _session_owned(p_code);
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
             anchor_senior = coalesce(item->>'anchor_senior', ''),
             sort_order = i
       where id = (item->>'id')::uuid and session_id = s.id
      returning id into new_id;
      if new_id is null then
        raise exception 'unknown_skill' using errcode = '42501';
      end if;
    else
      insert into skills (session_id, label, description, anchor, anchor_senior, sort_order)
      values (s.id, trim(item->>'label'), coalesce(item->>'description', ''),
              coalesce(item->>'anchor', ''), coalesce(item->>'anchor_senior', ''), i)
      returning id into new_id;
    end if;
    keep := keep || new_id;
    i := i + 1;
  end loop;

  delete from skills where session_id = s.id and not (id = any(keep));
  return _skills_json(s.id);
end;
$$;

create or replace function admin_add_participant(p_code text, p_name text, p_role text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s sessions; p participants;
begin
  s := _session_owned(p_code);
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

create or replace function admin_delete_participant(p_code text, p_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s sessions;
begin
  s := _session_owned(p_code);
  delete from participants where id = p_id and session_id = s.id;
end;
$$;

-- Alle sessies van de ingelogde facilitator. Eén account kan meerdere sessies
-- beheren — najaar 2026, voorjaar 2027 — zonder dat er per sessie iets te
-- onthouden valt.
create or replace function admin_list_sessions()
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
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
    where s.owner = auth.uid()
  ) t;

  return result;
end;
$$;

create or replace function admin_delete_session(p_code text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s sessions;
begin
  s := _session_owned(p_code);
  delete from sessions where id = s.id;
end;
$$;

-- ---------------------------------------------------------------- rechten

revoke all on all tables in schema public from anon, authenticated;

-- De deelnemer heeft geen account: zijn drie functies staan open voor anon.
-- Ze controleren zelf het token uit de link.
do $$
declare fn text;
begin
  foreach fn in array array[
    'get_participant(text)',
    'set_rating(text,uuid,text,int)',
    'set_submitted(text,boolean)'
  ] loop
    execute format('grant execute on function public.%s to anon, authenticated', fn);
  end loop;
end $$;

-- De facilitator is ingelogd, dus deze horen niet bij anon thuis. Ze kijken
-- allemaal zelf naar auth.uid(), maar een functie die zonder account niet eens
-- aanroepbaar is, is één laag minder om je in te vergissen.
do $$
declare fn text;
begin
  foreach fn in array array[
    'create_session(text)',
    'admin_get(text)',
    'admin_update_session(text,text,jsonb,text)',
    'admin_set_skills(text,jsonb)',
    'admin_add_participant(text,text,text)',
    'admin_delete_participant(text,uuid)',
    'admin_delete_session(text)',
    'admin_list_sessions()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', fn);
    execute format('grant  execute on function public.%s to authenticated', fn);
  end loop;
end $$;

-- Interne helpers blijven dicht — en dat moet ook van public, niet alleen van
-- anon en authenticated. Postgres geeft EXECUTE op een nieuwe functie namelijk
-- standaard aan PUBLIC, en Supabase geeft er via default privileges nog een
-- expliciete grant aan anon bovenop. Wie alleen die laatste intrekt haalt één
-- van de twee weg: de rol erft het recht daarna gewoon via PUBLIC en kan de
-- functie nog steeds aanroepen. Dat was hier zo, en het viel niet op omdat de
-- revoke zelf zonder klagen slaagde.
--
-- Wat er lekte: _skills_json(uuid) gaf de assen van elke sessie terug zonder
-- enige controle, en de toenmalige _session_by_admin gaf bij een kloppende
-- sleutel de hele sessierij inclusief de bcrypt-hash van die sleutel. Allebei
-- buiten de controle om die de hele opzet nu juist moet afdwingen.
revoke execute on function public._session_owned(text)         from public, anon, authenticated;
revoke execute on function public._skills_json(uuid)           from public, anon, authenticated;
revoke execute on function public.new_token()                  from public, anon, authenticated;
revoke execute on function public.default_skills()             from public, anon, authenticated;
revoke execute on function public.default_scale()              from public, anon, authenticated;
