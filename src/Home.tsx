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
 * Startscherm: één veld. De adminsleutel bepaalt welke sessies je ziet —
 * dezelfde sleutel kan meerdere sessies beheren. Deelnemers komen binnen via
 * hun eigen link (#/p/<token>) en zien dit scherm nooit.
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
    // Niet de knop uitzetten maar zeggen wat er mis is: een grijze knop zonder
    // uitleg laat je raden waarom er niets gebeurt.
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
      <Frame>
        <h1>UX Skill Matrix</h1>
        <p className="muted small" style={{ marginTop: 6 }}>Vul je adminsleutel in.</p>

        {!isConfigured && (
          <div className="banner error" style={{ marginTop: 16 }}>
            Supabase is niet geconfigureerd — zet <code>VITE_SUPABASE_URL</code> en{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code>.
          </div>
        )}

        <div className="stack" style={{ marginTop: 20, gap: 12 }}>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder="Adminsleutel"
            value={key}
            onChange={(e) => { setKey(e.target.value); if (error) setError('') }}
            onKeyDown={(e) => e.key === 'Enter' && unlock()}
          />
          {error && <div className="banner error">{error}</div>}
          <button className="primary" style={{ justifyContent: 'center' }} onClick={unlock} disabled={busy}>
            {busy ? 'Bezig…' : 'Openen'}
          </button>
        </div>

        <p className="small muted" style={{ marginTop: 14, textAlign: 'center' }}>
          Minstens 8 tekens. Nog geen sessie? Kies gewoon een sleutel — dan maak je er zo een aan.
        </p>
      </Frame>
    )
  }

  // ---------------------------------------------------------------- nieuwe sessie
  if (naming) {
    return (
      <Frame>
        <h1>Nieuwe sessie</h1>
        <p className="muted small" style={{ marginTop: 6 }}>
          {sessions.length === 0
            ? 'Er hoort nog geen sessie bij deze sleutel.'
            : 'Komt onder dezelfde sleutel te staan.'}
        </p>
        <div className="stack" style={{ marginTop: 20, gap: 12 }}>
          <input type="text" autoFocus placeholder="Bijv. COA · UX-team najaar 2026"
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()} />
          {error && <div className="banner error">{error}</div>}
          <button className="primary" style={{ justifyContent: 'center' }} onClick={create} disabled={busy}>
            {busy ? 'Bezig…' : 'Aanmaken'}
          </button>
        </div>
        <button
          className="ghost sm"
          style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}
          onClick={() => {
            setError('')
            setNaming(false)
            // Zonder sessies is er geen lijst om naar terug te keren: dan hoort
            // "terug" bij het sleutelscherm.
            if (sessions.length === 0) {
              setSessions(null)
              setKey('')
            }
          }}
        >
          {sessions.length === 0 ? 'Andere sleutel proberen' : 'Terug'}
        </button>
      </Frame>
    )
  }

  // ---------------------------------------------------------------- sessiekeuze
  return (
    <Frame wide>
      <h1>Jouw sessies</h1>
      <p className="muted small" style={{ marginTop: 6 }}>{sessions.length} sessies onder deze sleutel.</p>

      <div className="stack" style={{ marginTop: 18, gap: 8 }}>
        {sessions.map((s) => (
          <button key={s.code} onClick={() => open(s.code)}
            style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '12px 14px' }}>
            <span style={{ flex: 1 }}>
              <span style={{ fontWeight: 600, display: 'block' }}>{s.name}</span>
              <span className="small muted">
                {s.participants === 0
                  ? 'nog geen deelnemers'
                  : `${s.submitted}/${s.participants} ingediend`}
                {' · '}
                {new Date(s.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </span>
            <span className="mono small muted">{s.code}</span>
          </button>
        ))}
      </div>

      <button className="ghost sm" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}
        onClick={() => { setNaming(true); setName(''); setError('') }}>
        + Nieuwe sessie
      </button>
    </Frame>
  )
}

function Frame({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="center-page">
      <div className="card" style={{ width: wide ? 420 : 340 }}>{children}</div>
    </div>
  )
}
