-- Migratie 08 — trede 3 herzien
--
-- 'Met review' maakte een omstandigheid tot maatstaf: of er iemand meekeek
-- hangt af van wie die week beschikbaar was. Wie iets één keer alleen deed
-- zonder dat er iemand naar keek, viel door de ladder heen.
--
-- Trede 3 heet nu 'Zelf gedaan'. De grens naar 4 gaat over kunnen
-- onderbouwen, niet over zekerheid — dat laatste is een uitspraak over
-- iemands twijfel.
--
-- Let op: dit verandert alleen sessies die je hierna aanmaakt. Bestaande
-- sessies pas je aan onder Instellingen.

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
