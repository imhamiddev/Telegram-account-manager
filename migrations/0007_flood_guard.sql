-- Sliding counter per chat for the flood guard: how many messages arrived in the current window.
CREATE TABLE IF NOT EXISTS flood (
  chat_id INTEGER PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
