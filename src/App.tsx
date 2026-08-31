import { useEffect, useState } from 'react'
import Home from './Home'
import Participant from './Participant'
import Admin from './Admin'

function currentRoute() {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [path, query] = raw.split('?')
  return { path, params: new URLSearchParams(query ?? '') }
}

export function navigate(to: string) {
  window.location.hash = to
}

/**
 * Verplaatst de adminsleutel van de URL naar sessionStorage en haalt hem uit de
 * adresbalk. Anders staat hij in de browsergeschiedenis en op het scherm zodra
 * je tijdens een sessie je scherm deelt.
 */
function takeAdminKey(code: string, fromUrl: string | null): string {
  const slot = `skillmatrix:key:${code}`
  try {
    if (fromUrl) {
      sessionStorage.setItem(slot, fromUrl)
      window.history.replaceState(null, '', `#/admin?s=${code}`)
      return fromUrl
    }
    return sessionStorage.getItem(slot) ?? ''
  } catch {
    // privémodus of geblokkeerde opslag: dan maar met de sleutel in de URL
    return fromUrl ?? ''
  }
}

export default function App() {
  const [route, setRoute] = useState(currentRoute)

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
    return <Admin initialCode={code} initialKey={takeAdminKey(code, route.params.get('k'))} />
  }
  return <Home />
}
