#!/usr/bin/env node
/**
 * ScanRecords Wayback tool.
 *
 * When today's snapshot changed a document, ask the Internet Archive to
 * capture the SOURCE page too (web.archive.org/save/<url>). Result: every
 * recorded change has an independent, third-party timestamp of the same
 * page on the same day — "two archives agree" instead of "trust us".
 *
 * Runs after history.mjs and before the commit; derives the changed set
 * from git status, same as history.mjs. Never fails the workflow: a missed
 * capture is a smaller loss than a missed snapshot.
 *
 * Zero dependencies. Node >= 20.
 */

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "ScanRecordsBot/0.1 (+https://scanrecords.org; public policy archive)";
const MAX_SAVES = 8; // Save Page Now rate-limits unauthenticated callers

const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" });

async function save(url) {
  try {
    const res = await fetch("https://web.archive.org/save/" + url, {
      redirect: "follow",
      signal: AbortSignal.timeout(60_000),
      headers: { "user-agent": UA },
    });
    console.log(`wayback ${res.status}  ${url}`);
  } catch (e) {
    console.log(`wayback FAIL (${e.name})  ${url}`);
  }
}

async function main() {
  const urls = new Set();
  for (const row of git("status", "--porcelain", "--", "archive").split("\n")) {
    if (!row.trim()) continue;
    const modified = row[0] === "M" || row[1] === "M";
    if (!modified) continue;
    const path = row.slice(3).trim();
    const m = path.match(/^archive\/([^/]+)\/(.+?)\.(txt|json)$/);
    if (!m || m[2].endsWith(".meta")) continue;
    const metaPath = join(
      ROOT, "archive", m[1],
      (m[2] === "appstore-label" ? "appstore-label" : m[2]) + ".meta.json"
    );
    if (!existsSync(metaPath)) continue;
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    const url = meta.finalUrl ?? meta.url;
    if (url) urls.add(url);
  }

  if (urls.size === 0) {
    console.log("wayback: no changes today, nothing to capture");
    return;
  }
  const list = [...urls].slice(0, MAX_SAVES);
  if (urls.size > list.length)
    console.log(`wayback: capped at ${MAX_SAVES} of ${urls.size} URLs`);
  for (const u of list) await save(u);
  await save("https://scanrecords.org/"); // capture our own record of the day too
}

main();
