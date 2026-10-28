-- Advanced auto-replies: match type, per-person cooldown, optional media.
ALTER TABLE autoreplies ADD COLUMN match_type TEXT NOT NULL DEFAULT 'exact';   -- exact | contains | regex
ALTER TABLE autoreplies ADD COLUMN cooldown_min INTEGER NOT NULL DEFAULT 0;    -- 0 = no cooldown
ALTER TABLE autoreplies ADD COLUMN media_type TEXT;                            -- photo | document | video | NULL
ALTER TABLE autoreplies ADD COLUMN media_url TEXT;                             -- https URL Telegram fetches

-- When each person last triggered each keyword (used for cooldowns). Holds ids and timestamps only.
CREATE TABLE IF NOT EXISTS autoreply_hits (
  keyword TEXT NOT NULL,
  chat_id INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  PRIMARY KEY (keyword, chat_id)
);
