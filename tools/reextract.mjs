#!/usr/bin/env node
/**
 * ScanRecords re-extraction tool.
 *
 * Re-derives archive/<slug>/<doc>.txt from the .html already on disk, using
 * the CURRENT extraction rules in companies.json (ignore / clip / canonical).
 *
 * Why this exists: tightening an extraction rule changes the stored text, and
 * the daily pipeline reads a changed .txt as "the company edited its policy".
 * That would publish a fabricated change — the exact failure this archive
 * cannot afford. Running this tool in the same commit as the rule change
 * re-baselines the text up front, so the next snapshot sees no diff and no
 * event is ever emitted.
 *
 * It never touches the network: the archived HTML is the input, so the result
 * is byte-identical to what the original fetch would have produced under the
 * new rules, with no vantage or render nondeterminism in the loop. `fetchedAt`
 * is deliberately left alone — no fetch happened, and only our reading of the
 * document changed, not the document.
 *
 * Usage:
 *   node tools/reextract.mjs --dry          # report what would change
 *   node tools/reextract.mjs                # rewrite .txt + meta hashes
 *   node tools/reextract.mjs --only twitch  # one company
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractText, filterNoise, clipText, canonicalLines } from "./snapshot.mjs";
import { pdfText } from "./pdf.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE = join(ROOT, "archive");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx !== -1 ? args[onlyIdx + 1] : null;

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

const { companies, institutions = [] } = JSON.parse(
  readFileSync(join(ROOT, "companies.json"), "utf8")
);
const all = [...companies, ...institutions];
const targets = ONLY ? all.filter((c) => c.slug === ONLY) : all;
if (targets.length === 0) {
  console.error(`no company with slug "${ONLY}"`);
  process.exit(1);
}

let changed = 0, same = 0, skipped = 0;
for (const company of targets) {
  for (const doc of company.docs) {
    const dir = join(ARCHIVE, company.slug);
    // The archived original: page bytes for HTML, the filing itself for PDFs.
    const isPdf = doc.type === "pdf";
    const srcPath = join(dir, `${doc.id}.${isPdf ? "pdf" : "html"}`);
    const txtPath = join(dir, `${doc.id}.txt`);
    const metaPath = join(dir, `${doc.id}.meta.json`);
    if (!existsSync(srcPath) || !existsSync(txtPath)) { skipped++; continue; }

    let text = filterNoise(
      isPdf ? pdfText(readFileSync(srcPath)) : extractText(readFileSync(srcPath, "utf8")),
      [...(company.ignore ?? []), ...(doc.ignore ?? [])]
    );
    if (doc.clip) text = clipText(text, doc.clip);
    if (!isPdf && doc.canonical === "lines") text = canonicalLines(text);

    const before = readFileSync(txtPath, "utf8");
    const after = text + "\n";
    if (before === after) { same++; continue; }

    const bl = before.trim().split("\n").length, al = after.trim().split("\n").length;
    console.log(
      `${(company.slug + "/" + doc.id).padEnd(30)} ${String(before.length).padStart(7)} → ` +
      `${String(after.length).padStart(7)} chars   ${bl} → ${al} lines`
    );
    changed++;
    if (DRY) continue;

    writeFileSync(txtPath, after);
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    meta.textHash = sha256(text);
    meta.textChars = text.length;
    // Re-extraction is not a fetch: leave fetchedAt pointing at the last time
    // the source itself actually changed.
    writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
  }
}

console.log(
  `\nre-extract: ${changed} rewritten, ${same} identical, ${skipped} skipped` +
  (DRY ? "  (dry run — nothing written)" : "")
);
