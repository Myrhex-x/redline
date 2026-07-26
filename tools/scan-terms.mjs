#!/usr/bin/env node
/**
 * ScanRecords term search — receipts for the negative.
 *
 * Three of the statuses on this site are claims about what could NOT be
 * found: "no clear statement", "no EU evidence". Asserting that is cheap;
 * proving it is not. This tool searches every archived document of every
 * company for a fixed, published list of scanning vocabulary and records
 * exactly what it found and what it did not, with quoted context.
 *
 * The result is rendered on each company page, so a reader never has to
 * take "we found nothing" on faith: they can see the terms, the documents,
 * the character counts, and every match in context — and re-run this file
 * themselves against the same archive.
 *
 * Run: node tools/scan-terms.mjs        (writes archive/<slug>/terms-search.json)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE = join(ROOT, "archive");

// The published vocabulary. Grouped by what a match would actually prove.
// German and French terms are included because several tracked providers
// publish their real policies in those languages.
const TERMS = [
  // Group A — the EU derogation itself. A match here is the strongest signal.
  { g: "eu", label: "Regulation 2021/1232", re: /2021\s*\/\s*1232/i },
  { g: "eu", label: "derogation / Ausnahmeregelung / dérogation", re: /\bderogation\b|Ausnahmeregelung|dérogation/i },
  { g: "eu", label: "Chat Control / Chatkontrolle", re: /chat[\s-]?control|chatkontrolle/i },
  { g: "eu", label: "ePrivacy", re: /e-?privacy/i },
  // Group B — content scanning for child sexual abuse material, any jurisdiction.
  { g: "csam", label: "CSAM / CSAE", re: /\bCSAM\b|\bCSAE\b/i },
  { g: "csam", label: "child sexual abuse / Kindesmissbrauch", re: /child sexual abuse|child sexual exploitation|kindesmissbrauch|missbrauchsdarstellung/i },
  { g: "csam", label: "NCMEC / CyberTipline", re: /NCMEC|cybertipline/i },
  { g: "csam", label: "PhotoDNA", re: /photodna/i },
  { g: "csam", label: "hash matching / hash database", re: /hash[- ](?:match|database|list|value-based)|hash-datenbank/i },
  { g: "csam", label: "Internet Watch Foundation", re: /internet watch foundation|\bIWF\b/i },
  // Group C — scanning language in general. Matches here are usually about
  // spam, malware or public content, which is why context is shown.
  { g: "scan", label: "scan / scanning / gescannt", re: /\bscan(?:s|ned|ning)?\b|gescannt|scannen/i },
  { g: "scan", label: "automated detection / automatisierte Erkennung", re: /automat(?:ed|ic) (?:detection|review|scanning|means)|automatisierte? (?:erkennung|prüfung|verfahren)/i },
  { g: "scan", label: "classifier / machine learning detection", re: /classifier|machine learning (?:model|detection)/i },
  { g: "scan", label: "monitor content / review content", re: /(?:monitor|review|analyse|analyze)s? (?:your |user |the )?(?:content|messages|communications)/i },
];

const SNIPPET_PAD = 110;
const MAX_SNIPPETS_PER_TERM = 3;

function snippet(text, m) {
  const s = Math.max(0, m.index - SNIPPET_PAD);
  const e = Math.min(text.length, m.index + m[0].length + SNIPPET_PAD);
  return (s > 0 ? "…" : "") + text.slice(s, e).replace(/\s+/g, " ").trim() + (e < text.length ? "…" : "");
}

const { companies, institutions = [] } = JSON.parse(
  readFileSync(join(ROOT, "companies.json"), "utf8")
);

let wrote = 0;
for (const company of [...companies, ...institutions]) {
  const dir = join(ARCHIVE, company.slug);
  if (!existsSync(dir)) continue;
  const texts = readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => ({ doc: f.replace(/\.txt$/, ""), text: readFileSync(join(dir, f), "utf8") }));
  if (texts.length === 0) continue;

  const results = TERMS.map(({ g, label, re }) => {
    const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    const found = [];
    let count = 0;
    for (const { doc, text } of texts) {
      for (const m of text.matchAll(global)) {
        count++;
        if (found.length < MAX_SNIPPETS_PER_TERM) found.push({ doc, quote: snippet(text, m) });
      }
    }
    return { group: g, label, pattern: re.source, count, samples: found };
  });

  writeFileSync(
    join(dir, "terms-search.json"),
    JSON.stringify(
      {
        company: company.name,
        searchedAt: new Date().toISOString().slice(0, 10),
        documents: texts.map((t) => ({ doc: t.doc, chars: t.text.length })),
        totalChars: texts.reduce((n, t) => n + t.text.length, 0),
        terms: results,
      },
      null,
      1
    ) + "\n"
  );
  wrote++;
}
console.log(`term search: ${wrote} companies, ${TERMS.length} terms each`);
