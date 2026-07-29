#!/usr/bin/env node
/**
 * ScanRecords triage tool.
 *
 * After a snapshot run records changes, scan today's diffs for language
 * relevant to Chat Control — scanning, detection, CSAM, encryption,
 * law-enforcement access — and open a GitHub issue asking a human to
 * review whether any status needs re-assessment.
 *
 * Deliberately deterministic: a keyword pass over the recorded hunks.
 * It drafts nothing and publishes nothing — statuses only change by a
 * reviewed commit. (If diff volume ever makes this noisy, an LLM could
 * summarize the flagged hunks here — as a drafting aid for the same
 * human review, never as the record.)
 *
 * Runs in the workflow after history.mjs. Requires GITHUB_TOKEN and
 * GITHUB_REPOSITORY to file the issue; otherwise prints to stdout.
 *
 * Zero dependencies. Node >= 20.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pendingEvents } from "./new-events.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// One vocabulary, shared with the notification gate, so the thing that opens
// a review issue and the thing that sends the mail cannot drift apart.
import { RELEVANT } from "./significance.mjs";

function main() {
  const history = existsSync(join(ROOT, "history.json"))
    ? JSON.parse(readFileSync(join(ROOT, "history.json"), "utf8"))
    : [];
  const today = new Date().toISOString().slice(0, 10);
  // What THIS run recorded, not what carries today's date. Filtering by date
  // meant a second run on the same day re-flagged the morning's changes and
  // filed a second, identical issue — which is exactly what happened on
  // 26 July 2026. It also skips withdrawn records: asking a human to
  // re-assess a status over a change we have established did not happen is
  // the same false alarm as mailing it out.
  const todays = pendingEvents(history);
  if (todays.length === 0) {
    console.log("triage: no new changes this run");
    return;
  }

  const flagged = [];
  for (const e of todays) {
    const p = join(ROOT, "changes", `${e.id}.json`);
    if (!existsSync(p)) continue;
    const { hunks } = JSON.parse(readFileSync(p, "utf8"));
    const hits = [];
    for (const h of hunks)
      for (const l of h.lines)
        if (l.t !== " " && RELEVANT.test(l.s))
          hits.push(`${l.t === "+" ? "ADDED" : "REMOVED"}: ${l.s.slice(0, 220)}`);
    if (hits.length) flagged.push({ e, hits: hits.slice(0, 12) });
  }

  if (flagged.length === 0) {
    console.log(`triage: ${todays.length} change(s) today, none touch scanning language`);
    return;
  }

  const body = [
    `The daily snapshot recorded change(s) whose diff touches scanning/encryption language. ` +
      `Review whether any Chat Control status needs re-assessment — statuses only change by a reviewed commit.`,
    ``,
    ...flagged.flatMap(({ e, hits }) => [
      `### ${e.company} — ${e.docTitle} (${e.date})`,
      `https://scanrecords.org/change/${e.id}/`,
      ``,
      ...hits.map((h) => `- \`${h.replace(/`/g, "'")}\``),
      ``,
    ]),
  ].join("\n");

  const title = `Review: ${flagged.length} change(s) touch scanning language (${today})`;
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) {
    console.log("triage: (no GITHUB_TOKEN — printing instead)\n\n" + title + "\n\n" + body);
    return;
  }
  fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ title, body, labels: ["status-review"] }),
  }).then(async (r) => {
    console.log(`triage: issue ${r.ok ? "created" : "FAILED " + r.status}`);
    if (!r.ok) console.log(await r.text());
  });
}

main();
