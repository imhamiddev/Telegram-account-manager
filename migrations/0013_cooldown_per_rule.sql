-- Cooldowns are tracked per rule (id) instead of per keyword, so two rules with the same keyword
-- (different chat or hours) no longer block each other. Cooldown state is transient, so only live rows are carried over.
CREATE TABLE autoreply_hits_v2 (
  rule_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  PRIMARY KEY (rule_id, chat_id)
);
INSERT OR IGNORE INTO autoreply_hits_v2(rule_id, chat_id, last_at)
  SELECT r.id, h.chat_id, h.last_at FROM autoreply_hits h JOIN autoreplies r ON r.keyword = h.keyword;
DROP TABLE autoreply_hits;
ALTER TABLE autoreply_hits_v2 RENAME TO autoreply_hits;
CREATE INDEX IF NOT EXISTS idx_autoreply_hits_chat ON autoreply_hits(chat_id);
CREATE INDEX IF NOT EXISTS idx_autoreply_hits_last ON autoreply_hits(last_at);
