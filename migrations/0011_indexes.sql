-- Indexes for lookups that were full scans. Every statement is idempotent.
-- deleteChat() filters these tables by chat_id, which is not the leftmost column of their primary keys.
CREATE INDEX IF NOT EXISTS idx_topics_chat ON topics(chat_id);
CREATE INDEX IF NOT EXISTS idx_autoreply_hits_chat ON autoreply_hits(chat_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_chat ON daily_stats(chat_id);
-- Housekeeping deletes by age.
CREATE INDEX IF NOT EXISTS idx_autoreply_hits_last ON autoreply_hits(last_at);
CREATE INDEX IF NOT EXISTS idx_flood_window ON flood(window_start);
