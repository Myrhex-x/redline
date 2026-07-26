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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const RELEVANT =
  /\b(scan(?:s|ned|ning)?|detect(?:s|ed|ion|ing)?|CSAM|child sexual|hash[- ]?match|PhotoDNA|CSAI|end[- ]?to[- ]?end|E2EE|encrypt(?:ed|ion)?|law enforcement|government request|derogation|2021\/1232|monitor(?:s|ed|ing)?)\b/i;

function main() {
  const history = existsSync(join(ROOT, "history.json"))
    ? JSON.parse(readFileSync(join(ROOT, "history.json"), "utf8"))
    : [];
  const today = new Date().toISOString().slice(0, 10);
  const todays = history.filter((e) => e.date === today && e.kind !== "baseline");
  if (todays.length === 0) {
    console.log("triage: no changes today");
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
