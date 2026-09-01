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
