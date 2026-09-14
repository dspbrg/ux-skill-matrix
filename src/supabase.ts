import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)

export const supabase = createClient(url ?? 'https://placeholder.supabase.co', key ?? 'placeholder', {
  auth: {
    // PKCE en niet de impliciete stroom: die zet de tokens ín de hash, en deze
    // app gebruikt de hash zelf als router. Dan komt de deelnemer na een
    // inlog op #access_token=… terecht in plaats van op zijn profiel. Met
    // PKCE staat er ?code=… in de zoekreeks en blijft de hash van ons.
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
})

/** Inloggen als facilitator. Terugkomen doen we op precies deze pagina. */
export async function inloggen() {
  const terug = window.location.origin + window.location.pathname
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: terug },
  })
  if (error) throw new Error(error.message)
}

export async function uitloggen() {
  await supabase.auth.signOut()
  window.location.hash = '/'
}

/** Roept een Postgres-functie aan en gooit een leesbare fout bij falen. */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!isConfigured) {
    throw new Error(
      'Supabase is niet geconfigureerd. Zet VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY in .env.local.',
    )
  }
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(translate(error.message))
  return data as T
}

const messages: Record<string, string> = {
  invalid_token: 'Deze link is niet (meer) geldig. Vraag de facilitator om een nieuwe link.',
  not_signed_in: 'Je bent uitgelogd. Log opnieuw in om verder te gaan.',
  no_access: 'Deze sessie is niet van jou.',
  name_required: 'Vul een naam in.',
  at_least_one_skill: 'Er moet minstens één skill overblijven.',
  label_required: 'Elke skill heeft een naam nodig.',
  unknown_skill: 'Deze skill bestaat niet meer — herlaad de pagina.',
}

function translate(raw: string): string {
  for (const [code, text] of Object.entries(messages)) {
    if (raw.includes(code)) return text
  }
  return raw
}
