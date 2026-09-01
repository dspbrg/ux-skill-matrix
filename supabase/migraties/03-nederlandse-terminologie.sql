-- Migratie 03 — Nederlandse terminologie, tien assen incl. WCAG, per as een
-- ankerpunt, en een schaal die meet hoeveel vangnet er onder het werk lag.
-- Alles is create-or-replace: twee keer draaien kan geen kwaad.

alter table skills add column if not exists anchor text not null default '';

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

create or replace function _skills_json(p_session uuid) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'label', label, 'description', description,
           'anchor', anchor, 'sort_order', sort_order
         ) order by sort_order, label), '[]'::jsonb)
  from skills where session_id = p_session;
$$;

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
