import { useEffect, useState } from 'react'
import { navigate } from './App'
import { Icoon } from './Icoon'
import { inloggen, isConfigured, rpc, supabase, uitloggen } from './supabase'

interface SessionRow {
  code: string
  name: string
  created_at: string
  participants: number
  submitted: number
}

/**
 * Startscherm. Deelnemers komen binnen via hun eigen link (#/p/<token>) en zien
 * dit scherm nooit — het is dus alleen de facilitator-ingang.
 *
 * Hier stond eerst één veld voor een adminsleutel. Die sleutel was acht tekens,
 * door een mens verzonnen, en het enige wat het zelfbeeld van een heel team
 * afschermde. Een gedeeld geheim is het verkeerde gereedschap als er maar één
 * facilitator is — dus is het nu een account, en hoeft er niets onthouden te
 * worden.
 */
export default function Home() {
  const [ingelogd, setIngelogd] = useState<boolean | null>(null)
  const [sessions, setSessions] = useState<SessionRow[] | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const open = (code: string) => navigate(`/admin?s=${code}`)

  // Wie terugkomt van GitHub heeft ?code=… in de adresbalk staan; de client
  // wisselt die zelf in en meldt dat via onAuthStateChange. Daarom niet één
  // keer kijken maar luisteren.
  useEffect(() => {
    let levend = true
    supabase.auth.getSession().then(({ data }) => { if (levend) setIngelogd(!!data.session) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sessie) => {
      if (levend) setIngelogd(!!sessie)
    })
    return () => { levend = false; sub.subscription.unsubscribe() }
  }, [])

  // Zodra we weten wie je bent: je sessies ophalen. Heb je er één, dan ga je
  // er meteen heen — dat is bijna altijd het geval.
  useEffect(() => {
    if (!ingelogd) return
    let levend = true
    rpc<SessionRow[]>('admin_list_sessions', {})
      .then((rows) => {
        if (!levend) return
        if (rows.length === 1) return open(rows[0].code)
        setSessions(rows)
        if (rows.length === 0) setNaming(true)
      })
      .catch((e) => levend && setError((e as Error).message))
    return () => { levend = false }
  }, [ingelogd])

  async function create() {
    if (busy) return
    if (!name.trim()) return setError('Geef de sessie een naam.')
    setBusy(true)
    setError('')
    try {
      const s = await rpc<{ code: string }>('create_session', { p_name: name })
      open(s.code)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  // ---------------------------------------------------------------- inloggen
  if (ingelogd === null) {
    return <Frame kop={<>Eerst jij, dan het <em>team</em>.</>}><p className="muted">Even kijken wie je bent…</p></Frame>
  }

  if (!ingelogd) {
    return (
      <Frame kop={<>Eerst jij, dan het <em>team</em>.</>}>
        {!isConfigured && (
          <div className="banner error" style={{ marginBottom: 'var(--space-4)' }}>
            Supabase is niet geconfigureerd — zet <code>VITE_SUPABASE_URL</code> en{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code>.
          </div>
        )}
        {error && <div className="banner error">{error}</div>}
        <button className="primary groot" disabled={busy}
          onClick={() => { setBusy(true); inloggen().catch((e) => { setError((e as Error).message); setBusy(false) }) }}>
          <Icoon naam="github" maat={20} />
          Inloggen met GitHub
        </button>
      </Frame>
    )
  }

  // ---------------------------------------------------------------- nieuwe sessie
  if (naming) {
    return (
      <Frame kop={<>Hoe heet deze <em>sessie</em>?</>}>
        <label className="field">
          <span className="micro">Naam</span>
          <input type="text" autoFocus placeholder="COA · UX-team najaar 2026"
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()} />
        </label>
        {error && <div className="banner error">{error}</div>}
        <button className="primary groot" onClick={create} disabled={busy}>
          {busy ? 'Bezig…' : 'Aanmaken'}
        </button>
        {(sessions?.length ?? 0) > 0 && (
          <button className="ghost sm voet-knop" onClick={() => { setError(''); setNaming(false) }}>
            Terug
          </button>
        )}
        {(sessions?.length ?? 0) === 0 && (
          <button className="ghost sm voet-knop" onClick={uitloggen}>Uitloggen</button>
        )}
      </Frame>
    )
  }

  if (sessions === null) {
    return <Frame kop={<>Eerst jij, dan het <em>team</em>.</>}><p className="muted">Je sessies ophalen…</p></Frame>
  }

  // ---------------------------------------------------------------- sessiekeuze
  return (
    <Frame kop={<><em>{sessions.length}</em> sessies</>} breed>
      <div className="sessielijst">
        {sessions.map((s) => (
          <button key={s.code} onClick={() => open(s.code)}>
            <span className="naam">{s.name}</span>
            <span className="spacer" />
            <span className="micro">
              {s.participants === 0 ? 'geen deelnemers' : `${s.submitted}/${s.participants} ingediend`}
            </span>
            <span className="micro code">{s.code}</span>
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 'var(--space-4)' }}>
        <button className="ghost sm" onClick={() => { setNaming(true); setName(''); setError('') }}>
          <Icoon naam="plus" />
          Nieuwe sessie
        </button>
        <span className="spacer" />
        <button className="ghost sm" onClick={uitloggen}>Uitloggen</button>
      </div>
    </Frame>
  )
}

/**
 * De compositie: links uitgelijnd met een grote kop, en rechts een uitsnede van
 * het spinnenweb uit de radar. Een gecentreerd doosje op een leeg vlak zei
 * niets over wat dit is of van wie het is.
 */
function Frame({ kop, children, breed }: { kop: React.ReactNode; children: React.ReactNode; breed?: boolean }) {
  return (
    <div className="entree">
      <Web />
      <div className="entree-inhoud">
        <p className="micro merk">
          <span className="leeft" aria-hidden="true" />
          UX Skill Matrix · facilitator
        </p>
        <h1>{kop}</h1>
        <div className={`entree-vorm ${breed ? 'breed' : ''}`}>{children}</div>
      </div>
    </div>
  )
}

/** Het spinnenweb van de radar, uitvergroot en aangesneden. */
function Web() {
  const n = 10
  const punt = (straal: number, i: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2
    return [250 + Math.cos(a) * straal, 250 + Math.sin(a) * straal] as const
  }
  const ring = (straal: number) =>
    Array.from({ length: n }, (_, i) => punt(straal, i))
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(' ') + ' Z'

  return (
    <svg className="entree-web" viewBox="0 0 500 500" aria-hidden="true">
      {[80, 130, 180, 230].map((r) => (
        <path key={r} d={ring(r)} fill="none" stroke="currentColor" strokeWidth={1} />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = punt(230, i)
        return <line key={i} x1={250} y1={250} x2={x} y2={y} stroke="currentColor" strokeWidth={1} />
      })}
    </svg>
  )
}
