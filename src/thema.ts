/**
 * Welk thema de app draagt. Het eigen thema is de standaard; 'coa' zet de
 * app in het COA design system.
 *
 * Te kiezen met ?thema=coa in de adresbalk (ook achter de hash), daarna
 * onthouden in deze browser. De fonts van het COA-systeem worden pas geladen
 * als dat thema ook echt aanstaat — anders betaalt iedereen voor lettertypes
 * die hij niet ziet.
 */
export type Thema = 'eigen' | 'coa'

/**
 * Licht of donker is in het COA-systeem een expliciete keuze; het apparaat
 * volgen is daar een opt-in. Daarom staat die keuze hier en niet in een
 * mediaquery: ?licht voor een beamer in een verlichte zaal, ?donker voor een
 * avondsessie op een laptop die zelf op licht staat, en anders het apparaat.
 */
type Modus = 'auto' | 'licht' | 'donker'

const SLEUTEL = 'skillmatrix:thema'

/** Zoekt een parameter in de adresbalk, ook achter de hash. */
function uitAdres(naam: string): string | null {
  const hash = window.location.hash
  const bronnen = [window.location.search, hash.includes('?') ? '?' + hash.split('?')[1] : '']
  for (const bron of bronnen) {
    const params = new URLSearchParams(bron)
    if (params.has(naam)) return params.get(naam) ?? ''
  }
  return null
}

function themaUitAdres(): Thema | null {
  const waarde = uitAdres('thema')
  return waarde === 'coa' || waarde === 'eigen' ? waarde : null
}

function onthouden(): Thema | null {
  try {
    const waarde = localStorage.getItem(SLEUTEL)
    return waarde === 'coa' || waarde === 'eigen' ? waarde : null
  } catch {
    return null
  }
}

function modus(): Modus {
  if (uitAdres('donker') !== null) return 'donker'
  if (uitAdres('licht') !== null) return 'licht'
  return 'auto'
}

let fontsGeladen = false
function laadCoaFonts() {
  if (fontsGeladen) return
  fontsGeladen = true
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href =
    'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700' +
    '&family=JetBrains+Mono:wght@400;500&display=swap'
  document.head.appendChild(link)
}

const donkerVoorkeur = window.matchMedia?.('(prefers-color-scheme: dark)')
let luistert = false

function zetDonker(aan: boolean) {
  const wortel = document.documentElement
  if (aan) wortel.setAttribute('data-donker', '')
  else wortel.removeAttribute('data-donker')
}

/**
 * Het thema dat bij een sessie hoort. Een deelnemer krijgt wat de facilitator
 * voor die sessie heeft ingesteld — niet wat er toevallig in zijn browser staat
 * van een vorige keer, want dan zie je bij het COA het thema van een andere
 * opdrachtgever. Alleen ?thema= in de adresbalk gaat er nog overheen, zodat
 * testen mogelijk blijft.
 *
 * We onthouden het per sessie, zodat een tweede bezoek meteen goed opent in
 * plaats van een tel het standaardthema te laten zien.
 */
export function pasSessieThemaToe(sleutel: string, uitSessie?: string | null) {
  const bewaard = `${SLEUTEL}:sessie:${sleutel}`
  const geldig = (w: unknown): w is Thema => w === 'coa' || w === 'eigen'
  let thema: Thema | null = themaUitAdres()
  if (!thema && geldig(uitSessie)) {
    thema = uitSessie
    try { localStorage.setItem(bewaard, uitSessie) } catch { /* privémodus */ }
  }
  if (!thema) {
    try {
      const w = localStorage.getItem(bewaard)
      if (geldig(w)) thema = w
    } catch { /* privémodus */ }
  }
  pasThemaToe(thema ?? 'eigen', false)
}

/** Het thema dat bij deze sessie hoort, als we het al eerder zagen. */
export function onthoudenVoor(sleutel: string): Thema {
  try {
    const w = localStorage.getItem(`${SLEUTEL}:sessie:${sleutel}`)
    if (w === 'coa' || w === 'eigen') return w
  } catch { /* privémodus */ }
  return 'eigen'
}

/**
 * @param onthoud  false voor een thema dat van een sessie komt: dat is niet
 *   jouw keuze en moet dus ook niet jouw standaard worden.
 */
export function pasThemaToe(thema: Thema = huidigThema(), onthoud = true) {
  const wortel = document.documentElement
  if (thema === 'coa') {
    wortel.setAttribute('data-thema', 'coa')
    laadCoaFonts()
  } else {
    wortel.removeAttribute('data-thema')
  }

  const keuze = modus()
  zetDonker(keuze === 'donker' || (keuze === 'auto' && !!donkerVoorkeur?.matches))

  // Wisselt iemand halverwege de sessie van systeemthema, dan mag de app
  // meebewegen — maar alleen zolang hij die keuze niet zelf heeft gemaakt.
  if (keuze === 'auto' && donkerVoorkeur && !luistert) {
    luistert = true
    donkerVoorkeur.addEventListener('change', (e) => zetDonker(e.matches))
  }

  if (onthoud) {
    try {
      localStorage.setItem(SLEUTEL, thema)
    } catch {
      // privémodus: dan geldt de keuze alleen voor deze pagina
    }
  }
}

export function huidigThema(): Thema {
  return themaUitAdres() ?? onthouden() ?? 'eigen'
}
