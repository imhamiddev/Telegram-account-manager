-- Auto-reply rules are looked up by keyword (dedupe on save, cleanup of cooldown hits) and by chat (scoped rules).
CREATE INDEX IF NOT EXISTS idx_autoreplies_keyword ON autoreplies(keyword);
CREATE INDEX IF NOT EXISTS idx_autoreplies_chat ON autoreplies(chat_id) WHERE chat_id IS NOT NULL;
-- Label filter on the Chats tab.
CREATE INDEX IF NOT EXISTS idx_chats_label ON chats(label) WHERE label IS NOT NULL;
