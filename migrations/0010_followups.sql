-- One pending follow-up message per chat; cancelled when the owner replies, sent by the cron when it falls due.
CREATE TABLE IF NOT EXISTS followups (
  chat_id INTEGER PRIMARY KEY,
  connection_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  due_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_followups_due ON followups(due_at);
