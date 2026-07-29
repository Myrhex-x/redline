#!/usr/bin/env node
/**
 * ScanRecords history tool.
 *
 * Turns archive changes into a structured, renderable record:
 *   - history.json  — newest-first index of every recorded event
 *   - changes/<id>.json — the parsed unified diff for each change event
 *
 * Runs in the daily workflow AFTER snapshot.mjs/labels.mjs and BEFORE the
 * commit: modified archive files are read via `git diff` against HEAD, so
 * the before/after is exact. Docs present in the archive but absent from
 * history get a "baseline" entry (first recording) — which also seeds the
 * initial history and auto-baselines newly added companies.
 *
 * Zero dependencies (relies on the git binary, which the whole project
 * already assumes). Node >= 20.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STUB_FLOOR } from "./snapshot.mjs";
import { assessDiff } from "./significance.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE = join(ROOT, "archive");
const HISTORY = join(ROOT, "history.json");
const CHANGES = join(ROOT, "changes");

const MAX_HUNK_LINES = 600; // cap stored diff size; the full record stays in git

const git = (...args) =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

function loadJSON(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
}

/** Parse `git diff --unified` output into hunks of typed lines. */
function parseUnifiedDiff(text, cap = MAX_HUNK_LINES) {
  const hunks = [];
  let hunk = null;
  let total = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("@@")) {
      hunk = { header: line, lines: [] };
      hunks.push(hunk);
      continue;
    }
    if (!hunk) continue; // skip file header lines
    if (total >= cap) continue;
    if (line.startsWith("+")) hunk.lines.push({ t: "+", s: line.slice(1) });
    else if (line.startsWith("-")) hunk.lines.push({ t: "-", s: line.slice(1) });
    else if (line.startsWith(" ")) hunk.lines.push({ t: " ", s: line.slice(1) });
    else continue; // "\ No newline at end of file" etc.
    total++;
  }
  return { hunks: hunks.filter((h) => h.lines.length), truncated: total >= cap };
}

/**
 * Is this diff purely a reordering of the same lines?
 *
 * Universal, because the alternative is discovering each site's shuffle one
 * false alarm at a time. The EU Parliament's procedure file lists the same
 * entries in a different order between renders; two of them swapped and the
 * archive told subscribers Parliament had amended a filing. Google Play does
 * the same thing and needed a per-document `canonical` flag to stop it.
 *
 * If the added lines are a permutation of the removed lines then no text
 * exists now that did not exist before, and none has gone: nothing was
 * edited. Git still holds the reordering; it just is not an event.
 *
 * Safe against real edits by construction — changing so much as one character
 * on one line breaks the multiset equality and the change is recorded.
 */
function isPureReordering(hunks) {
  const added = [], removed = [];
  for (const h of hunks) {
    for (const l of h.lines) {
      const s = l.s.trim();
      if (!s) continue;
      if (l.t === "+") added.push(s);
      else if (l.t === "-") removed.push(s);
    }
  }
  if (!added.length || added.length !== removed.length) return false;
  const a = added.slice().sort(), b = removed.slice().sort();
  return a.every((x, i) => x === b[i]);
}

function main() {
  const { companies, institutions = [] } = loadJSON(join(ROOT, "companies.json"), { companies: [] });
  const bySlug = new Map([...companies, ...institutions].map((c) => [c.slug, c]));
  const history = loadJSON(HISTORY, []);
  const seen = new Set(history.map((e) => `${e.slug}/${e.doc}`));
  const ids = new Set(history.map((e) => e.id));
  const today = new Date().toISOString().slice(0, 10);
  const fresh = [];

  const uniqueId = (base) => {
    let id = base, n = 2;
    while (ids.has(id)) id = `${base}-${n++}`;
    ids.add(id);
    return id;
  };

  // 1) Change events: archive files modified relative to HEAD.
  const status = git("status", "--porcelain", "--", "archive");
  for (const row of status.split("\n")) {
    if (!row.trim()) continue;
    const path = row.slice(3).trim();
    const modified = row[0] === "M" || row[1] === "M";
    if (!modified) continue; // new files are handled by the baseline pass

    const m = path.match(/^archive\/([^/]+)\/(.+?)\.(txt|json)$/);
    if (!m) continue;
    const [, slug, base, ext] = m;
    if (ext === "json" && base !== "appstore-label") continue; // meta files: not the record
    if (ext === "txt" && base.endsWith(".meta")) continue;

    const isLabel = base === "appstore-label";
    const doc = isLabel ? "appstore-label" : base;
    const company = bySlug.get(slug);
    const docDef = company?.docs?.find((d) => d.id === doc);

    // Renderer upgrades are not policy changes: if the previous snapshot was a
    // flagged shell/blocked stub (under 500 chars), this is a recapture — the
    // baseline entry already covers first recording, and publishing it as a
    // "change" would put a false event on the front page.
    if (ext === "txt") {
      let old = null;
      try { old = git("show", `HEAD:${path}`); } catch { /* not in HEAD */ }
      // Anything under the stub floor was a shell/block page, not a document.
      // Clipped declaration docs (Play data safety) are legitimately tiny —
      // the most private apps declare the least — so a doc can set its own
      // `minChars`. The floor must match snapshot.mjs exactly.
      const stubFloor = docDef?.minChars ?? STUB_FLOOR;
      if (old !== null && old.trim().length < stubFloor) {
        console.log(`recapture ${slug}/${doc} (prior snapshot was a ${old.trim().length}-char stub)`);
        continue;
      }
      // The mirror image, and the one that actually bit us: a good capture
      // replaced by a shell. snapshot.mjs now refuses to write this, but the
      // guard belongs on both sides — losing a document is never an edit to
      // it, and it must never reach the front page or the mailing list.
      const now = readFileSync(join(ROOT, path), "utf8").trim();
      if (now.length < stubFloor) {
        console.log(`stub      ${slug}/${doc} (${now.length}-char capture — failed read, not a change)`);
        continue;
      }
    }

    const diffText = git("diff", "--no-color", "--unified=3", "--", path);
    const { hunks, truncated } = parseUnifiedDiff(diffText);
    if (!hunks.length) continue;
    // Judge reordering on the WHOLE diff, never the capped parse. A large edit
    // truncated at MAX_HUNK_LINES can leave a prefix that happens to be a
    // permutation while the part beyond the cap is a real rewrite, and
    // suppressing on that would silence the change permanently.
    const full = truncated ? parseUnifiedDiff(diffText, Infinity).hunks : hunks;
    if (isPureReordering(full)) {
      console.log(`reorder   ${slug}/${doc} (same lines, different order — not an edit)`);
      seen.add(`${slug}/${doc}`);
      continue;
    }
    const added = hunks.reduce((n, h) => n + h.lines.filter((l) => l.t === "+").length, 0);
    const removed = hunks.reduce((n, h) => n + h.lines.filter((l) => l.t === "-").length, 0);

    // Recorded either way; announced only if it is more than page furniture.
    const sig = assessDiff(hunks, { docId: doc });
    const id = uniqueId(`${today}-${slug}-${doc}`);
    mkdirSync(CHANGES, { recursive: true });
    writeFileSync(
      join(CHANGES, `${id}.json`),
      JSON.stringify({ id, date: today, slug, doc, hunks, truncated }, null, 1) + "\n"
    );
    fresh.push({
      id,
      date: today,
      slug,
      company: company?.name ?? slug,
      doc,
      docTitle: isLabel ? "App Store privacy label" : docDef?.title ?? doc,
      kind: isLabel ? "label-change" : "change",
      added,
      removed,
      ...(sig.substantive ? {} : { minor: true, minorReason: sig.reason }),
    });
    // This run has now spoken for the doc. Without this the baseline pass below
    // still sees it as "never mentioned in history" and files a baseline for
    // the same document on the same day — which happened to the EP procedure
    // file, whose first recorded event was a change and a first-recording at
    // once. A document is either being met for the first time or changing.
    seen.add(`${slug}/${doc}`);
    console.log(
      `change    ${id}  +${added} −${removed}${truncated ? " (truncated)" : ""}` +
      (sig.substantive ? "" : `  [minor, not announced: ${sig.reason.slice(0, 70)}]`)
    );
  }

  // 2) Baseline events: recorded docs that history has never mentioned.
  for (const dir of existsSync(ARCHIVE) ? readdirSync(ARCHIVE) : []) {
    const company = bySlug.get(dir);
    for (const f of readdirSync(join(ARCHIVE, dir))) {
      if (!f.endsWith(".meta.json")) continue;
      const doc = f.replace(/\.meta\.json$/, "");
      if (seen.has(`${dir}/${doc}`)) continue;
      const meta = loadJSON(join(ARCHIVE, dir, f), {});
      const isLabel = doc === "appstore-label";
      const docDef = company?.docs?.find((d) => d.id === doc);
      fresh.push({
        id: uniqueId(`${(meta.fetchedAt ?? today).slice(0, 10)}-${dir}-${doc}-baseline`),
        date: (meta.fetchedAt ?? today).slice(0, 10),
        slug: dir,
        company: company?.name ?? meta.company ?? dir,
        doc,
        docTitle: isLabel ? "App Store privacy label" : docDef?.title ?? meta.title ?? doc,
        kind: "baseline",
        added: 0,
        removed: 0,
      });
      seen.add(`${dir}/${doc}`);
      console.log(`baseline  ${dir}/${doc}`);
    }
  }

  if (!fresh.length) {
    console.log("history: nothing new");
    return;
  }
  // Newest first; within a day, changes before baselines.
  const updated = [...fresh, ...history].sort(
    (a, b) => b.date.localeCompare(a.date) || (a.kind === "baseline") - (b.kind === "baseline")
  );
  writeFileSync(HISTORY, JSON.stringify(updated, null, 1) + "\n");
  console.log(`history: +${fresh.length} entries (${updated.length} total)`);
}

main();
