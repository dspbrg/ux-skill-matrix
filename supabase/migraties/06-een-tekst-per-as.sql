-- Migratie 06 — één tekst per as in plaats van twee
--
-- Elke as had een omschrijving én een ankerpunt die vrijwel hetzelfde
-- zeiden, tien keer onder elkaar. Het ankerpunt blijft en heeft de
-- concrete details uit de omschrijving opgenomen.
--
-- Let op: dit verandert alleen sessies die je hierna aanmaakt.

-- De tien assen. Elke as is geformuleerd als iets wat je kunt opleveren, niet
-- als een vakgebied: "kleur" of "typografie" is geen skill waarop iemand
-- zichzelf een cijfer kan geven, "een scherm ontwerpen binnen een
-- designsysteem" wel.
--
-- Eén tekst per as, en dat is het ankerpunt: wat één keer "dit gedaan hebben"
-- concreet is. Er stond hiervoor ook een omschrijving bij, maar die zei
-- vrijwel hetzelfde in andere woorden — tien keer een parafrase onder elkaar.
-- Het ankerpunt heeft nu de concrete details opgenomen die daar stonden.
create or replace function default_skills() returns jsonb
language sql immutable as $$
  select jsonb_build_array(
    jsonb_build_object('label','Kwalitatief onderzoek',   'description','',
      'anchor','een testronde met een handvol deelnemers: opzet, moderatie en terugkoppeling'),
    jsonb_build_object('label','Kwantitatief onderzoek',  'description','',
      'anchor','een vragenlijst of analytics-vraag, van vraagstelling tot conclusie'),
    jsonb_build_object('label','Informatiearchitectuur',  'description','',
      'anchor','een navigatiestructuur ontwerpen én toetsen met een card sort of tree test'),
    jsonb_build_object('label','Interaction Design',      'description','',
      'anchor','een flow uitwerken inclusief lege, fout- en laadstates, klaar om te bouwen'),
    jsonb_build_object('label','UI Design',               'description','',
      'anchor','een scherm opleveren binnen het designsysteem: hiërarchie, componenten, states'),
    jsonb_build_object('label','Prototyping',             'description','',
      'anchor','een klikbaar prototype waarmee iemand anders kon testen'),
    jsonb_build_object('label','UX Writing',              'description','',
      'anchor','de teksten van een hele flow: labels, knoppen, foutmeldingen'),
    jsonb_build_object('label','Toegankelijkheid (WCAG)', 'description','',
      'anchor','een ontwerp toetsen op contrast, focusvolgorde, koppen en alt-teksten, met concrete bevindingen'),
    jsonb_build_object('label','Faciliteren',             'description','',
      'anchor','een sessie met stakeholders begeleiden waar een besluit uit komt'),
    jsonb_build_object('label','Presenteren & overtuigen','description','',
      'anchor','onderzoek presenteren aan mensen die er anders in staan, en het verandert iets')
  );
$$;
