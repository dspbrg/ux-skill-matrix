# UX Skill Matrix

Interactieve skill-assessment op basis van het [NN/g UX Skill Mapping
template](https://www.nngroup.com/articles/skill-mapping/) (Rachel Krause). Deelnemers scoren
zichzelf per skill op een huidige én een gewenste situatie; de facilitator ziet het teamprofiel,
de kloof per skill en wie er nu al op coach-niveau zit.

De acht skills en de vijfpuntsschaal komen uit het originele template, maar zijn **per sessie
volledig aanpasbaar** — labels, toelichtingen, volgorde en het aantal niveaus.

- **Frontend** — React + Vite, statisch, draait op GitHub Pages.
- **Backend** — Supabase Postgres. RLS staat aan zonder policies: de publieke anon-key kan
  niets rechtstreeks lezen of schrijven. Alle toegang loopt via `security definer` functies die
  eerst een deelnemerstoken of de adminsleutel van de sessie verifiëren.

## Eenmalige setup

### 1. Supabase

1. Maak een project op [supabase.com](https://supabase.com) (gratis tier volstaat ruim).
2. Open **SQL Editor** → **New query**, plak de volledige inhoud van
   [`supabase/schema.sql`](supabase/schema.sql) en voer hem uit. Het script is idempotent genoeg
   om opnieuw te draaien na een wijziging.
3. Noteer uit **Project Settings → API**: de **Project URL** en de **anon public** key.

### 2. Lokaal draaien

```bash
npm install
cp .env.example .env.local     # vul URL en anon-key in
npm run dev
```

### 3. GitHub Pages

```bash
git init && git add -A && git commit -m "UX skill matrix"
gh repo create <naam> --private --source=. --push      # of handmatig via github.com
```

Daarna in de repo:

- **Settings → Pages → Source**: `GitHub Actions`.
- **Settings → Secrets and variables → Actions → Variables**: voeg `VITE_SUPABASE_URL` en
  `VITE_SUPABASE_ANON_KEY` toe als *repository variables* (geen secrets — de anon-key hoort
  publiek te zijn en secrets zijn niet leesbaar tijdens een Pages-build van een fork).

Elke push naar `main` bouwt en publiceert. De app gebruikt hash-routing, dus er is geen
404-rewrite nodig.

## Gebruik

| Rol | Route | Toegang |
| --- | --- | --- |
| Facilitator | `/` | alleen de adminsleutel |
| Deelnemer | `#/p/<token>` | persoonlijke link, geen login |

Het startscherm heeft één veld: de adminsleutel. Die bepaalt wat je ziet — één bijbehorende
sessie opent direct, meerdere geven een keuzelijst, geen enkele vraagt om een naam voor je
eerste sessie. Nieuwe sessies komen automatisch onder dezelfde sleutel te staan, zodat een
facilitator één credential heeft in plaats van een code-plus-sleutel per sessie.

1. Vul een sleutel in en geef je eerste sessie een naam. De sleutel wordt met bcrypt gehasht —
   **kwijt is kwijt**, en er is nog geen manier om hem te wijzigen.
2. Pas onder **Skills & schaal** de terminologie aan vóórdat mensen gaan invullen.
3. Voeg onder **Deelnemers** iedereen toe en deel de persoonlijke links (er is een knop om alle
   links in één keer als naam-tab-link te kopiëren, handig voor een mailmerge of Slack).
4. Tijdens de sessie zie je onder **Overzicht** live het teamprofiel; exporteer desgewenst naar CSV.

De sessiecode van zes tekens blijft bestaan als interne identifier — hij staat in de admin-URL en
in de sessielijst, handig om iemand naar een specifieke sessie te verwijzen.

## Beveiliging in het kort

- Deelnemerstokens zijn 96 bits random en geven alleen toegang tot de eigen invulling — een
  deelnemer kan de scores van collega's niet opvragen.
- De adminsleutel wordt met bcrypt (`pgcrypto`) gehasht. Hij is een **hoofdsleutel**: wie hem
  heeft ziet al je sessies. Neem een passphrase van een stuk of vier woorden.
- De sleutel wordt na inloggen uit de URL gehaald en in `sessionStorage` gezet, zodat hij niet in
  je browsergeschiedenis of in beeld staat als je tijdens een sessie je scherm deelt.
- Wie een deelnemerslink heeft kan invullen. Dat is bewust: geen accounts, geen drempel op
  locatie. Deel links dus persoonlijk, niet in een openbaar kanaal.
- Er zit geen rate limiting op `create_session` of `admin_list_sessions`. Voor een intern team is
  dat prima; gaat de URL breed rond, voeg dan een Supabase Edge Function met captcha toe.

## Datamodel

```
sessions ─┬─ skills        (label, description, sort_order)
          ├─ participants  (name, role, token, submitted_at)
          └─ ratings       (participant × skill × {current|future} → 1..5)
```

Een skill hernoemen behoudt de al gegeven scores; een skill verwijderen verwijdert ze.

Het NN/g-template zelf (`NNg_Skill_Mapping_Template.xlsx`) zit bewust niet in deze repo: dat is
auteursrechtelijk beschermd materiaal van Nielsen Norman Group. Zie
[nngroup.com/articles/skill-mapping](https://www.nngroup.com/articles/skill-mapping/).
