#!/usr/bin/env node
/**
 * ScanRecords push sender.
 *
 * After history.mjs records today's events, notify every subscribed device
 * about real changes — the moment a tracked company's documents move is the
 * entire reason someone subscribed. Baselines and recaptures never notify.
 *
 * Runs in the daily workflow. Requires:
 *   DATABASE_URL       — Neon Postgres holding push_subs (same DB the
 *                        /api/subscribe endpoint writes to)
 *   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY — Web Push signing keys
 * plus the `web-push` and `@neondatabase/serverless` packages, installed
 * transiently by the workflow. Missing any of that, it skips gracefully.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { newEvents } from "./new-events.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://scanrecords.org";

async function main() {
  const { DATABASE_URL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!DATABASE_URL || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log("push: not configured (missing env) — skipping");
    return;
  }
  let webpush, neon;
  try {
    webpush = (await import("web-push")).default;
    ({ neon } = await import("@neondatabase/serverless"));
  } catch {
    console.log("push: packages not installed — skipping");
    return;
  }

  const history = existsSync(join(ROOT, "history.json"))
    ? JSON.parse(readFileSync(join(ROOT, "history.json"), "utf8"))
    : [];
  const today = new Date().toISOString().slice(0, 10);
  // Only what this run recorded: no changes, no notification, ever.
  const events = newEvents(history);
  if (events.length === 0) {
    console.log("push: no changes today, nothing to send");
    return;
  }

  const payload =
    events.length === 1
      ? {
          title: `${events[0].company} changed its ${events[0].docTitle}`,
          body: `+${events[0].added} −${events[0].removed} lines recorded ${today}. Tap for the before and after.`,
          url: `${SITE}/change/${events[0].id}/`,
          tag: `sr-${today}`,
        }
      : {
          title: `${events.length} tracked documents changed`,
          body: events.map((e) => `${e.company} — ${e.docTitle}`).slice(0, 4).join(" · ") + (events.length > 4 ? " …" : ""),
          url: `${SITE}/`,
          tag: `sr-${today}`,
        };

  webpush.setVapidDetails("https://scanrecords.org/legal", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const sql = neon(DATABASE_URL);
  const subs = await sql`SELECT endpoint, p256dh, auth FROM push_subs`;
  console.log(`push: ${events.length} event(s) → ${subs.length} device(s)`);

  let sent = 0, gone = 0, failed = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 86400 }
      );
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await sql`DELETE FROM push_subs WHERE endpoint = ${s.endpoint}`;
        gone++;
      } else failed++;
    }
  }
  console.log(`push: sent ${sent}, pruned ${gone} dead endpoints, ${failed} failures`);
}

main();
