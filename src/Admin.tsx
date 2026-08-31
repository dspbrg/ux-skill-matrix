import { useCallback, useEffect, useMemo, useState } from 'react'
import Radar from './Radar'
import { rpc } from './supabase'
import type { AdminPayload, ScaleLevel, Skill, State } from './types'

type Tab = 'overview' | 'people' | 'terms'

export default function Admin({ initialCode, initialKey }: { initialCode: string; initialKey: string }) {
  const code = initialCode
  const key = initialKey
  const [data, setData] = useState<AdminPayload | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('overview')

  const load = useCallback(async () => {
    setError('')
    try {
      setData(await rpc<AdminPayload>('admin_get', { p_code: code, p_admin_key: key }))
    } catch (e) {
      setData(null)
      setError((e as Error).message)
    }
  }, [code, key])

  useEffect(() => {
    // Zonder code en sleutel in de URL valt er niets te laden: terug naar het
    // startscherm, waar de sleutel alleen wordt gevraagd.
    if (!initialCode || !initialKey) window.location.hash = '/'
    else void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode, initialKey])

  if (!data) {
    return (
      <div className="center-page">
        {error ? (
          <div className="card" style={{ width: 340 }}>
            <h2>Geen toegang</h2>
            <p className="muted small" style={{ marginTop: 8 }}>{error}</p>
            <button className="primary" style={{ marginTop: 16, width: '100%', justifyContent: 'center' }}
              onClick={() => { window.location.hash = '/' }}>
              Terug naar start
            </button>
          </div>
        ) : (
          <p className="skeleton">Laden…</p>
        )}
      </div>
    )
  }

  return (
    <>
      <header className="topbar">
        <span className="brand">{data.session.name}</span>
        <span className="sep">·</span>
        <span className="mono small muted">{data.session.code}</span>
        <span className="spacer" />
        <div className="tabs">
          <button aria-selected={tab === 'overview'} onClick={() => setTab('overview')}>Overzicht</button>
          <button aria-selected={tab === 'people'} onClick={() => setTab('people')}>Deelnemers</button>
          <button aria-selected={tab === 'terms'} onClick={() => setTab('terms')}>Instellingen</button>
        </div>
      </header>

      <div className="shell">
        {error && <div className="banner error" style={{ marginBottom: 16 }}>{error}</div>}
        {tab === 'overview' && <Overview data={data} onAddPeople={() => setTab('people')} />}
        {tab === 'people' && <People data={data} code={code} adminKey={key} reload={load} setError={setError} />}
        {tab === 'terms' && <Terms data={data} code={code} adminKey={key} reload={load} setError={setError} />}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ overzicht */

function Overview({ data, onAddPeople }: { data: AdminPayload; onAddPeople: () => void }) {
  const { skills, participants, ratings, session } = data
  const max = session.scale.length || 5
  const [focus, setFocus] = useState<string>('__team__')

  // lookup[participant][skill][state]
  const lookup = useMemo(() => {
    const m = new Map<string, Map<string, { current?: number; future?: number }>>()
    for (const r of ratings) {
      if (!m.has(r.participant_id)) m.set(r.participant_id, new Map())
      const byS = m.get(r.participant_id)!
      byS.set(r.skill_id, { ...byS.get(r.skill_id), [r.state]: r.value })
    }
    return m
  }, [ratings])

  const avg = useCallback(
    (skillId: string, state: State) => {
      const vals = participants
        .map((p) => lookup.get(p.id)?.get(skillId)?.[state])
        .filter((v): v is number => typeof v === 'number')
      if (!vals.length) return null
      return vals.reduce((a, b) => a + b, 0) / vals.length
    },
    [participants, lookup],
  )

  const coverage = useCallback(
    (skillId: string, state: State, level: number) =>
      participants.filter((p) => (lookup.get(p.id)?.get(skillId)?.[state] ?? 0) >= level).length,
    [participants, lookup],
  )

  const series = useMemo(() => {
    if (focus === '__team__') {
      return [
        { key: 'current', label: 'Team — huidig', color: 'var(--current)', values: skills.map((s) => avg(s.id, 'current')) },
        { key: 'future', label: 'Team — gewenst', color: 'var(--future)', dashed: true, values: skills.map((s) => avg(s.id, 'future')) },
      ]
    }
    const byS = lookup.get(focus)
    return [
      { key: 'current', label: 'Huidig', color: 'var(--current)', values: skills.map((s) => byS?.get(s.id)?.current ?? null) },
      { key: 'future', label: 'Gewenst', color: 'var(--future)', dashed: true, values: skills.map((s) => byS?.get(s.id)?.future ?? null) },
    ]
  }, [focus, skills, avg, lookup])

  function exportCsv() {
    const head = ['deelnemer', 'rol', 'skill', 'huidig', 'gewenst']
    const rows = participants.flatMap((p) =>
      skills.map((s) => {
        const v = lookup.get(p.id)?.get(s.id)
        return [p.name, p.role, s.label, v?.current ?? '', v?.future ?? '']
      }),
    )
    const csv = [head, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `skill-matrix-${session.code}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const submittedCount = participants.filter((p) => p.submitted_at).length

  if (participants.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '56px 22px' }}>
        <h2>Nog geen deelnemers</h2>
        <p className="muted small" style={{ margin: '8px auto 20px', maxWidth: 460 }}>
          Voeg je team toe, deel de persoonlijke links, en dit scherm vult zich vanzelf. Wil je eerst de
          skills of de schaal aanpassen? Doe dat nu — daarna kost het je niets meer.
        </p>
        <button className="primary" onClick={onAddPeople}>Deelnemers toevoegen</button>
      </div>
    )
  }

  return (
    <>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Teamprofiel</h2>
              <p className="muted small" style={{ marginTop: 4 }}>
                {submittedCount} van {participants.length} ingediend · gemiddelde over ieders ingevulde scores
              </p>
            </div>
            <span className="spacer" />
            <select value={focus} onChange={(e) => setFocus(e.target.value)} style={{ width: 'auto' }}>
              <option value="__team__">Hele team</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <Radar
            axes={skills.map((s) => s.label)}
            series={series}
            max={max}
            size={440}
            exportName={
              focus === '__team__'
                ? `${session.name} — team`
                : `${session.name} — ${participants.find((p) => p.id === focus)?.name ?? ''}`
            }
          />
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>Waar zit de kloof?</h2>
              <p className="muted small" style={{ marginTop: 4 }}>
                Gemiddelden per skill, en hoeveel mensen nu op niveau 4+ zitten.
              </p>
            </div>
            <span className="spacer" />
            <button className="sm" onClick={exportCsv}>CSV exporteren</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Skill</th>
                  <th className="num">Huidig</th>
                  <th className="num">Gewenst</th>
                  <th className="num">Verschil</th>
                  <th className="num">4+ nu</th>
                </tr>
              </thead>
              <tbody>
                {[...skills]
                  .map((s) => ({ s, c: avg(s.id, 'current'), f: avg(s.id, 'future') }))
                  .sort((a, b) => ((b.f ?? 0) - (b.c ?? 0)) - ((a.f ?? 0) - (a.c ?? 0)))
                  .map(({ s, c, f }) => {
                    const gap = c != null && f != null ? f - c : null
                    const strong = coverage(s.id, 'current', 4)
                    return (
                      <tr key={s.id}>
                        <td>{s.label}</td>
                        <td className="num">{c?.toFixed(1) ?? '–'}</td>
                        <td className="num">{f?.toFixed(1) ?? '–'}</td>
                        <td className="num" style={{ color: gap && gap >= 1 ? 'var(--future)' : 'var(--text-2)' }}>
                          {gap == null ? '–' : gap > 0 ? `+${gap.toFixed(1)}` : gap.toFixed(1)}
                        </td>
                        <td className="num" style={{ color: c != null && strong === 0 ? 'var(--danger)' : undefined }}>
                          {strong}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            Een skill met <strong>0</strong> in de kolom “4+ nu” heeft niemand die anderen kan coachen — dat is
            meestal urgenter dan een grote gemiddelde kloof.
          </p>
        </div>
      </div>

      <div className="card">
        <h2>Iedereen naast elkaar</h2>
        <p className="muted small" style={{ margin: '4px 0 14px' }}>
          Huidig niveau, met het gewenste niveau erachter wanneer dat hoger ligt.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Skill</th>
                {participants.map((p) => (
                  <th key={p.id} className="num" title={p.role}>{p.name}</th>
                ))}
                <th className="num">Gem.</th>
              </tr>
            </thead>
            <tbody>
              {skills.map((s) => (
                <tr key={s.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{s.label}</td>
                  {participants.map((p) => {
                    const v = lookup.get(p.id)?.get(s.id)
                    return (
                      <td key={p.id} className="num">
                        <span className="heat" style={{ background: heat(v?.current, max), color: v?.current && v.current >= 4 ? '#fff' : undefined }}>
                          {v?.current ?? '–'}
                        </span>
                        {v?.future != null && v.future !== v.current && (
                          <span className="small" style={{ color: 'var(--future)' }}> →{v.future}</span>
                        )}
                      </td>
                    )
                  })}
                  <td className="num muted">{avg(s.id, 'current')?.toFixed(1) ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function heat(value: number | undefined, max: number) {
  if (!value) return 'transparent'
  const pct = Math.round((value / max) * 78)
  return `color-mix(in srgb, var(--accent) ${pct}%, transparent)`
}

/* ------------------------------------------------------------------ deelnemers */

function People({
  data, code, adminKey, reload, setError,
}: {
  data: AdminPayload; code: string; adminKey: string; reload: () => Promise<void>; setError: (s: string) => void
}) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const base = window.location.href.split('#')[0]
  const linkFor = (token: string) => `${base}#/p/${token}`

  async function add() {
    setBusy(true)
    try {
      await rpc('admin_add_participant', { p_code: code, p_admin_key: adminKey, p_name: name, p_role: role })
      setName('')
      setRole('')
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string, who: string) {
    if (!confirm(`${who} en al hun scores verwijderen?`)) return
    try {
      await rpc('admin_delete_participant', { p_code: code, p_admin_key: adminKey, p_id: id })
      await reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function copy(token: string) {
    await navigator.clipboard.writeText(linkFor(token))
    setCopied(token)
    setTimeout(() => setCopied(null), 1800)
  }

  async function copyAll() {
    const text = data.participants.map((p) => `${p.name}\t${linkFor(p.token)}`).join('\n')
    await navigator.clipboard.writeText(text)
    setCopied('__all__')
    setTimeout(() => setCopied(null), 1800)
  }

  return (
    <>
      <div className="card">
        <h2>Deelnemer toevoegen</h2>
        <p className="muted small" style={{ margin: '4px 0 14px' }}>
          Elke deelnemer krijgt een eigen link. Wie die link heeft kan invullen — deel hem dus persoonlijk.
        </p>
        <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: 2 }}>
            <span>Naam</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && add()} />
          </label>
          <label className="field" style={{ flex: 2 }}>
            <span>Rol (optioneel)</span>
            <input type="text" value={role} placeholder="UX designer" onChange={(e) => setRole(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && add()} />
          </label>
          <button className="primary" onClick={add} disabled={busy || !name.trim()}>Toevoegen</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>{data.participants.length} deelnemer{data.participants.length === 1 ? '' : 's'}</h2>
          <span className="spacer" />
          {data.participants.length > 0 && (
            <button className="sm" onClick={copyAll}>
              {copied === '__all__' ? 'Gekopieerd' : 'Alle links kopiëren'}
            </button>
          )}
        </div>

        {data.participants.length === 0 ? (
          <p className="muted small">Nog niemand toegevoegd.</p>
        ) : (
          <div className="stack">
            {data.participants.map((p) => {
              const scores = data.ratings.filter((r) => r.participant_id === p.id).length
              const total = data.skills.length * 2
              return (
                <div key={p.id} className="row" style={{ flexWrap: 'nowrap', gap: 14, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                  <div style={{ minWidth: 170 }}>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    {p.role && <div className="small muted">{p.role}</div>}
                  </div>
                  <div className="token-link" style={{ flex: 1, minWidth: 0 }}>
                    <code className="mono">{linkFor(p.token)}</code>
                    <button className="ghost sm" onClick={() => copy(p.token)}>
                      {copied === p.token ? 'Gekopieerd' : 'Kopiëren'}
                    </button>
                  </div>
                  <span className={`pill ${p.submitted_at ? 'ok' : ''}`} style={{ whiteSpace: 'nowrap' }}>
                    {p.submitted_at ? 'Ingediend' : `${scores}/${total}`}
                  </span>
                  <button className="danger sm" onClick={() => remove(p.id, p.name)}>Verwijderen</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ terminologie */

function Terms({
  data, code, adminKey, reload, setError,
}: {
  data: AdminPayload; code: string; adminKey: string; reload: () => Promise<void>; setError: (s: string) => void
}) {
  const [skills, setSkills] = useState<Skill[]>(data.skills)
  const [scale, setScale] = useState<ScaleLevel[]>(data.session.scale)
  const [sessionName, setSessionName] = useState(data.session.name)
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState('')
  const [confirmCode, setConfirmCode] = useState('')

  useEffect(() => {
    setSkills(data.skills)
    setScale(data.session.scale)
    setSessionName(data.session.name)
  }, [data])

  const dirtySkills = JSON.stringify(skills) !== JSON.stringify(data.skills)
  const dirtyScale =
    JSON.stringify(scale) !== JSON.stringify(data.session.scale) || sessionName !== data.session.name

  function patch(i: number, field: 'label' | 'description', value: string) {
    setSkills((s) => s.map((sk, k) => (k === i ? { ...sk, [field]: value } : sk)))
  }

  function move(i: number, dir: -1 | 1) {
    setSkills((s) => {
      const next = [...s]
      const j = i + dir
      if (j < 0 || j >= next.length) return s
      ;[next[i], next[j]] = [next[j], next[i]]
      return next.map((sk, k) => ({ ...sk, sort_order: k }))
    })
  }

  async function saveSkills() {
    const removed = data.skills.filter((old) => !skills.some((s) => s.id === old.id))
    if (removed.length && !confirm(
      `${removed.map((r) => r.label).join(', ')} wordt verwijderd, inclusief alle scores die daarop zijn gegeven. Doorgaan?`,
    )) return
    setBusy(true)
    try {
      await rpc('admin_set_skills', {
        p_code: code, p_admin_key: adminKey,
        p_skills: skills.map((s, i) => ({
          id: s.id.startsWith('new-') ? null : s.id,
          label: s.label, description: s.description, sort_order: i,
        })),
      })
      await reload()
      flash('Skills bijgewerkt')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function saveScale() {
    setBusy(true)
    try {
      await rpc('admin_update_session', {
        p_code: code, p_admin_key: adminKey, p_name: sessionName,
        p_scale: scale.map((lv, i) => ({ ...lv, level: i + 1 })),
      })
      await reload()
      flash('Schaal bijgewerkt')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteSession() {
    if (confirmCode.trim().toUpperCase() !== data.session.code) return
    setBusy(true)
    try {
      await rpc('admin_delete_session', { p_code: code, p_admin_key: adminKey })
      window.location.hash = '/'
      window.location.reload()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  function flash(msg: string) {
    setOk(msg)
    setTimeout(() => setOk(''), 2500)
  }

  return (
    <>
      {ok && <div className="banner" style={{ marginBottom: 16 }}>{ok}</div>}

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Skills (de assen van de matrix)</h2>
            <p className="muted small" style={{ marginTop: 4 }}>
              Hernoemen, herordenen, toevoegen of weghalen. Wijzigingen gelden voor alle deelnemers in deze
              sessie; hernoemen behoudt de al gegeven scores.
            </p>
          </div>
          <span className="spacer" />
          <button className="primary" onClick={saveSkills} disabled={busy || !dirtySkills}>
            {dirtySkills ? 'Skills opslaan' : 'Opgeslagen'}
          </button>
        </div>

        <div className="stack">
          {skills.map((s, i) => (
            <div key={s.id} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 8 }}>
              <div className="stack" style={{ gap: 2, paddingTop: 4 }}>
                <button className="ghost sm" onClick={() => move(i, -1)} disabled={i === 0} title="Omhoog">↑</button>
                <button className="ghost sm" onClick={() => move(i, 1)} disabled={i === skills.length - 1} title="Omlaag">↓</button>
              </div>
              <div className="stack" style={{ flex: 1, gap: 6 }}>
                <input type="text" value={s.label} onChange={(e) => patch(i, 'label', e.target.value)} />
                <input type="text" className="small" value={s.description}
                  placeholder="Korte toelichting (optioneel)"
                  onChange={(e) => patch(i, 'description', e.target.value)} />
              </div>
              <button className="danger sm" style={{ marginTop: 4 }}
                onClick={() => setSkills((cur) => cur.filter((_, k) => k !== i))}>
                ✕
              </button>
            </div>
          ))}
        </div>

        <button className="sm" style={{ marginTop: 14 }}
          onClick={() =>
            setSkills((s) => [
              ...s,
              { id: `new-${Date.now()}`, label: '', description: '', sort_order: s.length },
            ])
          }>
          + Skill toevoegen
        </button>
        {skills.length < 3 && (
          <p className="small" style={{ color: 'var(--danger)', marginTop: 8 }}>
            Met minder dan drie skills valt er geen radar te tekenen.
          </p>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Schaal en sessienaam</h2>
            <p className="muted small" style={{ marginTop: 4 }}>
              De niveaulabels die deelnemers bij elke score zien. Standaard is de vijfpuntsschaal uit het
              NN/g-template.
            </p>
          </div>
          <span className="spacer" />
          <button className="primary" onClick={saveScale} disabled={busy || !dirtyScale}>
            {dirtyScale ? 'Opslaan' : 'Opgeslagen'}
          </button>
        </div>

        <label className="field" style={{ marginBottom: 18 }}>
          <span>Sessienaam</span>
          <input type="text" value={sessionName} onChange={(e) => setSessionName(e.target.value)} />
        </label>

        <div className="stack">
          {scale.map((lv, i) => (
            <div key={i} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 10 }}>
              <span className="pill" style={{ marginTop: 6 }}>{i + 1}</span>
              <div className="stack" style={{ flex: 1, gap: 6 }}>
                <input type="text" value={lv.label}
                  onChange={(e) => setScale((s) => s.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
                <input type="text" value={lv.description} placeholder="Wanneer zit iemand op dit niveau?"
                  onChange={(e) => setScale((s) => s.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)))} />
              </div>
              <button className="danger sm" style={{ marginTop: 4 }} disabled={scale.length <= 2}
                onClick={() => setScale((s) => s.filter((_, k) => k !== i))}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <button className="sm" style={{ marginTop: 14 }} disabled={scale.length >= 7}
          onClick={() => setScale((s) => [...s, { level: s.length + 1, label: '', description: '' }])}>
          + Niveau toevoegen
        </button>
        <p className="small muted" style={{ marginTop: 10 }}>
          Let op: een niveau weghalen verandert de betekenis van scores die al zijn gegeven. Doe dat bij
          voorkeur vóórdat mensen invullen.
        </p>
      </div>

      <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--danger) 30%, var(--border))' }}>
        <h2>Sessie verwijderen</h2>
        <p className="muted small" style={{ margin: '4px 0 14px', maxWidth: 560 }}>
          Verwijdert <strong>{data.session.name}</strong> met alle deelnemers, hun links en alle scores.
          Niet terug te draaien — exporteer eerst de CSV onder Overzicht als je de data wilt bewaren.
        </p>
        <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end', maxWidth: 520 }}>
          <label className="field" style={{ flex: 1 }}>
            <span>Typ de sessiecode <strong className="mono">{data.session.code}</strong> om te bevestigen</span>
            <input
              type="text"
              className="mono"
              value={confirmCode}
              placeholder={data.session.code}
              onChange={(e) => setConfirmCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && deleteSession()}
            />
          </label>
          <button
            className="danger"
            style={{ border: '1px solid color-mix(in srgb, var(--danger) 45%, transparent)' }}
            disabled={busy || confirmCode.trim().toUpperCase() !== data.session.code}
            onClick={deleteSession}
          >
            Definitief verwijderen
          </button>
        </div>
      </div>
    </>
  )
}
