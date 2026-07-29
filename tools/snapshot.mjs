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
import { pdfText } from "./pdf.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE = join(ROOT, "archive");

const BOT_UA =
  "ScanRecordsBot/0.1 (+https://scanrecords.org; public policy archive)";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

const FETCH_TIMEOUT_MS = 30_000;
const DELAY_BETWEEN_MS = 1_500; // politeness: sequential, spaced out
/**
 * Below this many characters an extract is a JS shell or a block page, not a
 * document. Shared with history.mjs, which must apply the identical floor:
 * if the two disagree, a capture can be archived here and then classified
 * differently there, which is exactly how a fetch failure becomes a published
 * "change". Docs that are legitimately tiny (clipped Play declarations — the
 * most private apps declare the least) set their own `minChars`.
 */
export const STUB_FLOOR = 1_000;

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

/**
 * PDFs are fetched directly, not through the EU relay.
 *
 * The relay hands back `res.text()`, which mangles binary. These documents are
 * static files on a CDN rather than the region-varying HTML the relay exists
 * for — a filing published under an EU regulation does not have a US edition —
 * so reading them from the runner is safe in a way that a policy page is not.
 */
async function fetchPdf(url, ua) {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "user-agent": ua, accept: "application/pdf" },
  });
  const bytes = Buffer.from(await res.arrayBuffer());
  return { status: res.status, finalUrl: res.url, bytes };
}

async function fetchDoc(url, ua) {
  // When the EU relay is configured (CI runs on US machines), every document
  // fetch rides through it — the archive reads the web as the EU sees it.
  const { RELAY_URL, RELAY_TOKEN } = process.env;
  // Half-configured is the dangerous state. If the URL is set and the token is
  // not, this used to fall through to a direct fetch and quietly capture the
  // wrong vantage for every document in the run — Meta alone serves text that
  // differs by tens of thousands of characters, so a missing secret would look
  // like the entire web rewriting its policies overnight.
  if (RELAY_URL && !RELAY_TOKEN) {
    throw Object.assign(
      new Error("RELAY_URL is set but RELAY_TOKEN is missing — refusing to fetch from the wrong vantage"),
      { name: "RelayMisconfigured" }
    );
  }
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
  if (i === -1) {
    // Same failure as a missing end marker, and it used to pass silently:
    // the whole page — nav, footer, region-varying chrome — becomes the
    // document, and churns forever. Both boundaries must fail loudly.
    console.warn(`  ⚠ clip: start marker /${from}/ not found — keeping full text, expect churn`);
    return text;
  }
  const rest = lines.slice(i + 1).findIndex((l) => toRe.test(l.trim()));
  if (rest === -1) {
    // Fail loudly rather than silently keeping the page furniture: an
    // unclosed clip is how region-varying footers sneak back into the record.
    console.warn(`  ⚠ clip: end marker /${to}/ not found — keeping full text, expect churn`);
    return text;
  }
  const j = i + 1 + rest;
  // Drop the end marker itself: it is the boundary, not the document.
  return lines.slice(i, j).join("\n").trim() + "\n";
}

/**
 * Stabilize order for sources that shuffle their content per request.
 * Google Play renders a data-safety page's declarations in a different order
 * on every single fetch — verified: identical lines, permuted sequence, both
 * between blocks and within them. Hashing that raw would report a "change"
 * every day forever, drowning real edits. So for these targets the canonical
 * form is: the heading, then every declaration line sorted deterministically.
 * Nothing is dropped except pure UI artifacts, the raw HTML is still archived
 * verbatim as evidence, and a genuinely new or edited declaration still shows
 * up as a clean added/removed line in the diff.
 */
export function canonicalLines(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l !== "expand_more" && l !== "info");
  if (lines.length <= 2) return text;
  const [head, ...rest] = lines;
  rest.sort((a, b) => a.localeCompare(b, "en"));
  return [head, ...rest].join("\n") + "\n";
}

export function filterNoise(text, patterns) {
  if (!patterns || patterns.length === 0) return text;
  const res = patterns.map((p) => new RegExp(p, "i"));
  return text
    .split("\n")
    .filter((line) => !res.some((re) => re.test(line)))
    .join("\n");
}

/** Same contract as snapshotDoc, but the source of truth is a PDF. */
async function snapshotPdf(company, doc, dir, metaPath, prev, ua) {
  let res;
  try {
    res = await fetchPdf(doc.url, ua);
  } catch (e) {
    return { company, doc, state: "ERROR", detail: e.name === "TimeoutError" ? "timeout" : String(e.cause?.code ?? e.message) };
  }
  if (res.status >= 400) return { company, doc, state: "HTTP_" + res.status, detail: res.finalUrl };

  let text;
  try {
    text = filterNoise(pdfText(res.bytes), [...(company.ignore ?? []), ...(doc.ignore ?? [])]);
  } catch (e) {
    return { company, doc, state: "ERROR", detail: `pdf parse: ${String(e.message).slice(0, 60)}` };
  }
  if (doc.clip) text = clipText(text, doc.clip);

  const textHash = sha256(text);
  const floor = doc.minChars ?? STUB_FLOOR;
  if (prev && prev.textHash === textHash) return { company, doc, state: "UNCHANGED", chars: text.length };
  // A PDF that suddenly yields almost nothing means the producer changed, not
  // that the filing was emptied. Same rule as a shell page: keep what we have.
  if (text.length < floor && prev && prev.textChars >= floor) {
    return { company, doc, state: "STUB", detail: `${text.length} chars < ${floor} — kept prior ${prev.textChars}-char capture` };
  }

  if (!DRY) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${doc.id}.pdf`), res.bytes);
    writeFileSync(join(dir, `${doc.id}.txt`), text + "\n");
    writeFileSync(metaPath, JSON.stringify({
      company: company.name, title: doc.title, url: doc.url, finalUrl: res.finalUrl,
      httpStatus: res.status, fetchedAt: new Date().toISOString(), format: "pdf",
      textHash, textChars: text.length, pdfBytes: res.bytes.length,
    }, null, 2) + "\n");
  }
  return { company, doc, state: prev ? "CHANGED" : "NEW", chars: text.length };
}

const CONFIRM_DELAY_MS = 8_000; // long enough to land on a different backend

/** Fetch -> text, exactly as the archive stores it. Used twice per change. */
function toArchiveText(html, company, doc) {
  let text = filterNoise(extractText(html), [...(company.ignore ?? []), ...(doc.ignore ?? [])]);
  let clipFellThrough = false;
  if (doc.clip) {
    const clipped = clipText(text, doc.clip);
    clipFellThrough = clipped === text;
    text = clipped;
  }
  if (doc.canonical === "lines") text = canonicalLines(text);
  return { text, clipFellThrough };
}

async function snapshotDoc(company, doc) {
  const dir = join(ARCHIVE, company.slug);
  const metaPath = join(dir, `${doc.id}.meta.json`);
  const prev = existsSync(metaPath)
    ? JSON.parse(readFileSync(metaPath, "utf8"))
    : null;

  const ua = company.ua === "browser" ? BROWSER_UA : BOT_UA;

  if (doc.type === "pdf") return snapshotPdf(company, doc, dir, metaPath, prev, ua);

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

  // Clip fall-through means the page furniture is now inside the record: it
  // will churn every day and bury real edits. Surfaced next to the summary
  // rather than left as one warn() line in a 90-document log.
  let { text, clipFellThrough } = toArchiveText(html, company, doc);
  const textHash = sha256(text);
  const floor = doc.minChars ?? STUB_FLOOR;
  const short = text.length < floor;

  if (prev && prev.textHash === textHash) {
    return { company, doc, state: "UNCHANGED", chars: text.length, clipFellThrough };
  }

  // A shell or block page is a failure to read the document, not an edit to
  // it. Archiving it would destroy a good capture and — because the stored
  // text really did change — publish "Meta removed its entire Privacy Policy"
  // to the front page and to every subscriber. Keep what we have and say so.
  if (short && prev && prev.textChars >= floor) {
    return {
      company, doc, state: "STUB",
      detail: `${text.length} chars < ${floor} — kept prior ${prev.textChars}-char capture`,
    };
  }

  // Before recording that a company changed its policy, read the page again.
  //
  // This is what a person would do, and the pipeline never did. Sites serve
  // different renders from different backends, run A/B variants, and rebuild
  // caches mid-crawl; any of those produces a diff that is not an edit. A
  // second read costs one request on the handful of documents that changed,
  // and the archive only ever claimed to report what a document says, not
  // what one request happened to return.
  //
  // It does NOT catch a page whose ordering drifts across days but is stable
  // within a minute — the EU Parliament's procedure file is exactly that, and
  // the reordering guard in history.mjs is what covers it. Two mechanisms,
  // because one of them was never going to be enough.
  if (prev && !DRY) {
    await sleep(CONFIRM_DELAY_MS);
    let confirm;
    try {
      confirm = await fetchDoc(doc.url, ua);
    } catch {
      return { company, doc, state: "UNCONFIRMED", detail: "second read failed — keeping prior capture" };
    }
    if (confirm.status >= 400) {
      return { company, doc, state: "UNCONFIRMED", detail: `second read HTTP ${confirm.status} — keeping prior capture` };
    }
    const second = toArchiveText(confirm.html, company, doc).text;
    if (sha256(second) === prev.textHash) {
      return {
        company, doc, state: "FLAPPED",
        detail: "second read matches the PREVIOUS capture — the page varies between reads, not an edit",
      };
    }
    if (sha256(second) !== textHash) {
      return {
        company, doc, state: "FLAPPED",
        detail: "two reads disagree with each other — unstable page, keeping prior capture",
      };
    }
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
    clipFellThrough,
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
  const stubs = rows.filter((r) => r.state === "STUB");
  const flapped = rows.filter((r) => r.state === "FLAPPED" || r.state === "UNCONFIRMED");
  console.log("");
  console.log(
    `${rows.length} documents: ${changed.length} new/changed, ` +
    `${rows.length - changed.length - failed.length - stubs.length - flapped.length} unchanged, ` +
    `${stubs.length} stubbed, ${flapped.length} unconfirmed, ${failed.length} failed` +
    (DRY ? "  (dry run — nothing written)" : "")
  );
  // A document that fails confirmation repeatedly is either genuinely unstable
  // or quietly frozen in the archive. Either way somebody has to look.
  for (const r of flapped) {
    console.log(`  ⚠ unconfirmed: ${r.company.slug}/${r.doc.id} — ${r.detail}`);
  }
  // A stub is a silent staleness risk: the prior capture is preserved, so the
  // archive looks healthy while we have in fact stopped reading the document.
  // One bad day is noise; a target that stubs every day needs a headless lane.
  for (const r of stubs) {
    console.log(`  ⚠ stub: ${r.company.slug}/${r.doc.id} — ${r.detail}`);
  }
  for (const r of rows.filter((x) => x.clipFellThrough)) {
    console.log(`  ⚠ clip fell through: ${r.company.slug}/${r.doc.id} — page furniture is in the record, expect daily churn`);
  }

  // A partially-down internet must not fail the daily run; a mostly-down one should.
  if (failed.length > rows.length / 2) process.exit(1);
}

// Run only when invoked directly — headless.mjs imports this module for its
// extraction helpers and must not trigger a full snapshot as a side effect.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
