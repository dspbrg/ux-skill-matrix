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

export default function Radar({ axes, series, max = 5, size = 420, showLegend = true }: Props) {
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
        viewBox={`${-padX} ${-padY} ${size + padX * 2} ${size + padY * 2}`}
        width="100%"
        style={{ maxHeight: size + padY * 2, display: 'block' }}
        role="img"
        aria-label={`Radardiagram met ${n} skills`}
      >
        {/* ringen */}
        {Array.from({ length: max }, (_, k) => k + 1).map((level) => (
          <path
            key={level}
            d={ringPath(level)}
            fill={level === max ? 'var(--surface-2)' : 'none'}
            stroke="var(--border)"
            strokeWidth={1}
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

        {/* schaalcijfers op de verticale as */}
        {Array.from({ length: max }, (_, k) => k + 1).map((level) => {
          const [, y] = point(0, level)
          return (
            <text key={level} x={cx + 5} y={y + 3} fontSize={9.5} fill="var(--text-3)">
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
                  fill={pts.length >= 3 ? s.color : 'none'}
                  fillOpacity={partial ? 0.07 : 0.13}
                  stroke={s.color}
                  strokeWidth={2}
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
              <span className="dot" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
