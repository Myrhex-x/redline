#!/usr/bin/env node
/**
 * Internal link check over the built site.
 *
 * Every root-relative href/src on a generated page must resolve to a file in
 * public/. A dead internal link on an archive whose whole pitch is "check it
 * yourself" is worse than a typo — it is the reader hitting a wall at the
 * exact moment they decided to verify something.
 *
 * public/archive/ is skipped on purpose: those are verbatim captures of other
 * people's pages, and their root-relative asset paths are *supposed* to dangle.
 * Never "fix" a captured file.
 *
 * Run: node tools/check-links.mjs      (exit 1 if anything is broken)
 */

import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");

if (!existsSync(PUBLIC)) {
  console.error("check-links: public/ not built — run node tools/build-site.mjs first");
  process.exit(1);
}

const SKIP_DIRS = new Set([join(PUBLIC, "archive")]);
// cleanUrls: true means /404 is served from 404.html; the language switcher on
// the 404 page links to itself that way.
const KNOWN_EXTENSIONLESS = new Set(["/404"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (SKIP_DIRS.has(p)) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".html")) out.push(p);
  }
  return out;
}

const pages = walk(PUBLIC);
const broken = new Map();

for (const page of pages) {
  const html = readFileSync(page, "utf8");
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
    const target = m[1];
    if (target.startsWith("//")) continue; // protocol-relative: external
    if (KNOWN_EXTENSIONLESS.has(target) && existsSync(join(PUBLIC, target + ".html"))) continue;
    const file = target.endsWith("/")
      ? join(PUBLIC, target, "index.html")
      : join(PUBLIC, target);
    if (existsSync(file)) continue;
    if (existsSync(file + ".html")) continue; // cleanUrls
    if (!broken.has(target)) broken.set(target, new Set());
    broken.get(target).add(page.replace(ROOT + "/", ""));
  }
}

for (const [target, sources] of broken) {
  console.log(`  BROKEN ${target}`);
  for (const s of [...sources].slice(0, 4)) console.log(`         ← ${s}`);
}
console.log(
  `check-links: ${pages.length} pages, ${broken.size} broken internal target${broken.size === 1 ? "" : "s"}`
);
process.exit(broken.size ? 1 : 0);
