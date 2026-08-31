import { useEffect, useMemo, useRef, useState } from 'react'
import Radar from './Radar'
import { rpc } from './supabase'
import type { ParticipantPayload, Rating, State } from './types'

type Values = Record<string, { current?: number; future?: number }>

function toValues(ratings: Rating[]): Values {
  const out: Values = {}
  for (const r of ratings) {
    out[r.skill_id] = { ...out[r.skill_id], [r.state]: r.value }
  }
  return out
}

export default function Participant({ token }: { token: string }) {
  const [data, setData] = useState<ParticipantPayload | null>(null)
  const [values, setValues] = useState<Values>({})
  const [state, setState] = useState<State>('current')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(0)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    let alive = true
    rpc<ParticipantPayload>('get_participant', { p_token: token })
      .then((d) => {
        if (!alive) return
        setData(d)
        setValues(toValues(d.ratings))
        setSubmitted(Boolean(d.participant.submitted_at))
      })
      .catch((e) => alive && setError((e as Error).message))
    return () => {
      alive = false
    }
  }, [token])

  function rate(skillId: string, next: number) {
    const previous = values[skillId]?.[state]
    const value = previous === next ? null : next
    setValues((v) => ({ ...v, [skillId]: { ...v[skillId], [state]: value ?? undefined } }))
    setSaving((n) => n + 1)
    // Schrijfacties serialiseren zodat snelle kliks elkaar niet inhalen.
    queue.current = queue.current
      .then(() => rpc('set_rating', { p_token: token, p_skill: skillId, p_state: state, p_value: value }))
      .then(() => setSavedAt(new Date()))
      .catch((e) => setError((e as Error).message))
      .finally(() => setSaving((n) => n - 1))
  }

  async function toggleSubmit() {
    const next = !submitted
    setSubmitted(next)
    try {
      await rpc('set_submitted', { p_token: token, p_submitted: next })
      setSavedAt(new Date())
    } catch (e) {
      setSubmitted(!next)
      setError((e as Error).message)
    }
  }

  const skills = data?.skills ?? []
  const scale = data?.session.scale ?? []
  const max = scale.length || 5

  const filled = useMemo(() => {
    const count = (s: State) => skills.filter((sk) => values[sk.id]?.[s] != null).length
    return { current: count('current'), future: count('future'), total: skills.length }
  }, [skills, values])

  if (error && !data) {
    return (
      <div className="center-page">
        <div className="card" style={{ maxWidth: 460 }}>
          <h2>Deze link werkt niet</h2>
          <p className="muted" style={{ marginTop: 8 }}>{error}</p>
        </div>
      </div>
    )
  }
  if (!data) return <div className="skeleton">Laden…</div>

  const done = filled.current === filled.total && filled.future === filled.total && filled.total > 0

  return (
    <>
      <header className="topbar">
        <span className="brand">{data.session.name}</span>
        <span className="sep">·</span>
        <span className="muted">{data.participant.name}</span>
        <span className="spacer" />
        <span className="small muted">
          {saving > 0 ? 'Opslaan…' : savedAt ? `Bewaard om ${savedAt.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}` : 'Automatisch bewaard'}
        </span>
      </header>

      <div className="shell">
        {error && (
          <div className="banner error" style={{ marginBottom: 16 }}>
            {error} <button className="ghost sm" onClick={() => setError('')}>sluiten</button>
          </div>
        )}

        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div className="card">
            <div className="card-head">
              <div>
                <h2>{state === 'current' ? 'Waar sta je nu?' : 'Waar wil je naartoe?'}</h2>
                <p className="muted small" style={{ marginTop: 4 }}>
                  {state === 'current'
                    ? 'Scoor jezelf op je huidige niveau. Eerlijk is nuttiger dan bescheiden of stoer.'
                    : 'Waar wil je over pakweg een jaar staan? Niet alles hoeft omhoog — bewust gelijk blijven mag ook.'}
                </p>
              </div>
            </div>

            <div className="row" style={{ marginBottom: 14 }}>
              <div className="tabs">
                <button aria-selected={state === 'current'} onClick={() => setState('current')}>
                  Huidig <span className="muted small">&nbsp;{filled.current}/{filled.total}</span>
                </button>
                <button aria-selected={state === 'future'} onClick={() => setState('future')}>
                  Gewenst <span className="muted small">&nbsp;{filled.future}/{filled.total}</span>
                </button>
              </div>
            </div>

            <details style={{ marginBottom: 8 }}>
              <summary className="small muted" style={{ cursor: 'pointer' }}>Wat betekenen de niveaus?</summary>
              <ol className="small muted" style={{ paddingLeft: 20, marginTop: 8, display: 'grid', gap: 4 }}>
                {scale.map((lv) => (
                  <li key={lv.level} value={lv.level}>
                    <strong style={{ color: 'var(--text)' }}>{lv.label}</strong> — {lv.description}
                  </li>
                ))}
              </ol>
            </details>

            {skills.map((skill) => {
              const value = values[skill.id]?.[state]
              return (
                <div className="skill" key={skill.id}>
                  <div className="skill-head">
                    <span className="name">{skill.label}</span>
                    <span className="spacer" />
                    {value ? (
                      <span className="small muted">{scale[value - 1]?.label ?? value}</span>
                    ) : (
                      <span className="small" style={{ color: 'var(--text-3)' }}>nog niet ingevuld</span>
                    )}
                  </div>
                  {skill.description && <p className="skill-desc">{skill.description}</p>}
                  {skill.anchor && (
                    <p className="anchor">
                      <strong>Eén keer dit gedaan</strong> is hier: {skill.anchor}.
                    </p>
                  )}
                  <div className={`levels ${state === 'future' ? 'future' : ''}`}>
                    {Array.from({ length: max }, (_, i) => i + 1).map((lv) => (
                      <button
                        key={lv}
                        aria-pressed={value === lv}
                        title={scale[lv - 1]?.description ?? ''}
                        onClick={() => rate(skill.id, lv)}
                      >
                        <span className="lv">{lv}</span>
                        <span className="lb">{scale[lv - 1]?.label ?? ''}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ position: 'sticky', top: 78 }}>
            <div className="card">
              <h3 style={{ marginBottom: 10 }}>Jouw profiel</h3>
              <Radar
                axes={skills.map((s) => s.label)}
                max={max}
                exportName={`${data.session.name} — ${data.participant.name}`}
                series={[
                  {
                    key: 'current',
                    label: 'Huidig',
                    color: 'var(--current)',
                    values: skills.map((s) => values[s.id]?.current ?? null),
                  },
                  {
                    key: 'future',
                    label: 'Gewenst',
                    color: 'var(--future)',
                    dashed: true,
                    values: skills.map((s) => values[s.id]?.future ?? null),
                  },
                ]}
              />
            </div>

            <div className="card">
              {done ? (
                <>
                  <p className="small" style={{ marginBottom: 10 }}>
                    Alles is ingevuld. {submitted ? 'Je hebt je invulling ingediend.' : 'Dien hem in als je tevreden bent — je kunt daarna nog wijzigen.'}
                  </p>
                  <button className={submitted ? '' : 'primary'} onClick={toggleSubmit}>
                    {submitted ? 'Toch nog iets wijzigen' : 'Invulling indienen'}
                  </button>
                </>
              ) : (
                <p className="small muted">
                  Nog {filled.total * 2 - filled.current - filled.future} van de {filled.total * 2} scores te gaan.
                  Alles wordt automatisch bewaard; je kunt deze link later opnieuw openen.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
