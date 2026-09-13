import { useEffect, useRef, useState } from 'react'
import { Icoon } from './Icoon'
import type { ScaleLevel } from './types'

/**
 * Wat de vijf treden betekenen.
 *
 * Stond eerst in een <details>. Dat werkte wel, maar het is het verkeerde
 * gebaar: opendoen duwde de hele lijst assen naar beneden, zodat de as waar
 * je net over nadacht wegschoof, en de native driehoek is een tekstglyph —
 * in het COA-contract verboden en in beide thema's een vreemde eend.
 *
 * Dit is naslag die je één keer opzoekt en weer wegklikt. Dus: een paneel dat
 * over de pagina heen valt in plaats van erin, met Escape en klikken-ernaast
 * om weg te gaan, en de focus terug op de knop waar je vandaan kwam.
 */
export default function Niveaus({ scale }: { scale: ScaleLevel[] }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const knop = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const opToets = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); knop.current?.focus() }
    }
    // Naast het paneel klikken sluit het. Niet op mousedown: dan sluit hij al
    // voordat een klik ín het paneel is aangekomen.
    const opKlik = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', opToets)
    document.addEventListener('click', opKlik)
    return () => {
      document.removeEventListener('keydown', opToets)
      document.removeEventListener('click', opKlik)
    }
  }, [open])

  return (
    <div className="niveaus" ref={wrap}>
      <button
        ref={knop}
        className="ghost sm"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icoon naam="info" />
        Niveaus
      </button>

      {open && (
        <div className="niveaus-paneel" role="dialog" aria-label="Wat de niveaus betekenen">
          <dl>
            {scale.map((lv) => (
              <div key={lv.level}>
                <dt>
                  <span className="trede">{lv.level}</span>
                  {lv.label}
                </dt>
                <dd>{lv.description}</dd>
              </div>
            ))}
          </dl>
          <p className="tussen">
            Tussen elke twee treden zit een extra positie, voor als je er precies tussenin zit.
          </p>
        </div>
      )}
    </div>
  )
}
