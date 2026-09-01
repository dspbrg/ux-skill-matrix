import { useEffect, useMemo, useRef, useState } from 'react'
import Radar from './Radar'
import { rpc } from './supabase'
import type { ParticipantPayload, Rating, ScaleLevel, Skill, State } from './types'

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
  // Na indienen valt het formulier weg en wordt de radar het onderwerp.
  // 'afronden' is het korte moment waarin de assen uitfaden.
  const [afronden, setAfronden] = useState(false)
  const [klaar, setKlaar] = useState(false)
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    let alive = true
    rpc<ParticipantPayload>('get_participant', { p_token: token })
      .then((d) => {
        if (!alive) return
        setData(d)
        setValues(toValues(d.ratings))
        setSubmitted(Boolean(d.participant.submitted_at))
        setKlaar(Boolean(d.participant.submitted_at))
      })
      .catch((e) => alive && setError((e as Error).message))
    return () => {
      alive = false
    }
  }, [token])

  /**
   * Klikken zet de score. Wissen gaat via een eigen knop: toen dit een toggle
   * was, wiste een dubbelklik op een nog niet gekozen knop de score meteen
   * weer — twee losse events, waarvan het tweede de waarde terugzette op null.
   */
  function rate(skillId: string, value: number | null) {
    setValues((v) => ({ ...v, [skillId]: { ...v[skillId], [state]: value ?? undefined } }))
    // Een ingediende invulling die niet meer compleet is, mag niet stil als
    // "Ingediend" blijven staan bij de facilitator.
    if (value === null && submitted) void toggleSubmit()
    setSaving((n) => n + 1)
    // Schrijfacties serialiseren zodat snelle kliks elkaar niet inhalen.
    // Zet je je huidige niveau boven een al gekozen doel, dan zou het doel
    // ineens lager liggen dan waar je staat; dan schuift het mee omhoog.
    const doelMee =
      state === 'current' && value != null &&
      values[skillId]?.future != null && values[skillId]!.future! < value
    if (doelMee) setValues((v) => ({ ...v, [skillId]: { ...v[skillId], future: value } }))

    queue.current = queue.current
      .then(() => rpc('set_rating', { p_token: token, p_skill: skillId, p_state: state, p_value: value }))
      .then(() => doelMee
        ? rpc('set_rating', { p_token: token, p_skill: skillId, p_state: 'future', p_value: value })
        : undefined)
      .then(() => setSavedAt(new Date()))
      .catch((e) => setError((e as Error).message))
      .finally(() => setSaving((n) => n - 1))
  }

  async function toggleSubmit() {
    const next = !submitted
    if (next) {
      setAfronden(true)
      window.setTimeout(() => { setKlaar(true); setAfronden(false) }, 320)
    } else {
      setKlaar(false)
    }
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
          <p className="muted" style={{ marginTop: 'var(--space-2)' }}>{error}</p>
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
        <span className="small muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span className="leeft" aria-hidden="true" />
          {saving > 0 ? 'Opslaan…' : savedAt ? `Bewaard om ${savedAt.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}` : 'Automatisch bewaard'}
        </span>
      </header>

      {klaar ? (
        <div className="shell afgerond">
          <div className="card">
            <div className="card-head" style={{ alignItems: 'baseline' }}>
              <div>
                <h1>Ingediend</h1>
                <p className="micro" style={{ color: 'var(--text-3)', marginTop: 'var(--space-2)' }}>
                  {data.participant.name} · {data.session.name}
                </p>
              </div>
              <span className="spacer" />
              <button onClick={toggleSubmit}>Aanpassen</button>
            </div>
            <div style={{ maxWidth: 520, margin: '0 auto' }}>
            <Radar
              axes={skills.map((s) => s.label)}
              max={max}
              size={520}
              exportName={`${data.session.name} — ${data.participant.name}`}
              series={[
                { key: 'current', label: 'Nu', color: 'var(--current)',
                  values: skills.map((s) => values[s.id]?.current ?? null) },
                { key: 'future', label: 'Doel', color: 'var(--future)', dashed: true,
                  values: skills.map((s) => values[s.id]?.future ?? null) },
              ]}
            />
            </div>
          </div>
        </div>
      ) : (
      <div className={`shell ${afronden ? 'afronden' : ''}`}>
        {error && (
          <div className="banner error" style={{ marginBottom: 'var(--space-4)' }}>
            {error} <button className="ghost sm" onClick={() => setError('')}>sluiten</button>
          </div>
        )}

        {/* Links het gereedschap, rechts het onderwerp. Twee kaarten van bijna
            dezelfde kleur lieten het oog nergens naartoe gaan; alleen de radar
            krijgt nog een eigen oppervlak. */}
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div className="kolom">
            <div className="kop">
              <div>
                <h1>{state === 'current' ? 'Waar sta je nu?' : 'Waar wil je heen?'}</h1>
                {state === 'future' && (
                  <p className="muted small" style={{ marginTop: 'var(--space-2)' }}>
                    Over een jaar. Niet alles hoeft omhoog.
                  </p>
                )}
              </div>

              <div className="row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="tabs">
                  <button aria-selected={state === 'current'} onClick={() => setState('current')}>
                    1 · Nu <span className="muted small">&nbsp;{filled.current}/{filled.total}</span>
                  </button>
                  <button aria-selected={state === 'future'} onClick={() => setState('future')}>
                    2 · Doel <span className="muted small">&nbsp;{filled.future}/{filled.total}</span>
                  </button>
                </div>
              </div>
            </div>

            <details style={{ marginBottom: 'var(--space-2)' }}>
              <summary className="small muted" style={{ cursor: 'pointer' }}>Wat betekenen de niveaus?</summary>
              <ol className="small muted" style={{ paddingLeft: 'var(--space-5)', marginTop: 'var(--space-2)', display: 'grid', gap: 'var(--space-1)' }}>
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
                    {/* Altijd in de opmaak aanwezig, alleen onzichtbaar zolang er
                        niets te wissen valt: anders verspringt het hele blok zodra
                        je je eerste score zet. */}
                    <button
                      className="ghost sm"
                      style={{ visibility: value == null ? 'hidden' : 'visible' }}
                      tabIndex={value == null ? -1 : 0}
                      aria-hidden={value == null}
                      onClick={() => rate(skill.id, null)}
                    >
                      wissen
                    </button>
                  </div>
                  {/* Eén tekst per as. Er stonden er twee, en die zeiden
                      vrijwel hetzelfde — tien keer een parafrase onder elkaar. */}
                  {(skill.anchor || skill.description) && (
                    <p className="anchor">{skill.anchor || skill.description}</p>
                  )}
                  <Baan
                    skill={skill}
                    scale={scale}
                    max={max}
                    nu={values[skill.id]?.current}
                    doel={values[skill.id]?.future}
                    state={state}
                    onKies={(lv) => rate(skill.id, lv)}
                  />
                </div>
              )
            })}

            {/* De lijst liep dood: na de laatste skill stond niets, en de weg
                naar stap 2 was helemaal terugscrollen naar boven. */}
            {state === 'current' && filled.current === filled.total && filled.total > 0 && (
              <div className="opkomen" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-5)', marginTop: 'var(--space-2)' }}>
                <button
                  className="primary"
                  onClick={() => {
                    setState('future')
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                >
                  Verder naar stap 2 · Doel
                </button>
              </div>
            )}
            {state === 'future' && done && (
              <div className="opkomen" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-5)', marginTop: 'var(--space-2)' }}>
                <button className={submitted ? '' : 'primary'} onClick={toggleSubmit}>
                  {submitted ? 'Aanpassen' : 'Indienen'}
                </button>
              </div>
            )}
          </div>

          <div style={{ position: 'sticky', top: 78 }}>
            <div className="card">
              {/* "Jouw profiel" en "Teamprofiel" in het adminscherm staan op
                  dezelfde plek in de opbouw; dan hoort het ook dezelfde rang
                  te zijn. Voortgang staat hier omdat het bij het profiel hoort
                  en niet in een eigen kaart met een grote ring naast een korte
                  zin — dat stond uit balans in deze kolom. */}
              <div className="card-head" style={{ alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <h2>Je profiel</h2>
                <span className="spacer" />
                <span className="voortgang">
                  <span className="balk">
                    <span style={{ width: `${((filled.current + filled.future) / (filled.total * 2 || 1)) * 100}%` }} />
                  </span>
                  <span className="telling">
                    {filled.current + filled.future}/{filled.total * 2}
                  </span>
                </span>
              </div>
              <Radar
                axes={skills.map((s) => s.label)}
                max={max}
                exportName={`${data.session.name} — ${data.participant.name}`}
                series={[
                  {
                    key: 'current',
                    label: 'Nu',
                    color: 'var(--current)',
                    values: skills.map((s) => values[s.id]?.current ?? null),
                  },
                  {
                    key: 'future',
                    label: 'Doel',
                    color: 'var(--future)',
                    dashed: true,
                    values: skills.map((s) => values[s.id]?.future ?? null),
                  },
                ]}
              />
            </div>


          </div>
        </div>
      </div>
      )}
    </>
  )
}


/**
 * Eén baan per skill, met beide metingen erop: een bol voor waar je staat en
 * een ring voor waar je heen wil. Het gat is daardoor een zichtbare afstand
 * in plaats van twee losse getallen.
 *
 * De twee stappen blijven wel gescheiden. Als je per skill direct achter
 * elkaar allebei zou invullen, wordt het antwoord bij vrijwel iedereen
 * reflexmatig "eentje hoger" — en juist dat verschil is wat we willen weten.
 */
function Baan({
  skill, scale, max, nu, doel, state, onKies,
}: {
  skill: Skill
  scale: ScaleLevel[]
  max: number
  nu?: number
  doel?: number
  state: State
  onKies: (lv: number) => void
}) {
  const actief = state === 'current' ? nu : doel
  // Je doel kan niet lager liggen dan waar je nu staat: achteruitgang plannen
  // is geen ontwikkeldoel. Gelijk blijven mag wel — dat staat ook in de kop.
  const bodem = state === 'future' ? nu ?? 1 : 1
  const gat = nu != null && doel != null && doel !== nu
  const van = gat ? Math.min(nu!, doel!) : 0
  const tot = gat ? Math.max(nu!, doel!) : 0
  const pct = (n: number) => ((n - 1) / (max - 1)) * 100

  return (
    <div className={`baan ${state === 'future' ? 'doelstap' : ''}`}>
      <div
        className="baan-spoor"
        role="radiogroup"
        aria-label={`${skill.label} — ${state === 'current' ? 'waar je nu staat' : 'waar je heen wil'}`}
        onKeyDown={(e) => {
          const stap =
            e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
            : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
          if (!stap) return
          e.preventDefault()
          const volgende = Math.min(max, Math.max(bodem, (actief ?? bodem) + stap))
          onKies(volgende)
          ;(e.currentTarget.querySelectorAll('button')[volgende - 1] as HTMLButtonElement)?.focus()
        }}
      >
        {/* Lijn, gat én haltes delen één doos, anders lopen de percentages van
            de markers niet synchroon met die van de rail. Het spoor eromheen
            begint op dezelfde kantlijn als de tekst erboven; de eindruimte is
            er zodat de buitenste labels binnen de kaart passen. */}
        <div className="baan-rail">
          <span className="baan-lijn" aria-hidden="true" />
          {gat && (
            <span
              className="baan-gat"
              aria-hidden="true"
              style={{ left: `${pct(van)}%`, width: `${pct(tot) - pct(van)}%` }}
            />
          )}
        {Array.from({ length: max }, (_, i) => i + 1).map((lv) => {
          const isNu = nu === lv
          const isDoel = doel === lv
          const geblokkeerd = lv < bodem
          return (
            <button
              key={lv}
              role="radio"
              aria-checked={actief === lv}
              aria-disabled={geblokkeerd}
              disabled={geblokkeerd}
              tabIndex={actief === lv || (actief == null && lv === bodem) ? 0 : -1}
              title={geblokkeerd ? 'Lager dan waar je nu staat' : scale[lv - 1]?.description ?? ''}
              onClick={() => onKies(lv)}
              className="halte"
              style={{ left: `${pct(lv)}%` }}
            >
              <span
                className={`merk ${isNu ? 'is-nu' : ''} ${isDoel ? 'is-doel' : ''}`}
                aria-hidden="true"
              />
              {/* Op een smal scherm vervalt de labelrij en staat het label hier. */}
              <span className="halte-label">{scale[lv - 1]?.label ?? lv}</span>
            </button>
          )
        })}
        </div>
      </div>

      <div className="baan-labels" aria-hidden="true">
        {Array.from({ length: max }, (_, i) => i + 1).map((lv) => (
          <span
            key={lv}
            className={`${nu === lv ? 'is-nu' : doel === lv ? 'is-doel' : ''} ${lv < bodem ? 'uit' : ''}`}
            // Alle vijf optisch op hun eigen punt. Het eerste en laatste label
            // tegen de rand duwen scheelde maar 13px met de buurman, terwijl de
            // rest er 60 had; de kaartmarge vangt het overschot ruim op.
            style={{ left: `${pct(lv)}%`, transform: 'translateX(-50%)' }}
          >
            {scale[lv - 1]?.label ?? lv}
          </span>
        ))}
      </div>
    </div>
  )
}
