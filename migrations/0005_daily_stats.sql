-- Activity counters only. No message content, text or media is ever stored here.
CREATE TABLE IF NOT EXISTS daily_stats (
  day TEXT NOT NULL,                       -- YYYY-MM-DD in the configured time zone
  chat_id INTEGER NOT NULL,
  msgs INTEGER NOT NULL DEFAULT 0,         -- incoming messages
  replies INTEGER NOT NULL DEFAULT 0,      -- auto-replies sent
  deleted INTEGER NOT NULL DEFAULT 0,      -- messages removed by Close DM
  PRIMARY KEY (day, chat_id)
);
CREATE INDEX IF NOT EXISTS idx_daily_stats_day ON daily_stats(day);
