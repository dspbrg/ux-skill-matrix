import { useEffect, useLayoutEffect, useState } from 'react'
import Home from './Home'
import Participant from './Participant'
import Admin from './Admin'
import { pasSessieThemaToe, pasThemaToe } from './thema'

function currentRoute() {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [path, query] = raw.split('?')
  return { path, params: new URLSearchParams(query ?? '') }
}

export function navigate(to: string) {
  window.location.hash = to
}

/** De sleutel waaronder we het thema van een sessie onthouden. */
function sleutelVanRoute(route: ReturnType<typeof currentRoute>): string | null {
  const deelnemer = route.path.match(/^\/p\/([A-Za-z0-9_-]+)$/)
  if (deelnemer) return `p:${deelnemer[1]}`
  if (route.path.startsWith('/admin')) {
    const code = route.params.get('s')
    return code ? `s:${code}` : null
  }
  return null
}

export default function App() {
  const [route, setRoute] = useState(currentRoute)

  // Vóór de eerste verf, anders zie je het eigen thema even oplichten. Voor een
  // deelnemer of een sessie pakken we meteen het thema dat we van die sessie
  // onthouden hebben; wat de server straks zegt gaat daar alsnog overheen.
  useLayoutEffect(() => {
    const sleutel = sleutelVanRoute(route)
    if (sleutel) pasSessieThemaToe(sleutel)
    else pasThemaToe()
  }, [route.path])

  useEffect(() => {
    const onHash = () => {
      setRoute(currentRoute())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const participant = route.path.match(/^\/p\/([A-Za-z0-9_-]+)$/)
  if (participant) return <Participant token={participant[1]} />
  if (route.path.startsWith('/admin')) {
    const code = route.params.get('s') ?? ''
    return <Admin initialCode={code} />
  }
  return <Home />
}
