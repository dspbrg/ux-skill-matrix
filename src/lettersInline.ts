/**
 * De lettertypes mee in de PNG.
 *
 * Een SVG die als <img> wordt ingeladen mag niets meer van buiten halen — geen
 * stylesheet, geen fontbestand. Daarom viel de export altijd terug op
 * Helvetica, hoe netjes het font-family-attribuut er ook in stond: de browser
 * kende Source Sans 3 daar simpelweg niet. Het enige wat wél werkt is het font
 * als data-URI ín de SVG zetten.
 *
 * De @font-face-regels komen van dezelfde Google-stylesheets die de pagina al
 * gebruikt, dus embedden we precies de snedes die je op het scherm ziet en
 * niets meer. De woff2-bestanden zitten dan al in de cache van de browser.
 */

const cache = new Map<string, string>()

/** Alleen het latijnse blok: de rest is bereik dat deze app nooit tekent. */
function latijnseBlokken(css: string): string[] {
  const blokken = css.match(/@font-face\s*\{[^}]*\}/g) ?? []
  return blokken.filter((b) => /unicode-range:[^;]*U\+0000-00FF/i.test(b))
}

async function alsDataUri(url: string): Promise<string> {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
  let binair = ''
  // In stukjes, want String.fromCharCode(...) met honderdduizend argumenten
  // laat de stack omvallen.
  for (let i = 0; i < bytes.length; i += 8192) {
    binair += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return `data:font/woff2;base64,${btoa(binair)}`
}

async function vanStylesheet(href: string): Promise<string> {
  const bewaard = cache.get(href)
  if (bewaard !== undefined) return bewaard

  const css = await (await fetch(href)).text()
  const blokken = await Promise.all(
    latijnseBlokken(css).map(async (blok) => {
      const bron = blok.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/)
      if (!bron) return ''
      return blok.replace(bron[1], await alsDataUri(bron[1]))
    }),
  )
  const uit = blokken.join('\n')
  cache.set(href, uit)
  return uit
}

/**
 * De @font-face-regels voor alles wat de pagina op dit moment geladen heeft.
 * Faalt er iets — geen netwerk, een geblokkeerde CDN — dan komt er een lege
 * string terug en ziet de export er precies zo uit als voorheen.
 */
export async function ingebakkenLetters(): Promise<string> {
  try {
    const hrefs = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
    )
      .map((l) => l.href)
      .filter((h) => h.startsWith('https://fonts.googleapis.com/css2'))
    if (!hrefs.length) return ''
    return (await Promise.all(hrefs.map(vanStylesheet))).join('\n')
  } catch {
    return ''
  }
}
