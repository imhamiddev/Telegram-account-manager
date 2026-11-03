import { nowSec } from "./lib.js";
import { lastDays, HITS_RETENTION_SEC, FLOOD_RETENTION_SEC, STATS_RETENTION_DAYS } from "./rules.js";

// Daily housekeeping (cron 03:00 UTC). Keeps the small bookkeeping tables from growing forever.
export async function runMaintenance(env, tz = "Asia/Tehran") {
  const now = nowSec();
  const statsFrom = lastDays(STATS_RETENTION_DAYS, tz)[0];
  const [hits, flood, stats] = await env.DB.batch([
    env.DB.prepare("DELETE FROM autoreply_hits WHERE last_at < ?").bind(now - HITS_RETENTION_SEC),
    env.DB.prepare("DELETE FROM flood WHERE window_start < ?").bind(now - FLOOD_RETENTION_SEC),
    env.DB.prepare("DELETE FROM daily_stats WHERE day < ?").bind(statsFrom),
  ]);
  return { hits: hits.meta?.changes ?? 0, flood: flood.meta?.changes ?? 0, stats: stats.meta?.changes ?? 0 };
}
