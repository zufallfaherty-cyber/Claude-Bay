// ── localStorage → Supabase data migration ──
// Called once after first login. Non-destructive (localStorage data preserved).
import { insertMessages, insertFile } from './supabase'

export async function migrateLocalToSupabase(supabase) {
  if (!supabase) return { migrated: false, reason: 'no supabase client' }

  // Check if already migrated
  try {
    const { data: existing } = await supabase.from('chat_sessions').select('id').limit(1)
    if (existing?.length > 0) return { migrated: false, reason: 'already has data' }
  } catch { /* continue */ }

  let count = { sessions: 0, messages: 0, files: 0, settings: false }

  try {
    // 1. Sessions + Messages
    const sessions = JSON.parse(localStorage.getItem('bunny_sessions') || '[]')
    for (const s of sessions) {
      const { error } = await supabase.from('chat_sessions').upsert({
        id: s.id,
        name: s.name || '新对话',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      if (!error) count.sessions++

      const msgs = JSON.parse(localStorage.getItem('bunny_msgs_' + s.id) || '[]')
      if (msgs.length > 0) {
        const rows = msgs.map(m => ({
          id: m.id,
          session_id: s.id,
          role: m.role,
          content: m.content || '',
          attachments: m.attachments || [],
          created_at: m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString(),
        }))
        for (let i = 0; i < rows.length; i += 50) {
          await supabase.from('chat_messages').upsert(rows.slice(i, i + 50), { onConflict: 'id' })
        }
        count.messages += rows.length
      }
    }

    // 2. Files
    const files = JSON.parse(localStorage.getItem('bunny_files') || '[]')
    for (const f of files) {
      const { error } = await supabase.from('user_files').upsert({
        id: f.id,
        name: f.name,
        type: f.type || 'txt',
        content: f.content || '',
        created_at: f.createdAt || new Date().toISOString(),
      }, { onConflict: 'id' })
      if (!error) count.files++
    }

    // 3. Settings
    await supabase.from('user_settings').upsert({
      system_prompt: localStorage.getItem('system_prompt') || '',
      temperature: parseFloat(localStorage.getItem('temperature') || '0.8'),
      max_context_rounds: parseInt(localStorage.getItem('max_context_rounds') || '20'),
      api_base: localStorage.getItem('api_base') || '',
      api_key: localStorage.getItem('api_key') || '',
      api_model: localStorage.getItem('api_model') || '',
      avatar_bay_url: localStorage.getItem('avatar_bay') || '',
      avatar_claude_url: localStorage.getItem('avatar_claude') || '',
      together_since: localStorage.getItem('together_since') || '',
    }, { onConflict: 'user_id' })
    count.settings = true

    // 4. Mood entries
    const moods = JSON.parse(localStorage.getItem('bunny_moods') || '[]')
    for (const m of moods) {
      await supabase.from('mood_entries').upsert({
        entry_date: m.date || m.entry_date,
        bay_mood: m.bay?.mood || m.bay_mood,
        bay_note: m.bay?.note || m.bay_note,
        claude_mood: m.claude?.mood || m.claude_mood,
        claude_note: m.claude?.note || m.claude_note,
      }, { onConflict: 'user_id,entry_date' })
    }
  } catch (err) {
    console.error('Migration error:', err)
    return { migrated: false, reason: err.message, ...count }
  }

  return { migrated: true, ...count }
}
