export type State = 'current' | 'future'

export interface Skill {
  id: string
  label: string
  description: string
  /** Waar je op deze as instapt. */
  anchor: string
  /** Waar deze as heen groeit — per as iets anders. */
  anchor_senior: string
  sort_order: number
}

export interface ScaleLevel {
  level: number
  label: string
  description: string
}

export interface Rating {
  skill_id: string
  state: State
  value: number
}

export interface AdminRating extends Rating {
  participant_id: string
}

export interface Participant {
  id: string
  name: string
  role: string
  token: string
  submitted_at: string | null
  created_at: string
}

export interface SessionInfo {
  id?: string
  code: string
  name: string
  scale: ScaleLevel[]
}

export interface ParticipantPayload {
  session: { name: string; code: string; scale: ScaleLevel[] }
  participant: { id: string; name: string; role: string; submitted_at: string | null }
  skills: Skill[]
  ratings: Rating[]
}

export interface AdminPayload {
  session: SessionInfo
  skills: Skill[]
  participants: Participant[]
  ratings: AdminRating[]
}
