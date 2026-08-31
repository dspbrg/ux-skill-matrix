/**
 * Exporteert een radar-SVG als PNG.
 *
 * Twee dingen die niet vanzelf goed gaan bij het serialiseren van een SVG uit
 * de pagina: de kleuren staan als `var(--token)` in de attributen en het
 * lettertype erft van de pagina. Allebei bestaan niet meer zodra het bestand
 * los van de pagina wordt gerenderd, dus we rekenen ze hier uit en zetten ze
 * hard in de kopie.
 *
 * De export gebruikt bewust altijd het lichte palet, ook als je de app donker
 * bekijkt: een donkere radar met transparante achtergrond is zelden bruikbaar
 * in een rapport of een slide.
 */
interface ExportOptions {
  title?: string
  legend?: { label: string; color: string }[]
  scale?: number
}

const NS = 'http://www.w3.org/2000/svg'

function svgText(text: string, x: number, y: number, size: number, fill: string, anchor = 'middle') {
  const el = document.createElementNS(NS, 'text')
  el.setAttribute('x', String(x))
  el.setAttribute('y', String(y))
  el.setAttribute('font-size', String(size))
  el.setAttribute('fill', fill)
  el.setAttribute('text-anchor', anchor)
  el.textContent = text
  return el
}

export async function exportSvgAsPng(
  svg: SVGSVGElement,
  filename: string,
  { title, legend = [], scale = 2 }: ExportOptions = {},
) {
  const holder = document.createElement('div')
  holder.className = 'force-light'
  holder.style.cssText = 'position:fixed;left:-99999px;top:0;'
  const clone = svg.cloneNode(true) as SVGSVGElement
  holder.appendChild(clone)
  document.body.appendChild(holder)

  try {
    clone.setAttribute('font-family', 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif')

    const [vx, vy0, vw, vh0] = (svg.getAttribute('viewBox') ?? '0 0 400 400').split(/\s+/).map(Number)

    // Titel en legenda staan in de pagina buiten de SVG. Zonder ze mee te
    // tekenen levert de export een plaatje met twee naamloze kleuren op, dus
    // maken we hier ruimte en zetten we ze erbij.
    const titleH = title ? 46 : 12
    const legendH = legend.length ? 46 : 12
    const vy = vy0 - titleH
    const vh = vh0 + titleH + legendH
    const cx = vx + vw / 2

    const bg = document.createElementNS(NS, 'rect')
    bg.setAttribute('x', String(vx))
    bg.setAttribute('y', String(vy))
    bg.setAttribute('width', String(vw))
    bg.setAttribute('height', String(vh))
    bg.setAttribute('fill', '#ffffff')
    clone.insertBefore(bg, clone.firstChild)

    if (title) {
      const el = svgText(title, cx, vy + 30, 19, 'var(--text)')
      el.setAttribute('font-weight', '600')
      clone.appendChild(el)
    }

    if (legend.length) {
      // eerst de breedte schatten om het geheel te kunnen centreren
      const itemW = legend.map((l) => 20 + l.label.length * 7.4)
      const total = itemW.reduce((a, b) => a + b, 0) + (legend.length - 1) * 22
      let x = cx - total / 2
      const y = vy0 + vh0 + legendH - 16
      legend.forEach((l, i) => {
        const dot = document.createElementNS(NS, 'circle')
        dot.setAttribute('cx', String(x + 5))
        dot.setAttribute('cy', String(y - 4))
        dot.setAttribute('r', '5')
        dot.setAttribute('fill', l.color)
        clone.appendChild(dot)
        clone.appendChild(svgText(l.label, x + 16, y, 13, 'var(--text-2)', 'start'))
        x += itemW[i] + 22
      })
    }

    clone.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`)
    clone.setAttribute('width', String(vw))
    clone.setAttribute('height', String(vh))
    clone.setAttribute('xmlns', NS)

    // Pas hier var(--…) uitrekenen tegen het lichte palet: titel en legenda
    // moeten er ook in meegenomen worden.
    for (const el of Array.from(clone.querySelectorAll<SVGElement>('*'))) {
      const computed = getComputedStyle(el)
      for (const prop of ['fill', 'stroke'] as const) {
        if (el.getAttribute(prop)?.includes('var(')) el.setAttribute(prop, computed[prop])
      }
    }

    const source = new XMLSerializer().serializeToString(clone)
    const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }))

    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('De afbeelding kon niet worden opgebouwd.'))
        img.src = url
      })

      const canvas = document.createElement('canvas')
      canvas.width = Math.round(vw * scale)
      canvas.height = Math.round(vh * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas is niet beschikbaar in deze browser.')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
      if (!blob) throw new Error('De PNG kon niet worden opgeslagen.')

      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = `${slug(filename)}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(href), 1000)
    } finally {
      URL.revokeObjectURL(url)
    }
  } finally {
    holder.remove()
  }
}

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'radar'
  )
}
