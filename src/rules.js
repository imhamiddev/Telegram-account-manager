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

// ---------- schedule ("only run during these hours") ----------
const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isValidHM = (v) => HM.test(String(v));
const toMin = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };

/** Minutes since midnight for `date` in the IANA time zone `tz`. */
export function minutesInZone(date, tz = "Asia/Tehran") {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return get("hour") * 60 + get("minute");
}

/** Is `min` inside [start, end)? Handles windows that wrap past midnight (e.g. 22:00 -> 07:00). start == end means "all day". */
export function inWindow(start, end, min) {
  const s = toMin(start), e = toMin(end);
  if (s === e) return true;
  return s < e ? min >= s && min < e : min >= s || min < e;
}

/**
 * Is `feature` ("close_dm" | "autoreply") allowed to run right now?
 * Without an enabled schedule that applies to the feature, it always runs.
 */
export function scheduleActive(cfg, feature, now = new Date()) {
  if (cfg.sched_enabled !== "1") return true;
  if ((cfg[`sched_${feature}`] ?? "1") !== "1") return true;
  const start = isValidHM(cfg.sched_start) ? cfg.sched_start : "00:00";
  const end = isValidHM(cfg.sched_end) ? cfg.sched_end : "00:00";
  return inWindow(start, end, minutesInZone(now, cfg.tz || "Asia/Tehran"));
}
