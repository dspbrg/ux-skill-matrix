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
    const pad = 6
    setFitted(`${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`)
  }, [axes.join('|'), max, size])

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
        <defs>
          {series.map((s) => (
            <radialGradient key={s.key} id={`vulling-${s.key}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.16} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.46} />
            </radialGradient>
          ))}
        </defs>

        {Array.from({ length: max }, (_, k) => k + 1).map((level) => (
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
          const [lx, ly] = point(i, max + 1.12)
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

        {series.map((s) => (
          <Shape key={s.key} series={s} point={point} />
        ))}
      </svg>

      {showLegend && (
        <div className="legend" style={{ justifyContent: 'center', marginTop: 4 }}>
          {series.map((s) => (
            <span className="item" key={s.key}>
              <svg width="22" height="10" aria-hidden="true">
                <line x1="1" y1="5" x2="21" y2="5" stroke={s.color} strokeWidth="3"
                  strokeDasharray={s.dashed ? '5 3' : undefined} strokeLinecap="round" />
              </svg>
              {s.label}
            </span>
          ))}
        </div>
      )}

      {exportName && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
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
          {failed && <p className="small" style={{ color: 'var(--danger)', marginTop: 8 }}>{failed}</p>}
        </div>
      )}
    </div>
  )
}


/**
 * Eén geveerde reeks. Als eigen component, want de veer is een hook en die
 * mag niet in een map staan: zodra het aantal reeksen verandert klopt de
 * volgorde van de hooks niet meer.
 */
function Shape({
  series,
  point,
}: {
  series: Series
  point: (i: number, v: number) => readonly [number, number]
}) {
  const values = useSpring(series.values)

  // Alleen de ingevulde assen vormen de veelhoek. Ontbrekende waarden als nul
  // lezen zou de vorm naar het middelpunt trekken en een half ingevulde meting
  // er dramatischer uit laten zien dan ze is.
  const pts = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v != null)
    .map(({ v, i }) => point(i, v))

  const d =
    pts.length >= 2
      ? pts.map(([x, y], k) => `${k === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ') +
        (pts.length >= 3 ? ' Z' : '')
      : ''

  return (
    <g>
      {d && (
        <path
          d={d}
          /* Twee gevulde vlakken over elkaar geven een modderige mengkleur die in
             geen van beide paletten bestaat, precies in het brandpunt. Dus: waar
             je staat is gevuld, waar je heen wil is alleen lijn. */
          fill={pts.length >= 3 && !series.dashed ? `url(#vulling-${series.key})` : 'none'}
          stroke={series.color}
          strokeOpacity={series.dashed ? 1 : 0.65}
          strokeWidth={series.dashed ? 2.25 : 1.25}
          strokeDasharray={series.dashed ? '6 4' : undefined}
          strokeLinejoin="round"
        />
      )}
      {pts.map(([x, y], k) => (
        <circle key={k} cx={x} cy={y} r={3.2} fill={series.color} stroke="var(--surface)" strokeWidth={1.5} />
      ))}
    </g>
  )
}
