-- BIJWERKEN — draai dit één keer in de Supabase SQL Editor
--
-- Dit bestand vervangt alle losse migraties na 06 en is idempotent: twee keer
-- draaien kan geen kwaad. Je bestaande scores worden omgerekend van de oude
-- vijfpuntsschaal naar de negen posities, en alleen als dat nog niet gebeurd is.
--
-- Wat er verandert:
--   * negen posities in plaats van vijf, met de vijf benoemde treden op
--     1, 3, 5, 7 en 9
--   * de schaal heet Nog niet · Meegelopen · Zelf gedaan · Zelfstandig · Expert
--   * elke as krijgt twee ankers: waar je instapt en waar het heen groeit
--   * 'een doel kan niet lager zijn dan waar je nu staat' wordt op de server
--     afgedwongen, niet alleen in de knoppen
--   * de schaal kan niet meer buiten twee tot vijf treden worden gezet, en niet
--     kleiner dan de scores die er al staan
--   * twee ongebruikte functies vervallen

alter table skills add column if not exists anchor_senior text not null default '';

do $bijwerken$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'ratings'::regclass
      and conname = 'ratings_value_check'
      and pg_get_constraintdef(oid) like '%5)%'
  ) then
    alter table ratings drop constraint ratings_value_check;
    update ratings set value = value * 2 - 1;
    alter table ratings add constraint ratings_value_check check (value between 1 and 9);
    raise notice 'Scores omgerekend naar de negenpuntsschaal.';
  else
    raise notice 'Scores stonden al goed; niets omgerekend.';
  end if;
end
$bijwerken$;

-- De tien assen. Elke as heeft twee ankers: waar je instapt en waar het
-- heen groeit. Die tweede is per as iets anders -- onderzoek groeit langs
-- repertoire, toegankelijkheid langs diepte, faciliteren langs schaal -- en
-- juist dat maakt het verschil tussen "kan contrast controleren" en "kan
-- toegankelijkheid overdragen".
create or replace function default_skills() returns jsonb
language sql immutable as $$
  select jsonb_build_array(
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
      'anchor_senior','een scherm opleveren dat een ander kan bouwen zonder te gokken'),
    jsonb_build_object('label','Prototyping',               'description','',
      'anchor','schermen aan elkaar klikken',
      'anchor_senior','een prototype op precies het detailniveau dat de vraag vraagt'),
    jsonb_build_object('label','UX Writing',                'description','',
      'anchor','losse labels en knopteksten schrijven',
      'anchor_senior','de teksten van een hele flow, inclusief fout- en randgevallen'),
    jsonb_build_object('label','Toegankelijkheid (WCAG)',   'description','',
      'anchor','contrast en alt-teksten controleren',
      'anchor_senior','focusvolgorde, aria en toetsenbordpaden beoordelen'),
    jsonb_build_object('label','Faciliteren',               'description','',
      'anchor','een sessie met een handjevol mensen begeleiden',
      'anchor_senior','een volle zaal, met eigen werkvormen'),
    jsonb_build_object('label','Presenteren & overtuigen',  'description','',
      'anchor','je bevindingen delen in het team',
      'anchor_senior','een zaal met belanghebbenden meekrijgen, met eigen materiaal')
  );
$$;

-- De schaal gaat over het werk, niet over de persoon. Twee eerdere versies
-- gingen daar onderuit: "met vangnet" zette de invuller neer als iemand die
-- beschermd moest worden, en "met review" maakte een omstandigheid tot
-- maatstaf — of er iemand meekeek hangt af van wie die week beschikbaar was,
-- niet van wat je kunt. Wie in een klein team iets één keer alleen deed
-- zonder dat iemand ernaar keek, viel daardoor door de ladder heen.
--
-- De grens die er wél toe doet ligt tussen 3 en 4, en die gaat over kunnen
-- onderbouwen waarom je het zo aanpakt. Bewust niet over zekerheid: een zin
-- als "of het goed was weet je niet" is een uitspraak over iemands twijfel,
-- en die lees je hardop naast je collega.
--
-- Trede 3 is daarmee breed — één keer zelf gedaan en tien keer zelf gedaan
-- zitten er allebei in.
create or replace function default_scale() returns jsonb
language sql immutable as $$
  select jsonb_build_array(
    jsonb_build_object('level',1,'label','Nog niet',    'description','Je weet wat het is, maar je hebt het nog niet gedaan.'),
    jsonb_build_object('level',2,'label','Meegelopen',  'description','Je liep mee; iemand anders trok het.'),
    jsonb_build_object('level',3,'label','Zelf gedaan', 'description','Je hebt het zelf gedaan, van begin tot eind.'),
    jsonb_build_object('level',4,'label','Zelfstandig', 'description','Je doet het zelf en kunt onderbouwen waarom je het zo aanpakt.'),
    jsonb_build_object('level',5,'label','Expert',      'description','Anderen komen bij jou.')
  );
$$;

create or replace function _skills_json(p_session uuid) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'label', label, 'description', description,
           'anchor', anchor, 'anchor_senior', anchor_senior, 'sort_order', sort_order
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
    insert into skills (session_id, label, description, anchor, anchor_senior, sort_order)
    values (s_id, sk->i->>'label', sk->i->>'description',
            coalesce(sk->i->>'anchor', ''), coalesce(sk->i->>'anchor_senior', ''), i);
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


-- ---------------------------------------------------------------------
-- Aanvulling: een ronde over de ankerteksten.
-- Let op: dit geldt voor sessies die je hierna aanmaakt. Een bestaande
-- sessie pas je aan onder Instellingen.

-- De tien assen. Elke as heeft twee ankers: waar je instapt en waar het heen
-- groeit. Die tweede is per as iets anders -- onderzoek groeit langs
-- repertoire, toegankelijkheid langs diepte, faciliteren langs schaal,
-- presenteren langs publiek.
create or replace function default_skills() returns jsonb
language sql immutable as $$
  select jsonb_build_array(
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
-- Migratie 11 — de regels ook op de server
--
-- Twee regels stonden alleen in de interface, en die is niet de enige weg
-- naar deze functies.
--
-- 1. "Een doel kan niet lager zijn dan waar je nu staat" werd alleen in de
--    knoppen afgedwongen. Twee tabbladen naast elkaar -- normaal genoeg als
--    iemand zijn link nog een keer opent -- en het staat er alsnog. Dan
--    rekent de kloof-tabel bij de facilitator met een negatief verschil en
--    zakt die as ten onrechte naar de bodem.
--
-- 2. De schaal-editor liet zeven treden toe. Zeven treden zijn dertien
--    posities, terwijl de waardecontrole op ratings er negen aankan: de
--    deelnemer kreeg een onvertaalde databasefout zodra hij een hoge positie
--    aanklikte. Minder treden was net zo fout -- dan werden bestaande scores
--    onbereikbaar en onzichtbaar.
--
-- Verder vervallen set_participant_name en admin_update_participant: die
-- worden nergens vanuit de app aangeroepen en zijn dus alleen aanvalsoppervlak.

drop function if exists set_participant_name(text, text, text);
drop function if exists admin_update_participant(text, text, uuid, text, text);

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

create or replace function admin_update_session(p_code text, p_admin_key text, p_name text, p_scale jsonb)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s sessions;
begin
  s := _session_by_admin(p_code, p_admin_key);

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

  update sessions
     set name  = coalesce(nullif(trim(p_name), ''), name),
         scale = coalesce(p_scale, scale)
   where id = s.id;
end;
$$;
