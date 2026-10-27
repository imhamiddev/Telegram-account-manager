-- Initial schema. No message content is ever stored.
-- Only settings, connections, topics and chat names.
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, is_enabled INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS topics (
  group_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  thread_id INTEGER NOT NULL,
  PRIMARY KEY (group_id, chat_id)
);
CREATE TABLE IF NOT EXISTS chats (
  chat_id INTEGER PRIMARY KEY,
  name TEXT,
  username TEXT,
  muted INTEGER DEFAULT 0,
  added INTEGER
);
