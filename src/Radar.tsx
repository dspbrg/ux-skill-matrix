import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { exportSvgAsPng } from './exportPng'

interface Series {
  key: string
  label: string
  color: string
  /** Eén waarde per as, in dezelfde volgorde als `axes`. null = niet ingevuld. */
  values: (number | null)[]
  dashed?: boolean
}

interface Props {
  axes: string[]
  series: Series[]
  max?: number
  size?: number
  showLegend?: boolean
  /** Zet een downloadknop onder de radar; wordt de bestandsnaam. */
  exportName?: string
}

/**
 * Veert de getoonde waarden naar hun doel toe. De demping ligt bewust onder
 * kritiek (bij deze stijfheid is 26 kritiek, wij nemen 15), zodat de vorm
 * doorschiet en terugkomt: hij landt in plaats van te schuiven.
 *
 * De lus hangt niet aan een afhankelijkheidslijst maar controleert na elke
 * render of hij nog moet lopen. Een eerdere versie startte de animatie in een
 * effect met [signature] als dep; als die vergelijking één keer niet aansloeg
 * bleef de vorm voorgoed op de oude waarde staan terwijl de knoppen al lang
 * de nieuwe toonden — en niets bracht hem terug. Zo herstelt hij zichzelf.
 */
function useSpring(target: (number | null)[]): (number | null)[] {
  const [, herteken] = useReducer((n: number) => n + 1, 0)
  const st = useRef({ x: [] as number[], v: [] as number[], frame: 0, last: 0, gestart: false })

  // Bij de eerste render meteen op de juiste waarde gaan staan. Eerder begon
  // de vorm in het middelpunt en moest de animatie hem naar buiten brengen —
  // maar requestAnimationFrame staat stil in een achtergrondtab, dus wie even
  // wegklikte kwam terug bij een lege radar. De animatie is een verfraaiing;
  // een kloppend beeld mag er nooit van afhangen.
  if (!st.current.gestart) {
    st.current.gestart = true
    target.forEach((t, i) => { st.current.x[i] = t ?? 0; st.current.v[i] = 0 })
  }
  st.current.x.length = target.length
  st.current.v.length = target.length

  const rustig = () =>
    target.every((t, i) => {
      const doel = t ?? 0
      return Math.abs((st.current.x[i] ?? 0) - doel) <= 0.002 && Math.abs(st.current.v[i] ?? 0) <= 0.002
    })

  useEffect(() => {
    const s = st.current
    if (s.frame || rustig()) return

    // Zonder zichtbare tab lopen er geen frames: dan direct op de waarde.
    if (document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      target.forEach((t, i) => { s.x[i] = t ?? 0; s.v[i] = 0 })
      herteken()
      return
    }

    s.last = performance.now()
    const stap = (nu: number) => {
      const dt = Math.min((nu - s.last) / 1000, 1 / 30)
      s.last = nu
      let bewegend = false
      target.forEach((t, i) => {
        const doel = t ?? 0
        if (s.x[i] == null) { s.x[i] = 0; s.v[i] = 0 }
        s.v[i] += (-170 * (s.x[i] - doel) - 15 * s.v[i]) * dt
        s.x[i] += s.v[i] * dt
        if (Math.abs(s.x[i] - doel) > 0.002 || Math.abs(s.v[i]) > 0.002) bewegend = true
      })
      s.frame = bewegend ? requestAnimationFrame(stap) : 0
      herteken()
    }
    s.frame = requestAnimationFrame(stap)
  })

  useEffect(() => () => {
    if (st.current.frame) cancelAnimationFrame(st.current.frame)
  }, [])

  return target.map((t, i) => (t == null ? null : st.current.x[i] ?? 0))
}

/** Breekt een aslabel op in regels van maximaal ~15 tekens. */
function wrap(label: string, limit = 15): string[] {
  const words = label.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    if (line && (line + ' ' + w).length > limit) {
      lines.push(line)
      line = w
    } else {
      line = line ? line + ' ' + w : w
    }
  }
  if (line) lines.push(line)
  return lines.slice(0, 3)
}

export default function Radar({ axes, series, max = 5, size = 420, showLegend = true, exportName }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [exporting, setExporting] = useState(false)
  const [failed, setFailed] = useState('')
  const [fitted, setFitted] = useState<string>()
  const n = axes.length

  const padX = 92
  const padY = 54
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - padX / 2

  // De marges rond de tekening waren geschat en zaten er ruim naast: gemeten
  // bleef ruim een derde van de hoogte leeg. De buitenste ring en de labels
  // bepalen de omvang, niet de data, dus één meting per opzet volstaat.
  useLayoutEffect(() => {
    const el = svgRef.current
    if (!el) return
    const b = el.getBBox()
    if (!b.width || !b.height) return
    // Vierkant én gecentreerd op het middelpunt van het web, niet op het
    // omhullende kader van de inkt. De labels links en rechts zijn breder dan
    // die boven en onder, dus een strakke uitsnede duwde het web uit het
    // midden en liet het platter ogen dan het is.
    const pad = 8
    const half =
      Math.max(cx - b.x, b.x + b.width - cx, cy - b.y, b.y + b.height - cy) + pad
    setFitted(`${cx - half} ${cy - half} ${half * 2} ${half * 2}`)
  }, [axes.join('|'), max, size])

  // Alle reeksen in één veer: zo staan beide vormen in dezelfde render tot mijn
  // beschikking, wat nodig is om het gebied ertussen te kunnen tekenen.
  const plat = useSpring(series.flatMap((x) => x.values))
  const perSerie: (number | null)[][] = []
  let k = 0
  for (const x of series) { perSerie.push(plat.slice(k, k + x.values.length)); k += x.values.length }

  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2
  const point = (i: number, v: number) => {
    const a = angle(i)
    const rr = (Math.max(0, Math.min(max, v)) / max) * r
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as const
  }
  const ringPath = (level: number) =>
    axes
      .map((_, i) => {
        const [x, y] = point(i, level)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(' ') + ' Z'

  if (n < 3) {
    return (
      <p className="muted small" style={{ padding: '40px 0', textAlign: 'center' }}>
        Een radar heeft minstens drie skills nodig.
      </p>
    )
  }

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={fitted ?? `${-padX} ${-padY} ${size + padX * 2} ${size + padY * 2}`}
        width="100%"
        style={{ display: 'block' }}
        role="img"
        aria-label={`Radardiagram met ${n} skills`}
      >
        {/* Bij negen posities zijn negen ringen ruis: alleen de benoemde treden
            krijgen een ring, plus altijd de buitenste. */}
        {Array.from({ length: max }, (_, k) => k + 1)
          .filter((level) => level === max || (max > 6 ? level % 2 === 1 : true))
          .map((level) => (
          <path
            key={level}
            d={ringPath(level)}
            fill={level === max ? 'var(--surface-2)' : 'none'}
            stroke={level === max ? 'var(--border-strong)' : 'var(--border)'}
            strokeWidth={level === max ? 1.5 : 1}
          />
        ))}

        {axes.map((label, i) => {
          const [ax, ay] = point(i, max)
          const [lx, ly] = point(i, max + 1.34)
          const anchor = Math.abs(lx - cx) < 6 ? 'middle' : lx > cx ? 'start' : 'end'
          const tx = lx + (anchor === 'start' ? 8 : anchor === 'end' ? -8 : 0)
          const lines = wrap(label)
          return (
            <g key={i}>
              <line x1={cx} y1={cy} x2={ax} y2={ay} stroke="var(--border)" strokeWidth={1} />
              <text
                x={tx}
                y={ly - ((lines.length - 1) * 13) / 2}
                textAnchor={anchor}
                dominantBaseline="middle"
                fontSize={12.5}
                fill="var(--text-2)"
              >
                {lines.map((ln, k) => (
                  <tspan key={k} x={tx} dy={k === 0 ? 0 : 13}>
                    {ln}
                  </tspan>
                ))}
              </text>
            </g>
          )
        })}

        {(() => {
          const padVan = (waarden: (number | null)[]) => {
            const pts = waarden
              .map((v, i) => ({ v, i }))
              .filter((q): q is { v: number; i: number } => q.v != null)
              .map(({ v, i }) => point(i, v))
            if (pts.length < 3) return { d: '', pts }
            return {
              d: pts.map(([x, y], j) => `${j === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ') + ' Z',
              pts,
            }
          }
          const vormen = series.map((x, i) => ({ serie: x, ...padVan(perSerie[i]) }))
          const nu = vormen.find((v) => !v.serie.dashed)
          const doel = vormen.find((v) => v.serie.dashed)

          return (
            <>
              {/* Het gebied tussen nu en doel als eigen vorm. Twee vormen over
                  elkaar heen laten je niet zien wie boven wie ligt; het verschil
                  is juist waar het gesprek over gaat, dus dat krijgt de vulling. */}
              {nu?.d && doel?.d && (
                <path d={`${nu.d} ${doel.d}`} fillRule="evenodd" fill={doel.serie.color} fillOpacity={0.16} />
              )}

              {nu?.d && (
                <path d={nu.d} fill={nu.serie.color} fillOpacity={0.22}
                  stroke={nu.serie.color} strokeWidth={1.5} strokeLinejoin="round" />
              )}

              {/* Massief in plaats van gestreept: het gevulde verschilgebied
                  onderscheidt de twee al, en een stippellijn oogt rommelig. */}
              {doel?.d && (
                <path d={doel.d} fill="none" stroke={doel.serie.color} strokeWidth={2}
                  strokeLinejoin="round" />
              )}

              {vormen.map((v) =>
                v.pts.map(([x, y], j) => (
                  <circle key={`${v.serie.key}-${j}`} cx={x} cy={y} r={3.2}
                    fill={v.serie.color} stroke="var(--surface)" strokeWidth={1.5} />
                )),
              )}
            </>
          )
        })()}

      </svg>

      {showLegend && (
        <div className="legend" style={{ justifyContent: 'center', marginTop: 'var(--space-1)' }}>
          {series.map((s) => (
            <span className="item" key={s.key}>
              <svg width="22" height="10" aria-hidden="true">
                <line x1="1" y1="5" x2="21" y2="5" stroke={s.color} strokeWidth="3"
                  strokeLinecap="round" />
              </svg>
              {s.label}
            </span>
          ))}
        </div>
      )}

      {exportName && (
        <div style={{ textAlign: 'center', marginTop: 'var(--space-3)' }}>
          <button
            className="sm"
            disabled={exporting}
            title="Witte achtergrond, op dubbele resolutie — geschikt voor een rapport of slide"
            onClick={async () => {
              if (!svgRef.current) return
              setExporting(true)
              setFailed('')
              try {
                await exportSvgAsPng(svgRef.current, exportName, {
                  title: exportName,
                  legend: series.map((x) => ({ label: x.label, color: x.color, dashed: x.dashed })),
                })
              } catch (e) {
                setFailed((e as Error).message)
              } finally {
                setExporting(false)
              }
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 1.5v8.5m0 0L4.75 6.75M8 10l3.25-3.25" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 11.5v1.75c0 .69.56 1.25 1.25 1.25h9.5c.69 0 1.25-.56 1.25-1.25V11.5"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {exporting ? 'Bezig…' : 'PNG downloaden'}
          </button>
          {failed && <p className="small" style={{ color: 'var(--danger)', marginTop: 'var(--space-2)' }}>{failed}</p>}
        </div>
      )}
    </div>
  )
}
