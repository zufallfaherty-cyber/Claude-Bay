// ── Supabase data access layer ──
// All functions take a supabase client (from useAuth()) as first parameter.
// Tables: chat_sessions, chat_messages, mood_entries, user_files, user_settings

// ── Sessions ──

export async function fetchSessions(supabase) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) { console.error('fetchSessions:', error); return [] }
  return data || []
}

export async function createSession(supabase, { id, name }) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({ id, name })
    .select()
    .single()
  if (error) { console.error('createSession:', error); return null }
  return data
}

export async function updateSession(supabase, id, updates) {
  if (!supabase) return
  const { error } = await supabase
    .from('chat_sessions')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) console.error('updateSession:', error)
}

// ── Messages ──

export async function fetchMessages(supabase, sessionId) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  if (error) { console.error('fetchMessages:', error); return [] }
  return (data || []).map(m => ({
    id: m.id,
    role: m.role,
    content: m.content || '',
    attachments: m.attachments || [],
    timestamp: new Date(m.created_at).getTime(),
  }))
}

export async function insertMessage(supabase, sessionId, msg) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      id: msg.id,
      session_id: sessionId,
      role: msg.role,
      content: msg.content || '',
      attachments: msg.attachments || [],
      created_at: msg.timestamp ? new Date(msg.timestamp).toISOString() : new Date().toISOString(),
    })
    .select()
    .single()
  if (error) { console.error('insertMessage:', error); return null }
  return data
}

export async function insertMessages(supabase, sessionId, msgs, userId) {
  if (!supabase || msgs.length === 0) return
  const rows = msgs.map(m => ({
    id: m.id,
    session_id: sessionId,
    user_id: userId,
    role: m.role,
    content: m.content || '',
    attachments: m.attachments || [],
    created_at: m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString(),
  }))
  // Batch insert in chunks of 50
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50)
    const { error } = await supabase.from('chat_messages').upsert(chunk, { onConflict: 'id' })
    if (error) console.error('insertMessages batch:', error)
  }
}

// ── Settings ──

export async function fetchSettings(supabase) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .single()
  if (error) { /* no row yet */ return null }
  return data
}

export async function upsertSettings(supabase, settings) {
  if (!supabase) return
  const { error } = await supabase
    .from('user_settings')
    .upsert({
      ...settings,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  if (error) console.error('upsertSettings:', error)
}

// ── Moods ──

export async function fetchMoods(supabase) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('mood_entries')
    .select('*')
    .order('entry_date', { ascending: false })
  if (error) { console.error('fetchMoods:', error); return [] }
  return data || []
}

export async function upsertMood(supabase, date, bay, claude) {
  if (!supabase) return
  const entry = { entry_date: date }
  if (bay) { entry.bay_mood = bay.mood; entry.bay_note = bay.note }
  if (claude) { entry.claude_mood = claude.mood; entry.claude_note = claude.note }
  const { error } = await supabase
    .from('mood_entries')
    .upsert(entry, { onConflict: 'user_id,entry_date' })
  if (error) console.error('upsertMood:', error)
}

// ── Files ──

export async function fetchFiles(supabase) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('user_files')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) { console.error('fetchFiles:', error); return [] }
  return data || []
}

export async function insertFile(supabase, file) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('user_files')
    .insert({
      id: file.id,
      name: file.name,
      type: file.type || 'txt',
      content: file.content || '',
    })
    .select()
    .single()
  if (error) { console.error('insertFile:', error); return null }
  return data
}

export async function deleteFile(supabase, fileId) {
  if (!supabase) return
  const { error } = await supabase.from('user_files').delete().eq('id', fileId)
  if (error) console.error('deleteFile:', error)
}

// ── Profile ──

export async function fetchTogetherSince(supabase) {
  if (!supabase) return null
  const { data } = await supabase
    .from('user_settings')
    .select('together_since')
    .single()
  return data?.together_since || null
}
