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

// ---------------------------------------------------------------- data ----
const config = loadJSON(join(ROOT, "companies.json"), { companies: [] });
const { companies, blocked = [] } = config;
const ASSESSED = config.assessed ?? "2026-07-26";
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

// Chat Control status taxonomy. Order = display order (most to least concerning).
// The distinction that matters: scanning under the EU derogation itself vs.
// scanning globally under US law (NCMEC/PhotoDNA) — they are not the same thing.
const STATUS = {
  confirmed: { label: "Scans in the EU under Chat Control", cls: "st-scans",
    verdict: "Scanning in the EU — confirmed",
    blurb: "Evidence of scanning under the EU derogation itself: named in the European Commission's implementation reporting, or the company publishes an EU-specific transparency report under Regulation 2021/1232." },
  global: { label: "Scans globally — no EU evidence", cls: "st-global",
    verdict: "Scans under US law · no EU evidence",
    blurb: "Their documents disclose content scanning under US law (NCMEC reporting, PhotoDNA). No evidence found that they invoke the EU derogation for private communications — US-law scanning and Chat Control are separate regimes." },
  unclear: { label: "No clear statement", cls: "st-unclear",
    verdict: "Won't say",
    blurb: "Not end-to-end encrypted, and no clear public statement about scanning private communications was found either way." },
  denies: { label: "States it does not scan", cls: "st-denies",
    verdict: "Says it doesn't scan",
    blurb: "The company publicly states that it does not scan message content." },
  e2ee: { label: "End-to-end encrypted — out of scope", cls: "st-e2ee",
    verdict: "Can't read your messages",
    blurb: "Content is end-to-end encrypted; E2EE communications are formally excluded from Chat Control's voluntary scanning." },
};
const groups = Object.keys(STATUS).map((k) => ({
  key: k, ...STATUS[k],
  companies: companies.filter((c) => (c.chatControl?.status ?? "unclear") === k),
}));

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
a:focus-visible { outline:2px solid var(--fg); outline-offset:2px; border-radius:2px; }
.skip { position:absolute; left:-9999px; }
.skip:focus { left:12px; top:10px; z-index:10; background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:.5rem .9rem; }
.mono { font-family:ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace; font-size:.86em; }
.dim { color:var(--dim); } .faint { color:var(--faint); }
.wrap { max-width:66rem; margin:0 auto; padding:0 22px; }
header.top { border-bottom:1px solid var(--line); }
header.top .wrap { display:flex; align-items:baseline; gap:1.4rem; padding-top:18px; padding-bottom:14px; flex-wrap:wrap; }
.wm { font-weight:650; letter-spacing:-.02em; font-size:1.05rem; }
.wm .half { color:var(--dim); font-weight:500; }
nav.site { display:flex; gap:1.1rem; font-size:.92rem; color:var(--dim); margin-left:auto; flex-wrap:wrap; }
nav.site a[aria-current] { color:var(--fg); }
main { padding:2.6rem 0 3.5rem; }
h1 { font-size:1.7rem; letter-spacing:-.025em; line-height:1.25; font-weight:650; max-width:46rem; }
h2 { font-size:1.02rem; font-weight:650; letter-spacing:.01em; margin:2.6rem 0 .9rem; }
p.lede { font-size:1.06rem; max-width:44rem; margin-top:.9rem; color:var(--dim); }
p.lede strong { color:var(--fg); font-weight:600; }
.stats { display:flex; gap:2rem; flex-wrap:wrap; margin-top:1.7rem; }
.stat b { display:block; font-size:1.25rem; font-weight:650; letter-spacing:-.02em; }
.stat span { font-size:.82rem; color:var(--dim); }
.livedot { display:inline-block; width:.5em; height:.5em; border-radius:50%; background:var(--live); margin-right:.45em; }
.dot { display:inline-block; width:.55em; height:.55em; border-radius:50%; margin-right:.5em; background:var(--faint); }
.st-scans .dot { background:var(--del-fg); }
.st-global .dot { background:transparent; box-shadow:inset 0 0 0 1.5px var(--del-fg); }
.st-e2ee .dot { background:var(--live); }
.st-denies .dot { background:transparent; box-shadow:inset 0 0 0 1.5px var(--live); }
.st-unclear .dot { background:var(--faint); }
.chips { display:flex; flex-wrap:wrap; gap:.55rem; margin:.9rem 0 .4rem; }
.chip { display:inline-flex; align-items:center; border:1px solid var(--line); border-radius:10px; padding:.5rem .85rem; font-size:.93rem; font-weight:550; text-decoration:none !important; }
.chip:hover { background:var(--soft); }
.quote { border-left:3px solid var(--line); padding:.35rem 0 .35rem .9rem; margin-top:.6rem; color:var(--dim); font-style:italic; }
.quote .who { font-style:normal; font-size:.82rem; color:var(--faint); }
.legend { display:flex; flex-wrap:wrap; gap:.6rem; margin-top:1.6rem; }
.legend a { border:1px solid var(--line); border-radius:99px; padding:.3rem .85rem; font-size:.86rem; color:var(--dim); text-decoration:none; }
.legend a b { color:var(--fg); font-weight:650; }
.grouphead { display:flex; align-items:baseline; gap:.8rem; flex-wrap:wrap; }
.grouphead .count { color:var(--faint); font-weight:400; }
p.groupnote { font-size:.88rem; color:var(--dim); max-width:44rem; margin:-.3rem 0 .8rem; }
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
.banner { border:1px solid var(--line); border-left-width:4px; border-radius:10px; padding:1rem 1.2rem; margin:1.5rem 0; max-width:46rem; }
.banner.st-scans { border-left-color:var(--del-fg); }
.banner.st-global { border-left-color:var(--del-fg); border-left-style:dashed; }
.banner.st-e2ee, .banner.st-denies { border-left-color:var(--live); }
.banner.st-unclear { border-left-color:var(--faint); }
.banner .srcs { font-size:.85rem; color:var(--dim); margin-top:.55rem; }
.diff { border:1px solid var(--line); border-radius:10px; overflow:hidden; margin:1.1rem 0; }
.diff .hunkhead { padding:.35rem .9rem; background:var(--soft); color:var(--faint); border-top:1px solid var(--line); }
.diff .hunkhead:first-child { border-top:0; }
.diff pre { margin:0; overflow-x:auto; }
.diff .ln { display:block; padding:.13rem .9rem; white-space:pre-wrap; word-break:break-word; }
.diff .add { background:var(--add-bg); color:var(--add-fg); }
.diff .del { background:var(--del-bg); color:var(--del-fg); }
.cite { background:var(--soft); border:1px solid var(--line); border-radius:10px; padding:1rem 1.2rem; max-width:46rem; overflow-wrap:anywhere; }
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
.about p, .about ul { max-width:44rem; margin-bottom:.9rem; }
.about ul { padding-left:1.2rem; }
.about li { margin-bottom:.4rem; }
@media print {
  header.top nav, footer.site, .legend, .skip { display:none !important; }
  body { font-size:12px; }
  main { padding:0; }
  a { text-decoration:none !important; }
  .diff, .banner, .cite { break-inside:avoid-page; border-color:#bbb; }
}

/* ——— v2 design layer ——— */
.wrap { max-width:72rem; }
h1 { font-size:clamp(2rem, 4.4vw, 3.2rem); line-height:1.07; letter-spacing:-.032em; max-width:58rem; }
h2 { font-size:1.28rem; letter-spacing:-.015em; }
p.lede { font-size:1.12rem; line-height:1.62; }
main { padding-top:1.8rem; }
.hero { background:#0a0c0f; color:#f4f4f4; border:1px solid #1d2128; border-radius:20px;
  padding:clamp(1.8rem, 4.5vw, 3.4rem); position:relative; overflow:hidden; }
.hero::before { content:""; position:absolute; inset:0; pointer-events:none;
  background:repeating-linear-gradient(0deg, transparent 0 3px, rgba(255,255,255,.02) 3px 4px); }
.hero .beam { position:absolute; left:0; right:0; top:-22%; height:16%; pointer-events:none;
  background:linear-gradient(180deg, transparent, rgba(87,196,111,.04), rgba(87,196,111,.13), transparent);
  animation:scan 8s cubic-bezier(.45,0,.55,1) infinite; }
@keyframes scan { 0% { top:-22% } 60% { top:108% } 100% { top:108% } }
@media (prefers-reduced-motion:reduce) { .hero .beam { display:none; } }
.hero .eyebrow { font-size:.78rem; letter-spacing:.14em; text-transform:uppercase; color:#8b949e;
  display:flex; align-items:center; gap:.15rem; margin-bottom:1.3rem; }
.hero h1 { color:#ffffff; }
.hero p.lede { color:#a6adb5; max-width:47rem; }
.hero a { text-decoration-color:#5a6470; }
.hero a:hover { text-decoration-color:#fff; }
.bar { display:flex; height:13px; border-radius:99px; overflow:hidden; margin:2.1rem 0 1.1rem;
  border:1px solid rgba(255,255,255,.09); background:#14171c; }
.bar i { display:block; }
.seg-confirmed { background:#e35d66; }
.seg-global { background:repeating-linear-gradient(135deg, #e35d66 0 5px, rgba(227,93,102,.22) 5px 9px); }
.seg-unclear { background:#3a3f45; }
.seg-denies { background:repeating-linear-gradient(135deg, #3fae5c 0 5px, rgba(63,174,92,.22) 5px 9px); }
.seg-e2ee { background:#3fae5c; }
.bignums { display:flex; gap:clamp(1.3rem, 3.5vw, 2.8rem); flex-wrap:wrap; margin-top:.4rem; }
.bignums a { text-decoration:none !important; }
.bignums a:hover span { color:#d7dce1; }
.bignums b { display:block; font-size:2rem; font-weight:680; letter-spacing:-.03em; line-height:1.15; }
.bignums span { font-size:.82rem; color:#98a0a8; }
.n-red { color:#ef7078; } .n-redsoft { color:rgba(239,112,120,.72); }
.n-gray { color:#9aa2aa; } .n-greensoft { color:rgba(87,196,111,.72); } .n-green { color:#57c46f; }
.grouphead { margin-top:3rem; }
.cards { display:grid; grid-template-columns:repeat(auto-fill, minmax(232px, 1fr)); gap:.8rem; margin:1.1rem 0 .4rem; }
.card { display:flex; align-items:center; gap:.9rem; border:1px solid var(--line); border-radius:14px;
  padding:.95rem 1.05rem; text-decoration:none !important;
  transition:transform .12s ease, box-shadow .12s ease, border-color .12s ease; }
.card:hover { transform:translateY(-2px); box-shadow:0 10px 26px rgb(0 0 0 / .14); border-color:var(--faint); }
.mg { flex:0 0 42px; width:42px; height:42px; border-radius:50%; display:grid; place-items:center;
  font-weight:700; font-size:1.06rem; background:var(--soft); border:2px solid var(--faint); }
.st-scans .mg { border-color:var(--del-fg); }
.st-global .mg { border-color:var(--del-fg); border-style:dashed; }
.st-e2ee .mg { border-color:var(--live); }
.st-denies .mg { border-color:var(--live); border-style:dashed; }
.st-unclear .mg { border-color:var(--faint); }
.card .nm { font-weight:640; font-size:.98rem; }
.card .vd { font-size:.8rem; color:var(--dim); }
.st-scans .vd, .st-global .vd { color:var(--del-fg); }
.st-e2ee .vd, .st-denies .vd { color:var(--live); }
@media print { .hero .beam { display:none; } .hero { background:#fff; color:#000; border-color:#bbb; }
  .hero h1 { color:#000; } .hero p.lede { color:#333; } }
`;

// --------------------------------------------------------------- shell ----
const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#111"/><path d="M8 10h16M8 16h16M8 22h10" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>`
  );

const SITEMAP = [];

function page({ title, desc, path, active, body }) {
  SITEMAP.push(path);
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
<meta property="og:type" content="website">
<meta property="og:site_name" content="ScanRecords">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}/og.png">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="wrap">
  <a class="wm plain" href="/">Scan<span class="half">Records</span></a>
  <nav class="site">
    ${navLink("/", "Changes", "home")}
    ${navLink("/companies/", "Companies", "companies")}
    ${navLink("/chat-control/", "Chat Control", "cc")}
    ${navLink("/about/", "About", "about")}
    ${navLink("/data/", "Data", "data")}
    <a href="${REPO}">GitHub</a>
  </nav>
</div></header>
<main id="main"><div class="wrap">
${body}
</div></main>
<footer class="site"><div class="wrap">
  <span>No cookies, no analytics, no accounts — nothing to consent to.</span>
  <a href="/about/">Method</a>
  <a href="/legal">Legal &amp; privacy</a>
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
    <td class="dim">${a.docs.size ? `${a.docs.size} tracked` : `<span title="Policy pages block archiving">blocked</span>`}</td>
    <td>${a.label ? `<span class="mono dim">✓</span>` : `<span class="faint">—</span>`}</td>
    <td>${status}</td>
  </tr>`;
}

function legend() {
  return `<div class="legend">${groups
    .map((g) => `<a class="${g.cls}" href="#${g.key}"><span class="dot"></span><b>${g.companies.length}</b> ${g.label}</a>`)
    .join("")}</div>`;
}

function groupedTables() {
  return groups
    .map(
      (g) => `
  <h2 class="grouphead" id="${g.key}"><span class="${g.cls}"><span class="dot"></span>${g.label}</span> <span class="count">${g.companies.length}</span></h2>
  <p class="groupnote">${g.blurb}</p>
  <div class="scroll"><table>
    <thead><tr><th>Company</th><th>Documents</th><th>App label</th><th>Last change</th></tr></thead>
    <tbody>${g.companies.map(companyRow).join("")}</tbody>
  </table></div>`
    )
    .join("");
}

/** The checker: per-status card grids — the fastest possible "find your app". */
const shortName = (c) => c.name.split(" (")[0];
function groupedCards() {
  return groups
    .map(
      (g) => `
  <h2 class="grouphead" id="${g.key}"><span class="${g.cls}"><span class="dot"></span>${g.label}</span> <span class="count">${g.companies.length}</span></h2>
  <p class="groupnote">${g.blurb}</p>
  <div class="cards">${g.companies
    .map((c) => `<a class="card ${g.cls}" href="/company/${c.slug}/">
      <span class="mg" aria-hidden="true">${esc(shortName(c)[0])}</span>
      <span><span class="nm">${esc(shortName(c))}</span><br><span class="vd">${g.verdict}</span></span>
    </a>`)
    .join("")}</div>`
    )
    .join("");
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

// index — the checker + the change feed
{
  const recent = realChanges.slice(0, 40);
  const feed = recent.length
    ? `<ul class="feed">${recent.map(feedRow).join("")}</ul>`
    : `<div class="empty">No changes recorded since the baseline of ${fmtDate(baselineDate)}.
       Quiet is the point — the moment a tracked document changes, the change appears here
       with its full before and after.</div>`;
  const body = `
  <section class="hero">
    <div class="beam" aria-hidden="true"></div>
    <div class="eyebrow"><span class="livedot"></span> A public record — updated daily at 06:17 UTC</div>
    <h1>Is your messaging app scanning under the EU's Chat&nbsp;Control?</h1>
    <p class="lede">Chat Control lets providers <strong>voluntarily scan private messages</strong>
    in the EU until April 2028. Each company decides for itself — and end-to-end encrypted apps
    are excluded. We track ${companies.length} platforms and record what their own documents and
    EU filings actually say. <a href="/chat-control/">How this works →</a></p>
    <div class="bar" role="img" aria-label="Of ${companies.length} tracked platforms: ${groups.map((g) => `${g.companies.length} ${g.label.toLowerCase()}`).join(", ")}">
      ${groups.map((g) => `<i class="seg-${g.key}" style="flex:${g.companies.length}"></i>`).join("")}
    </div>
    <div class="bignums">
      <a href="#confirmed"><b class="n-red">${groups[0].companies.length}</b><span>scan in the EU</span></a>
      <a href="#global"><b class="n-redsoft">${groups[1].companies.length}</b><span>scan under US law only</span></a>
      <a href="#unclear"><b class="n-gray">${groups[2].companies.length}</b><span>won't say</span></a>
      <a href="#denies"><b class="n-greensoft">${groups[3].companies.length}</b><span>says it doesn't</span></a>
      <a href="#e2ee"><b class="n-green">${groups[4].companies.length}</b><span>can't — E2EE</span></a>
    </div>
  </section>
  ${groupedCards()}
  <p class="note" style="margin-top:1.2rem">Statuses assessed ${fmtDate(ASSESSED)} from public
  records — <strong>they describe what companies say and file, not measurements of their
  software</strong>. Full table with tracked documents: <a href="/companies/">companies</a>.
  Wrong about your company? <a href="${REPO}/issues">Dispute it</a> — disputes are published.</p>
  <h2>Latest changes</h2>
  <p class="groupnote">Every tracked document is re-fetched daily; when one changes, the change
  appears here with its full before and after. That is how a status change would be caught.</p>
  ${feed}
  <p class="note" style="margin-top:1rem">Baseline: ${fmtDate(baselineDate)} — ${docCount} documents
  and ${labelCount} App Store labels across ${companies.length} companies. Every snapshot is a
  commit in the <a href="${REPO}">public repository</a>; nothing here can be silently rewritten,
  including by us.</p>
  <div class="stats" style="margin-top:2rem">
    <div class="stat"><b>${companies.length}</b><span>companies</span></div>
    <div class="stat"><b>${docCount}</b><span>documents</span></div>
    <div class="stat"><b>${labelCount}</b><span>App Store labels</span></div>
    <div class="stat"><b>${fmtDate(baselineDate)}</b><span>recording since</span></div>
    <div class="stat"><b><span class="livedot"></span>daily</b><span>last snapshot ${lastFetch ? fmtDate(lastFetch) : "—"}</span></div>
  </div>`;
  writeFileSync(
    join(OUT, "index.html"),
    page({
      title: "ScanRecords — is your app scanning under the EU's Chat Control?",
      desc: "Check what your messaging app's own documents say about scanning under the EU's Chat Control — recorded daily, every change preserved with its before and after.",
      path: "/", active: "home", body,
    })
  );
}

// companies index
{
  const body = `
  <h1>Tracked companies</h1>
  <p class="lede">${companies.length} platforms, ${docCount} documents, ${labelCount} App Store labels —
  snapshotted daily at 06:17 UTC. Statuses assessed ${fmtDate(ASSESSED)};
  <a href="/chat-control/">how they're assigned</a>.</p>
  ${legend()}
  ${groupedTables()}
  ${blocked.length ? `<h2>Currently untrackable</h2>
  <p class="note">These pages block automated archiving; the block itself is the recorded fact.</p>
  <div class="scroll"><table><thead><tr><th>Target</th><th>Reason</th></tr></thead><tbody>
  ${blocked.map((b) => `<tr><td>${esc(b.name)}</td><td class="dim">${esc(b.reason)}</td></tr>`).join("")}
  </tbody></table></div>` : ""}`;
  mkdirSync(join(OUT, "companies"), { recursive: true });
  writeFileSync(
    join(OUT, "companies", "index.html"),
    page({ title: "Tracked companies — ScanRecords", desc: "Every platform tracked by the ScanRecords archive, grouped by what their own documents say about scanning.", path: "/companies/", active: "companies", body })
  );
}

// company pages
for (const c of companies) {
  const a = archive.get(c.slug) ?? { docs: new Map(), label: null, labelMeta: null };
  const evts = changesBySlug.get(c.slug) ?? [];
  const real = evts.filter((e) => e.kind !== "baseline");
  const cc = c.chatControl ?? { status: "unclear", note: "", sources: [] };
  const st = STATUS[cc.status] ?? STATUS.unclear;
  const srcs = (cc.sources ?? [])
    .map((s) => `<a href="${esc(s.u)}">${esc(s.t)}</a>`)
    .join(" · ");
  const banner = `
  <div class="banner ${st.cls}">
    <strong><span class="dot"></span>${st.label}</strong>
    <span class="dim"> — assessed ${fmtDate(ASSESSED)}</span>
    <div style="margin-top:.45rem">${esc(cc.note)}</div>
    ${cc.quote ? `<div class="quote">“${esc(cc.quote)}” <span class="who">— from ${esc(c.name)}'s ${esc(cc.quoteDoc ?? "own documents")}, as archived here</span></div>` : ""}
    <div class="srcs">${srcs ? `Sources: ${srcs} · ` : ""}<a href="/chat-control/">what this status means</a> · <a href="${REPO}/issues">dispute it</a></div>
  </div>`;
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
  ${banner}
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
      title: `${c.name}: ${st.label} — ScanRecords`,
      desc: `${c.name} under the EU's Chat Control: ${st.label.toLowerCase()}. ${cc.note}`,
      path: `/company/${c.slug}/`, active: "companies", body,
    })
  );
}

// change pages (diffs)
const CHANGES_DIR = join(ROOT, "changes");
for (const e of realChanges) {
  const detail = loadJSON(join(CHANGES_DIR, `${e.id}.json`), null);
  if (!detail) continue;
  const a = archive.get(e.slug);
  const meta = e.kind === "label-change" ? a?.labelMeta : a?.docs.get(e.doc);
  const hash = meta?.labelHash ?? meta?.textHash ?? null;
  const srcUrl = meta?.finalUrl ?? meta?.url ?? null;
  const diffHtml = detail.hunks
    .map(
      (h) => `<div class="hunkhead mono">${esc(h.header)}</div><pre>${h.lines
        .map((l) => `<span class="ln mono ${l.t === "+" ? "add" : l.t === "-" ? "del" : ""}">${l.t === " " ? " " : l.t}${esc(l.s)}</span>`)
        .join("")}</pre>`
    )
    .join("");
  const wayback = srcUrl
    ? `<p class="note">Independent copy: whenever a change is recorded, the Internet Archive is asked to
       capture the source page the same day — <a href="https://web.archive.org/web/${e.date.replaceAll("-", "")}*/${esc(srcUrl)}">find the same-day Wayback capture</a>.</p>`
    : "";
  const body = `
  <p class="crumbs"><a href="/company/${e.slug}/">${esc(e.company)}</a> / ${esc(e.docTitle)}</p>
  <h1>${esc(e.company)} changed its ${esc(e.docTitle)}</h1>
  <p class="lede">Recorded ${fmtDate(e.date)} —
    <span class="delta mono"><span class="a">+${e.added}</span> lines added, <span class="r">−${e.removed}</span> removed</span>.
    This page shows the exact difference between the previous snapshot and the new one.</p>
  <div class="diff">${diffHtml}</div>
  ${detail.truncated ? `<p class="note">This diff is large and was truncated for display; the complete change is preserved in the <a href="${REPO}/commits/main">repository history</a>.</p>` : ""}
  <p class="note">Removed lines are how the document read before; added lines are how it reads now.
  Verify independently: the snapshot files and their history are in the <a href="${REPO}">public repository</a>.</p>
  ${wayback}
  <h2>Cite this record</h2>
  <div class="cite mono" style="font-size:.85rem">ScanRecords. “${esc(e.company)} changed its ${esc(e.docTitle)}.” Recorded ${fmtDate(e.date)}. ${SITE}/change/${e.id}/${hash ? ` — snapshot SHA-256 (after): ${hash}.` : "."}</div>`;
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

// chat-control explainer
{
  const body = `<div class="about">
  <h1>The EU's Chat Control, and what these statuses mean</h1>
  <p class="lede">The short version: scanning of private communications in the EU is currently
  <strong>voluntary, per provider</strong> — and end-to-end encrypted messengers are excluded.
  So the practical question is what each provider chooses, and says, on its own.</p>

  <h2>What Chat Control is</h2>
  <p>The ePrivacy derogation (Regulation 2021/1232, widely called <strong>"Chat Control
  1.0"</strong>) permits — but does not require — communication providers to scan private
  messages for child sexual abuse material. It lapsed in April 2026, was reinstated by the
  Council and survived a European Parliament rejection vote in July 2026, and now runs
  until <strong>April 2028</strong>. An amendment adopted alongside it formally
  <strong>excludes end-to-end encrypted communications</strong> from its scope.</p>
  <p>A separate, permanent regulation (the CSA Regulation, <strong>"Chat Control 2.0"</strong>),
  which could make detection mandatory, remains under negotiation between the Council and
  Parliament. It is not law. If that changes, what these pages track — and this page —
  will change with it.</p>
  <p class="note">Background reading:
  <a href="https://www.euronews.com/my-europe/2026/07/23/eu-temporarily-extends-controversial-chat-scanning-regime-until-2028">Euronews</a> ·
  <a href="https://fightchatcontrol.eu/">fightchatcontrol.eu</a> ·
  <a href="https://edri.org/our-work/csa-regulation-document-pool/">EDRi's document pool</a></p>

  <h2>Who actually uses it</h2>
  <p>Providers that scan under the derogation must report on it, and the European Commission
  publishes <a href="https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A52025DC0740">implementation
  reports</a> naming them. That is the strongest evidence there is, and it points to a
  <strong>small group</strong>: ${groups.find((g) => g.key === "confirmed").companies.map((c) => `<a href="/company/${c.slug}/">${esc(c.name)}</a>`).join(", ")}.
  Some also publish EU-specific transparency reports of their own, like
  <a href="https://storage.googleapis.com/transparencyreport/report-downloads/pdf-report-23_2021-8-2_2021-12-31_en_v1.pdf">Google's report under Regulation 2021/1232</a> and
  <a href="https://www.microsoft.com/en/digitalsafety/transparency-reports/jurisdictional-reports">Microsoft's jurisdictional reports</a> — both now tracked by this archive.</p>

  <h2>Scanning under US law is not Chat Control</h2>
  <p>Most large US platforms scan uploads for known abuse material and report to
  <a href="https://www.missingkids.org/cybertiplinedata">NCMEC</a> — that is a <strong>US legal
  regime</strong>, and it says nothing about whether a company invokes the EU derogation to scan
  private communications of EU users. This site keeps the two separate: a filled red dot means
  EU evidence; a hollow red dot means US-law scanning with no EU evidence found. Conflating the
  two overstates the record, so we don't.</p>

  <h2>The five statuses</h2>
  <ul>
    ${groups.map((g) => `<li><span class="${g.cls}"><span class="dot"></span><strong>${g.label}</strong></span> — ${g.blurb}</li>`).join("")}
  </ul>

  <h2>How statuses are assigned</h2>
  <ul>
    <li>In order of strength: the Commission's implementation reports → a company's own
    EU-specific transparency reporting → its policies and security pages (which this site
    snapshots daily, and quotes where relevant) → US reporting data as context only.</li>
    <li>They are <strong>observations of what companies say and file, not measurements of what
    their software does</strong>. Behavioral measurement is a different and harder project.</li>
    <li>Each status was last assessed on ${fmtDate(ASSESSED)} and is reviewed when the
    underlying documents change — which is exactly what the daily snapshots watch for.</li>
    <li>Companies can dispute a status by <a href="${REPO}/issues">opening an issue</a>;
    per the <a href="${REPO}/blob/main/POLICY.md">editorial policy</a>, disputes and
    responses are published.</li>
  </ul>

  <h2>What would change a status</h2>
  <p>Their own words. If a provider switches scanning on — or an encrypted messenger weakens
  the sentence "we cannot read your messages" — it has to surface in the documents this site
  records every morning. When it does, the change appears on the
  <a href="/">front page</a> with its full before and after, and the status gets re-assessed.</p>
  </div>`;
  mkdirSync(join(OUT, "chat-control"), { recursive: true });
  writeFileSync(
    join(OUT, "chat-control", "index.html"),
    page({
      title: "What is the EU's Chat Control? — ScanRecords",
      desc: "Chat Control in plain terms: voluntary scanning until April 2028, E2EE excluded — and how ScanRecords assigns each platform's status.",
      path: "/chat-control/", active: "cc", body,
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
  <p>Under the EU's <a href="/chat-control/">Chat Control</a> derogation (extended to April
  2028), scanning of private communications is <em>voluntary</em>: each provider decides for
  itself whether to scan. That decision is rarely announced. When it appears anywhere,
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
    <li>When a change is recorded, the <strong>Internet Archive</strong> is asked to capture the source page the same day — an independent, third-party timestamp of the same document.</li>
    <li>Fetches identify themselves as <span class="mono">ScanRecordsBot</span>. When a site blocks the bot, the block is recorded before any workaround is considered.</li>
  </ul>

  <h2>What this is not</h2>
  <p>ScanRecords publishes <strong>observations, not conclusions</strong>. A recorded
  change means the document changed — nothing more. Interpretation is left to the
  reader. Corrections, vendor responses and takedown requests follow the fixed
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

// data page
{
  const body = `<div class="about">
  <h1>Data</h1>
  <p class="lede">Everything this site knows is a plain file you can fetch. Build alerts,
  dashboards, research — no key, no rate card, no account.</p>
  <div class="scroll"><table>
    <thead><tr><th>Endpoint</th><th>What it is</th></tr></thead><tbody>
    <tr><td class="mono"><a href="/history.json">/history.json</a></td><td class="dim">Every recorded event, newest first: company, document, date, kind, +/− line counts, change id.</td></tr>
    <tr><td class="mono"><a href="/companies.json">/companies.json</a></td><td class="dim">The tracked targets, their documents, App Store ids, and Chat Control statuses with sources.</td></tr>
    <tr><td class="mono">/archive/&lt;company&gt;/&lt;doc&gt;.txt</td><td class="dim">Current extracted text of a tracked document (also <span class="mono">.html</span> raw, <span class="mono">.meta.json</span> provenance).</td></tr>
    <tr><td class="mono">/archive/&lt;company&gt;/appstore-label.json</td><td class="dim">Current App Store privacy label, canonicalized.</td></tr>
    <tr><td class="mono"><a href="/feed.xml">/feed.xml</a></td><td class="dim">RSS of recorded changes.</td></tr>
    <tr><td class="mono"><a href="/sitemap.xml">/sitemap.xml</a></td><td class="dim">Every page.</td></tr>
    </tbody></table></div>
  <h2>Example</h2>
  <div class="cite mono" style="font-size:.85rem">curl -s ${SITE}/history.json | head</div>
  <h2>History and provenance</h2>
  <p>Full version history of every file lives in the <a href="${REPO}">public git repository</a> —
  each daily snapshot is a commit. The generated data files above are public domain (CC0);
  archived documents remain the property of their owners, preserved as a public-interest record.</p>
  </div>`;
  mkdirSync(join(OUT, "data"), { recursive: true });
  writeFileSync(
    join(OUT, "data", "index.html"),
    page({ title: "Data — ScanRecords", desc: "The whole archive as plain JSON and text endpoints. No key, no account.", path: "/data/", active: "data", body })
  );
}

// 404
writeFileSync(
  join(OUT, "404.html"),
  page({
    title: "Not in the record — ScanRecords",
    desc: "This page is not in the record.",
    path: "/404", active: "none",
    body: `<h1>Not in the record.</h1>
  <p class="lede">Whatever was here, we have no snapshot of it.</p>
  <p class="note"><a href="/">Latest changes</a> · <a href="/companies/">Tracked companies</a> · <a href="/about/">About</a></p>`,
  })
);
SITEMAP.pop(); // 404 is not a sitemap entry

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

// sitemap.xml
{
  const lastmod = (lastFetch ?? new Date().toISOString()).slice(0, 10);
  writeFileSync(
    join(OUT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${SITEMAP.map((p) => `<url><loc>${SITE}${p}</loc><lastmod>${lastmod}</lastmod></url>`).join("\n")}
</urlset>
`
  );
}

// static passthroughs
cpSync(join(ROOT, "archive"), join(OUT, "archive"), { recursive: true });
cpSync(join(ROOT, "robots.txt"), join(OUT, "robots.txt"));
cpSync(join(ROOT, ".well-known"), join(OUT, ".well-known"), { recursive: true });
cpSync(join(ROOT, "history.json"), join(OUT, "history.json"));
cpSync(join(ROOT, "companies.json"), join(OUT, "companies.json"));
if (existsSync(join(ROOT, "assets", "og.png"))) cpSync(join(ROOT, "assets", "og.png"), join(OUT, "og.png"));
if (existsSync(join(ROOT, "legal.html"))) cpSync(join(ROOT, "legal.html"), join(OUT, "legal.html"));

const pages = [];
(function count(dir) {
  for (const f of readdirSync(dir, { withFileTypes: true }))
    f.isDirectory() ? count(join(dir, f.name)) : f.name.endsWith(".html") && pages.push(1);
})(OUT);
console.log(`built ${pages.length} pages → public/`);
