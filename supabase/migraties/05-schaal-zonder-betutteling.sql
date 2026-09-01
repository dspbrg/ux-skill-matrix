-- Migratie 05 — de schaal gaat over het werk, niet over de persoon
--
-- 'Met vangnet' en 'Met rugdekking' framen de invuller allebei als iemand
-- die beschermd moet worden. 'Met review' beschrijft wat er feitelijk
-- gebeurde, en review is normaal werk op elk niveau. 'Vraagbaak' wordt
-- 'Expert', zoals in het NN/g-origineel.
--
-- Let op: dit verandert alleen sessies die je hierna aanmaakt. Bestaande
-- sessies pas je aan onder Instellingen.

-- De schaal gaat over het werk, niet over de persoon: is het nagekeken, of
-- beoordeel je zelf of het goed genoeg was. Eerdere woorden als "vangnet" en
-- "rugdekking" zetten de invuller neer als iemand die beschermd moet worden;
-- review is normaal werk op elk niveau, ook bij een lead.
--
-- De schaal meet dus hoeveel toezicht er op het werk lag, niet óf je het ooit
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
    jsonb_build_object('level',3,'label','Met review',     'description','Je hebt dit een enkele keer zelf gedaan; iemand anders keek het na.'),
    jsonb_build_object('level',4,'label','Zelfstandig',    'description','Je doet dit regelmatig alleen en beoordeelt zelf of het goed genoeg is.'),
    jsonb_build_object('level',5,'label','Expert',         'description','Anderen komen bij jou; je kunt het uitleggen en verbeteren.')
  );
$$;
