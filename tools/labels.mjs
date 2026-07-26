#!/usr/bin/env node
/**
 * ScanRecords App Store privacy-label tool.
 *
 * Apple requires every app to declare what data it collects; the declaration
 * is shown as the "privacy label" on the app's App Store page — and it is
 * embedded server-side in the page HTML (fastboot/shoebox JSON), so it can be
 * archived without a browser. Labels change silently and nobody keeps a
 * history. This does.
 *
 * For each company in companies.json with an `appstore` entry, fetches the
 * app page, extracts `privacyDetails`, and writes
 * archive/<slug>/appstore-label.json + .meta.json — only when the label
 * actually changed. The stored JSON is canonicalized (sorted keys) so diffs
 * are stable.
 *
 * Zero dependencies. Node >= 20.
 *
 * Usage:
 *   node tools/labels.mjs             # all apps
 *   node tools/labels.mjs --only x    # one company slug
 *   node tools/labels.mjs --dry       # fetch + report, write nothing
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE = join(ROOT, "archive");

// apps.apple.com serves the serialized-server-data island (which carries the
// privacy label) only to browser user-agents; the bot UA gets a page without
// it. Recorded 2026-07-26 — this lane needs the browser UA to exist at all.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const FETCH_TIMEOUT_MS = 30_000;
const DELAY_BETWEEN_MS = 3_000; // Apple rate-limits faster cadences (429)
const RETRY_429_AFTER_MS = 30_000;

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx !== -1 ? args[onlyIdx + 1] : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/** JSON.stringify with recursively sorted object keys — a canonical form. */
function stableStringify(value, indent = 2) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = sort(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(sort(value), null, indent);
}

/** Depth-first search for the first object satisfying a predicate. */
function findObject(node, pred, depth = 0) {
  if (depth > 40 || node == null || typeof node !== "object") return null;
  if (!Array.isArray(node) && pred(node)) return node;
  const values = Array.isArray(node) ? node : Object.values(node);
  for (const v of values) {
    const hit = findObject(v, pred, depth + 1);
    if (hit) return hit;
  }
  return null;
}

// The semantic fields of a privacy label. Everything else on the page
// structure (artwork URLs, impression metrics, styles, click actions) is
// presentation and would cause false diffs.
const KEEP = new Set(["identifier", "title", "detail", "purposes", "categories", "dataTypes"]);
function semantic(node) {
  if (Array.isArray(node)) return node.map(semantic);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) if (KEEP.has(k)) out[k] = semantic(v);
    return out;
  }
  return node;
}

/**
 * Pull the privacy label (+ app name) out of an App Store product page.
 * Since ~2026 the page is a Svelte app embedding its data in
 * <script type="application/json" id="serialized-server-data">, with the
 * label at data[0].data.shelfMapping.privacyTypes.items. A deep search
 * backs up the direct path in case Apple reshuffles the tree.
 */
export function extractLabel(html) {
  const m = html.match(
    /<script[^>]+id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!m) return null;
  let root;
  try {
    root = JSON.parse(m[1]);
  } catch {
    return null;
  }

  const page = root?.data?.[0]?.data;
  let shelf = page?.shelfMapping?.privacyTypes;
  if (!shelf?.items?.length) {
    shelf = findObject(
      root,
      (o) => o.contentType === "privacyType" && Array.isArray(o.items) && o.items.length > 0
    );
  }
  if (!shelf?.items?.length) return null;

  const appName = page?.title ?? null;

  return { appName, privacyTypes: semantic(shelf.items) };
}

async function snapshotLabel(company) {
  const { id, expect } = company.appstore;
  const url = `https://apps.apple.com/us/app/id${id}`;
  const dir = join(ARCHIVE, company.slug);
  const metaPath = join(dir, "appstore-label.meta.json");
  const prev = existsSync(metaPath)
    ? JSON.parse(readFileSync(metaPath, "utf8"))
    : null;

  let res, html;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "user-agent": UA, accept: "text/html", "accept-language": "en" },
      });
      html = await res.text();
    } catch (e) {
      return { company, state: "ERROR", detail: e.name === "TimeoutError" ? "timeout" : String(e.cause?.code ?? e.message) };
    }
    if (res.status === 429 && attempt === 0) {
      await sleep(RETRY_429_AFTER_MS);
      continue;
    }
    break;
  }
  if (res.status >= 400) return { company, state: "HTTP_" + res.status, detail: url };

  const label = extractLabel(html);
  if (!label) return { company, state: "NO_LABEL", detail: "privacy label not found in page" };

  // Wrong-app guard: the configured id must resolve to the app we meant.
  if (expect && label.appName && !label.appName.toLowerCase().includes(expect.toLowerCase())) {
    return { company, state: "MISMATCH", detail: `expected "${expect}", page is "${label.appName}"` };
  }

  const canonical = stableStringify(label.privacyTypes);
  const labelHash = sha256(canonical);

  if (prev && prev.labelHash === labelHash) {
    return { company, state: "UNCHANGED", detail: label.appName };
  }

  if (!DRY) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "appstore-label.json"), canonical + "\n");
    writeFileSync(
      metaPath,
      JSON.stringify(
        {
          company: company.name,
          app: label.appName,
          appId: id,
          url,
          fetchedAt: new Date().toISOString(),
          labelHash,
        },
        null,
        2
      ) + "\n"
    );
  }

  return { company, state: prev ? "CHANGED" : "NEW", detail: label.appName };
}

async function main() {
  const { companies } = JSON.parse(
    readFileSync(join(ROOT, "companies.json"), "utf8")
  );
  const targets = companies.filter(
    (c) => c.appstore && (!ONLY || c.slug === ONLY)
  );
  if (targets.length === 0) {
    console.error(ONLY ? `no appstore entry for slug "${ONLY}"` : "no appstore entries");
    process.exit(1);
  }

  const rows = [];
  for (const company of targets) {
    rows.push(await snapshotLabel(company));
    await sleep(DELAY_BETWEEN_MS);
  }

  console.log("");
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad("company", 22) + pad("state", 12) + "app / detail");
  console.log("-".repeat(70));
  for (const r of rows) {
    console.log(pad(r.company.slug, 22) + pad(r.state, 12) + (r.detail ?? ""));
  }

  const bad = rows.filter((r) =>
    ["ERROR", "NO_LABEL", "MISMATCH"].includes(r.state) || r.state.startsWith("HTTP_")
  );
  const changed = rows.filter((r) => r.state === "CHANGED" || r.state === "NEW");
  console.log("");
  console.log(
    `${rows.length} apps: ${changed.length} new/changed, ` +
    `${rows.length - changed.length - bad.length} unchanged, ${bad.length} problems` +
    (DRY ? "  (dry run — nothing written)" : "")
  );
  if (bad.length > rows.length / 2) process.exit(1);
}

main();
