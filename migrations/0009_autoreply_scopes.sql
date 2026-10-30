-- Auto-replies get an id (so the same keyword can have different replies) plus optional scopes:
-- one chat only, an active time window, and a follow-up message. Existing rules are copied over unchanged.
CREATE TABLE autoreplies_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  reply TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'exact',
  cooldown_min INTEGER NOT NULL DEFAULT 0,
  media_type TEXT,
  media_url TEXT,
  chat_id INTEGER,
  hours_start TEXT,
  hours_end TEXT,
  followup_min INTEGER NOT NULL DEFAULT 0,
  followup_text TEXT
);
INSERT INTO autoreplies_v2(keyword, reply, match_type, cooldown_min, media_type, media_url)
  SELECT keyword, reply, match_type, cooldown_min, media_type, media_url FROM autoreplies;
DROP TABLE autoreplies;
ALTER TABLE autoreplies_v2 RENAME TO autoreplies;
