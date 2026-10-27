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

/** Prepare DB rows for matching: compile regexes once, order exact -> contains -> regex. */
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
    .sort((a, b) => order[a.match_type] - order[b.match_type]);
}

/**
 * First rule that matches `text`.
 *  exact    -> the whole trimmed message equals the keyword (case-insensitive)
 *  contains -> the message includes the keyword (case-insensitive)
 *  regex    -> the pattern matches (case-insensitive, first 500 chars only)
 */
export function matchAutoreply(rules, text) {
  const t = String(text ?? "").trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  for (const r of rules) {
    if (r.match_type === "exact" && lower === r.keyword) return r;
    if (r.match_type === "contains" && lower.includes(r.keyword)) return r;
    if (r.match_type === "regex" && r.re.test(t.slice(0, 500))) return r;
  }
  return null;
}

/** Seconds timestamp before which a person must not trigger the same keyword again. */
export const cooldownCutoff = (nowSec, cooldownMin) => nowSec - Math.max(0, Number(cooldownMin) || 0) * 60;
