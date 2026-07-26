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

// ---- HTML template ---------------------------------------------------------
// Email HTML is its own universe: everything inline, table shell, system
// fonts, and a plain-text part always sent alongside. The design mirrors the
// site's dark hero — same colors, same voice.
const F = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const M = "ui-monospace,'SF Mono',Menlo,monospace";

export function shell(inner, preheader) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#eef0f2;">
<div style="display:none;max-height:0;overflow:hidden;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f2;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#0a0c0f;border-radius:18px;border:1px solid #1d2128;">
<tr><td style="padding:26px 32px 0;">
  <img src="${SITE}/icons/icon-192.png" width="34" height="34" alt="" style="vertical-align:middle;border-radius:8px;">
  <span style="font-family:${F};font-size:19px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;padding-left:10px;vertical-align:middle;">Scan<span style="color:#8b949e;font-weight:500;">Records</span></span>
</td></tr>
<tr><td style="padding:18px 32px 28px;">${inner}</td></tr>
<tr><td style="padding:0 32px 26px;">
  <div style="border-top:1px solid #1d2128;padding-top:16px;font-family:${F};font-size:12px;line-height:1.7;color:#8b949e;">
    ScanRecords — the Chat Control policy archive, recorded daily at
    <a href="${SITE}" style="color:#8b949e;">scanrecords.org</a>. No cookies, no tracking, nothing sold.
  </div>
</td></tr>
</table></td></tr></table></body></html>`;
}

export function digestHtml(events, today, unsubUrl) {
  const rows = events
    .map(
      (e) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;"><tr>
  <td style="border:1px solid #1d2128;border-radius:12px;padding:14px 16px;">
    <div style="font-family:${F};font-size:15px;font-weight:600;color:#ffffff;">${esc(e.company)}
      <span style="color:#a6adb5;font-weight:400;">— ${esc(e.docTitle)}</span></div>
    <div style="font-family:${M};font-size:13px;padding:6px 0 10px;">
      <span style="color:#57c46f;">+${e.added}</span>&nbsp;<span style="color:#ef7078;">−${e.removed}</span>
      <span style="font-family:${F};color:#8b949e;">&nbsp;lines</span></div>
    <a href="${SITE}/change/${e.id}/" style="font-family:${F};font-size:13px;color:#d7dce1;text-decoration:none;border:1px solid #2a2f36;border-radius:8px;padding:7px 13px;display:inline-block;">See the before / after →</a>
  </td></tr></table>`
    )
    .join("");
  const inner = `
  <div style="font-family:${F};font-size:11px;letter-spacing:2px;color:#8b949e;text-transform:uppercase;padding-bottom:8px;">Recorded ${esc(today)}</div>
  <div style="font-family:${F};font-size:22px;line-height:1.3;font-weight:700;color:#ffffff;">${events.length === 1 ? "A tracked document changed" : `${events.length} tracked documents changed`}</div>
  <div style="font-family:${F};font-size:14px;line-height:1.6;color:#a6adb5;padding:8px 0 4px;">Each link shows the exact difference — what the document said before, and what it says now.</div>
  ${rows}
  <div style="font-family:${F};font-size:13px;padding-top:6px;"><a href="${SITE}/changes/" style="color:#8b949e;">The full record →</a></div>
  <div style="font-family:${F};font-size:12px;line-height:1.7;color:#8b949e;padding-top:18px;">
    You confirmed email alerts on <a href="${SITE}/alerts/" style="color:#8b949e;">scanrecords.org/alerts</a>.
    <a href="${unsubUrl}" style="color:#8b949e;">Unsubscribe in one click</a> — it deletes your address immediately.
  </div>`;
  return shell(inner, events.map((e) => `${e.company} — ${e.docTitle}`).join(" · "));
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

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
  const messages = subs.map((s) => {
    const unsubUrl = `${SITE}/api/unsubscribe-email?t=${s.token}`;
    return {
      from: "ScanRecords <alerts@scanrecords.org>",
      to: [s.email],
      subject,
      text:
        `Recorded ${today} by ScanRecords — each link shows the exact before and after:\n\n` +
        `${lines}\n\n` +
        `The full record: ${SITE}/changes/\n\n—\n` +
        `You get this because you confirmed email alerts on ${SITE}/alerts/.\n` +
        `One-click unsubscribe (deletes your address immediately):\n` +
        `${unsubUrl}\n`,
      html: digestHtml(events, today, unsubUrl),
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    };
  });

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
