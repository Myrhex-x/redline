#!/usr/bin/env node
/**
 * ScanRecords site generator.
 *
 * Renders the whole site into public/ from the data files in this repo:
 * companies.json, archive/** (snapshots + metas + labels), history.json,
 * changes/*.json. Runs on Vercel at every push — including the daily
 * snapshot commits, so the site republishes itself each morning.
 *
 * Deliberately: zero dependencies, zero client-side JavaScript, zero
 * cookies. Pages are plain HTML + one stylesheet. An archive should not
 * need a framework.
 *
 * Usage: node tools/build-site.mjs
 */

import {
  readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, cpSync, rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public");
const SITE = "https://scanrecords.org";
const REPO = "https://github.com/Myrhex-x/redline";

const loadJSON = (p, fb) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fb);
const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (iso) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const daysSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso)) / 86400000));

// ---------------------------------------------------------------- data ----
const { companies, blocked = [] } = loadJSON(join(ROOT, "companies.json"), { companies: [] });
const history = loadJSON(join(ROOT, "history.json"), []);

const archive = new Map(); // slug -> { docs: Map(docId -> meta), label, labelMeta }
const ARCH = join(ROOT, "archive");
for (const dir of existsSync(ARCH) ? readdirSync(ARCH) : []) {
  const entry = { docs: new Map(), label: null, labelMeta: null };
  for (const f of readdirSync(join(ARCH, dir))) {
    if (f === "appstore-label.json") entry.label = loadJSON(join(ARCH, dir, f), null);
    else if (f === "appstore-label.meta.json") entry.labelMeta = loadJSON(join(ARCH, dir, f), null);
    else if (f.endsWith(".meta.json"))
      entry.docs.set(f.replace(/\.meta\.json$/, ""), loadJSON(join(ARCH, dir, f), {}));
  }
  archive.set(dir, entry);
}

const changesBySlug = new Map();
for (const e of history) {
  if (!changesBySlug.has(e.slug)) changesBySlug.set(e.slug, []);
  changesBySlug.get(e.slug).push(e);
}
const realChanges = history.filter((e) => e.kind !== "baseline");
const docCount = [...archive.values()].reduce((n, a) => n + a.docs.size, 0);
const labelCount = [...archive.values()].filter((a) => a.label).length;
const lastFetch = [...archive.values()]
  .flatMap((a) => [...a.docs.values(), a.labelMeta].filter(Boolean))
  .map((m) => m.fetchedAt ?? "")
  .sort()
  .at(-1);
const baselineDate = history.length ? history[history.length - 1].date : "2026-07-26";

// --------------------------------------------------------------- style ----
const CSS = `
:root { color-scheme: light dark;
  --bg:#ffffff; --fg:#111111; --dim:#6b6b6b; --faint:#9a9a9a;
  --line:#e6e6e6; --soft:#f7f7f7; --live:#137333;
  --add-bg:#e9f5ec; --add-fg:#0f6a2f; --del-bg:#fdedee; --del-fg:#a52833; }
@media (prefers-color-scheme: dark) { :root {
  --bg:#0a0a0a; --fg:#ebebeb; --dim:#9a9a9a; --faint:#6f6f6f;
  --line:#1e1e1e; --soft:#121212; --live:#4ccb6f;
  --add-bg:rgba(46,160,67,.14); --add-fg:#57c46f; --del-bg:rgba(248,81,73,.13); --del-fg:#ef7078; } }
* { margin:0; box-sizing:border-box; }
html { -webkit-text-size-adjust:100%; }
body { background:var(--bg); color:var(--fg);
  font:16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
a { color:inherit; text-decoration:none; }
main a:not(.plain), footer a { text-decoration:underline; text-decoration-color:var(--faint); text-underline-offset:3px; }
main a:hover, footer a:hover { text-decoration-color:var(--fg); }
.mono { font-family:ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace; font-size:.86em; }
.dim { color:var(--dim); } .faint { color:var(--faint); }
.wrap { max-width:66rem; margin:0 auto; padding:0 22px; }
header.top { border-bottom:1px solid var(--line); }
header.top .wrap { display:flex; align-items:baseline; gap:1.4rem; padding-top:18px; padding-bottom:14px; flex-wrap:wrap; }
.wm { font-weight:650; letter-spacing:-.02em; font-size:1.05rem; }
.wm .half { color:var(--dim); font-weight:500; }
nav.site { display:flex; gap:1.1rem; font-size:.92rem; color:var(--dim); margin-left:auto; }
nav.site a[aria-current] { color:var(--fg); }
main { padding:2.6rem 0 3.5rem; }
h1 { font-size:1.7rem; letter-spacing:-.025em; line-height:1.25; font-weight:650; }
h2 { font-size:1.02rem; font-weight:650; letter-spacing:.01em; margin:2.6rem 0 .9rem; }
p.lede { font-size:1.06rem; max-width:44rem; margin-top:.9rem; color:var(--dim); }
p.lede strong { color:var(--fg); font-weight:600; }
.stats { display:flex; gap:2rem; flex-wrap:wrap; margin-top:1.7rem; }
.stat b { display:block; font-size:1.25rem; font-weight:650; letter-spacing:-.02em; }
.stat span { font-size:.82rem; color:var(--dim); }
.livedot { display:inline-block; width:.5em; height:.5em; border-radius:50%; background:var(--live); margin-right:.45em; }
table { width:100%; border-collapse:collapse; font-size:.93rem; }
th { text-align:left; font-size:.74rem; text-transform:uppercase; letter-spacing:.06em; color:var(--faint); font-weight:600; padding:.5rem .8rem .5rem 0; border-bottom:1px solid var(--line); }
td { padding:.62rem .8rem .62rem 0; border-bottom:1px solid var(--line); vertical-align:top; }
tr:hover td { background:var(--soft); }
.scroll { overflow-x:auto; }
.feed { list-style:none; }
.feed li { display:flex; gap:1.1rem; padding:.7rem 0; border-bottom:1px solid var(--line); align-items:baseline; flex-wrap:wrap; }
.feed .date { flex:0 0 7.2rem; }
.pill { font-size:.74rem; padding:.12rem .55rem; border:1px solid var(--line); border-radius:99px; color:var(--dim); white-space:nowrap; }
.delta { white-space:nowrap; }
.delta .a { color:var(--add-fg); } .delta .r { color:var(--del-fg); }
.empty { border:1px dashed var(--line); border-radius:10px; padding:1.4rem 1.5rem; color:var(--dim); max-width:44rem; }
.diff { border:1px solid var(--line); border-radius:10px; overflow:hidden; margin:1.1rem 0; }
.diff .hunkhead { padding:.35rem .9rem; background:var(--soft); color:var(--faint); border-top:1px solid var(--line); }
.diff .hunkhead:first-child { border-top:0; }
.diff pre { margin:0; overflow-x:auto; }
.diff .ln { display:block; padding:.13rem .9rem; white-space:pre-wrap; word-break:break-word; }
.diff .add { background:var(--add-bg); color:var(--add-fg); }
.diff .del { background:var(--del-bg); color:var(--del-fg); }
.label-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(15rem,1fr)); gap:1rem; margin-top:1rem; }
.label-card { border:1px solid var(--line); border-radius:10px; padding:1rem 1.1rem; }
.label-card h3 { font-size:.92rem; font-weight:650; margin-bottom:.5rem; }
.label-card ul { list-style:none; font-size:.86rem; color:var(--dim); }
.label-card li { padding:.12rem 0; }
.crumbs { font-size:.85rem; color:var(--dim); margin-bottom:1.1rem; }
.doclist td:first-child { min-width:13rem; }
footer.site { border-top:1px solid var(--line); }
footer.site .wrap { padding:1.4rem 22px 2.2rem; font-size:.84rem; color:var(--dim); display:flex; gap:1.4rem; flex-wrap:wrap; }
.note { font-size:.88rem; color:var(--dim); max-width:44rem; }
.about h2 { margin-top:2.2rem; }
.about p, .about ul { max-width:44rem; margin-bottom: .9rem; }
.about ul { padding-left:1.2rem; }
.about li { margin-bottom:.4rem; }
`;

// --------------------------------------------------------------- shell ----
const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#111"/><path d="M8 10h16M8 16h16M8 22h10" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>`
  );

function page({ title, desc, path, active, body }) {
  const navLink = (href, label, key) =>
    `<a href="${href}"${active === key ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${path}">
<link rel="icon" href="${FAVICON}">
<link rel="alternate" type="application/rss+xml" title="ScanRecords changes" href="${SITE}/feed.xml">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="top"><div class="wrap">
  <a class="wm plain" href="/">Scan<span class="half">Records</span></a>
  <nav class="site">
    ${navLink("/", "Changes", "home")}
    ${navLink("/companies/", "Companies", "companies")}
    ${navLink("/about/", "About", "about")}
    <a href="${REPO}">GitHub</a>
  </nav>
</div></header>
<main><div class="wrap">
${body}
</div></main>
<footer class="site"><div class="wrap">
  <span>No cookies, no analytics, no accounts — nothing to consent to.</span>
  <a href="/about/">Method</a>
  <a href="/legal.html">Legal &amp; privacy</a>
  <a href="${REPO}/blob/main/POLICY.md">Editorial policy</a>
  <a href="/feed.xml">RSS</a>
</div></footer>
</body>
</html>`;
}

// ------------------------------------------------------------ fragments ----
function feedRow(e) {
  const what =
    e.kind === "baseline"
      ? `first recording`
      : `<span class="delta mono"><span class="a">+${e.added}</span> <span class="r">−${e.removed}</span></span>`;
  const target = e.kind === "baseline" ? `/company/${e.slug}/` : `/change/${e.id}/`;
  return `<li>
    <span class="date mono dim">${fmtDate(e.date)}</span>
    <span><a href="${target}"><strong>${esc(e.company)}</strong></a> — ${esc(e.docTitle)}</span>
    <span class="pill">${e.kind === "label-change" ? "App Store label" : e.kind === "baseline" ? "baseline" : "document"}</span>
    <span style="margin-left:auto">${what}</span>
  </li>`;
}

function companyRow(c) {
  const a = archive.get(c.slug) ?? { docs: new Map(), label: null };
  const evts = (changesBySlug.get(c.slug) ?? []).filter((e) => e.kind !== "baseline");
  const last = evts[0];
  const status = last
    ? `<a href="/change/${last.id}/">changed ${fmtDate(last.date)}</a>`
    : `<span class="dim">quiet since baseline</span>`;
  return `<tr>
    <td><a href="/company/${c.slug}/"><strong>${esc(c.name)}</strong></a></td>
    <td class="dim">${a.docs.size} tracked${a.docs.size !== c.docs.length ? "" : ""}</td>
    <td>${a.label ? `<span class="mono dim">✓</span>` : `<span class="faint">—</span>`}</td>
    <td>${status}</td>
  </tr>`;
}

const PRIVACY_ORDER = ["DATA_USED_TO_TRACK_YOU", "DATA_LINKED_TO_YOU", "DATA_NOT_LINKED_TO_YOU", "DATA_NOT_COLLECTED"];
function labelCards(label) {
  const items = [...label].sort(
    (x, y) => PRIVACY_ORDER.indexOf(x.identifier) - PRIVACY_ORDER.indexOf(y.identifier)
  );
  return `<div class="label-grid">${items
    .map((t) => {
      const cats = (t.categories ?? []).concat(
        (t.purposes ?? []).flatMap((p) => p.categories ?? [])
      );
      const names = [...new Set(cats.map((c) => c.title))];
      return `<div class="label-card">
        <h3>${esc(t.title)}</h3>
        ${names.length ? `<ul>${names.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : `<ul><li class="faint">No data declared</li></ul>`}
      </div>`;
    })
    .join("")}</div>`;
}

// ---------------------------------------------------------------- pages ----
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "style.css"), CSS.trim() + "\n");

// index — the change feed
{
  const recent = realChanges.slice(0, 40);
  const feed = recent.length
    ? `<ul class="feed">${recent.map(feedRow).join("")}</ul>`
    : `<div class="empty">No changes recorded since the baseline of ${fmtDate(baselineDate)}.
       Quiet is the point — the moment a tracked document changes, the change appears here
       with its full before and after.</div>`;
  const body = `
  <h1>What communication platforms say they do with your messages — recorded daily.</h1>
  <p class="lede">ScanRecords keeps a public archive of the privacy policies, terms of service,
  encryption claims and App Store privacy labels of <strong>${companies.length} communication
  platforms</strong> serving EU users. When a sentence changes, the record shows
  <strong>what changed and when</strong>, with the before and after preserved.</p>
  <div class="stats">
    <div class="stat"><b>${companies.length}</b><span>companies</span></div>
    <div class="stat"><b>${docCount}</b><span>documents</span></div>
    <div class="stat"><b>${labelCount}</b><span>App Store labels</span></div>
    <div class="stat"><b>${fmtDate(baselineDate)}</b><span>recording since</span></div>
    <div class="stat"><b><span class="livedot"></span>daily</b><span>last snapshot ${lastFetch ? fmtDate(lastFetch) : "—"}</span></div>
  </div>
  <h2>Latest changes</h2>
  ${feed}
  <p class="note" style="margin-top:1rem">Baseline: ${fmtDate(baselineDate)} — ${docCount} documents
  and ${labelCount} labels first recorded. Every snapshot since is a commit in the
  <a href="${REPO}">public repository</a>; nothing here can be silently rewritten, including by us.</p>
  <h2>Tracked companies</h2>
  <div class="scroll"><table>
    <thead><tr><th>Company</th><th>Documents</th><th>App label</th><th>Status</th></tr></thead>
    <tbody>${companies.map(companyRow).join("")}</tbody>
  </table></div>`;
  writeFileSync(
    join(OUT, "index.html"),
    page({
      title: "ScanRecords — the policy change archive",
      desc: "A public, daily archive of the privacy policies, terms and App Store privacy labels of communication platforms serving EU users. Every change recorded, with the before and after.",
      path: "/", active: "home", body,
    })
  );
}

// companies index
{
  const body = `
  <h1>Tracked companies</h1>
  <p class="lede">${companies.length} platforms, ${docCount} documents, ${labelCount} App Store labels —
  snapshotted daily at 06:17 UTC.</p>
  <div class="scroll" style="margin-top:1.6rem"><table>
    <thead><tr><th>Company</th><th>Documents</th><th>App label</th><th>Status</th></tr></thead>
    <tbody>${companies.map(companyRow).join("")}</tbody>
  </table></div>
  ${blocked.length ? `<h2>Currently untrackable</h2>
  <p class="note">These pages block automated archiving; the block itself is the recorded fact.</p>
  <div class="scroll"><table><thead><tr><th>Target</th><th>Reason</th></tr></thead><tbody>
  ${blocked.map((b) => `<tr><td>${esc(b.name)}</td><td class="dim">${esc(b.reason)}</td></tr>`).join("")}
  </tbody></table></div>` : ""}`;
  mkdirSync(join(OUT, "companies"), { recursive: true });
  writeFileSync(
    join(OUT, "companies", "index.html"),
    page({ title: "Tracked companies — ScanRecords", desc: "Every platform tracked by the ScanRecords archive.", path: "/companies/", active: "companies", body })
  );
}

// company pages
for (const c of companies) {
  const a = archive.get(c.slug) ?? { docs: new Map(), label: null, labelMeta: null };
  const evts = changesBySlug.get(c.slug) ?? [];
  const real = evts.filter((e) => e.kind !== "baseline");
  const docRows = c.docs
    .map((d) => {
      const m = a.docs.get(d.id) ?? {};
      const flagged = m.note ? ` <span class="pill" title="${esc(m.note)}">limited</span>` : "";
      return `<tr>
        <td><strong>${esc(d.title)}</strong>${flagged}<br>
            <a class="dim" href="${esc(d.url)}">${esc(new URL(d.url).hostname)}</a></td>
        <td class="mono dim">${m.fetchedAt ? fmtDate(m.fetchedAt) : "—"}</td>
        <td class="mono dim">${m.textChars ? m.textChars.toLocaleString("en-US") + " chars" : "—"}</td>
        <td class="mono faint" title="SHA-256 of extracted text">${m.textHash ? m.textHash.slice(0, 12) : "—"}</td>
        <td><a class="dim" href="/archive/${c.slug}/${d.id}.txt">text</a> · <a class="dim" href="/archive/${c.slug}/${d.id}.html">html</a></td>
      </tr>`;
    })
    .join("");
  const timeline = evts.length
    ? `<ul class="feed">${evts.slice(0, 60).map(feedRow).join("")}</ul>`
    : `<div class="empty">Nothing recorded yet.</div>`;
  const body = `
  <p class="crumbs"><a href="/companies/">Companies</a> / ${esc(c.name)}</p>
  <h1>${esc(c.name)}</h1>
  <p class="lede">${c.docs.length} document${c.docs.length === 1 ? "" : "s"} tracked${a.label ? " · App Store privacy label tracked" : ""}${real.length ? ` · ${real.length} change${real.length === 1 ? "" : "s"} recorded` : " · no changes since baseline"}.</p>
  ${c.docs.length ? `<h2>Tracked documents</h2>
  <div class="scroll"><table class="doclist">
    <thead><tr><th>Document</th><th>Last fetched</th><th>Size</th><th>Hash</th><th>Snapshot</th></tr></thead>
    <tbody>${docRows}</tbody>
  </table></div>` : `<p class="note">No policy pages are currently trackable for this company — see <a href="/companies/">why</a>. ${a.label ? "Its App Store label is tracked below." : ""}</p>`}
  ${a.label ? `<h2>App Store privacy label${a.labelMeta?.app ? ` <span class="dim" style="font-weight:400">— ${esc(a.labelMeta.app)}</span>` : ""}</h2>
  <p class="note">Apple requires every app to declare the data it collects. This is ${esc(c.name)}'s current declaration, as shown on the App Store; ScanRecords records when it changes.</p>
  ${labelCards(a.label)}` : ""}
  <h2>Record</h2>
  ${timeline}`;
  mkdirSync(join(OUT, "company", c.slug), { recursive: true });
  writeFileSync(
    join(OUT, "company", c.slug, "index.html"),
    page({
      title: `${c.name} — ScanRecords`,
      desc: `Recorded policy documents and App Store privacy label for ${c.name}: what changed and when.`,
      path: `/company/${c.slug}/`, active: "companies", body,
    })
  );
}

// change pages (diffs)
const CHANGES_DIR = join(ROOT, "changes");
for (const e of realChanges) {
  const detail = loadJSON(join(CHANGES_DIR, `${e.id}.json`), null);
  if (!detail) continue;
  const diffHtml = detail.hunks
    .map(
      (h) => `<div class="hunkhead mono">${esc(h.header)}</div><pre>${h.lines
        .map((l) => `<span class="ln mono ${l.t === "+" ? "add" : l.t === "-" ? "del" : ""}">${l.t === " " ? " " : l.t}${esc(l.s)}</span>`)
        .join("")}</pre>`
    )
    .join("");
  const body = `
  <p class="crumbs"><a href="/company/${e.slug}/">${esc(e.company)}</a> / ${esc(e.docTitle)}</p>
  <h1>${esc(e.company)} changed its ${esc(e.docTitle)}</h1>
  <p class="lede">Recorded ${fmtDate(e.date)} —
    <span class="delta mono"><span class="a">+${e.added}</span> lines added, <span class="r">−${e.removed}</span> removed</span>.
    This page shows the exact difference between the previous snapshot and the new one.</p>
  <div class="diff">${diffHtml}</div>
  ${detail.truncated ? `<p class="note">This diff is large and was truncated for display; the complete change is preserved in the <a href="${REPO}/commits/main">repository history</a>.</p>` : ""}
  <p class="note">Removed lines are how the document read before; added lines are how it reads now.
  Verify independently: the snapshot files and their history are in the <a href="${REPO}">public repository</a>.</p>`;
  mkdirSync(join(OUT, "change", e.id), { recursive: true });
  writeFileSync(
    join(OUT, "change", e.id, "index.html"),
    page({
      title: `${e.company} — ${e.docTitle} changed ${fmtDate(e.date)} — ScanRecords`,
      desc: `${e.company} changed its ${e.docTitle} on ${fmtDate(e.date)}: +${e.added} lines, −${e.removed} lines. Full before/after recorded.`,
      path: `/change/${e.id}/`, active: "home", body,
    })
  );
}

// about
{
  const body = `<div class="about">
  <h1>About ScanRecords</h1>
  <p class="lede">A public, automated archive of what communication platforms
  say they do with your messages — built so that quiet edits stop being quiet.</p>

  <h2>Why this exists</h2>
  <p>Under the EU's ePrivacy derogation (extended to April 2028), scanning of
  private communications is <em>voluntary</em>: each provider decides for itself
  whether to scan. That decision is rarely announced. When it appears anywhere,
  it appears as a small edit to a policy document.</p>
  <p>Nobody was keeping the record, and a record like this cannot be
  reconstructed later — measurements of ${fmtDate(baselineDate)} can only be
  taken on ${fmtDate(baselineDate)}. So the archive records every day, and the
  record keeps itself.</p>

  <h2>What is tracked</h2>
  <ul>
    <li><strong>Privacy policies and terms of service</strong> — where scanning must eventually be disclosed.</li>
    <li><strong>Encryption description pages</strong> — if client-side scanning arrives, the sentence "we cannot read your messages" changes first.</li>
    <li><strong>Law-enforcement and government-request pages</strong>, and <strong>community guidelines</strong>.</li>
    <li><strong>App Store privacy labels</strong> — declared data collection, changed silently, archived by nobody else.</li>
  </ul>

  <h2>Method</h2>
  <ul>
    <li>Every day at 06:17 UTC, a zero-dependency tool fetches each tracked document, extracts its readable text, and stores text, raw HTML, and a SHA-256 hash.</li>
    <li>A snapshot is committed <strong>only when the extracted text actually changed</strong> — presentation churn is filtered, so every recorded change is a real change.</li>
    <li>Git history is the timestamped, tamper-evident record. The <a href="${REPO}">repository</a> is public: anyone can re-run the tools and verify any snapshot.</li>
    <li>Fetches identify themselves as <span class="mono">ScanRecordsBot</span>. When a site blocks the bot, the block is recorded before any workaround is considered.</li>
  </ul>

  <h2>What this is not</h2>
  <p>ScanRecords publishes <strong>observations, not conclusions</strong>. A recorded
  change means the document changed — nothing more. Interpretation is left to the
  reader; a platform's presence in the archive implies nothing about its behavior.
  Corrections, vendor responses and takedown requests follow the fixed
  <a href="${REPO}/blob/main/POLICY.md">editorial policy</a>.</p>

  <h2>Limitations</h2>
  <ul>
    <li>Some pages render their content only with JavaScript; plain fetches archive the server response and are flagged <span class="mono">limited</span>.</li>
    <li>The archive records what platforms <em>say</em>, not what their software <em>does</em>. Behavioral measurement is a separate project.</li>
  </ul>

  <h2>Contact</h2>
  <p>Open an issue on <a href="${REPO}/issues">GitHub</a>.</p>
  </div>`;
  mkdirSync(join(OUT, "about"), { recursive: true });
  writeFileSync(
    join(OUT, "about", "index.html"),
    page({ title: "About — ScanRecords", desc: "Why ScanRecords exists, what it tracks, and how the archive works.", path: "/about/", active: "about", body })
  );
}

// feed.xml — real changes only, plus a launch item
{
  const items = realChanges.slice(0, 50).map(
    (e) => `<item>
  <title>${esc(`${e.company} changed its ${e.docTitle}`)}</title>
  <link>${SITE}/change/${e.id}/</link>
  <guid isPermaLink="true">${SITE}/change/${e.id}/</guid>
  <pubDate>${new Date(e.date + "T06:30:00Z").toUTCString()}</pubDate>
  <description>${esc(`+${e.added} lines added, −${e.removed} removed. Full before/after recorded.`)}</description>
</item>`
  );
  items.push(`<item>
  <title>ScanRecords is recording</title>
  <link>${SITE}/</link>
  <guid isPermaLink="true">${SITE}/#baseline</guid>
  <pubDate>${new Date(baselineDate + "T12:00:00Z").toUTCString()}</pubDate>
  <description>Baseline recorded: ${docCount} documents and ${labelCount} App Store labels across ${companies.length} communication platforms. Daily snapshots from here on.</description>
</item>`);
  writeFileSync(
    join(OUT, "feed.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>ScanRecords — policy changes</title>
<link>${SITE}</link>
<description>Recorded changes to the policies of communication platforms serving EU users.</description>
<language>en</language>
${items.join("\n")}
</channel></rss>
`
  );
}

// static passthroughs
cpSync(join(ROOT, "archive"), join(OUT, "archive"), { recursive: true });
cpSync(join(ROOT, "robots.txt"), join(OUT, "robots.txt"));
cpSync(join(ROOT, ".well-known"), join(OUT, ".well-known"), { recursive: true });
if (existsSync(join(ROOT, "legal.html"))) cpSync(join(ROOT, "legal.html"), join(OUT, "legal.html"));

const pages = [];
(function count(dir) {
  for (const f of readdirSync(dir, { withFileTypes: true }))
    f.isDirectory() ? count(join(dir, f.name)) : f.name.endsWith(".html") && pages.push(1);
})(OUT);
console.log(`built ${pages.length} pages → public/`);
