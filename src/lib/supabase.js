import { createClient } from '@supabase/supabase-js'

let client = null

export function getSupabase() {
  if (client) return client

  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || !key) {
    console.warn('Supabase not configured — using local storage')
    return null
  }

  client = createClient(url, key)
  return client
}

// ── Session helpers ──

export async function fetchSessions() {
  const sb = getSupabase()
  if (!sb) return []

  const { data } = await sb
    .from('sessions')
    .select('*')
    .order('updated_at', { ascending: false })

  return data || []
}

export async function createSession(id, name) {
  const sb = getSupabase()
  if (!sb) return null

  const { data } = await sb
    .from('sessions')
    .insert({ id, name })
    .select()
    .single()

  return data
}

export async function updateSessionName(id, name) {
  const sb = getSupabase()
  if (!sb) return null

  await sb
    .from('sessions')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id)
}

// ── Message helpers ──

export async function fetchMessages(sessionId) {
  const sb = getSupabase()
  if (!sb) return []

  const { data } = await sb
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  return data || []
}

export async function insertMessage(sessionId, { id, role, content }) {
  const sb = getSupabase()
  if (!sb) return null

  const { data } = await sb
    .from('messages')
    .insert({ id, session_id: sessionId, role, content })
    .select()
    .single()

  return data
}

// ── Mood helpers ──

export async function fetchMoods() {
  const sb = getSupabase()
  if (!sb) return []

  const { data } = await sb
    .from('moods')
    .select('*')
    .order('created_at', { ascending: false })

  return data || []
}

export async function insertMood({ mood, note }) {
  const sb = getSupabase()
  if (!sb) return null

  const { data } = await sb
    .from('moods')
    .insert({ id: crypto.randomUUID(), mood, note })
    .select()
    .single()

  return data
}
