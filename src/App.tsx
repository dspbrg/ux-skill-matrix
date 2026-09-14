import { useEffect, useLayoutEffect, useState } from 'react'
import Home from './Home'
import Participant from './Participant'
import Admin from './Admin'
import { pasThemaToe } from './thema'

function currentRoute() {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [path, query] = raw.split('?')
  return { path, params: new URLSearchParams(query ?? '') }
}

export function navigate(to: string) {
  window.location.hash = to
}

export default function App() {
  const [route, setRoute] = useState(currentRoute)

  // Vóór de eerste verf, anders zie je het eigen thema even oplichten.
  useLayoutEffect(() => { pasThemaToe() }, [route.path])

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
