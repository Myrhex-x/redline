#!/usr/bin/env node
/**
 * ScanRecords quote verifier.
 *
 * Every chatControl.quote in companies.json is presented on the site as
 * "from <company>'s own documents, as archived here". This tool enforces
 * that claim mechanically: each quote must literally appear in one of that
 * company's archived snapshot texts. If a company edits the quoted line
 * away, the daily run fails this check and the quote must be updated or
 * removed — quotes are never allowed to rot into fiction.
 *
 * Run: node tools/verify-quotes.mjs      (exit 0 = all verified, 2 = rot)
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Normalize typography so a straight-vs-curly quote or collapsed whitespace
// never causes a false alarm — only real wording changes should.
const norm = (s) =>
  s
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const { companies, institutions = [], serviceEvidence } = JSON.parse(
  readFileSync(join(ROOT, "companies.json"), "utf8")
);

let checked = 0, missing = [];

// The service-level claim rests on one quoted sentence, and company pages use
// it to say which services a source actually names. If Breyer rewrites that
// line, every "Named / Not named" split on the site silently loses its
// footing — so it is held to the same standard as a company's own quote.
// Per-company service evidence: a provider's own filing naming its own
// services. Same rule — if the quote is not in the archive, the "Named" list
// on that page is unsourced.
for (const c of companies) {
  const ev = c.servicesEvidence;
  if (!ev) continue;
  for (const q of ev.quotes ?? (ev.quote ? [ev.quote] : [])) {
    checked++;
    const f = join(ROOT, "archive", ev.slug, `${ev.doc}.txt`);
    const ok = existsSync(f) && norm(readFileSync(f, "utf8")).includes(norm(q));
    if (ok) console.log(`ok   ${c.slug} servicesEvidence: "${q.slice(0, 46)}…" in archive/${ev.slug}/${ev.doc}.txt`);
    else { missing.push(`${c.slug} servicesEvidence`); console.error(`ROT  ${c.slug} servicesEvidence: "${q}" not in archive/${ev.slug}/${ev.doc}.txt`); }
  }
}

if (serviceEvidence?.quote) {
  checked++;
  const f = join(ROOT, "archive", serviceEvidence.slug, `${serviceEvidence.doc}.txt`);
  const ok = existsSync(f) && norm(readFileSync(f, "utf8")).includes(norm(serviceEvidence.quote));
  if (ok) {
    console.log(`ok   serviceEvidence: quote found in archive/${serviceEvidence.slug}/${serviceEvidence.doc}.txt`);
  } else {
    missing.push("serviceEvidence");
    console.error(`ROT  serviceEvidence: the service-naming quote is no longer in archive/${serviceEvidence.slug}/${serviceEvidence.doc}.txt`);
  }
}
for (const c of [...companies, ...institutions]) {
  const quote = c.chatControl?.quote;
  if (!quote) continue;
  checked++;
  const dir = join(ROOT, "archive", c.slug);
  const texts = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".txt")) : [];
  const hit = texts.find((f) => norm(readFileSync(join(dir, f), "utf8")).includes(norm(quote)));
  if (hit) {
    console.log(`ok   ${c.slug}: quote found in archive/${c.slug}/${hit}`);
  } else {
    missing.push(c.slug);
    console.error(`ROT  ${c.slug}: quote not found in any archived text — "${quote.slice(0, 80)}…"`);
  }
}

console.log(`\n${checked} quotes checked, ${missing.length} missing`);
if (missing.length) {
  console.error(
    "A quoted line no longer exists in the archived documents. Either the company " +
    "changed the document (update or drop the quote, and record the change) or the " +
    "snapshot regressed. Do not ship a quote the archive cannot back."
  );
  process.exit(2);
}
