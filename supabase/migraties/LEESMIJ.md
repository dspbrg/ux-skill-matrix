# Migraties

`schema.sql` in de map hierboven is de volledige, actuele definitie — draai die
op een leeg project. Deze map bevat de losse stappen voor een project dat al
draait, op volgorde.

Draaien: Supabase dashboard → **SQL Editor** → **New query** → inhoud plakken →
**Run**. Alles is `create or replace` / `if not exists`, dus twee keer draaien
kan geen kwaad.

| | Wat het doet |
| --- | --- |
| `01-sessie-verwijderen.sql` | `admin_delete_session`, zodat een sessie met alle deelnemers en scores weg kan |
| `02-inloggen-met-alleen-de-sleutel.sql` | `admin_list_sessions`, zodat de adminsleutel alleen genoeg is om in te loggen |
| `03-nederlandse-terminologie.sql` | Tien Nederlandse assen incl. WCAG, een ankerpunt per as, en de schaal die vangnet meet |
| `04-schaallabels.sql` | Vriendelijkere niveaulabels |
| `05-schaal-zonder-betutteling.sql` | De schaal gaat over het werk, niet over de persoon |
| `06-een-tekst-per-as.sql` | Eén tekst per as in plaats van twee |
| **`BIJWERKEN.sql`** | **Brengt alles daarna in één keer bij: de huidige schaal, negen posities en twee ankers per as. Vervangt de losse stappen 07 t/m 10.** |

Let op: de skills en de schaal worden gekopieerd op het moment dat een sessie
wordt aangemaakt. Een migratie verandert daarom alleen wat je daarna aanmaakt,
niet wat er al staat.
