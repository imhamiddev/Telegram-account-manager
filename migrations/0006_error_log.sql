-- Recent problems shown in the console's health card. Holds error descriptions only, never message content.
CREATE TABLE IF NOT EXISTS error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  scope TEXT NOT NULL,       -- backup | auto-reply | close-dm | spam | stats | webhook | api
  message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_error_log_at ON error_log(at);
