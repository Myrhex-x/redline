#!/usr/bin/env node
/**
 * Regression tests for tools/pdf.mjs, against the filings actually archived.
 *
 * Both failures pinned here were live during development and both produced
 * something that looked like success:
 *
 *   1. Not skipping image XObjects returned pages of inflated pixel data as
 *      "text" — thousands of characters of convincing garbage.
 *   2. Trimming each positioning operator's output deleted every space, because
 *      these producers emit one word (sometimes one glyph) per operator. The
 *      result read as GoogleIrelandTransparencyReport… and a keyword search for
 *      "Google Chat" found nothing, which nearly became the conclusion that
 *      Google names no services.
 *
 * A silent extraction failure here does not break the build. It quietly empties
 * the evidence behind a service-level claim, so it needs a test.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pdfText } from "./pdf.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}  ${detail}`); }
};

const FIXTURES = [
  {
    file: "archive/google/derogation-report.pdf",
    minChars: 20_000,
    must: [
      "Specific number-independent interpersonal communications service concerned Gmail Google Chat",
      "The numbers below cover the consumer version of Google Chat and Gmail",
      "Regulation (EU) 2021/1232",
    ],
  },
  {
    file: "archive/meta/derogation-report.pdf",
    minChars: 2_000,
    must: [
      "We run our media matching technology on images and video (media) across Messenger and Instagram Direct",
    ],
  },
];

for (const fx of FIXTURES) {
  const p = join(ROOT, fx.file);
  if (!existsSync(p)) { check(`${fx.file} present`, false, "fixture missing"); continue; }
  const text = pdfText(readFileSync(p));

  check(`${fx.file}: extracts real text`, text.length >= fx.minChars, `${text.length} chars`);
  // Binary noise from image streams shows up as a low share of plain letters.
  const letters = (text.match(/[A-Za-z]/g) ?? []).length / Math.max(text.length, 1);
  check(`${fx.file}: not binary noise`, letters > 0.6, `letters ${(letters * 100).toFixed(0)}%`);
  // The space bug: words run together and this collapses toward zero.
  const spaces = (text.match(/ /g) ?? []).length / Math.max(text.length, 1);
  check(`${fx.file}: word spacing survived`, spaces > 0.1, `spaces ${(spaces * 100).toFixed(1)}%`);
  for (const m of fx.must) {
    check(`${fx.file}: contains "${m.slice(0, 44)}…"`, text.includes(m));
  }
}

console.log(`\n${pass + fail} checks: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
