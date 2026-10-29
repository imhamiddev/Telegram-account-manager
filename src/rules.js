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

// ---------- auto-reply matching ----------
const MATCH_TYPES = ["exact", "contains", "regex"];
export const isMatchType = (v) => MATCH_TYPES.includes(v);

/**
 * Reject regexes that are likely to backtrack catastrophically (ReDoS) or are just too big.
 * Conservative on purpose: a nested quantifier like (a+)+ is refused.
 */
export function isSafeRegex(pattern) {
  const p = String(pattern ?? "");
  if (!p || p.length > 100) return false;
  if (/\([^)]*[+*}][^)]*\)\s*[+*{]/.test(p)) return false; // nested quantifiers
  if (/\\[1-9]/.test(p)) return false;                      // back-references
  try { new RegExp(p, "iu"); return true; } catch { return false; }
}

/** A rule may be limited to one chat and/or to an active time window (HH:MM, may wrap past midnight). */
export function ruleApplies(rule, chatId, now = new Date(), tz = "Asia/Tehran") {
  if (rule.chat_id != null && (chatId == null || Number(rule.chat_id) !== Number(chatId))) return false;
  if (isValidHM(rule.hours_start) && isValidHM(rule.hours_end)) return inWindow(rule.hours_start, rule.hours_end, minutesInZone(now, tz));
  return true;
}

/** Prepare DB rows for matching: compile regexes once; rules for one chat win over global ones, then exact -> contains -> regex. */
export function buildRules(rows) {
  const order = { exact: 0, contains: 1, regex: 2 };
  return rows
    .map((r) => {
      const type = isMatchType(r.match_type) ? r.match_type : "exact";
      let re = null;
      if (type === "regex") {
        if (!isSafeRegex(r.keyword)) return null; // ignore unsafe/broken rules instead of crashing
        re = new RegExp(r.keyword, "iu");
      }
      return { ...r, match_type: type, re };
    })
    .filter(Boolean)
    .sort((a, b) => ((a.chat_id == null) - (b.chat_id == null)) || (order[a.match_type] - order[b.match_type]));
}

/**
 * First rule that matches `text`.
 *  exact    -> the whole trimmed message equals the keyword (case-insensitive)
 *  contains -> the message includes the keyword (case-insensitive)
 *  regex    -> the pattern matches (case-insensitive, first 500 chars only)
 */
export function matchAutoreply(rules, text, { chatId = null, now = new Date(), tz } = {}) {
  const t = String(text ?? "").trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  for (const r of rules) {
    if (!ruleApplies(r, chatId, now, tz)) continue;
    if (r.match_type === "exact" && lower === r.keyword) return r;
    if (r.match_type === "contains" && lower.includes(r.keyword)) return r;
    if (r.match_type === "regex" && r.re.test(t.slice(0, 500))) return r;
  }
  return null;
}

/** Seconds timestamp before which a person must not trigger the same keyword again. */
export const cooldownCutoff = (nowSec, cooldownMin) => nowSec - Math.max(0, Number(cooldownMin) || 0) * 60;

// ---------- stats helpers ----------
/** YYYY-MM-DD for `date` in time zone `tz`. */
export function dayKey(date, tz = "Asia/Tehran") {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** The last `n` day keys ending today (oldest first, no duplicates even across DST changes). */
export function lastDays(n, tz = "Asia/Tehran", now = new Date()) {
  const out = [];
  for (let i = n + 1; i >= 0 && out.length < n + 2; i--) {
    const k = dayKey(new Date(now.getTime() - i * 86400000), tz);
    if (!out.includes(k)) out.push(k);
  }
  return out.slice(-n);
}

// ---------- spam filter ----------
/** "word1, word2\nword3" -> ["word1","word2","word3"] (lowercased, unique, capped). */
export function parseWordList(raw) {
  const seen = new Set();
  for (const part of String(raw ?? "").split(/[\n,،;]+/)) {
    const w = part.trim().toLowerCase();
    if (w && w.length <= 50) seen.add(w);
    if (seen.size >= 200) break;
  }
  return [...seen];
}

/** First banned word contained in `text` (case-insensitive), or null. */
export function findBannedWord(words, text) {
  const t = String(text ?? "").toLowerCase();
  if (!t) return null;
  return words.find((w) => t.includes(w)) ?? null;
}

/** The flood guard trips when a chat sends more than `max` messages inside one window. */
export const floodExceeded = (count, max) => count > max;

/** Trusted ("never delete") chats are exempt from spam deletion and flood muting. */
export const isTrusted = (chat) => chat?.dm_rule === "keep";

// ---------- console PIN lock ----------
export const isValidPin = (pin) => /^\d{4,8}$/.test(String(pin ?? ""));

export const PIN_MAX_FAILS = 5;
export const PIN_LOCKOUT_SEC = 300;

/** Remaining lockout in seconds (0 when not locked out). */
export const lockoutRemaining = (lockUntil, now) => Math.max(0, (Number(lockUntil) || 0) - now);

/** State after a wrong PIN: after PIN_MAX_FAILS misses the console locks out for PIN_LOCKOUT_SEC and the counter resets. */
export function registerPinFailure(fails, now) {
  const n = (Number(fails) || 0) + 1;
  return n >= PIN_MAX_FAILS ? { fails: 0, lockUntil: now + PIN_LOCKOUT_SEC } : { fails: n, lockUntil: 0 };
}
