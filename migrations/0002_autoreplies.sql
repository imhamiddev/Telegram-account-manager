-- Auto-reply: exact-match keyword (trimmed, case-insensitive) -> reply text.
CREATE TABLE IF NOT EXISTS autoreplies (
  keyword TEXT PRIMARY KEY,
  reply TEXT NOT NULL
);
