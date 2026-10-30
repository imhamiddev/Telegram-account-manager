-- Chat organisation: last activity (sorting + auto cleanup), pinning, a short label and a private note per chat.
ALTER TABLE chats ADD COLUMN last_at INTEGER;
ALTER TABLE chats ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chats ADD COLUMN label TEXT;
ALTER TABLE chats ADD COLUMN note TEXT;
UPDATE chats SET last_at = added WHERE last_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chats_sort ON chats(pinned, last_at);
