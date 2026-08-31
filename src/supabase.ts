import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)

export const supabase = createClient(url ?? 'https://placeholder.supabase.co', key ?? 'placeholder')

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
  invalid_credentials: 'Sessiecode of adminsleutel klopt niet.',
  name_required: 'Vul een naam in.',
  admin_key_too_short: 'De adminsleutel moet minstens 8 tekens zijn.',
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
