#!/usr/bin/env node
/**
 * ScanRecords snapshot tool.
 *
 * Fetches every tracked document in companies.json, extracts readable text
 * from the HTML, and writes it into archive/<company>/<doc>.{html,txt} plus
 * a meta.json — but ONLY when the extracted text actually changed. Raw HTML
 * churns on every request (nonces, CSRF tokens, cache-busters); extracted
 * text is the signal. Git history is the timestamped record of change.
 *
 * Zero dependencies. Node >= 20.
 *
 * Usage:
 *   node tools/snapshot.mjs            # snapshot everything
 *   node tools/snapshot.mjs --only x   # snapshot one company slug
 *   node tools/snapshot.mjs --dry      # fetch + report, write nothing
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE = join(ROOT, "archive");

const BOT_UA =
  "ScanRecordsBot/0.1 (+https://scanrecords.org; public policy archive)";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

const FETCH_TIMEOUT_MS = 30_000;
const DELAY_BETWEEN_MS = 1_500; // politeness: sequential, spaced out
const SHORT_TEXT_CHARS = 500; // below this, likely a JS shell or a block page

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx !== -1 ? args[onlyIdx + 1] : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/** Minimal, deterministic HTML -> text. Not a browser; good enough to diff. */
export function extractText(html) {
  let s = html;
  // Drop non-content subtrees entirely.
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  for (const tag of ["script", "style", "noscript", "template", "svg", "head"]) {
    s = s.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, "gi"), " ");
  }
  // Block-level boundaries become newlines so diffs stay line-oriented.
  s = s.replace(
    /<\/(p|div|li|ul|ol|h[1-6]|tr|td|th|table|section|article|header|footer|blockquote|dt|dd)>/gi,
    "\n"
  );
  s = s.replace(/<(br|hr)\s*\/?>/gi, "\n");
  // Strip every remaining tag.
  s = s.replace(/<[^>]+>/g, " ");
  // Decode the entities that actually occur in policy pages.
  const entities = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'",
    "&apos;": "'", "&nbsp;": " ", "&mdash;": "—", "&ndash;": "–",
    "&rsquo;": "’", "&lsquo;": "‘", "&rdquo;": "”",
    "&ldquo;": "“", "&hellip;": "…", "&copy;": "©",
    "&reg;": "®", "&trade;": "™",
  };
  s = s.replace(/&[a-z]+;|&#\d+;|&#x[0-9a-f]+;/gi, (m) => {
    if (entities[m]) return entities[m];
    if (m.startsWith("&#x") || m.startsWith("&#X"))
      return safeFromCode(parseInt(m.slice(3, -1), 16));
    if (m.startsWith("&#")) return safeFromCode(parseInt(m.slice(2, -1), 10));
    return m;
  });
  // Normalize whitespace: this is the canonical form we hash and diff.
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n");
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

function safeFromCode(code) {
  if (!Number.isFinite(code) || code < 32 || code > 0x10ffff) return " ";
  try {
    return String.fromCodePoint(code);
  } catch {
    return " ";
  }
}

async function fetchDoc(url, ua) {
  // When the EU relay is configured (CI runs on US machines), every document
  // fetch rides through it — the archive reads the web as the EU sees it.
  const { RELAY_URL, RELAY_TOKEN } = process.env;
  if (RELAY_URL && RELAY_TOKEN) {
    const res = await fetch(`${RELAY_URL}?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS + 5_000),
      headers: { "x-relay-token": RELAY_TOKEN, "x-relay-ua": ua },
    });
    const html = await res.text();
    const upstream = Number(res.headers.get("x-upstream-status") ?? 0);
    if (res.status !== 200 || upstream === 0)
      throw Object.assign(new Error(`relay: ${res.status} ${html.slice(0, 80)}`), { name: "RelayError" });
    return { status: upstream, finalUrl: res.headers.get("x-final-url") ?? url, html };
  }
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "user-agent": ua,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en",
    },
  });
  const html = await res.text();
  return { status: res.status, finalUrl: res.url, html };
}

/**
 * Drop lines matching a target's `ignore` regexes before hashing/storing.
 * For per-request noise a site embeds in visible text (trace ids, session
 * tokens) — without this, every fetch looks like a policy change.
 */
/**
 * Keep only the lines from the first match of `from` through the first
 * subsequent match of `to` (both inclusive). For pages whose surrounding
 * chrome varies by region or day (Google Play), the clipped section is the
 * document; everything outside it is noise no line-regex list can chase.
 * If a marker is missing the full text is kept — a structural change on the
 * source should surface loudly in the diff, not vanish.
 */
export function clipText(text, { from, to }) {
  const lines = text.split("\n");
  const fromRe = new RegExp(from), toRe = new RegExp(to);
  const i = lines.findIndex((l) => fromRe.test(l.trim()));
  if (i === -1) return text;
  const rest = lines.slice(i + 1).findIndex((l) => toRe.test(l.trim()));
  const j = rest === -1 ? lines.length - 1 : i + 1 + rest;
  return lines.slice(i, j + 1).join("\n").trim() + "\n";
}

export function filterNoise(text, patterns) {
  if (!patterns || patterns.length === 0) return text;
  const res = patterns.map((p) => new RegExp(p, "i"));
  return text
    .split("\n")
    .filter((line) => !res.some((re) => re.test(line)))
    .join("\n");
}

async function snapshotDoc(company, doc) {
  const dir = join(ARCHIVE, company.slug);
  const metaPath = join(dir, `${doc.id}.meta.json`);
  const prev = existsSync(metaPath)
    ? JSON.parse(readFileSync(metaPath, "utf8"))
    : null;

  const ua = company.ua === "browser" ? BROWSER_UA : BOT_UA;
  let result;
  try {
    result = await fetchDoc(doc.url, ua);
  } catch (e) {
    return { company, doc, state: "ERROR", detail: e.name === "TimeoutError" ? "timeout" : String(e.cause?.code ?? e.message) };
  }

  const { status, finalUrl, html } = result;
  if (status >= 400) {
    return { company, doc, state: "HTTP_" + status, detail: finalUrl };
  }

  let text = filterNoise(
    extractText(html),
    [...(company.ignore ?? []), ...(doc.ignore ?? [])]
  );
  if (doc.clip) text = clipText(text, doc.clip);
  const textHash = sha256(text);
  const short = text.length < (doc.minChars ?? SHORT_TEXT_CHARS);

  if (prev && prev.textHash === textHash) {
    return { company, doc, state: "UNCHANGED", chars: text.length };
  }

  if (!DRY) {
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
          finalUrl,
          httpStatus: status,
          fetchedAt: new Date().toISOString(),
          textHash,
          textChars: text.length,
          htmlBytes: Buffer.byteLength(html),
          note: short ? "short-extract: likely JS-rendered or blocked" : undefined,
        },
        null,
        2
      ) + "\n"
    );
  }

  return {
    company, doc,
    state: prev ? "CHANGED" : "NEW",
    chars: text.length,
    short,
  };
}

async function main() {
  const { companies, institutions = [] } = JSON.parse(
    readFileSync(join(ROOT, "companies.json"), "utf8")
  );
  const all = [...companies, ...institutions];
  const targets = ONLY ? all.filter((c) => c.slug === ONLY) : all;
  if (targets.length === 0) {
    console.error(`no company with slug "${ONLY}"`);
    process.exit(1);
  }

  const rows = [];
  for (const company of targets) {
    for (const doc of company.docs) {
      if (doc.render === "headless") continue; // captured by tools/headless.mjs
      rows.push(await snapshotDoc(company, doc));
      await sleep(DELAY_BETWEEN_MS);
    }
  }

  // Summary table.
  console.log("");
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad("company", 22) + pad("doc", 10) + pad("state", 12) + "detail");
  console.log("-".repeat(70));
  for (const r of rows) {
    const detail =
      r.detail ??
      (r.chars != null ? `${r.chars} chars${r.short ? "  ⚠ short" : ""}` : "");
    console.log(
      pad(r.company.slug, 22) + pad(r.doc.id, 10) + pad(r.state, 12) + detail
    );
  }

  const failed = rows.filter((r) => r.state === "ERROR" || r.state.startsWith("HTTP_"));
  const changed = rows.filter((r) => r.state === "CHANGED" || r.state === "NEW");
  console.log("");
  console.log(
    `${rows.length} documents: ${changed.length} new/changed, ` +
    `${rows.length - changed.length - failed.length} unchanged, ${failed.length} failed` +
    (DRY ? "  (dry run — nothing written)" : "")
  );

  // A partially-down internet must not fail the daily run; a mostly-down one should.
  if (failed.length > rows.length / 2) process.exit(1);
}

// Run only when invoked directly — headless.mjs imports this module for its
// extraction helpers and must not trigger a full snapshot as a side effect.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
