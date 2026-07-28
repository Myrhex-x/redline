#!/usr/bin/env node
/**
 * Wait until today's change pages are actually being served.
 *
 * The notifiers run after the commit, but pushing is not publishing: Vercel
 * still has to build the site and propagate it to the edge. Sending a "see
 * the before/after" link into that window is how a subscriber clicks through
 * to a 404 — which reads as a broken archive at the exact moment someone is
 * paying attention.
 *
 * So: poll the first recorded change URL until it answers 200, then let the
 * notifiers go. If it never comes up we send anyway and say so — a missed
 * notification loses the change entirely, while a link that starts working a
 * minute later is merely late. The record itself is already safe in git.
 *
 * Reads the same NEW_EVENTS_FILE the notifiers use. No events, no wait.
 */

import { readFileSync, existsSync } from "node:fs";

const SITE = process.env.SITE_URL ?? "https://scanrecords.org";
const TIMEOUT_MS = Number(process.env.DEPLOY_TIMEOUT_MS ?? 360_000); // 6 min
const INTERVAL_MS = 10_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const file = process.env.NEW_EVENTS_FILE;
if (!file || !existsSync(file)) {
  console.log("await-deploy: no event file — nothing to wait for");
  process.exit(0);
}
const events = JSON.parse(readFileSync(file, "utf8"));
if (events.length === 0) {
  console.log("await-deploy: no changes this run — nothing to wait for");
  process.exit(0);
}

const url = `${SITE}/change/${events[0].id}/`;
const started = Date.now();
let attempt = 0;

while (Date.now() - started < TIMEOUT_MS) {
  attempt++;
  let status = 0;
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
    status = res.status;
  } catch (e) {
    status = 0;
  }
  const secs = Math.round((Date.now() - started) / 1000);
  if (status === 200) {
    console.log(`await-deploy: ${url} is live after ${secs}s (${attempt} check${attempt === 1 ? "" : "s"})`);
    process.exit(0);
  }
  console.log(`await-deploy: ${url} → ${status || "no response"} (${secs}s elapsed), waiting…`);
  await sleep(INTERVAL_MS);
}

// Deliberately not a failure: the alert is worth more than the wait.
console.log(
  `await-deploy: ⚠ ${url} still not serving after ${Math.round(TIMEOUT_MS / 1000)}s — ` +
  `sending anyway; the link should resolve once the build lands`
);
