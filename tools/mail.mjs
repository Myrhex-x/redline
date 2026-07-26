#!/usr/bin/env node
/**
 * ScanRecords email alert sender.
 *
 * After history.mjs records today's events, send ONE digest email to every
 * confirmed subscriber — real changes only. Baselines and recaptures never
 * mail, and quiet days send nothing: an alert list that emails on schedule
 * instead of on evidence would be just another newsletter.
 *
 * Requires (skips gracefully without them):
 *   DATABASE_URL     — Neon Postgres holding email_subs (written by /api/subscribe-email)
 *   RESEND_API_KEY   — sending key for the verified scanrecords.org domain
 * plus @neondatabase/serverless, installed transiently by the workflow.
 *
 * Every message carries the subscriber's one-click unsubscribe link and
 * RFC 8058 List-Unsubscribe headers; unsubscribing deletes the address.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://scanrecords.org";

async function main() {
  const { DATABASE_URL, RESEND_API_KEY } = process.env;
  if (!DATABASE_URL || !RESEND_API_KEY) {
    console.log("mail: not configured (missing env) — skipping");
    return;
  }
  let neon;
  try {
    ({ neon } = await import("@neondatabase/serverless"));
  } catch {
    console.log("mail: packages not installed — skipping");
    return;
  }

  const history = existsSync(join(ROOT, "history.json"))
    ? JSON.parse(readFileSync(join(ROOT, "history.json"), "utf8"))
    : [];
  const today = new Date().toISOString().slice(0, 10);
  const events = history.filter((e) => e.date === today && e.kind !== "baseline");
  if (events.length === 0) {
    console.log("mail: no changes today, nothing to send");
    return;
  }

  const sql = neon(DATABASE_URL);
  let subs = [];
  try {
    subs = await sql`SELECT email, token FROM email_subs WHERE confirmed = true`;
  } catch (e) {
    if (!/does not exist/.test(e.message)) throw e;
  }
  if (subs.length === 0) {
    console.log("mail: no confirmed subscribers");
    return;
  }

  const subject =
    events.length === 1
      ? `${events[0].company} changed its ${events[0].docTitle}`
      : `${events.length} tracked documents changed today`;
  const lines = events
    .map((e) => `· ${e.company} — ${e.docTitle} (+${e.added} −${e.removed})\n  ${SITE}/change/${e.id}/`)
    .join("\n\n");

  // Personalized batch (unsubscribe link per recipient), 100 per API call.
  const messages = subs.map((s) => ({
    from: "ScanRecords <alerts@scanrecords.org>",
    to: [s.email],
    subject,
    text:
      `Recorded ${today} by ScanRecords — each link shows the exact before and after:\n\n` +
      `${lines}\n\n` +
      `The full record: ${SITE}/changes/\n\n—\n` +
      `You get this because you confirmed email alerts on ${SITE}/alerts/.\n` +
      `One-click unsubscribe (deletes your address immediately):\n` +
      `${SITE}/api/unsubscribe-email?t=${s.token}\n`,
    headers: {
      "List-Unsubscribe": `<${SITE}/api/unsubscribe-email?t=${s.token}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  }));

  let sent = 0, failed = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    const r = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(batch),
    });
    if (r.ok) sent += batch.length;
    else {
      failed += batch.length;
      console.error(`mail: batch failed ${r.status}: ${(await r.text()).slice(0, 160)}`);
    }
  }
  console.log(`mail: ${sent} sent, ${failed} failed, ${events.length} change(s) in digest`);
}

main().catch((e) => {
  // The record never fails over a notification channel.
  console.error(`mail: ${e.message}`);
});
