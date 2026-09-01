import { useState } from 'react'
import { navigate } from './App'
import { isConfigured, rpc } from './supabase'

interface SessionRow {
  code: string
  name: string
  created_at: string
  participants: number
  submitted: number
}

/**
 * Startscherm. Deelnemers komen binnen via hun eigen link (#/p/<token>) en zien
 * dit scherm nooit — het is dus alleen de facilitator-login. Eén veld: de
 * adminsleutel bepaalt welke sessies je ziet.
 */
export default function Home() {
  const [key, setKey] = useState('')
  const [sessions, setSessions] = useState<SessionRow[] | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const open = (code: string) => navigate(`/admin?s=${code}&k=${encodeURIComponent(key)}`)

  async function unlock() {
    if (busy) return
    if (key.trim().length === 0) return setError('Vul je adminsleutel in.')
    if (key.length < 8) return setError(`Een adminsleutel is minstens 8 tekens — deze heeft er ${key.length}.`)
    setBusy(true)
    setError('')
    try {
      const rows = await rpc<SessionRow[]>('admin_list_sessions', { p_admin_key: key })
      if (rows.length === 1) return open(rows[0].code)
      setSessions(rows)
      if (rows.length === 0) setNaming(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function create() {
    if (busy) return
    if (!name.trim()) return setError('Geef de sessie een naam.')
    setBusy(true)
    setError('')
    try {
      const s = await rpc<{ code: string }>('create_session', { p_name: name, p_admin_key: key })
      open(s.code)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  // ---------------------------------------------------------------- sleutel
  if (sessions === null) {
    return (
      <Frame kop={<>Eerst jij, dan het <em>team</em>.</>}>
        {!isConfigured && (
          <div className="banner error" style={{ marginBottom: 'var(--space-4)' }}>
            Supabase is niet geconfigureerd — zet <code>VITE_SUPABASE_URL</code> en{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code>.
          </div>
        )}
        <label className="field">
          <span className="micro">Sleutel</span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={key}
            onChange={(e) => { setKey(e.target.value); if (error) setError('') }}
            onKeyDown={(e) => e.key === 'Enter' && unlock()}
          />
        </label>
        {error && <div className="banner error">{error}</div>}
        <button className="primary groot" onClick={unlock} disabled={busy}>
          {busy ? 'Bezig…' : 'Openen'}
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
        <button className="ghost sm voet-knop"
          onClick={() => {
            setError(''); setNaming(false)
            if (sessions.length === 0) { setSessions(null); setKey('') }
          }}>
          {sessions.length === 0 ? 'Andere sleutel proberen' : 'Terug'}
        </button>
      </Frame>
    )
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
      <button className="ghost sm voet-knop"
        onClick={() => { setNaming(true); setName(''); setError('') }}>
        + Nieuwe sessie
      </button>
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
