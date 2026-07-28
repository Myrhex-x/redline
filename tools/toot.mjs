#!/usr/bin/env node
/**
 * ScanRecords Mastodon announcer.
 *
 * After history.mjs records today's events, post each real change to the
 * project's Mastodon account. Baselines and recaptures never post — the
 * account should be silent on quiet days, exactly like the push channel.
 *
 * Requires two secrets (skips gracefully without them):
 *   MASTODON_INSTANCE — e.g. "mastodon.social" (host only, no scheme)
 *   MASTODON_TOKEN    — an access token for the account, scope write:statuses
 *     (Mastodon → Settings → Development → New application)
 *
 * Zero dependencies: the Mastodon status API is one authenticated POST.
 * Caps at 4 individual posts per day, then a single digest — an account
 * that floods is an account that gets muted.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pendingEvents } from "./new-events.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://scanrecords.org";

async function post(instance, token, status) {
  const r = await fetch(`https://${instance}/api/v1/statuses`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ status, visibility: "public", language: "en" }),
  });
  if (!r.ok) throw new Error(`mastodon ${r.status}: ${(await r.text()).slice(0, 120)}`);
  return (await r.json()).url;
}

async function main() {
  const { MASTODON_INSTANCE, MASTODON_TOKEN } = process.env;
  if (!MASTODON_INSTANCE || !MASTODON_TOKEN) {
    console.log("toot: not configured (missing env) — skipping");
    return;
  }
  const history = existsSync(join(ROOT, "history.json"))
    ? JSON.parse(readFileSync(join(ROOT, "history.json"), "utf8"))
    : [];
  const today = new Date().toISOString().slice(0, 10);
  // Only what this run recorded: no changes, no notification, ever.
  const events = pendingEvents(history);
  if (events.length === 0) {
    console.log("toot: no changes today, nothing to post");
    return;
  }

  if (events.length <= 4) {
    for (const e of events) {
      const status =
        `${e.company} changed its ${e.docTitle} (+${e.added} −${e.removed} lines).\n\n` +
        `Full before/after, recorded and independently timestamped:\n${SITE}/change/${e.id}/\n\n` +
        `#ChatControl #privacy`;
      const url = await post(MASTODON_INSTANCE, MASTODON_TOKEN, status);
      console.log(`toot: posted ${e.slug}/${e.doc} → ${url}`);
    }
  } else {
    const list = events.slice(0, 6).map((e) => `· ${e.company} — ${e.docTitle}`).join("\n");
    const status =
      `${events.length} tracked documents changed today:\n\n${list}${events.length > 6 ? "\n· …" : ""}\n\n` +
      `Every change with its full before/after: ${SITE}/changes/\n\n#ChatControl #privacy`;
    const url = await post(MASTODON_INSTANCE, MASTODON_TOKEN, status);
    console.log(`toot: posted digest of ${events.length} → ${url}`);
  }
}

main().catch((e) => {
  // Never fail the record over a social post.
  console.error(`toot: ${e.message}`);
});
