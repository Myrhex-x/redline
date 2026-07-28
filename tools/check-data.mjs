#!/usr/bin/env node
/**
 * Structural checks on companies.json.
 *
 * These are the mistakes that produce a page which builds cleanly, passes
 * every other check, and says something false. The one that prompted this
 * file: an institution added to `institutions[]` without `institution: true`
 * renders as a tracked platform and is given a Chat Control verdict — the
 * site briefly told readers that a former MEP had "No statement found" on
 * whether he scans your messages.
 *
 * Run: node tools/check-data.mjs      (exit 1 on any problem)
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(ROOT, "companies.json"), "utf8"));
const { companies = [], institutions = [], serviceEvidence } = data;

const problems = [];
const fail = (m) => problems.push(m);

// A source is not a tracked platform. Without the flag it is rendered as one,
// verdict and all, and lands in a status group on /companies/.
for (const i of institutions) {
  if (i.institution !== true) fail(`institutions[] entry "${i.slug}" is missing institution: true — it will render as a tracked platform with a Chat Control verdict`);
  if (i.chatControl) fail(`institution "${i.slug}" has a chatControl block; institutions are sources, not assessed platforms`);
}
for (const c of companies) {
  if (c.institution) fail(`companies[] entry "${c.slug}" is flagged institution: true`);
  if (!c.chatControl?.status) fail(`company "${c.slug}" has no chatControl.status`);
  if (!(c.chatControl?.sources ?? []).length) fail(`company "${c.slug}" has no sources`);
}

// Slugs are URLs and archive directories; a collision silently merges two records.
const slugs = [...companies, ...institutions].map((x) => x.slug);
for (const s of slugs.filter((s, i) => slugs.indexOf(s) !== i)) fail(`duplicate slug "${s}"`);
for (const s of slugs) if (!/^[a-z0-9-]+$/.test(s)) fail(`slug "${s}" is not url-safe`);

// Cross-links must resolve, or a company page links to a 404.
for (const c of companies) {
  for (const o of c.alsoOwns ?? []) {
    if (!slugs.includes(o.slug)) fail(`"${c.slug}" alsoOwns unknown slug "${o.slug}"`);
    if (!o.link) fail(`"${c.slug}" alsoOwns "${o.slug}" has no link label`);
  }
  // Claiming a source names a service the company does not list is a typo
  // that would silently narrow or widen what the verdict attaches to.
  for (const s of c.servicesNamed ?? []) {
    if (!(c.services ?? []).includes(s)) fail(`"${c.slug}" servicesNamed "${s}" is not in its services list`);
  }
}

// A per-company filing must point at a document that company actually tracks.
for (const c of companies) {
  const ev = c.servicesEvidence;
  if (!ev) continue;
  if (!c.servicesNamed?.length) fail(`"${c.slug}" has servicesEvidence but no servicesNamed`);
  const owner = [...companies, ...institutions].find((x) => x.slug === ev.slug);
  if (!owner) fail(`"${c.slug}" servicesEvidence points at unknown slug "${ev.slug}"`);
  else if (!(owner.docs ?? []).some((d) => d.id === ev.doc)) fail(`"${c.slug}" servicesEvidence points at untracked doc "${ev.slug}/${ev.doc}"`);
  if (!(ev.quotes?.length || ev.quote)) fail(`"${c.slug}" servicesEvidence has no quote`);
  for (const entry of ev.quotes ?? []) {
    const doc = typeof entry === "string" ? ev.doc : (entry.doc ?? ev.doc);
    if (owner && !(owner.docs ?? []).some((d) => d.id === doc))
      fail(`"${c.slug}" servicesEvidence quote points at untracked doc "${ev.slug}/${doc}"`);
  }
}

// Doc ids become archive filenames.
for (const x of [...companies, ...institutions]) {
  const ids = (x.docs ?? []).map((d) => d.id);
  for (const d of ids.filter((v, i) => ids.indexOf(v) !== i)) fail(`"${x.slug}" has duplicate doc id "${d}"`);
  for (const d of x.docs ?? []) {
    if (!/^[a-z0-9-]+$/.test(d.id)) fail(`"${x.slug}" doc id "${d.id}" is not filename-safe`);
    try { new URL(d.url); } catch { fail(`"${x.slug}/${d.id}" has an invalid url`); }
  }
}

// The service-level split is only honest if its quote is actually archived.
if (serviceEvidence) {
  const f = join(ROOT, "archive", serviceEvidence.slug ?? "", `${serviceEvidence.doc ?? ""}.txt`);
  if (!existsSync(f)) fail(`serviceEvidence points at ${f}, which is not archived`);
  const named = companies.filter((c) => c.servicesNamed?.length);
  if (named.length && !serviceEvidence.quote) fail("servicesNamed is used but serviceEvidence has no quote");
  if (named.length && !serviceEvidence.caveat) fail("serviceEvidence has no caveat — 'not named' must never read as 'not scanning'");
}

for (const p of problems) console.error(`  ${p}`);
console.log(
  `check-data: ${companies.length} companies, ${institutions.length} institutions — ` +
  `${problems.length} problem${problems.length === 1 ? "" : "s"}`
);
process.exit(problems.length ? 1 : 0);
