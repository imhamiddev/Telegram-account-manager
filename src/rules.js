// Pure decision logic, no Telegram or DB access. Kept separate so it can be unit-tested with `npm test`.

/**
 * Should an incoming message be deleted by "Close DM"?
 *  - close_dm off          -> never
 *  - chat rule "keep"      -> never (whitelist)
 *  - mode "selected"       -> only chats whose rule is "close"
 *  - mode "all" (default)  -> every chat except whitelisted ones
 */
export function shouldCloseDm(cfg, chat) {
  if (cfg.close_dm !== "1") return false;
  const rule = chat?.dm_rule || "default";
  if (rule === "keep") return false;
  if ((cfg.close_dm_mode || "all") === "selected") return rule === "close";
  return true;
}
