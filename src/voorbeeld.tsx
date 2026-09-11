/**
 * Tijdelijke werkbank: draait de app op verzonnen data, zonder database.
 * Onderschept de fetch naar PostgREST en beantwoordt hem uit een winkeltje in
 * het geheugen, zodat klikken echt iets doet.
 *
 *   http://localhost:5175/voorbeeld.html#/p/demo
 *   http://localhost:5175/voorbeeld.html#/admin?s=DEMO&k=demo
 */
import { createRoot } from 'react-dom/client'
import './styles.css'
import './thema-coa.css'

const scale = [
  { level: 1, label: 'Nog niet', description: 'Je weet wat het is, maar je hebt het nog niet gedaan.' },
  { level: 2, label: 'Meegelopen', description: 'Je liep mee; iemand anders trok het.' },
  { level: 3, label: 'Zelf gedaan', description: 'Je hebt het zelf gedaan, van begin tot eind.' },
  { level: 4, label: 'Zelfstandig', description: 'Je doet het zelf en kunt onderbouwen waarom je het zo aanpakt.' },
  { level: 5, label: 'Expert', description: 'Anderen komen bij jou.' },
]

const assen: [string, string, string][] = [
  ['Kwalitatief onderzoek', 'een usability test draaien die iemand anders bedacht', 'de methode kiezen die bij de vraag past, en de hypothese scherpstellen'],
  ['Kwantitatief onderzoek', 'een vragenlijst uitzetten en de uitkomsten samenvatten', 'een hypothese toetsbaar maken, en zien wanneer een cijfer niets zegt'],
  ['Informatiearchitectuur', 'een menu of paginastructuur voorstellen', 'een structuur ontwerpen én toetsen met een card sort of tree test'],
  ['Interaction Design', 'het gelukkige pad uittekenen', 'alle states uitwerken: leeg, fout, laden en de randgevallen'],
  ['UI Design', 'een scherm samenstellen uit bestaande componenten', 'een bestand opleveren waar een developer niet uit hoeft te gokken'],
  ['Prototyping', 'een klikbaar prototype maken van schermen die er al zijn', 'het detailniveau kiezen dat de vraag vraagt, en niet meer bouwen dan dat'],
  ['UX Writing', 'losse labels en knopteksten schrijven', 'de teksten van een hele flow, inclusief fout- en randgevallen'],
  ['Toegankelijkheid (WCAG)', 'contrast en alt-teksten controleren', 'focusvolgorde, aria en toetsenbordpaden beoordelen'],
  ['Faciliteren', 'een sessie met een handjevol mensen begeleiden', 'een volle zaal, met werkvormen die je zelf kiest'],
  ['Presenteren & overtuigen', 'je bevindingen delen in het team', 'een zaal met belanghebbenden meekrijgen, met eigen materiaal'],
]

const skills = assen.map(([label, anchor, anchor_senior], i) => ({
  id: `s${i}`, label, description: '', anchor, anchor_senior, sort_order: i,
}))

const deelnemers = [
  { id: 'p0', name: 'Maud', role: 'UX designer', token: 'demo', submitted_at: null, created_at: '' },
  { id: 'p1', name: 'Joris', role: 'Onderzoeker', token: 't1', submitted_at: '2026-09-01', created_at: '' },
  { id: 'p2', name: 'Iris', role: 'Content designer', token: 't2', submitted_at: '2026-09-01', created_at: '' },
  { id: 'p3', name: 'Tarik', role: 'Lead', token: 't3', submitted_at: null, created_at: '' },
]

type R = { participant_id: string; skill_id: string; state: 'current' | 'future'; value: number }
const ratings: R[] = []
// Drie ingevulde profielen; Maud (de deelnemer die je bekijkt) heeft er één open
// gelaten, zodat de voet van de lijst iets te zeggen heeft.
const nu = [
  [5, 3, 7, 6, 9, 7, 4, 3, 5, 6],
  [9, 7, 5, 3, 1, 3, 5, 4, 7, 8],
  [3, 2, 6, 5, 4, 4, 9, 6, 5, 7],
]
nu.forEach((rij, pi) => rij.forEach((v, si) => {
  if (pi === 0 && si === 5) return // Maud heeft Prototyping nog niet ingevuld
  ratings.push({ participant_id: `p${pi}`, skill_id: `s${si}`, state: 'current', value: v })
  ratings.push({ participant_id: `p${pi}`, skill_id: `s${si}`, state: 'future', value: Math.min(9, v + (si % 3) + 1) })
}))

const session = { id: 'x', code: 'DEMO', name: 'COA · UX-team najaar 2026', scale }

function antwoord(fn: string, a: Record<string, unknown>): unknown {
  const wie = (token: string) => deelnemers.find((p) => p.token === token)!
  switch (fn) {
    case 'get_participant': {
      const p = wie(a.p_token as string)
      return {
        session: { name: session.name, code: session.code, scale },
        participant: { id: p.id, name: p.name, role: p.role, submitted_at: p.submitted_at },
        skills,
        ratings: ratings.filter((r) => r.participant_id === p.id).map(({ skill_id, state, value }) => ({ skill_id, state, value })),
      }
    }
    case 'set_rating': {
      const p = wie(a.p_token as string)
      const i = ratings.findIndex((r) => r.participant_id === p.id && r.skill_id === a.p_skill && r.state === a.p_state)
      if (a.p_value == null) { if (i >= 0) ratings.splice(i, 1) }
      else if (i >= 0) ratings[i].value = a.p_value as number
      else ratings.push({ participant_id: p.id, skill_id: a.p_skill as string, state: a.p_state as 'current', value: a.p_value as number })
      return null
    }
    case 'set_submitted': {
      const p = wie(a.p_token as string)
      p.submitted_at = a.p_submitted ? new Date().toISOString() : null
      return null
    }
    case 'admin_get':
      return { session, skills, participants: deelnemers, ratings }
    default:
      return null
  }
}

const echt = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const m = url.match(/\/rest\/v1\/rpc\/([a-z_]+)/)
  if (!m) return echt(input, init)
  const body = init?.body ? JSON.parse(String(init.body)) : {}
  // Kleine vertraging, anders is elke toestand tussendoor onzichtbaar.
  await new Promise((r) => setTimeout(r, 120))
  return new Response(JSON.stringify(antwoord(m[1], body)), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

if (!window.location.hash) window.location.hash = '/p/demo'
const { default: App } = await import('./App')
createRoot(document.getElementById('root')!).render(<App />)
