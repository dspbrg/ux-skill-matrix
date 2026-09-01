-- BIJWERKEN — brengt een bestaande database in één keer bij
--
-- Vervangt de losse migraties 07 tot en met 10. Alles hieronder is
-- create-or-replace of afgeschermd, dus twee keer draaien kan geen kwaad.
--
-- Wat er verandert:
--   * De schaal heet nu Nog niet · Meegelopen · Zelf gedaan · Zelfstandig ·
--     Expert. 'Met review' maakte een omstandigheid tot maatstaf -- of er
--     iemand meekeek hangt af van wie die week beschikbaar was.
--   * Negen posities in plaats van vijf: de benoemde treden staan op 1, 3, 5,
--     7 en 9, ertussen zit telkens een 'hier tussenin'.
--   * Elke as krijgt naast het instapanker een senior-anker, want elke as
--     wordt langs een andere lijn senior.
--
-- BESTAANDE SCORES worden omgerekend van de oude schaal (1-5) naar de nieuwe
-- posities (1, 3, 5, 7, 9), en alleen als dat nog niet gebeurd is.

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
-- Aanvulling: stakeholders als elfde as, en een ronde over de ankerteksten.
-- Let op: dit geldt voor sessies die je hierna aanmaakt. Een bestaande
-- sessie vul je aan onder Instellingen.

-- De elf assen. Elke as heeft twee ankers: waar je instapt en waar het heen
-- groeit. Die tweede is per as iets anders -- onderzoek groeit langs
-- repertoire, toegankelijkheid langs diepte, faciliteren langs schaal,
-- stakeholders langs tegengestelde belangen.
--
-- Stakeholders staat los van faciliteren en presenteren: faciliteren is of je
-- een sessie kunt leiden, presenteren of je het kunt overbrengen, en dit of je
-- met de belangen kunt omgaan. Bij een overheidsorganisatie is dat laatste
-- vaak wat bepaalt of ontwerpwerk ergens landt.
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
    jsonb_build_object('label','Stakeholders',              'description','',
      'anchor','weten wie waarover beslist en wat die nodig heeft',
      'anchor_senior','tegengestelde belangen bij elkaar brengen tot een besluit dat standhoudt'),
    jsonb_build_object('label','Presenteren & overtuigen',  'description','',
      'anchor','je bevindingen delen in het team',
      'anchor_senior','een zaal met belanghebbenden meekrijgen, met eigen materiaal')
  );
$$;
