import { useLayoutEffect, useRef, useState } from 'react'
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
  if (n < 3) {
    return (
      <p className="muted small" style={{ padding: '40px 0', textAlign: 'center' }}>
        Een radar heeft minstens drie skills nodig.
      </p>
    )
  }

  // Horizontaal is er meer ruimte nodig dan verticaal: de aslabels steken
  // vooral naar links en rechts uit.
  const padX = 92
  const padY = 54
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - padX / 2

  // De marges rond de tekening waren geschat en zaten er ruim naast: gemeten
  // bleef ruim een derde van de hoogte leeg. Dat is zichtbaar op de beamer en
  // in elke geëxporteerde PNG, dus meet na render de werkelijke inkt.
  useLayoutEffect(() => {
    const el = svgRef.current
    if (!el) return
    const b = el.getBBox()
    if (!b.width || !b.height) return
    const pad = 6
    setFitted(`${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`)
  }, [axes.join('|'), max, size, JSON.stringify(series.map((x) => x.values))])

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
        {/* ringen */}
        {Array.from({ length: max }, (_, k) => k + 1).map((level) => (
          <path
            key={level}
            d={ringPath(level)}
            fill={level === max ? 'var(--surface-2)' : 'none'}
            stroke={level === max ? 'var(--border-strong)' : 'var(--border)'}
            strokeWidth={level === max ? 1.5 : 1}
          />
        ))}

        {/* assen + labels */}
        {axes.map((label, i) => {
          const [ax, ay] = point(i, max)
          const [lx, ly] = point(i, max + 1.12)
          const anchor = Math.abs(lx - cx) < 6 ? 'middle' : lx > cx ? 'start' : 'end'
          // duw het label nog een paar pixels van de as af, zodat de tekst niet
          // tegen het uiterste datapunt aanplakt
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

        {/* Schaalcijfers op een straal precies tussen de eerste twee assen in:
            op een as zelf botsen ze met het aslabel. */}
        {Array.from({ length: max }, (_, k) => k + 1).map((level) => {
          const a = angle(0) + Math.PI / n
          const rr = (level / max) * r
          return (
            <text
              key={level}
              x={cx + Math.cos(a) * rr}
              y={cy + Math.sin(a) * rr + 3.5}
              textAnchor="middle"
              fontSize={10.5}
              fill="var(--text-3)"
              stroke="var(--surface)"
              strokeWidth={3}
              style={{ paintOrder: 'stroke' }}
            >
              {level}
            </text>
          )
        })}

        {/* series */}
        {series.map((s) => {
          // Alleen de ingevulde assen vormen de veelhoek. Ontbrekende waarden als
          // nul lezen zou de vorm naar het middelpunt trekken en een half
          // ingevulde meting er dramatischer uit laten zien dan ze is.
          const filled = s.values
            .map((v, i) => ({ v, i }))
            .filter((p): p is { v: number; i: number } => p.v != null)
          const pts = filled.map(({ v, i }) => point(i, v))
          const d =
            pts.length >= 2
              ? pts.map(([x, y], k) => `${k === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ') +
                (pts.length >= 3 ? ' Z' : '')
              : ''
          const partial = filled.length < s.values.length
          return (
            <g key={s.key}>
              {d && (
                <path
                  d={d}
                  fill={pts.length >= 3 && !s.dashed ? s.color : 'none'}
                  fillOpacity={partial ? 0.10 : 0.16}
                  stroke={s.color}
                  strokeWidth={s.dashed ? 2.5 : 2}
                  strokeDasharray={s.dashed ? '6 4' : undefined}
                  strokeLinejoin="round"
                />
              )}
              {pts.map(([x, y], k) => (
                <circle key={k} cx={x} cy={y} r={3.4} fill={s.color} stroke="var(--surface)" strokeWidth={1.5} />
              ))}
            </g>
          )
        })}
      </svg>

      {showLegend && (
        <div className="legend" style={{ justifyContent: 'center', marginTop: 4 }}>
          {series.map((s) => (
            <span className="item" key={s.key}>
              <svg width="22" height="8" aria-hidden="true">
                <line x1="1" y1="4" x2="21" y2="4" stroke={s.color} strokeWidth="3"
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
            {exporting ? 'Bezig…' : 'PNG downloaden'}
          </button>
          {failed && (
            <p className="small" style={{ color: 'var(--danger)', marginTop: 8 }}>{failed}</p>
          )}
        </div>
      )}
    </div>
  )
}
