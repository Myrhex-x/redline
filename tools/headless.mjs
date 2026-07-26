#!/usr/bin/env node
/**
 * ScanRecords headless lane.
 *
 * Some tracked pages are unreachable by a plain fetch: JavaScript-rendered
 * shells (Reddit, Twitch, TikTok's guidelines) and WAFs that block anything
 * without a real browser's TLS fingerprint (Roblox's Zendesk, Epic's
 * Cloudflare, Yubo). This lane drives a real headless Chromium via
 * Playwright for exactly the docs marked `"render": "headless"` in
 * companies.json, then stores snapshots in the identical archive format —
 * same extraction, same noise filtering, same change detection.
 *
 * Playwright is NOT a repo dependency: the daily workflow installs it
 * transiently (npm install --no-save playwright), keeping the published
 * package-free, zero-dependency posture for everything else. If Playwright
 * is unavailable this lane skips gracefully — a missed headless run is a
 * smaller loss than a failed workflow.
 *
 * Usage:
 *   node tools/headless.mjs            # all headless-marked docs
 *   node tools/headless.mjs --only x   # one company slug
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractText, filterNoise } from "./snapshot.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE = join(ROOT, "archive");

const NAV_TIMEOUT_MS = 60_000;
const SETTLE_MS = 3_500; // after load: let hydration finish
const DELAY_BETWEEN_MS = 2_000;
const SHORT_TEXT_CHARS = 500;

const args = process.argv.slice(2);
const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx !== -1 ? args[onlyIdx + 1] : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.log("headless: playwright not installed — skipping this lane");
    return;
  }

  const { companies } = JSON.parse(readFileSync(join(ROOT, "companies.json"), "utf8"));
  const targets = [];
  for (const c of companies) {
    if (ONLY && c.slug !== ONLY) continue;
    for (const d of c.docs) if (d.render === "headless") targets.push([c, d]);
  }
  if (!targets.length) {
    console.log("headless: no headless-marked docs");
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    locale: "en-US",
    timezoneId: "UTC",
    viewport: { width: 1366, height: 900 },
  });
  const rows = [];

  for (const [company, doc] of targets) {
    const dir = join(ARCHIVE, company.slug);
    const metaPath = join(dir, `${doc.id}.meta.json`);
    const prev = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : null;
    const page = await ctx.newPage();
    try {
      const res = await page.goto(doc.url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      await sleep(SETTLE_MS);
      const status = res?.status() ?? 0;
      if (status >= 400) {
        rows.push({ company, doc, state: "HTTP_" + status });
        continue;
      }
      const html = await page.content();
      const text = filterNoise(extractText(html), [
        ...(company.ignore ?? []),
        ...(doc.ignore ?? []),
      ]);
      const textHash = sha256(text);
      const short = text.length < SHORT_TEXT_CHARS;

      if (prev && prev.textHash === textHash) {
        rows.push({ company, doc, state: "UNCHANGED", chars: text.length });
        continue;
      }
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${doc.id}.html`), html);
      writeFileSync(join(dir, `${doc.id}.txt`), text + "\n");
      writeFileSync(
        metaPath,
        JSON.stringify(
          {
            company: company.name,
            title: doc.title,
            url: doc.url,
            finalUrl: page.url(),
            httpStatus: status,
            fetchedAt: new Date().toISOString(),
            renderer: "headless-chromium",
            textHash,
            textChars: text.length,
            htmlBytes: Buffer.byteLength(html),
            note: short ? "short-extract: page did not render content" : undefined,
          },
          null,
          2
        ) + "\n"
      );
      rows.push({ company, doc, state: prev ? "CHANGED" : "NEW", chars: text.length, short });
    } catch (e) {
      rows.push({ company, doc, state: "ERROR", detail: e.name === "TimeoutError" ? "timeout" : e.message.slice(0, 80) });
    } finally {
      await page.close();
      await sleep(DELAY_BETWEEN_MS);
    }
  }

  await browser.close();

  console.log("");
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad("company", 14) + pad("doc", 12) + pad("state", 12) + "detail");
  console.log("-".repeat(60));
  for (const r of rows) {
    const detail = r.detail ?? (r.chars != null ? `${r.chars} chars${r.short ? "  ⚠ short" : ""}` : "");
    console.log(pad(r.company.slug, 14) + pad(r.doc.id, 12) + pad(r.state, 12) + detail);
  }
  const failed = rows.filter((r) => r.state === "ERROR" || r.state.startsWith("HTTP_"));
  console.log(`\n${rows.length} headless documents: ${rows.length - failed.length} ok, ${failed.length} failed`);
}

main();
