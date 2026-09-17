/**
 * Een canvas als PDF van één pagina.
 *
 * Geen bibliotheek: de bundel is al groot genoeg en dit is een PDF met precies
 * één afbeelding erop. Wat daarvoor nodig is past in tachtig regels.
 *
 * De pixels gaan er verliesvrij in. JPEG was minder werk geweest — die mag je
 * rechtstreeks in een PDF plakken — maar een radar is dunne lijnen op een vlak
 * en daar maakt JPEG een vieze rand omheen. Dus: rauwe RGB-bytes, gedeflate
 * met CompressionStream, als FlateDecode erin. Dat is hetzelfde wat PNG doet.
 */

/** Zoveel punten past een A4 breed en hoog (72 punten per inch). */
const A4 = { breedte: 595.28, hoogte: 841.89 }
const MARGE = 36

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stroom = new Blob([data.buffer as ArrayBuffer]).stream()
    .pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stroom).arrayBuffer())
}

/** RGBA uit het canvas naar de RGB die een PDF verwacht. */
function naarRgb(d: Uint8ClampedArray): Uint8Array {
  const uit = new Uint8Array((d.length / 4) * 3)
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
    uit[j] = d[i]
    uit[j + 1] = d[i + 1]
    uit[j + 2] = d[i + 2]
  }
  return uit
}

export async function canvasAlsPdf(canvas: HTMLCanvasElement, titel: string): Promise<Blob> {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is niet beschikbaar in deze browser.')
  const { width: bw, height: bh } = canvas
  const beeld = await deflate(naarRgb(ctx.getImageData(0, 0, bw, bh).data))

  // Passend op de pagina, met de verhouding intact en gecentreerd.
  const schaal = Math.min((A4.breedte - MARGE * 2) / bw, (A4.hoogte - MARGE * 2) / bh)
  const w = bw * schaal
  const h = bh * schaal
  const x = (A4.breedte - w) / 2
  const y = (A4.hoogte - h) / 2

  const enc = new TextEncoder()
  const delen: (string | Uint8Array)[] = []
  const posities: number[] = []
  let lengte = 0
  const schrijf = (stuk: string | Uint8Array) => {
    delen.push(stuk)
    lengte += typeof stuk === 'string' ? enc.encode(stuk).length : stuk.length
  }
  const object = (n: number, inhoud: string, stroom?: Uint8Array) => {
    posities[n] = lengte
    schrijf(`${n} 0 obj\n${inhoud}\n`)
    if (stroom) {
      schrijf('stream\n')
      schrijf(stroom)
      schrijf('\nendstream\n')
    }
    schrijf('endobj\n')
  }

  // De titel in UTF-16BE met een bytevolgordeteken, als hexstring. Een gewone
  // (tekst) is PDFDocEncoding, en daarin worden een middenpunt en een kastlijn
  // twee losse tekens — 'COA Â· UX-team â•fl Maud' in de titelbalk. Hex hoeft
  // ook niet ontsnapt te worden voor haakjes.
  const titelHex = Array.from('\ufeff' + titel)
    .flatMap((teken) => {
      const c = teken.codePointAt(0)!
      // Buiten het basisvlak: twee eenheden, zoals UTF-16 dat doet.
      if (c <= 0xffff) return [c]
      const n = c - 0x10000
      return [0xd800 + (n >> 10), 0xdc00 + (n & 0x3ff)]
    })
    .map((u) => u.toString(16).padStart(4, '0'))
    .join('')
  const tekenen = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /B Do Q`

  schrijf('%PDF-1.4\n')
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.breedte} ${A4.hoogte}] ` +
            '/Resources << /XObject << /B 4 0 R >> >> /Contents 5 0 R >>')
  object(4, `<< /Type /XObject /Subtype /Image /Width ${bw} /Height ${bh} ` +
            `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode ` +
            `/Length ${beeld.length} >>`, beeld)
  object(5, `<< /Length ${tekenen.length} >>`, enc.encode(tekenen))
  object(6, `<< /Title <${titelHex}> /Producer (UX Skill Matrix) >>`)

  const kruistabel = lengte
  let tabel = `xref\n0 7\n0000000000 65535 f \n`
  for (let n = 1; n <= 6; n++) tabel += `${String(posities[n]).padStart(10, '0')} 00000 n \n`
  tabel += `trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${kruistabel}\n%%EOF\n`
  schrijf(tabel)

  return new Blob(delen.map((d) => (typeof d === 'string' ? d : (d.buffer as ArrayBuffer))),
                  { type: 'application/pdf' })
}
