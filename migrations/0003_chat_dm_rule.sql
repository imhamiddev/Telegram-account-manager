-- Per-chat rule for "Close DM":
--   default = follow the global mode, keep = never delete (whitelist), close = always delete
ALTER TABLE chats ADD COLUMN dm_rule TEXT NOT NULL DEFAULT 'default';
