-- Migratie 04 — vriendelijkere niveaulabels
--
-- 'Nooit gedaan' klonk als een verwijt en 'Met vangnet' als toezicht.
-- 'Nog niet' zegt hetzelfde maar houdt de deur open, en 'Met rugdekking'
-- gaat over iemand die achter je staat in plaats van boven je.
--
-- Let op: dit verandert alleen sessies die je hierna aanmaakt. Bestaande
-- sessies pas je aan onder Instellingen.

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
    jsonb_build_object('level',1,'label','Nog niet',       'description','Je weet wat het is, maar je hebt het nog niet gedaan.'),
    jsonb_build_object('level',2,'label','Meegelopen',     'description','Je hebt een keer meegedaan; iemand anders trok het.'),
    jsonb_build_object('level',3,'label','Met rugdekking', 'description','Je hebt dit een enkele keer zelf gedaan, met iemand die meekeek of achteraf corrigeerde.'),
    jsonb_build_object('level',4,'label','Zelfstandig',    'description','Je doet dit regelmatig alleen én je ziet zelf of het goed genoeg is.'),
    jsonb_build_object('level',5,'label','Vraagbaak',      'description','Anderen komen bij jou; je kunt het uitleggen en verbeteren.')
  );
$$;
