-- chat_sessions: 聊天会话列表
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT DEFAULT '新对话',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_sessions_user ON chat_sessions(user_id);

-- chat_messages: 聊天消息
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT DEFAULT '',
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_messages_session ON chat_messages(session_id);
CREATE INDEX idx_messages_user ON chat_messages(user_id);

-- mood_entries: 情绪日记
CREATE TABLE mood_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  bay_mood TEXT,
  bay_note TEXT,
  claude_mood TEXT,
  claude_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, entry_date)
);
CREATE INDEX idx_moods_user ON mood_entries(user_id);

-- user_files: 文件库
CREATE TABLE user_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'txt',
  content TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_files_user ON user_files(user_id);

-- user_settings: 用户设置
CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  system_prompt TEXT DEFAULT '你是一个温柔、细腻的AI伙伴。你善于倾听，会记住我说过的话，用温暖的方式回应。你的回复自然、真诚，像一个真正关心我的人。',
  temperature REAL DEFAULT 0.8,
  max_context_rounds INTEGER DEFAULT 20,
  api_base TEXT DEFAULT 'https://api.jiushi.xin/v1',
  api_key TEXT DEFAULT '',
  api_model TEXT DEFAULT '[按量]claude-opus-4-6',
  avatar_bay_url TEXT DEFAULT '',
  avatar_claude_url TEXT DEFAULT '',
  together_since TEXT DEFAULT '',
  push_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_settings_user ON user_settings(user_id);

-- RLS: 每张表只允许用户读写自己的数据
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_isolation" ON chat_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_isolation" ON chat_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE mood_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_isolation" ON mood_entries FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE user_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_isolation" ON user_files FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_isolation" ON user_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Claude's Study (书房) ──

-- claude_diaries: 日记（每天早上6点自动生成）
CREATE TABLE claude_diaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, entry_date)
);
CREATE INDEX idx_diaries_user_date ON claude_diaries(user_id, entry_date DESC);

ALTER TABLE claude_diaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_isolation" ON claude_diaries FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- memo_portrait: 备忘录 — 用户画像
CREATE TABLE memo_portrait (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  content TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_portrait_user ON memo_portrait(user_id);

ALTER TABLE memo_portrait ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_isolation" ON memo_portrait FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- memo_promises: 备忘录 — 承诺/待办
CREATE TABLE memo_promises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  entry_date DATE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_promises_user_status ON memo_promises(user_id, status);

ALTER TABLE memo_promises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_isolation" ON memo_promises FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
