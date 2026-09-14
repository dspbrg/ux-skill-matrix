/**
 * Iconen uit Lucide, als paden in plaats van een pakket.
 *
 * Het COA-contract schrijft Lucide voor op 16 of 20 met lijndikte 1,75, en
 * verbiedt tekstglyphs (→ ‹ ✓). De app gebruikte ↑ ↓ ✕ → als tekst: die
 * schalen met het lettertype mee, missen de optische correcties van een echt
 * icoon en verschillen per platform. Vijf paden wegen minder dan een
 * afhankelijkheid, en de lijndikte is hier een keuze in plaats van een
 * standaardwaarde die we toch zouden overschrijven.
 */
const PADEN = {
  omhoog: ['M12 19V5', 'm5 12 7-7 7 7'],
  omlaag: ['M12 5v14', 'm19 12-7 7-7-7'],
  rechts: ['M5 12h14', 'm12 5 7 7-7 7'],
  kruis: ['M18 6 6 18', 'm6 6 12 12'],
  plus: ['M5 12h14', 'M12 5v14'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'],
  // De cirkel van lucide-info als pad, want dit bestand tekent alleen paden.
  info: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'M12 16v-4', 'M12 8h.01'],
  // Het GitHub-merkteken; geen Lucide, maar wel hetzelfde raster en
  // dezelfde maat. Dit is een vulling en geen lijn, dus hij wordt apart
  // getekend.
  github: ['M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22'],
} as const

export type IcoonNaam = keyof typeof PADEN

export function Icoon({ naam, maat = 16 }: { naam: IcoonNaam; maat?: 16 | 20 | 12 }) {
  return (
    <svg
      className="icoon"
      width={maat}
      height={maat}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PADEN[naam].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
