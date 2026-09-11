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

const SLEUTEL = 'skillmatrix:thema'

function uitAdres(): Thema | null {
  const hash = window.location.hash
  const bronnen = [window.location.search, hash.includes('?') ? '?' + hash.split('?')[1] : '']
  for (const bron of bronnen) {
    const waarde = new URLSearchParams(bron).get('thema')
    if (waarde === 'coa' || waarde === 'eigen') return waarde
  }
  return null
}

function onthouden(): Thema | null {
  try {
    const waarde = localStorage.getItem(SLEUTEL)
    return waarde === 'coa' || waarde === 'eigen' ? waarde : null
  } catch {
    return null
  }
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

/** Licht afdwingen met ?licht in de adresbalk, ongeacht de voorkeur van het apparaat. */
function lichtGevraagd(): boolean {
  const hash = window.location.hash
  const bronnen = [window.location.search, hash.includes('?') ? '?' + hash.split('?')[1] : '']
  return bronnen.some((b) => new URLSearchParams(b).has('licht'))
}

export function pasThemaToe(thema: Thema = huidigThema()) {
  const wortel = document.documentElement
  if (thema === 'coa') {
    wortel.setAttribute('data-thema', 'coa')
    laadCoaFonts()
  } else {
    wortel.removeAttribute('data-thema')
  }
  if (lichtGevraagd()) wortel.setAttribute('data-licht', '')
  else wortel.removeAttribute('data-licht')
  try {
    localStorage.setItem(SLEUTEL, thema)
  } catch {
    // privémodus: dan geldt de keuze alleen voor deze pagina
  }
}

export function huidigThema(): Thema {
  return uitAdres() ?? onthouden() ?? 'eigen'
}
