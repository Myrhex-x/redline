#!/usr/bin/env node
/**
 * Which tracked pages are unstable, before they send a false alarm?
 *
 * Every false alert this archive has sent was discovered the same way: it
 * arrived in someone's inbox. The EU Parliament's procedure file was added on
 * a Monday and announced a fake amendment on the Tuesday. Nothing had ever
 * asked whether a page reads the same twice.
 *
 * This does. For each document it reads the page twice and compares, and it
 * also compares against the stored capture, which is what catches the harder
 * case: a page that is stable within a minute but reorders across days. That
 * is the Parliament's failure mode, and a two-fetch test alone calls it clean.
 *
 * Classifications:
 *   stable      both reads identical, and identical to the archive
 *   drifted     both reads agree with each other but not with the archive
 *               (either a real edit since the last run, or slow-moving churn)
 *   reordering  the difference is only line order — needs canonical:"lines"
 *   unstable    the two reads disagree with each other — needs investigation
 *
 * Run: node tools/stability.mjs              # every document
 *      node tools/stability.mjs --only meta  # one company
 *      node tools/stability.mjs --limit 20   # first N, for a quick pass
 *
 * Honest about cost: two requests per document, spaced. Not part of the daily
 * run; meant for a weekly job and for whenever a document is added.
 */

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractText, filterNoise, clipText, canonicalLines } from "./snapshot.mjs";
import { pdfText } from "./pdf.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BOT_UA = "ScanRecordsBot/0.1 (+https://scanrecords.org; public policy archive)";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const GAP_MS = 6_000;      // between the two reads of one document
const POLITE_MS = 1_200;   // between documents

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");

async function readOnce(company, doc) {
  const ua = company.ua === "browser" ? BROWSER_UA : BOT_UA;
  const { RELAY_URL, RELAY_TOKEN } = process.env;
  if (doc.type === "pdf") {
    const r = await fetch(doc.url, { redirect: "follow", signal: AbortSignal.timeout(30_000), headers: { "user-agent": ua } });
    if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
    return pdfText(Buffer.from(await r.arrayBuffer()));
  }
  let html;
  if (RELAY_URL && RELAY_TOKEN) {
    const r = await fetch(`${RELAY_URL}?url=${encodeURIComponent(doc.url)}`, {
      signal: AbortSignal.timeout(35_000),
      headers: { "x-relay-token": RELAY_TOKEN, "x-relay-ua": ua },
    });
    html = await r.text();
    if (r.status !== 200) throw new Error(`relay ${r.status}`);
  } else {
    const r = await fetch(doc.url, {
      redirect: "follow", signal: AbortSignal.timeout(30_000),
      headers: { "user-agent": ua, accept: "text/html,application/xhtml+xml", "accept-language": "en" },
    });
    if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
    html = await r.text();
  }
  let text = filterNoise(extractText(html), [...(company.ignore ?? []), ...(doc.ignore ?? [])]);
  if (doc.clip) text = clipText(text, doc.clip);
  if (doc.canonical === "lines") text = canonicalLines(text);
  return text;
}

/** Same lines, different order? The cheapest thing the daily run cannot see. */
const sameLineSet = (a, b) => {
  const norm = (s) => s.split("\n").map((l) => l.trim()).filter(Boolean).sort().join("\n");
  return norm(a) === norm(b);
};

const { companies, institutions = [] } = JSON.parse(readFileSync(join(ROOT, "companies.json"), "utf8"));
const targets = [];
for (const c of [...companies, ...institutions]) {
  if (only && c.slug !== only) continue;
  for (const d of c.docs) {
    if (d.render === "headless") continue; // needs the browser lane
    targets.push([c, d]);
  }
}

const rows = [];
for (const [company, doc] of targets.slice(0, limit)) {
  const key = `${company.slug}/${doc.id}`;
  let a, b;
  try {
    a = await readOnce(company, doc);
    await sleep(GAP_MS);
    b = await readOnce(company, doc);
  } catch (e) {
    rows.push({ key, verdict: "error", detail: String(e.message).slice(0, 60) });
    await sleep(POLITE_MS);
    continue;
  }

  const archivePath = join(ROOT, "archive", company.slug, `${doc.id}.txt`);
  const stored = existsSync(archivePath) ? readFileSync(archivePath, "utf8").trim() : null;

  let verdict, detail = "";
  if (sha(a) !== sha(b)) {
    verdict = sameLineSet(a, b) ? "reordering" : "unstable";
    detail = verdict === "reordering" ? "two reads differ only in line order" : "two reads differ in content";
  } else if (stored !== null && sha(a.trim()) !== sha(stored)) {
    verdict = sameLineSet(a, stored) ? "reordering" : "drifted";
    detail = verdict === "reordering"
      ? "reads agree, but differ from the archive only in line order"
      : "reads agree; differs from the archive (real edit, or slow churn)";
  } else {
    verdict = "stable";
  }
  rows.push({ key, verdict, detail });
  const mark = { stable: "ok  ", reordering: "⚠ RE", unstable: "⚠ UN", drifted: "·  D", error: "ERR " }[verdict];
  console.log(`  ${mark} ${key.padEnd(34)} ${detail}`);
  await sleep(POLITE_MS);
}

const by = (v) => rows.filter((r) => r.verdict === v);
console.log(
  `\n${rows.length} documents: ${by("stable").length} stable, ${by("drifted").length} drifted, ` +
  `${by("reordering").length} REORDERING, ${by("unstable").length} UNSTABLE, ${by("error").length} error`
);
for (const r of [...by("reordering"), ...by("unstable")]) {
  console.log(`  → ${r.key}: ${r.verdict === "reordering" ? 'set canonical:"lines" on this doc' : "investigate before it emits a false change"}`);
}
// Reordering is actionable and silent otherwise; instability is not fatal.
process.exit(by("reordering").length ? 1 : 0);
