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
const { companies, blocked = [], institutions = [] } = config;
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

// Per-company OG share cards (rendered locally by tools/make-og-cards.swift).
// The manifest records which status each card was drawn with — on drift the
// page falls back to the generic card rather than sharing a stale verdict.
const OG_CARDS = loadJSON(join(ROOT, "assets", "og", "cards.json"), {});

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
  confirmed: { label: "Scans under the EU's Chat Control", cls: "st-scans",
    verdict: "Scans under Chat Control — confirmed",
    blurb: "The derogation's mandatory reports exist only for providers actually scanning private communications under it. Exactly five filed them, for both 2023 and 2024, per the Commission's own implementation report — this is Chat Control use, documented by the EU itself." },
  global: { label: "Scans globally — no EU evidence", cls: "st-global",
    verdict: "Scans under US law · no EU evidence",
    blurb: "Their documents disclose content scanning under US law (NCMEC reporting, PhotoDNA). No evidence found that they invoke the EU derogation for private communications — US-law scanning and Chat Control are separate regimes. Absence of evidence is a fact about the public record, not proof of absence: a provider could scan and not disclose it." },
  unclear: { label: "No clear statement", cls: "st-unclear",
    verdict: "Won't say",
    blurb: "Not end-to-end encrypted, and no clear public statement about scanning private communications was found either way. Silence measures disclosure, not behavior." },
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

// ------------------------------------------------------------- content ----
// Figures below are extracted from COM(2025) 740, the Commission's
// implementation report on Regulation 2021/1232 (charts and error table).
const N_REPORTS = [["2022", 1.5], ["2023", 1.34], ["2024", 0.95]]; // millions
const N_FILES = [["2022", 7.7], ["2023", 32.3], ["2024", 106.1]]; // millions
const N_TYPE = [["2022", 1015.2, 325.8, 68], ["2023", 831.7, 351.7, 62], ["2024", 344.2, 393.5, 36]]; // thousands + chat share %
const N_ERRORS = [
  ["Google", "1.14% (18 : 1,576)", "0.54% (10 : 1,834)", "Items automatically flagged as CSAM that human review did not confirm — hash-matching technology."],
  ["LinkedIn", "0% (0 : 0)", "0% (0 : 0)", "Account actions reversed relative to appeals against account restrictions."],
  ["Meta", "0.32% (11,600 : 3.6M)", "0.12% (1,800 : 1.5M)", "Content items restored and account actions reversed relative to actioned items."],
  ["Microsoft", "n/a", "n/a", "“Microsoft indicated that the data was insufficient to calculate an error rate.”"],
];

const NOTES = [
  {
    slug: "one-app-two-stories", date: "2026-07-26",
    title: "One app, two stories: what the same apps tell Apple and Google",
    teaser: "We now archive both stores' privacy declarations. For several apps, the two disagree — recorded verbatim, with the caveats the comparison needs.",
    body: `
<p>As of today the archive records every tracked app's privacy self-declaration in <em>both</em> stores:
Apple's App&nbsp;Store privacy label and Google&nbsp;Play's Data&nbsp;Safety section. Same app, same developer,
two mandatory disclosures — which makes disagreements between them visible for the first time. Three examples,
quoted from today's captures:</p>
<p><strong><a href="/company/tuta/">Tuta</a></strong> tells Apple: <em>"The developer does not collect any data from
this app"</em> — the App Store's strongest possible declaration. Its Play listing, the same day, declares data
<em>collected</em> (email address, user IDs, optional contacts) and data <em>shared</em> (payment info).</p>
<p><strong><a href="/company/threema/">Threema</a></strong> is the mirror image: on Play, <em>"this app doesn't
collect or share any user data"</em>; on the App Store, "Data Linked to You" — contact info and identifiers,
plus diagnostics.</p>
<p><strong><a href="/company/x/">X</a></strong> tells Play <em>"this app doesn't share user data with other
companies or organizations"</em>, while its Apple label declares "Data Used to Track You" across seven
categories, from location to browsing history — and Apple defines tracking as linking or sharing user data
with data brokers and advertisers.</p>
<p>Now the caveats, because they matter. The two stores force <strong>different taxonomies</strong>: Google's
"sharing" definition exempts transfers to service providers and several other cases; Apple's categories cut
the world differently; and an iOS build can genuinely differ from an Android build. A discrepancy is therefore
not proof that anyone is lying — it may be honest platform differences, definitional gaps, or one stale form.
What it <em>is</em>, in every case: two public claims about the same product that do not say the same thing.</p>
<p>That is exactly the kind of fact this archive exists to hold. Both declarations are now fetched daily,
hashed, and diffed — so when either side of any of these pairs quietly changes, the change becomes a dated,
citable event. The raw captures: <a href="/archive/tuta/appstore-label.json">Tuta/Apple</a> ·
<a href="/archive/tuta/play-safety.txt">Tuta/Play</a> · <a href="/archive/threema/appstore-label.json">Threema/Apple</a> ·
<a href="/archive/threema/play-safety.txt">Threema/Play</a> · <a href="/archive/x/appstore-label.json">X/Apple</a> ·
<a href="/archive/x/play-safety.txt">X/Play</a>.</p>
<p class="note">The quotes above are the declarations <em>as archived on 26 July 2026</em>. The links point
at the archive's live copies, which keep updating — if one no longer matches its quote here, that means the
declaration changed after this note was written, and the change will be in <a href="/changes/">the record</a>
with its date. A note frozen in time plus an archive that moves is the design, not a defect.</p>`,
  },
  {
    slug: "archiving-the-law-itself", date: "2026-07-26",
    title: "The law's own pages are in the archive now",
    teaser: "Companies aren't the only ones who quietly edit. The Commission's policy page and the Parliament's 2.0 tracker are now recorded daily, under the same rules.",
    body: `
<p>Every target in this archive so far has been a company: privacy policies, security pages, App Store labels.
As of today there are two exceptions — <a href="/company/eu-commission/">the European Commission</a> and
<a href="/company/eu-parliament/">the European Parliament</a>. Not because they scan anything, but because
they write the rules, and what they <em>say</em> about the rules lives on web pages that can be edited
like anyone else's.</p>
<p>Two documents joined the daily snapshot: DG&nbsp;HOME's
<a href="https://home-affairs.ec.europa.eu/policies/internal-security/child-sexual-abuse_en">child sexual abuse policy page</a> —
the Commission's own framing of what "voluntary detection" is and why it should continue — and the Parliament's
<a href="https://www.europarl.europa.eu/legislative-train/theme-promoting-our-european-way-of-life/file-combating-child-sexual-abuse-online">legislative-train file</a>
for the draft CSA Regulation, the page that tracks how close "Chat Control 2.0" is to becoming law.
If the framing shifts, or the draft lurches toward mandatory scanning, the edit becomes a dated, diffable, citable event.</p>
<p>One detail worth recording: the Parliament's status tracker sits behind an anti-bot wall. Our archiver
identifies itself honestly by default, and for that it received a challenge page instead of the content;
only a browser identity got through. A page that exists to tell the public where a surveillance law stands
is defended against automated reading. We note it without further comment — the note is the comment.</p>
<p>The same rules apply as everywhere else in the archive: fetched daily at 06:17&nbsp;UTC, hashed, diffed,
committed to public git history, never edited after capture. Institutions get no scanning status —
they aren't providers — but they get the same tripwire. <a href="/chat-control/">The explainer</a> shows
where these pages fit in the larger machine.</p>`,
  },
  {
    slug: "on-the-list-not-in-the-reports", date: "2026-07-26",
    title: "On the list, but not in the reports: Snapchat and Apple",
    teaser: "Two names appear among services said to scan under the derogation — and don't appear among the five providers that filed the mandatory reports.",
    body: `
<p>Two sources answer the question "who scans under Chat Control", and they don't quite agree.</p>
<p>MEP Patrick Breyer's long-running <a href="https://www.patrick-breyer.de/en/posts/chat-control/">tracking page</a> says that
<em>"only unencrypted US communication services such as Gmail, Facebook/Instagram Messenger, Skype, Snapchat, iCloud Mail, or Xbox"</em>
make use of the derogation. The European Commission's implementation report,
<a href="https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A52025DC0740">COM(2025)&nbsp;740</a>, names the providers that
filed the reports the regulation makes mandatory: <em>"Google, LinkedIn, Meta, Microsoft and Yubo submitted reports, for both 2023 and 2024."</em></p>
<p>Snapchat and Apple's iCloud Mail are on the first list and absent from the second. There are several possible explanations —
scanning stopped, scanning continues under a different legal analysis, or reporting simply didn't happen — and the public record
doesn't say which. So their pages on this site show both facts, side by side, and nothing more.</p>
<p>This is what the archive is for: not to resolve every question, but to make sure the discrepancy itself is recorded, dated,
and citable. If either company clarifies, the record will show when.</p>`,
  },
  {
    slug: "five-providers-verbatim", date: "2026-07-26",
    title: "Five providers, verbatim",
    teaser: "The Commission's report names exactly who files under Chat Control. The list is shorter than most people assume.",
    body: `
<p>Providers that scan under the ePrivacy derogation don't just get permission — they get homework. Article 3(1)(g)(vii) of
Regulation 2021/1232 requires each of them to publish and submit an annual report on their processing of personal data,
to their supervisory authority and to the Commission.</p>
<p>The Commission's latest implementation report, <a href="https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A52025DC0740">COM(2025)&nbsp;740</a>
(27 November 2025), states it plainly: <em>"Google, LinkedIn, Meta, Microsoft and Yubo submitted reports, for both 2023 and 2024."</em></p>
<p>Five companies. Not the hundreds that people sometimes imagine when they hear "the EU scans your messages" — and not zero,
either. The same report carries the providers' own error ratios and the volumes flowing through the system;
we've put those on <a href="/numbers/">the numbers page</a>.</p>
<p>Every status on this site follows from evidence of this kind, in order of strength: the Commission's reporting first,
companies' own EU filings second, their policies third. When someone asks how we know who scans — this sentence is how.</p>`,
  },
  {
    slug: "why-scanrecords-exists", date: "2026-07-26",
    title: "Why this archive exists",
    teaser: "Voluntary scanning means the decision lives in quiet policy edits. A baseline recorded today cannot be reconstructed later.",
    body: `
<p>Chat Control 1.0 makes scanning <em>voluntary</em>. That one word moves the entire question out of law and into
corporate policy: each provider decides, and the decision surfaces — if it surfaces anywhere — as a quiet edit to a
privacy policy, a security page, or an App Store label.</p>
<p>Quiet edits have a property that matters: they can only be caught by someone who recorded the page <em>before</em>.
A baseline of 26 July 2026 can only be taken on 26 July 2026. Wait a year, and the evidence of what companies said
today is gone.</p>
<p>So the archive records every day: ${docCount} documents and ${labelCount} App Store privacy labels across
${companies.length} platforms, snapshotted at 06:17 UTC, committed to a public git history, with the Internet Archive
asked to capture changed sources the same day. Observations, not conclusions — and every claim linked to what it
stands on.</p>
<p>The data is CC0. Build alerts on it, write about it, prove us wrong with it: <a href="/data/">scanrecords.org/data</a>.</p>`,
  },
];

const GLOSSARY = [
  ["Chat Control", "The colloquial name for two EU instruments: the ePrivacy derogation in force ('1.0', voluntary scanning, until April 2028) and the draft CSA Regulation ('2.0', potentially mandatory detection). Most confusion about Chat Control comes from mixing them up."],
  ["Derogation report (Article 3(1)(g)(vii))", "The transparency report the derogation itself requires from every provider that scans under it — no scanning, nothing to file. This is why filing one is the strongest public evidence of Chat Control use, and it is a different thing from DSA transparency reports, which all large platforms must publish whether they scan private messages or not. The Commission's COM(2025) 740 names exactly five filers for 2023 and 2024: Google, LinkedIn, Meta, Microsoft, Yubo."],
  ["ePrivacy derogation (Regulation 2021/1232)", "The exception to EU confidentiality rules that lets providers voluntarily scan private communications for child sexual abuse material. Reinstated in July 2026 and in force until April 2028; end-to-end encrypted communications are formally excluded."],
  ["CSA Regulation (“Chat Control 2.0”)", "The proposed permanent regulation (2022) whose detection orders could make scanning mandatory, including via scanning on the user's device. Still in negotiation; not law."],
  ["End-to-end encryption (E2EE)", "Encryption where only the communicating devices hold the keys — the provider cannot read message content, so it has nothing meaningful to scan server-side. Signal, WhatsApp, Threema, Olvid, Wire and Element use it by default."],
  ["Client-side scanning", "Scanning content on the user's device before encryption is applied. The mechanism by which mandatory detection could reach E2EE apps, and the central controversy of Chat Control 2.0."],
  ["Hash matching", "Comparing a fingerprint (hash) of an image or video against a database of known abuse material. Detects only previously identified content; the most established scanning method, and the one Google's error figures refer to."],
  ["PhotoDNA", "Microsoft's perceptual hash-matching technology (2009), licensed widely across the industry. A perceptual hash survives resizing and small edits, unlike an exact file hash."],
  ["Classifier", "A machine-learning model that flags previously unseen content as potentially abusive. Catches new material, at the cost of a higher false-positive risk than hash matching."],
  ["NCMEC / CyberTipline", "The US National Center for Missing & Exploited Children and its reporting pipeline. US law requires providers to report detected material there — a US regime, distinct from the EU derogation, though NCMEC reports about EU users appear in the Commission's statistics."],
  ["Detection order", "Under the draft 2.0 regulation, a binding order requiring a specific service to scan for specific material. The mechanism that would turn scanning from voluntary into mandatory."],
  ["Trilogue", "The closed-door negotiation between the Council, Parliament and Commission that produces the final text of EU law. The 2.0 trilogue collapsed over suspicionless scanning in June 2026 and continues."],
  ["Metadata", "Who talked to whom, when, how often, from where. Not protected by E2EE and not the subject of Chat Control scanning — but revealing enough that it deserves its own scrutiny."],
];

// --------------------------------------------------------------- style ----
// The CSP forbids inline styles (style-src 'self', no unsafe-inline), so every
// style must live in this stylesheet — data-driven values are interpolated at
// build time (bar segment flexes) or registered as width classes (wcls below).
const segFlex = Object.fromEntries(groups.map((g) => [g.key, g.companies.length]));
const WIDTHS = new Map();
function wcls(pct) {
  const val = pct.toFixed(1);
  const name = "w" + val.replace(".", "-");
  WIDTHS.set(name, val);
  return name;
}
const CSS = `
@font-face { font-family:"Space Grotesk"; src:url("/fonts/space-grotesk-500.woff2") format("woff2");
  font-weight:500; font-style:normal; font-display:swap; }
@font-face { font-family:"Space Grotesk"; src:url("/fonts/space-grotesk-700.woff2") format("woff2");
  font-weight:700; font-style:normal; font-display:swap; }
:root { color-scheme: light dark;
  --bg:#ffffff; --fg:#111111; --dim:#6b6b6b; --faint:#9a9a9a;
  --line:#e6e6e6; --soft:#f7f7f7; --live:#137333;
  --add-bg:#e9f5ec; --add-fg:#0f6a2f; --del-bg:#fdedee; --del-fg:#a52833;
  --warn-bg:#faf3e3; --warn-fg:#9a6a12; }
@media (prefers-color-scheme: dark) { :root {
  --bg:#0a0a0a; --fg:#ebebeb; --dim:#9a9a9a; --faint:#6f6f6f;
  --line:#1e1e1e; --soft:#121212; --live:#4ccb6f;
  --add-bg:rgba(46,160,67,.14); --add-fg:#57c46f; --del-bg:rgba(248,81,73,.13); --del-fg:#ef7078;
  --warn-bg:rgba(217,154,43,.13); --warn-fg:#d9a03f; } }
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
.st-global .dot { background:transparent; box-shadow:inset 0 0 0 1.5px var(--warn-fg); }
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
.banner.st-global { border-left-color:var(--warn-fg); border-left-style:dashed; }
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
.hero p.lede strong { color:#f4f4f4; }
.hero a { text-decoration-color:#5a6470; }
.hero a:hover { text-decoration-color:#fff; }
.bar { display:flex; height:13px; border-radius:99px; overflow:hidden; margin:2.1rem 0 1.1rem;
  border:1px solid rgba(255,255,255,.09); background:#14171c; }
.bar i { display:block; }
.seg-confirmed { flex:${segFlex.confirmed}; background:#e35d66; }
.seg-global { flex:${segFlex.global}; background:repeating-linear-gradient(135deg, #d9a03f 0 5px, rgba(217,160,63,.22) 5px 9px); }
.seg-unclear { flex:${segFlex.unclear}; background:#3a3f45; }
.seg-denies { flex:${segFlex.denies}; background:repeating-linear-gradient(135deg, #3fae5c 0 5px, rgba(63,174,92,.22) 5px 9px); }
.seg-e2ee { flex:${segFlex.e2ee}; background:#3fae5c; }
.bignums { display:flex; gap:clamp(1.3rem, 3.5vw, 2.8rem); flex-wrap:wrap; margin-top:.4rem; }
.bignums a { text-decoration:none !important; }
.bignums a:hover span { color:#d7dce1; }
.bignums b { display:block; font-size:2rem; font-weight:680; letter-spacing:-.03em; line-height:1.15; }
.bignums span { font-size:.82rem; color:#98a0a8; }
.n-red { color:#ef7078; } .n-amber { color:#d9a03f; }
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
.st-global .mg { border-color:var(--warn-fg); border-style:dashed; }
.st-e2ee .mg { border-color:var(--live); }
.st-denies .mg { border-color:var(--live); border-style:dashed; }
.st-unclear .mg { border-color:var(--faint); }
.card .nm { font-weight:640; font-size:.98rem; }
.card .vd { font-size:.8rem; color:var(--dim); }
.st-scans .vd { color:var(--del-fg); }
.st-global .vd { color:var(--warn-fg); }
.st-e2ee .vd, .st-denies .vd { color:var(--live); }
@media print { .hero .beam { display:none; } .hero { background:#fff; color:#000; border-color:#bbb; }
  .hero h1 { color:#000; } .hero p.lede { color:#333; } }
.idrow { display:flex; align-items:center; gap:1.1rem; margin-top:.3rem; }
.idrow .mg-lg { flex:0 0 62px; width:62px; height:62px; font-size:1.55rem; border-width:2.5px; }
.idrow h1 { font-size:clamp(1.8rem, 3.4vw, 2.4rem); line-height:1.1; }
.idrow .idvd { font-size:.95rem; font-weight:550; }
.trust { display:flex; gap:.6rem 2rem; flex-wrap:wrap; border:1px solid var(--line); border-radius:14px;
  padding:1.05rem 1.3rem; margin-top:2.6rem; font-size:.88rem; color:var(--dim); }
.trust b { color:var(--fg); font-weight:600; }
.heroeye { display:none; }
@media (min-width:1180px) {
  .hero:not(.cc-hero) { padding-right:330px; }
  .heroeye { display:block; position:absolute; right:clamp(1.5rem, 4vw, 3.6rem); top:50%;
    transform:translateY(-50%); width:250px; }
  .heroeye svg { width:100%; height:auto; display:block; }
}
.cc-hero { margin-bottom:2.2rem; }
.cc-grid { display:flex; align-items:center; justify-content:space-between; gap:2.4rem; flex-wrap:wrap; position:relative; }
.cc-grid > div:first-child { flex:1 1 30rem; }
.cc-eye { flex:0 1 300px; min-width:210px; margin-inline:auto; }
.cc-eye svg { width:100%; height:auto; display:block; }
.tl { list-style:none; padding-left:0; max-width:46rem; margin:1.2rem 0; }
.tl li { position:relative; padding:.42rem 0 .42rem 1.7rem; border-left:2px solid var(--line); margin-left:.4rem; }
.tl li::before { content:""; position:absolute; left:-6px; top:.95rem; width:10px; height:10px;
  border-radius:50%; background:var(--bg); border:2px solid var(--faint); }
.tl li:last-child::before { border-color:var(--live); }
.tl b { font-family:ui-monospace, "SF Mono", Menlo, monospace; font-size:.82em; color:var(--dim); margin-right:.35rem; }
.cmp td:first-child { white-space:nowrap; }
.cmp th:nth-child(2), .cmp td:nth-child(2) { padding-right:1.4rem; }
main details { border:1px solid var(--line); border-radius:12px; padding:.85rem 1.1rem; margin:.6rem 0; max-width:46rem; }
main details summary { cursor:pointer; font-weight:600; }
main details summary::marker { color:var(--faint); }
main details[open] summary { margin-bottom:.5rem; }
main details p { color:var(--dim); }
.sources { list-style:none; padding-left:0 !important; }
.sources li { padding:.45rem 0; border-bottom:1px solid var(--line); }

/* ——— v3: typeface, charts, footer, tints ——— */
.wm, h1, h2, h3, .bignums b, .stat b, .step b, .bigcard h3 {
  font-family:"Space Grotesk", -apple-system, BlinkMacSystemFont, system-ui, sans-serif; }
h1 { font-weight:700; }
.st-scans .mg { background:var(--del-bg); }
.st-global .mg { background:var(--warn-bg); }
.st-e2ee .mg, .st-denies .mg { background:var(--add-bg); }
.chart { max-width:46rem; margin:1.1rem 0 1.6rem; }
.crow { display:grid; grid-template-columns:6.5rem 1fr 6rem; gap:.9rem; align-items:center; padding:.22rem 0; font-size:.9rem; }
.crow .track { background:var(--soft); border:1px solid var(--line); border-radius:6px; height:22px; position:relative; overflow:hidden; }
.crow .fill { position:absolute; inset:0 auto 0 0; border-radius:5px; background:var(--del-fg); opacity:.85; }
.crow .fill.g2 { background:var(--dim); }
.crow .val { text-align:right; }
.crow-sub { margin-top:-.1rem; }
.lgd { display:inline-block; width:.85em; height:.85em; border-radius:3px; vertical-align:-.1em; margin-right:.35em; }
.steps { display:grid; grid-template-columns:repeat(auto-fit, minmax(215px, 1fr)); gap:1rem; margin:1.2rem 0 .4rem; }
.step { border-left:2px solid var(--line); padding:.15rem 0 .15rem 1rem; font-size:.92rem; color:var(--dim); }
.step b { display:block; color:var(--fg); margin-bottom:.25rem; }
.bigcards { display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:.9rem; margin:1.1rem 0 .4rem; }
.bigcard { border:1px solid var(--line); border-radius:14px; padding:1.15rem 1.25rem; text-decoration:none !important;
  transition:transform .12s ease, box-shadow .12s ease, border-color .12s ease; }
.bigcard:hover { transform:translateY(-2px); box-shadow:0 10px 26px rgb(0 0 0 / .12); border-color:var(--faint); }
.bigcard h3 { font-size:1.02rem; margin-bottom:.35rem; }
.bigcard p { font-size:.87rem; color:var(--dim); }
.notes-list { list-style:none; }
.notes-list li { display:flex; gap:1.2rem; padding:.85rem 0; border-bottom:1px solid var(--line); }
.notes-list .date { flex:0 0 7.2rem; padding-top:.15rem; }
.gloss dt { font-weight:650; font-family:"Space Grotesk", system-ui, sans-serif; margin-top:1.2rem; }
.gloss dd { color:var(--dim); margin:.25rem 0 0; max-width:44rem; }
footer.site .wrap { display:grid; grid-template-columns:2fr 1fr 1fr 1fr; gap:2.2rem; padding:2.4rem 22px 2.8rem; }
footer.site .fcol h4 { font-size:.76rem; text-transform:uppercase; letter-spacing:.09em; color:var(--faint); margin-bottom:.6rem; font-weight:600; }
footer.site .fcol a { display:block; padding:.17rem 0; text-decoration:none; }
footer.site .fcol a:hover { text-decoration:underline; }
footer.site .fbrand p { font-size:.88rem; max-width:22rem; }
footer.site .feye { width:54px; margin-bottom:.7rem; }
footer.site .feye svg { width:100%; height:auto; display:block; }
@media (max-width:820px) { footer.site .wrap { grid-template-columns:1fr 1fr; gap:1.6rem; } footer.site .fbrand { grid-column:1 / -1; } }
.langmenu { position:relative; }
.langmenu summary { list-style:none; cursor:pointer; color:var(--dim); user-select:none;
  display:inline-flex; align-items:center; gap:.34em; line-height:1;
  font-size:.8rem; font-weight:550; letter-spacing:.02em;
  border:1px solid var(--line); border-radius:8px; padding:.3rem .55rem; }
.langmenu summary:hover { color:var(--fg); border-color:var(--faint); }
.langmenu summary::-webkit-details-marker { display:none; }
.langmenu summary svg { width:.85rem; height:.85rem; display:block; opacity:.75; }
.langmenu summary::after { content:"▾"; font-size:.7em; color:var(--faint); }
.langmenu[open] summary { color:var(--fg); border-color:var(--faint); }
.langmenu .panel { position:absolute; right:0; top:calc(100% + .5rem); z-index:40; min-width:10.5rem;
  background:var(--bg); border:1px solid var(--line); border-radius:12px; padding:.3rem;
  box-shadow:0 14px 40px rgb(0 0 0 / .16); }
.langmenu .panel a { display:flex; align-items:baseline; justify-content:space-between; gap:1.1rem;
  padding:.48rem .75rem; border-radius:8px; color:var(--fg); font-size:.92rem; text-decoration:none !important; }
.langmenu .panel a:hover { background:var(--soft); }
.langmenu .panel a[aria-current] { font-weight:650; }
.langmenu .panel a[aria-current]::after { content:"✓"; color:var(--live); font-size:.85em; }
@media (max-width:700px) {
  header.top .wrap { position:relative; padding-top:14px; padding-bottom:12px; gap:.5rem 1rem; }
  nav.site { width:100%; margin-left:0; gap:.4rem .95rem; font-size:.9rem; padding-right:0; }
  .langmenu { position:absolute; top:12px; right:22px; }
}
.herochips { margin-top:1.7rem; align-items:center; }
.herochips .chiplbl { font-size:.72rem; letter-spacing:.13em; text-transform:uppercase; color:#8b949e; margin-right:.25rem; }
.hero .chip { border-color:rgba(255,255,255,.15); color:#d7dce1; font-size:.86rem; padding:.34rem .72rem; font-weight:500; }
.hero .chip:hover { background:rgba(255,255,255,.08); }
.watchfor { border:1px dashed var(--line); border-radius:12px; padding:.85rem 1.15rem; margin:1.1rem 0 1.5rem;
  font-size:.9rem; color:var(--dim); max-width:46rem; }
.watchfor b { color:var(--fg); font-weight:600; }
.st-inst .dot { background:#34579F; }
.st-inst .mg { border-color:#34579F; background:rgba(52,87,159,.08); }
.banner.st-inst { border-left-color:#34579F; }
.toc { font-size:.88rem; color:var(--dim); margin:1.4rem 0 .2rem; max-width:46rem; line-height:2; }
.toc a { text-decoration-color:var(--faint); }
.stathist { margin-top:-.6rem; margin-bottom:1.4rem; }
/* utilities — the CSP bans style="" attributes, so spacing one-offs live here */
.mt-04 { margin-top:.45rem; } .mt-06 { margin-top:.6rem; } .mt-10 { margin-top:1rem; }
.mt-12 { margin-top:1.2rem; } .mt-14 { margin-top:1.4rem; } .mt-16 { margin-top:1.6rem; } .mt-20 { margin-top:2rem; }
.pl-12 { padding-left:1.2rem; } .va-mid { vertical-align:middle; } .ml-auto { margin-left:auto; }
.fs-85 { font-size:.85rem; } .fs-90 { font-size:.9rem; } .fw-400 { font-weight:400; }
.lgd-chat { background:var(--del-fg); } .lgd-social { background:var(--dim); }
.mailform { display:flex; gap:.6rem; flex-wrap:wrap; max-width:34rem; margin:.9rem 0 1.6rem; }
.mailinput { font:inherit; flex:1 1 14rem; padding:.66rem .9rem; border-radius:10px;
  border:1px solid var(--line); background:var(--bg); color:var(--fg); min-width:0; }
.mailinput:focus-visible { outline:2px solid var(--fg); outline-offset:1px; }
.mailform .btn { margin-right:0; }
.btn { font:inherit; font-weight:600; padding:.7rem 1.25rem; border-radius:10px; cursor:pointer;
  border:1px solid var(--fg); background:var(--fg); color:var(--bg); margin-right:.6rem; }
.btn:hover { opacity:.85; }
.btn[hidden] { display:none; }
#alert-status.st-ok { color:var(--add-fg); }
#alert-status.st-err { color:var(--dim); }
`;

// --------------------------------------------------------------- shell ----
const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#111"/><path d="M4,16 C9,8.6 23,8.6 28,16 C23,23.4 9,23.4 4,16 Z" fill="#fff"/><circle cx="16" cy="16" r="5.4" fill="#34579F"/></svg>`
  );

const SITEMAP = [];

const GLOBE_SVG = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true"><circle cx="8" cy="8" r="6.4"/><ellipse cx="8" cy="8" rx="2.9" ry="6.4"/><path d="M1.9 6h12.2M1.9 10h12.2"/></svg>`;

function page({ title, desc, path, active, body, alt, image, feed }) {
  SITEMAP.push(path);
  const navLink = (href, label, key) =>
    `<a href="${href}"${active === key ? ' aria-current="page"' : ""}>${label}</a>`;
  const alts = alt
    ? { en: path, ...Object.fromEntries(Object.keys(LOCALES).map((c) => [c, "/" + c + alt.slice(3)])) }
    : { en: path };
  const hreflang = alt
    ? Object.entries(alts)
        .map(([c, p]) => `<link rel="alternate" hreflang="${c}" href="${SITE}${p}">`)
        .join("\n") + `\n<link rel="alternate" hreflang="x-default" href="${SITE}${path}">`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${path}">
<link rel="alternate" type="application/rss+xml" title="ScanRecords — recorded changes" href="${SITE}/feed.xml">
<link rel="me" href="https://mastodon.social/@scanrecords_org">
${feed ? `<link rel="alternate" type="application/rss+xml" title="${esc(title)} — changes" href="${SITE}${feed}">` : ""}
${hreflang}
<link rel="icon" href="${FAVICON}">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)">
<link rel="alternate" type="application/rss+xml" title="ScanRecords changes" href="${SITE}/feed.xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ScanRecords">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}${image ?? "/og.png"}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}${image ?? "/og.png"}">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="wrap">
  <a class="wm plain" href="/">Scan<span class="half">Records</span></a>
  <nav class="site">
    ${navLink("/companies/", "Companies", "companies")}
    ${navLink("/chat-control/", "Chat Control", "cc")}
    ${navLink("/numbers/", "Numbers", "numbers")}
    ${navLink("/notes/", "Notes", "notes")}
    ${navLink("/about/", "About", "about")}
    <a href="${REPO}">GitHub</a>
    ${langMenu("en", alts)}
  </nav>
</div></header>
<main id="main"><div class="wrap">
${body}
</div></main>
<footer class="site"><div class="wrap">
  <div class="fcol fbrand">
    <div class="feye" aria-hidden="true">${EYE_SVG}</div>
    <p><strong>ScanRecords</strong> — the Chat Control policy archive.<br>
    Recorded daily. No cookies, no analytics, no accounts — nothing to consent to.</p>
  </div>
  <div class="fcol"><h4>Explore</h4>
    <a href="/">The checker</a><a href="/chat-control/">What is Chat Control?</a>
    <a href="/numbers/">The numbers</a><a href="/notes/">Notes</a><a href="/glossary/">Glossary</a>
    <a href="/switch/">Get out of the scanning</a><a href="/press/">Press &amp; reuse</a>
  </div>
  <div class="fcol"><h4>The record</h4>
    <a href="/companies/">Tracked companies</a><a href="/changes/">All changes</a><a href="/alerts/">Alerts</a>
    <a href="/data/">Data (CC0)</a><a href="${REPO}">GitHub</a><a rel="me" href="https://mastodon.social/@scanrecords_org">Mastodon</a><a href="/feed.xml">RSS</a>
  </div>
  <div class="fcol"><h4>Rules</h4>
    <a href="/about/">Method</a><a href="${REPO}/blob/main/POLICY.md">Editorial policy</a>
    <a href="/legal/">Legal &amp; privacy</a>
  </div>
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
    <span class="ml-auto">${what}</span>
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

/** The Chat Control eye — an eye with the EU flag as its iris. Drawn as SVG
 *  so it stays crisp everywhere and the hero's scan beam can pass over it. */
function euStars(cx, cy, ringR, starR) {
  let out = "";
  for (let k = 0; k < 12; k++) {
    const a = ((k * 30 - 90) * Math.PI) / 180;
    const sx = cx + ringR * Math.cos(a), sy = cy + ringR * Math.sin(a);
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? starR * 0.381 : starR;
      const b = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push((sx + r * Math.cos(b)).toFixed(1) + "," + (sy + r * Math.sin(b)).toFixed(1));
    }
    out += `<polygon points="${pts.join(" ")}" fill="#FFD21F"/>`;
  }
  return out;
}
const EYE_SVG = `<svg viewBox="0 0 560 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An eye with the EU flag as its iris">
<path d="M40,180 C150,62 410,62 520,180 C410,298 150,298 40,180 Z" fill="#ffffff"/>
<circle cx="280" cy="180" r="96" fill="#34579F"/>
${euStars(280, 180, 62, 11)}
</svg>`;

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
// style.css is written at the very end of the build — chart width classes
// register into WIDTHS while pages render and must be appended after.

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
    <div class="heroeye" aria-hidden="true">${EYE_SVG}</div>
    <div class="eyebrow"><span class="livedot"></span> A public record — updated daily at 06:17 UTC</div>
    <h1>Is your messaging app scanning under the EU's Chat&nbsp;Control?</h1>
    <p class="lede">Chat Control lets providers <strong>voluntarily scan private messages</strong>
    in the EU until April 2028. Each company decides for itself — and end-to-end encrypted apps
    are excluded. We track ${companies.length} platforms and record what their own documents and
    EU filings actually say. <a href="/chat-control/">How this works →</a></p>
    <div class="bar" role="img" aria-label="Of ${companies.length} tracked platforms: ${groups.map((g) => `${g.companies.length} ${g.label.toLowerCase()}`).join(", ")}">
      ${groups.map((g) => `<i class="seg-${g.key}"></i>`).join("")}
    </div>
    <div class="bignums">
      <a href="#confirmed"><b class="n-red">${groups[0].companies.length}</b><span>scan under Chat Control</span></a>
      <a href="#global"><b class="n-amber">${groups[1].companies.length}</b><span>scan under US law · no EU evidence</span></a>
      <a href="#unclear"><b class="n-gray">${groups[2].companies.length}</b><span>won't say</span></a>
      <a href="#denies"><b class="n-greensoft">${groups[3].companies.length}</b><span>says it doesn't</span></a>
      <a href="#e2ee"><b class="n-green">${groups[4].companies.length}</b><span>can't — E2EE</span></a>
    </div>
    <div class="chips herochips">
      <span class="chiplbl">Check yours</span>
      ${[["signal", "Signal"], ["whatsapp", "WhatsApp"], ["telegram", "Telegram"], ["google", "Gmail"], ["meta", "Instagram"], ["apple", "iMessage"], ["discord", "Discord"], ["tiktok", "TikTok"]]
        .map(([s, n]) => `<a class="chip" href="/company/${s}/">${n}</a>`).join("\n      ")}
    </div>
  </section>
  ${groupedCards()}
  <p class="note mt-12">Statuses assessed ${fmtDate(ASSESSED)} from public
  records — <strong>they describe what companies say and file, not measurements of their
  software</strong>, and absence of evidence is not evidence of absence: a provider could scan
  without disclosing it. Full table with tracked documents: <a href="/companies/">companies</a>.
  Wrong about your company? <a href="${REPO}/issues">Dispute it</a> — disputes are published.</p>
  <h2>How the record works</h2>
  <div class="steps">
    <div class="step"><b>1 · Snapshot</b>Every tracked policy, security page and App Store label is re-fetched daily at 06:17 UTC.</div>
    <div class="step"><b>2 · Diff</b>A change is committed only when the words actually changed — with the full before and after preserved.</div>
    <div class="step"><b>3 · Witness</b>Each snapshot is a public git commit, and the Internet Archive captures changed sources the same day.</div>
  </div>
  <h2>Go deeper</h2>
  <div class="bigcards">
    <a class="bigcard" href="/numbers/"><h3>The scanners' own numbers →</h3><p>Error ratios, report volumes, and the collapse of chat-scanning reports after Messenger went E2EE — from the Commission's own report.</p></a>
    <a class="bigcard" href="/chat-control/"><h3>What is Chat Control? →</h3><p>The plain-language guide: the timeline, 1.0 vs 2.0, who actually scans, and what it means for your apps.</p></a>
    <a class="bigcard" href="/notes/"><h3>Notes →</h3><p>Short, sourced write-ups from the record — starting with the Snapchat and Apple discrepancy.</p></a>
    <a class="bigcard" href="/alerts/"><h3>Get alerts →</h3><p>A push notification the moment a tracked company moves. No account, no email — install to your Home Screen and subscribe.</p></a>
    <a class="bigcard" href="/switch/"><h3>Get out of the scanning →</h3><p>The practical version: which apps can't read your messages, the backup trap, and why a VPN changes nothing.</p></a>
  </div>
  <h2>Latest changes</h2>
  <p class="groupnote">Every tracked document is re-fetched daily; when one changes, the change
  appears here with its full before and after. That is how a status change would be caught.
  <a href="/changes/">Full record, including every baseline →</a></p>
  ${feed}
  <p class="note mt-10">Baseline: ${fmtDate(baselineDate)} — ${docCount} documents
  and ${labelCount} App Store labels across ${companies.length} companies. Every snapshot is a
  commit in the <a href="${REPO}">public repository</a>; nothing here can be silently rewritten,
  including by us.</p>
  <div class="stats mt-20">
    <div class="stat"><b>${companies.length}</b><span>companies</span></div>
    <div class="stat"><b>${docCount}</b><span>documents</span></div>
    <div class="stat"><b>${labelCount}</b><span>App Store labels</span></div>
    <div class="stat"><b>${fmtDate(baselineDate)}</b><span>recording since</span></div>
    <div class="stat"><b><span class="livedot"></span>daily</b><span>last snapshot ${lastFetch ? fmtDate(lastFetch) : "—"}</span></div>
  </div>
  <div class="trust">
    <span><b>No cookies,</b> no analytics — JavaScript only on the opt-in <a href="/alerts/">alerts page</a></span>
    <span><b>Every snapshot</b> is a public git commit — tamper-evident</span>
    <span><b>Statuses cite their evidence</b> and can be disputed publicly</span>
    <span><b>The data is CC0</b> — <a href="/data/">build on it</a></span>
  </div>`;
  writeFileSync(
    join(OUT, "index.html"),
    page({
      title: "ScanRecords — is your app scanning under the EU's Chat Control?",
      desc: "Check what your messaging app's own documents say about scanning under the EU's Chat Control — recorded daily, every change preserved with its before and after.",
      path: "/", active: "home", body, alt: "/fr/",
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
  ${institutions.length ? `<h2 class="grouphead"><span class="st-inst"><span class="dot"></span>Institutional sources</span> <span class="count">${institutions.length}</span></h2>
  <p class="groupnote">The law's own pages, archived under the same rules as everyone else's —
  no scanning status, because these aren't providers; they're the paper trail.</p>
  <div class="scroll"><table>
    <thead><tr><th>Source</th><th>Documents</th><th>App label</th><th>Last change</th></tr></thead>
    <tbody>${institutions.map(companyRow).join("")}</tbody>
  </table></div>` : ""}
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
// What a status change would look like, per status — rendered on every company
// page so readers know the archive is a tripwire, not a museum.
const WATCH = {
  confirmed: (n) => `${n} files the derogation's transparency reports today. We watch for the reports stopping, scanning language disappearing from these documents, and what replaces the legal basis when the derogation expires in April 2028.`,
  global: (n) => `${n} discloses scanning under US law. We watch for the first sign of the EU regime: a derogation filing, an EU-specific scanning clause in these documents, or its name appearing in the Commission's next implementation report.`,
  unclear: (n) => `${n} has no clear public position. We watch for any statement either way — a scanning disclosure appearing in these documents, or an explicit denial. Either would change this status the day it's published.`,
  denies: (n) => `${n} states that it does not scan. We watch for that language weakening or vanishing — the statement is pinned to the archived text above, so any edit is caught and diffed.`,
  e2ee: (n) => `${n}'s content is end-to-end encrypted, which keeps it out of Chat Control's scope. We watch for weakened encryption claims, client-side scanning language, or new qualifiers around E2EE in these documents.`,
};

for (const c of [...companies, ...institutions]) {
  const inst = !!c.institution;
  const a = archive.get(c.slug) ?? { docs: new Map(), label: null, labelMeta: null };
  const evts = changesBySlug.get(c.slug) ?? [];
  const real = evts.filter((e) => e.kind !== "baseline");
  const cc = c.chatControl ?? { status: "unclear", note: "", sources: [] };
  const st = inst
    ? { label: "Institutional source", cls: "st-inst", verdict: "The law's own paper trail" }
    : STATUS[cc.status] ?? STATUS.unclear;
  const srcs = (cc.sources ?? [])
    .map((s) => `<a href="${esc(s.u)}">${esc(s.t)}</a>`)
    .join(" · ");
  const banner = inst
    ? `
  <div class="banner st-inst">
    <strong><span class="dot"></span>Institutional source — not a provider, no scanning status</strong>
    <div class="mt-04">${esc(c.note)}</div>
    <div class="srcs"><a href="/chat-control/">what Chat Control is</a> · <a href="${REPO}/issues">flag a problem</a></div>
  </div>`
    : `
  <div class="banner ${st.cls}">
    <strong><span class="dot"></span>${st.label}</strong>
    <span class="dim"> — assessed ${fmtDate(ASSESSED)}</span>
    <div class="mt-04">${esc(cc.note)}</div>
    ${cc.quote ? `<div class="quote">“${esc(cc.quote)}” <span class="who">— from ${esc(c.name)}'s ${esc(cc.quoteDoc ?? "own documents")}, as archived here</span></div>` : ""}
    <div class="srcs">${srcs ? `Sources: ${srcs} · ` : ""}<a href="/chat-control/">what this status means</a> · <a href="${REPO}/issues">dispute it</a></div>
  </div>
  <div class="watchfor"><b>What we watch for</b> — ${WATCH[cc.status in WATCH ? cc.status : "unclear"](esc(shortName(c)))}</div>
  <p class="note stathist">Status in this archive: ${(cc.statusHistory ?? [{ status: cc.status, since: ASSESSED }])
    .map((h) => `<strong>${(STATUS[h.status] ?? { label: h.status }).label}</strong> since ${fmtDate(h.since)}`)
    .join(" → ")}${(cc.statusHistory ?? []).length > 1 ? "" : " — no status changes recorded."}</p>`;
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
        <td><a class="dim" href="/archive/${c.slug}/${d.id}.txt">text</a> · <a class="dim" href="/archive/${c.slug}/${d.id}.html" title="Original page bytes, kept as evidence — renders without its styling here">raw</a> · <a class="dim" href="https://web.archive.org/web/*/${esc(d.url)}" title="Every Internet Archive capture of this URL — including from before this record began">wayback</a></td>
      </tr>`;
    })
    .join("");
  const timeline = evts.length
    ? `<ul class="feed">${evts.slice(0, 60).map(feedRow).join("")}</ul>`
    : `<div class="empty">Nothing recorded yet.</div>`;
  const body = `
  <p class="crumbs"><a href="/companies/">Companies</a> / ${esc(c.name)}</p>
  <div class="idrow ${st.cls}">
    <span class="mg mg-lg" aria-hidden="true">${esc(shortName(c)[0])}</span>
    <div><h1>${esc(c.name)}</h1><span class="vd idvd">${st.verdict}</span></div>
  </div>
  ${banner}
  <p class="lede">${c.docs.length} document${c.docs.length === 1 ? "" : "s"} tracked${a.label ? " · App Store privacy label tracked" : ""}${real.length ? ` · ${real.length} change${real.length === 1 ? "" : "s"} recorded` : " · no changes since baseline"}.</p>
  ${c.docs.length ? `<h2>Tracked documents</h2>
  <div class="scroll"><table class="doclist">
    <thead><tr><th>Document</th><th>Last fetched</th><th>Size</th><th>Hash</th><th>Snapshot</th></tr></thead>
    <tbody>${docRows}</tbody>
  </table></div>
  <p class="note mt-06"><strong>text</strong> is the extracted record we hash and diff; <strong>raw</strong> is the page's original HTML kept verbatim as evidence — it renders without its styling here, by design.</p>` : `<p class="note">No policy pages are currently trackable for this company — see <a href="/companies/">why</a>. ${a.label ? "Its App Store label is tracked below." : ""}</p>`}
  ${a.label ? `<h2>App Store privacy label${a.labelMeta?.app ? ` <span class="dim fw-400">— ${esc(a.labelMeta.app)}</span>` : ""}</h2>
  <p class="note">Apple requires every app to declare the data it collects. This is ${esc(c.name)}'s current declaration, as shown on the App Store; ScanRecords records when it changes.</p>
  ${labelCards(a.label)}` : ""}
  <h2>Record <a class="dim plain fs-85 fw-400" href="/feed/${c.slug}.xml" title="RSS feed of this company's recorded changes only">RSS ↗</a></h2>
  ${timeline}`;
  const cardStatus = inst ? "inst" : (cc.status ?? "unclear");
  let cardImage;
  if (OG_CARDS[c.slug] === cardStatus) cardImage = `/og/${c.slug}.png`;
  else if (OG_CARDS[c.slug]) console.warn(`⚠ stale OG card for ${c.slug}: drawn as "${OG_CARDS[c.slug]}", status now "${cardStatus}" — re-run tools/make-og-cards.swift`);
  mkdirSync(join(OUT, "company", c.slug), { recursive: true });
  writeFileSync(
    join(OUT, "company", c.slug, "index.html"),
    page({
      title: `${c.name}: ${st.label} — ScanRecords`,
      desc: inst
        ? `${c.name} in the ScanRecords archive: the law's own pages, recorded daily. ${c.note}`
        : `${c.name} under the EU's Chat Control: ${st.label.toLowerCase()}. ${cc.note}`,
      path: `/company/${c.slug}/`, active: "companies", body,
      image: cardImage, feed: `/feed/${c.slug}.xml`,
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
  <div class="cite mono fs-85">ScanRecords. “${esc(e.company)} changed its ${esc(e.docTitle)}.” Recorded ${fmtDate(e.date)}. ${SITE}/change/${e.id}/${hash ? ` — snapshot SHA-256 (after): ${hash}.` : "."}</div>`;
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

// the full record — every event ever recorded, baselines included
{
  const rows = history.length
    ? `<ul class="feed">${history.map(feedRow).join("")}</ul>`
    : `<div class="empty">Nothing recorded yet.</div>`;
  const body = `
  <h1>The record</h1>
  <p class="lede">Every event this archive has ever recorded — newest first. A
  <strong>baseline</strong> is the first capture of a document: the reference everything
  after it is diffed against. A <strong>document</strong> or <strong>App Store label</strong>
  event is a real change, with its full before and after preserved.</p>
  <p class="note">Recording since ${fmtDate(baselineDate)} · ${history.length} events ·
  ${realChanges.length} real change${realChanges.length === 1 ? "" : "s"} ·
  machine-readable at <a href="/history.json">/history.json</a> ·
  follow via <a href="/feed.xml">RSS</a> or <a href="/alerts/">push alerts</a>.</p>
  ${rows}
  <p class="note mt-16">Baselines matter more than they look: a scanning clause added in 2027
  can only be proven <em>new</em> against a recorded 2026 baseline. That is why everything
  is captured before it changes, not after.</p>`;
  mkdirSync(join(OUT, "changes"), { recursive: true });
  writeFileSync(
    join(OUT, "changes", "index.html"),
    page({
      title: "The record — every event — ScanRecords",
      desc: "Every event the ScanRecords archive has recorded: baselines and changes across tracked Chat Control documents and App Store labels, newest first.",
      path: "/changes/", active: "changes", body,
    })
  );
}

// chat-control explainer
{
  const body = `
  <section class="hero cc-hero">
    <div class="beam" aria-hidden="true"></div>
    <div class="cc-grid">
      <div>
        <div class="eyebrow">Regulation (EU) 2021/1232 — in force until April 2028</div>
        <h1>What is the EU's Chat&nbsp;Control?</h1>
        <p class="lede">The rule that lets communication providers <strong>voluntarily scan
        private messages</strong> in the EU. Not mandatory, not universal, and end-to-end
        encrypted apps are excluded — which is why the real question is what each provider
        chooses. This page is the plain-language version, with primary sources.</p>
      </div>
      <div class="cc-eye">${EYE_SVG}</div>
    </div>
  </section>
  <div class="about">

  <nav class="toc" aria-label="On this page">On this page:
  <a href="#what">What it is</a> · <a href="#timeline">Timeline</a> · <a href="#one-vs-two">1.0 vs 2.0</a> ·
  <a href="#paper-trail">The paper trail</a> · <a href="#who">Who uses it</a> · <a href="#us-law">US law ≠ Chat Control</a> ·
  <a href="#for-you">For you</a> · <a href="#statuses">The five statuses</a> · <a href="#faq">FAQ</a></nav>
  <h2 id="what">What Chat Control is</h2>
  <p>Under the EU's ePrivacy rules, reading private communications is normally forbidden —
  for providers too. The ePrivacy derogation (Regulation 2021/1232, widely called
  <strong>"Chat Control 1.0"</strong>) carves out an exception: providers <em>may</em> scan
  private messages for child sexual abuse material, if they choose to. It lapsed in April
  2026, was reinstated by the Council and survived a European Parliament rejection vote in
  July 2026, and now runs until <strong>April 2028</strong>. An amendment adopted alongside
  it formally <strong>excludes end-to-end encrypted communications</strong> from its scope.</p>
  <p>A separate, permanent regulation (the CSA Regulation, <strong>"Chat Control 2.0"</strong>),
  which could make detection mandatory — including on encrypted apps, via scanning on your
  device before encryption — remains under negotiation between the Council and Parliament.
  It is not law. If that changes, what these pages track — and this page — will change with it.</p>

  <h2 id="timeline">How we got here</h2>
  <ol class="tl">
    <li><b>Dec 2020</b> — New EU telecom rules extend ePrivacy confidentiality to messengers; Facebook pauses CSAM scanning in the EU overnight.</li>
    <li><b>Jul 2021</b> — Regulation 2021/1232 enters into force: voluntary scanning becomes legal again. Chat Control 1.0.</li>
    <li><b>Aug 2021</b> — Apple announces on-device photo scanning for iCloud; abandons the plan by December 2022 after expert backlash.</li>
    <li><b>May 2022</b> — The Commission proposes the permanent CSA Regulation with mandatory detection orders. Chat Control 2.0.</li>
    <li><b>Nov 2023</b> — Parliament's position: no indiscriminate scanning, protect end-to-end encryption.</li>
    <li><b>Dec 2023</b> — Meta turns on E2EE by default for Messenger personal chats.</li>
    <li><b>Jun 2024</b> — Council's "upload moderation" compromise fails to find a majority; the vote is pulled.</li>
    <li><b>Dec 2025</b> — Council and Parliament begin trilogue negotiations on 2.0.</li>
    <li><b>Mar–Apr 2026</b> — Parliament rejects extending 1.0 (311–228); the derogation lapses on 3 April.</li>
    <li><b>Jul 2026</b> — The Council reinstates it; a Parliament rejection motion gets more no than yes votes (314–276) but misses the 361 absolute majority. Extended to <b>April 2028</b>, with E2EE formally excluded.</li>
    <li><b>Jun–Jul 2026</b> — The supposedly final 2.0 trilogue collapses over suspicionless scanning; negotiations continue.</li>
  </ol>

  <h2 id="one-vs-two">1.0 vs 2.0 — don't mix them up</h2>
  <div class="scroll"><table class="cmp">
    <thead><tr><th></th><th>Chat Control 1.0 (in force)</th><th>Chat Control 2.0 (draft)</th></tr></thead>
    <tbody>
    <tr><td class="dim">What it is</td><td>ePrivacy derogation — Regulation 2021/1232</td><td>CSA Regulation — proposed 2022, still in negotiation</td></tr>
    <tr><td class="dim">Scanning</td><td><strong>Voluntary</strong> — each provider decides</td><td>Could be <strong>mandatory</strong> via detection orders</td></tr>
    <tr><td class="dim">Encrypted apps</td><td><strong>Formally excluded</strong></td><td>Central fight — client-side scanning would affect them</td></tr>
    <tr><td class="dim">Until</td><td>April 2028</td><td>Not law; nothing to expire</td></tr>
    <tr><td class="dim">What this site does</td><td>Records who uses it, in their own words and filings</td><td>Records the encryption language that would have to change first</td></tr>
    </tbody>
  </table></div>
  <div class="banner st-unclear mt-14">
    <strong>Where 2.0 stands right now</strong> <span class="dim">— last reviewed ${fmtDate(ASSESSED)}</span>
    <div class="mt-04 dim">The supposedly final trilogue collapsed on 29 June 2026
    over suspicionless scanning; negotiations continue under the Irish Council presidency. Nothing is
    law yet. This box is re-reviewed whenever statuses are.</div>
  </div>
  <p class="note">Background reading:
  <a href="https://www.euronews.com/my-europe/2026/07/23/eu-temporarily-extends-controversial-chat-scanning-regime-until-2028">Euronews</a> ·
  <a href="https://fightchatcontrol.eu/">fightchatcontrol.eu</a> ·
  <a href="https://edri.org/our-work/csa-regulation-document-pool/">EDRi's document pool</a></p>

  <h2 id="paper-trail">The paper trail — we archive the law's own pages too</h2>
  <p>Companies aren't the only ones who quietly edit their pages. The institutions writing
  Chat Control publish policy pages and status trackers of their own — so those are in the
  archive under the same rules: fetched daily, diffed, and preserved. If the Commission
  reframes what "voluntary detection" means, or the Parliament's tracker moves a step
  toward mandatory scanning, that edit becomes a recorded, citable event.</p>
  <ul class="sources">
    ${institutions.map((i) => `<li><strong><a href="/company/${i.slug}/">${esc(i.name)}</a></strong> —
    ${i.docs.map((d) => `<a href="${esc(d.url)}">${esc(d.title)}</a> (<a class="dim" href="/archive/${i.slug}/${d.id}.txt">archived text</a>)`).join(" · ")}</li>`).join("\n    ")}
  </ul>

  <h2 id="who">Who actually uses it</h2>
  <p>Providers scanning under the derogation must file annual reports, and the Commission's
  latest implementation report names exactly five: <em>“Google, LinkedIn, Meta, Microsoft and
  Yubo submitted reports, for both 2023 and 2024”</em>
  (<a href="https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A52025DC0740">COM(2025)&nbsp;740</a>).
  MEP Patrick Breyer's <a href="https://www.patrick-breyer.de/en/posts/chat-control/">tracking</a> adds
  that <em>“only unencrypted US communication services such as Gmail, Facebook/Instagram Messenger,
  Skype, Snapchat, iCloud Mail, or Xbox”</em> make use of it — note that Snapchat and Apple appear in
  that service list but <strong>not</strong> among the five reporting providers; both facts are shown
  on their pages. Some providers also publish EU-specific transparency reports of their own, like
  <a href="https://storage.googleapis.com/transparencyreport/report-downloads/pdf-report-23_2021-8-2_2021-12-31_en_v1.pdf">Google's report under Regulation 2021/1232</a> and
  <a href="https://www.microsoft.com/en/digitalsafety/transparency-reports/jurisdictional-reports">Microsoft's jurisdictional reports</a> — both tracked by this archive.</p>

  <h2 id="us-law">Scanning under US law is not Chat Control</h2>
  <p>Most large US platforms scan uploads for known abuse material and report to
  <a href="https://www.missingkids.org/cybertiplinedata">NCMEC</a> — that is a <strong>US legal
  regime</strong>, and it says nothing about whether a company invokes the EU derogation to scan
  private communications of EU users. This site keeps the two separate: a filled red dot means
  EU evidence; a hollow red dot means US-law scanning with no EU evidence found. Conflating the
  two overstates the record, so we don't.</p>

  <h2 id="for-you">What this means for you</h2>
  <ul>
    <li><strong>If you use Gmail, Facebook or Instagram messaging, Outlook, or LinkedIn in the
    EU</strong> — the provider scans under the derogation, legally and by its own choice. Scanning
    means automated matching of content against known-abuse databases and classifiers, not a
    person reading your mail — but it is your private correspondence being processed.</li>
    <li><strong>If you use Signal, WhatsApp, Threema, Olvid, Wire or Element</strong> — message
    content is end-to-end encrypted; the provider has nothing readable to scan, and E2EE is
    formally excluded from 1.0.</li>
    <li><strong>A VPN does not change any of this</strong> — scanning happens at the provider,
    not on the network path. The only variable that matters is which app you use.</li>
    <li><strong>Telegram is its own case</strong> — cloud chats are not E2EE, so Telegram
    <em>could</em> read them; whether it scans them is exactly what it doesn't say.
    <a href="/company/telegram/">Its page</a> records what is known.</li>
  </ul>

  <h2 id="statuses">The five statuses</h2>
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
    <li>And the negative buckets are claims about the <em>record</em>, not the world: "no EU evidence"
    means none was found in public documents and filings — a provider could scan and not say so.
    That asymmetry is why the confirmed group has a hard floor (the Commission's own naming) while
    the other groups are explicitly provisional, re-read daily.</li>
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

  <h2 id="faq">Common questions</h2>
  <details><summary>Is someone reading my WhatsApp or Signal messages?</summary>
  <p>Not under Chat Control 1.0. Both are end-to-end encrypted, E2EE apps are formally excluded,
  and the provider has no readable content to scan. The pressure point for encrypted apps is the
  <em>draft</em> 2.0 regulation — which is not law.</p></details>
  <details><summary>Is Chat Control the thing that would break encryption?</summary>
  <p>That's 2.0 — the draft CSA Regulation, whose detection orders could force scanning on your
  device before encryption. It has been stuck in negotiation since 2022, most recently collapsing
  over suspicionless scanning in June 2026. What is actually in force, 1.0, excludes E2EE.</p></details>
  <details><summary>Can I opt out of the scanning that exists today?</summary>
  <p>Only by choosing your app. Scanning under 1.0 happens provider-side, so the practical
  opt-out is using an end-to-end encrypted service — see <a href="/#e2ee">the seven tracked
  apps that can't read your messages</a>.</p></details>
  <details><summary>Does a company scanning "for CSAM" mean it reads everything I send?</summary>
  <p>Disclosed methods are automated: hash matching against known-abuse databases and, in some
  cases, classifiers — with human review of flagged material. That is narrower than "someone
  reads your mail," and still means private correspondence is processed; both things are true,
  and false positives on legal content are a documented problem in the Commission's own report.</p></details>
  <details><summary>Why do you say "no EU evidence" instead of "doesn't scan in the EU"?</summary>
  <p>Because absence of evidence is what we actually have. A provider could scan EU
  communications without it appearing in the sources this site can check; what we can say is
  that the mandatory reporting names five providers, and the others aren't in it. We publish
  the strongest true sentence, not the strongest sentence.</p></details>

  <h2>Sources</h2>
  <ul class="sources">
    <li><a href="https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A52025DC0740">COM(2025) 740</a> — the Commission's implementation report on Regulation 2021/1232: the five reporting providers, data volumes, accuracy figures.</li>
    <li><a href="https://storage.googleapis.com/transparencyreport/report-downloads/pdf-report-23_2021-8-2_2021-12-31_en_v1.pdf">Google's transparency report under Regulation 2021/1232</a> — an EU-specific filing by a scanning provider.</li>
    <li><a href="https://www.microsoft.com/en/digitalsafety/transparency-reports/jurisdictional-reports">Microsoft's jurisdictional transparency reports</a> — tracked by this archive.</li>
    <li><a href="https://www.patrick-breyer.de/en/posts/chat-control/">Patrick Breyer's Chat Control page</a> — MEP-maintained tracking of the file and the services using the derogation.</li>
    <li><a href="https://edri.org/our-work/csa-regulation-document-pool/">EDRi's CSA Regulation document pool</a> — the paper trail of 2.0.</li>
    <li><a href="https://fightchatcontrol.eu/">fightchatcontrol.eu</a> — campaign overview and country-by-country positions.</li>
    <li><a href="https://www.missingkids.org/cybertiplinedata">NCMEC CyberTipline data</a> — the US reporting regime, kept distinct from the EU one throughout this site.</li>
  </ul>
  </div>`;
  mkdirSync(join(OUT, "chat-control"), { recursive: true });
  writeFileSync(
    join(OUT, "chat-control", "index.html"),
    page({
      title: "What is the EU's Chat Control? — plain-language guide — ScanRecords",
      desc: "Chat Control explained: the voluntary scanning rule in force until April 2028, the timeline, 1.0 vs 2.0, who actually scans (per the Commission's own report), what it means for your apps, and common questions.",
      path: "/chat-control/", active: "cc", body, alt: "/fr/chat-control/",
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
    <li><strong>Absence of evidence is not evidence of absence.</strong> "No EU evidence" and "no clear
    statement" describe the public record: a provider could scan and simply not disclose it. Lawful
    derogation use must eventually surface in Commission reporting — undisclosed or differently-justified
    scanning would not. The statuses can only ever be as strong as the record they cite.</li>
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
    <tr><td class="mono">/feed/&lt;company&gt;.xml</td><td class="dim">Per-company RSS — recorded changes for one company only (e.g. <a href="/feed/signal.xml">/feed/signal.xml</a>). Empty until it moves; quiet is the point.</td></tr>
    <tr><td class="mono"><a href="/history.json">/history.json</a></td><td class="dim">Every recorded event, newest first: company, document, date, kind, +/− line counts, change id.</td></tr>
    <tr><td class="mono"><a href="/companies.json">/companies.json</a></td><td class="dim">The tracked targets, their documents, App Store ids, and Chat Control statuses with sources.</td></tr>
    <tr><td class="mono">/archive/&lt;company&gt;/&lt;doc&gt;.txt</td><td class="dim">Current extracted text of a tracked document (also <span class="mono">.html</span> raw, <span class="mono">.meta.json</span> provenance).</td></tr>
    <tr><td class="mono">/archive/&lt;company&gt;/appstore-label.json</td><td class="dim">Current App Store privacy label, canonicalized.</td></tr>
    <tr><td class="mono"><a href="/feed.xml">/feed.xml</a></td><td class="dim">RSS of recorded changes.</td></tr>
    <tr><td class="mono"><a href="/sitemap.xml">/sitemap.xml</a></td><td class="dim">Every page.</td></tr>
    </tbody></table></div>
  <h2>Example</h2>
  <div class="cite mono fs-85">curl -s ${SITE}/history.json | head</div>
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

// numbers — the Commission's own figures
{
  const hbar = (rows, unit, max, color = "") =>
    `<div class="chart">${rows
      .map(
        ([label, v]) => `<div class="crow"><span class="mono dim">${label}</span>
        <span class="track"><span class="fill ${color} ${wcls((v / max) * 100)}"></span></span>
        <span class="val mono">${v}${unit}</span></div>`
      )
      .join("")}</div>`;
  const typeChart = `<div class="chart">${N_TYPE.map(
    ([y, chat, social, share]) => `
    <div class="crow"><span class="mono dim">${y}</span>
      <span class="track"><span class="fill ${wcls((chat / 1100) * 100)}"></span></span>
      <span class="val mono">${chat}k</span></div>
    <div class="crow crow-sub"><span class="mono faint">${share}% of total</span>
      <span class="track"><span class="fill g2 ${wcls((social / 1100) * 100)}"></span></span>
      <span class="val mono dim">${social}k</span></div>`
  ).join("")}
  <p class="note mt-06"><span class="lgd lgd-chat"></span> chat, messaging or email services
  &nbsp; <span class="lgd lgd-social"></span> social media or gaming platforms</p></div>`;
  const body = `
  <h1>The scanners' own numbers</h1>
  <p class="lede">Providers scanning under Chat Control must report on it, and the Commission
  compiles the results. Everything on this page is from
  <a href="https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A52025DC0740">COM(2025)&nbsp;740</a>
  (27 November 2025) — the EU's own accounting of the scanning it permits.</p>

  <nav class="toc" aria-label="On this page">On this page:
  <a href="#reports">Reports falling</a> · <a href="#files">Files exploding</a> · <a href="#e2ee-effect">The E2EE effect</a> ·
  <a href="#errors">Error rates</a> · <a href="#caveats">Caveats</a></nav>
  <h2 id="reports">Reports about the EU are falling…</h2>
  <p class="groupnote">NCMEC reports concerning the EU, in millions.</p>
  ${hbar(N_REPORTS, "M", 1.6)}

  <h2 id="files">…while the files inside them exploded</h2>
  <p class="groupnote">Images, videos and other files contained in those reports, in millions —
  fourteen times more files in 2024 than 2022, inside fewer reports.</p>
  ${hbar(N_FILES, "M", 110)}

  <h2 id="e2ee-effect">The E2EE effect</h2>
  <p class="groupnote">Reports by service type, in thousands. Reports from chat, messaging and email
  scanning collapsed by two-thirds after Meta turned on end-to-end encryption for Messenger in
  December 2023 — from 68% of everything reported about the EU to 36%.</p>
  ${typeChart}

  <h2 id="errors">What the scanners get wrong</h2>
  <p class="groupnote">Error ratios (false positives), as tabulated in the report — each provider
  measures errors differently, which the Commission itself flags as a problem.</p>
  <div class="scroll"><table>
    <thead><tr><th>Provider</th><th>2023</th><th>2024</th><th>What the ratio measures</th></tr></thead>
    <tbody>${N_ERRORS.map(
      ([p, a, b, m]) => `<tr><td><strong>${p}</strong></td><td class="mono">${a}</td><td class="mono">${b}</td><td class="dim">${m}</td></tr>`
    ).join("")}</tbody>
  </table></div>
  <p class="note">Read both columns of Meta's row: 0.12% sounds small, and it also means
  <strong>1,800 wrongly-actioned items in 2024</strong> (11,600 in 2023) — both things are true.
  The report's own summary: flagged material is <em>"overwhelmingly confirmed"</em> on human
  review, and <em>"a small fraction may turn out, upon human review, not to be CSAM."</em></p>

  <h2 id="caveats">The Commission's own caveats</h2>
  <p>The report notes <em>"considerable disparities in the reporting"</em> by both providers and
  member states, calls for <em>"greater standardisation"</em>, and says the gaps between NCMEC
  data and member-state data <em>"have significant shortcomings"</em>. Several member states
  reported no usable statistics at all. The numbers on this page are the best public accounting
  that exists — and the EU's own report says it isn't good enough.</p>

  <h2>Method</h2>
  <p class="note">Figures extracted from the official PDF of COM(2025) 740; European decimal
  notation normalised. The five reporting providers and their statuses are on
  <a href="/">the checker</a>; the exact sentence naming them is quoted in
  <a href="/notes/five-providers-verbatim/">this note</a>. Spot an extraction error?
  <a href="${REPO}/issues">Open an issue</a> — corrections are published.</p>`;
  mkdirSync(join(OUT, "numbers"), { recursive: true });
  writeFileSync(
    join(OUT, "numbers", "index.html"),
    page({
      title: "The scanners' own numbers — ScanRecords",
      desc: "Chat Control by the EU's own figures: falling reports, exploding file counts, the E2EE effect, and what the scanners get wrong — from COM(2025) 740.",
      path: "/numbers/", active: "numbers", body,
    })
  );
}

// notes — index + articles
{
  const body = `
  <h1>Notes</h1>
  <p class="lede">Short, sourced write-ups from the record. Everything here cites primary
  documents; nothing here is a hot take.</p>
  <ul class="notes-list">${NOTES.map(
    (n) => `<li><span class="date mono dim">${fmtDate(n.date)}</span>
    <span><a href="/notes/${n.slug}/"><strong>${esc(n.title)}</strong></a><br>
    <span class="dim fs-90">${esc(n.teaser)}</span></span></li>`
  ).join("")}</ul>`;
  mkdirSync(join(OUT, "notes"), { recursive: true });
  writeFileSync(
    join(OUT, "notes", "index.html"),
    page({ title: "Notes — ScanRecords", desc: "Short, sourced write-ups from the Chat Control record.", path: "/notes/", active: "notes", body })
  );
  for (const n of NOTES) {
    const body = `<div class="about">
    <p class="crumbs"><a href="/notes/">Notes</a> / ${fmtDate(n.date)}</p>
    <h1>${esc(n.title)}</h1>
    ${n.body}
    <p class="note mt-16">— ScanRecords, ${fmtDate(n.date)}.
    <a href="/feed.xml">Subscribe by RSS</a> · <a href="${REPO}/issues">corrections</a></p>
    </div>`;
    mkdirSync(join(OUT, "notes", n.slug), { recursive: true });
    writeFileSync(
      join(OUT, "notes", n.slug, "index.html"),
      page({ title: `${n.title} — ScanRecords`, desc: n.teaser, path: `/notes/${n.slug}/`, active: "notes", body })
    );
  }
}

// glossary
{
  const body = `<div class="about">
  <h1>Glossary</h1>
  <p class="lede">Twelve terms that carry most Chat Control conversations — each in plain
  language, none requiring the others.</p>
  <dl class="gloss">${GLOSSARY.map(
    ([term, def]) => `<dt id="${term.toLowerCase().replace(/[^a-z0-9]+/g, "-")}">${esc(term)}</dt><dd>${esc(def)}</dd>`
  ).join("")}</dl></div>`;
  mkdirSync(join(OUT, "glossary"), { recursive: true });
  writeFileSync(
    join(OUT, "glossary", "index.html"),
    page({ title: "Glossary — ScanRecords", desc: "Chat Control's vocabulary in plain language: E2EE, client-side scanning, hash matching, detection orders, and more.", path: "/glossary/", active: "notes", body, alt: "/fr/glossary/" })
  );
}

// switch — the practical page
{
  const e2eeApps = groups.find((g) => g.key === "e2ee").companies;
  const body = `<div class="about">
  <h1>How to actually get out of the scanning</h1>
  <p class="lede">Everything on this page follows from the record: what is scanned today, what
  cannot be, and which settings quietly undo your protection. No products to buy — just choices.</p>

  <nav class="toc" aria-label="On this page">On this page:
  <a href="#apps">Apps</a> · <a href="#backups">Backups</a> · <a href="#email">Email</a> ·
  <a href="#vpn">VPN</a> · <a href="#metadata">Metadata</a> · <a href="#scope">Scope</a></nav>
  <h2 id="apps">1. The only real opt-out is the app you use</h2>
  <p>Scanning under Chat Control happens <strong>at the provider</strong>, with the provider's
  keys. End-to-end encrypted apps have nothing readable to scan and are formally excluded from
  the derogation. These are the tracked apps that cannot read your messages:</p>
  <div class="cards">${e2eeApps
    .map((c) => `<a class="card st-e2ee" href="/company/${c.slug}/">
      <span class="mg" aria-hidden="true">${esc(shortName(c)[0])}</span>
      <span><span class="nm">${esc(shortName(c))}</span><br><span class="vd">Can't read your messages</span></span></a>`)
    .join("")}</div>

  <h2 id="backups">2. Mind the backup trap</h2>
  <p>WhatsApp chats are E2EE — but an <strong>unencrypted cloud backup</strong> hands a readable
  copy to Apple's or Google's servers anyway. Either disable chat backups or turn on
  <em>end-to-end encrypted backup</em> (Settings → Chats → Chat backup). The same logic applies
  anywhere: encryption in transit means little if a plaintext copy rests somewhere else.</p>

  <h2 id="email">3. Email is the scanned zone</h2>
  <p>Gmail and Outlook are scanned in the EU under the derogation — their operators are two of the
  <a href="/notes/five-providers-verbatim/">five providers filing its reports</a>. Proton states it
  does not scan content and cannot read stored mail; GMX makes no clear statement. If your
  correspondence is sensitive, the mailbox provider is a bigger decision than any setting inside it.</p>

  <h2 id="vpn">4. A VPN does not help here</h2>
  <p>A VPN moves your traffic, not your messages — scanning happens where the message is
  processed, at the provider. Against Chat Control specifically, a VPN changes nothing. Choose
  the app, not the tunnel.</p>

  <h2 id="metadata">5. Know what still leaks</h2>
  <p>E2EE protects <strong>content</strong>. Metadata — who you talk to, when, how often — is
  visible to most providers regardless (Signal and Threema minimize even that). And nothing here
  protects a device someone else unlocks.</p>

  <h2 id="scope">6. What this doesn't cover</h2>
  <p>All of the above concerns the rules in force today. The draft
  <a href="/chat-control/">Chat Control 2.0</a> could reach into E2EE apps via scanning on your
  device, before encryption — which is why the sentence "we cannot read your messages" is one of
  the things this archive watches daily.</p>

  <p class="note mt-16">Every claim above traces to the
  <a href="/">checker</a>, the <a href="/numbers/">numbers</a>, or a company's own archived
  documents. Send this page to the person who asked you "so what do I do?"</p>
  </div>`;
  mkdirSync(join(OUT, "switch"), { recursive: true });
  writeFileSync(
    join(OUT, "switch", "index.html"),
    page({
      title: "How to get out of the scanning — ScanRecords",
      desc: "The practical version: which apps can't read your messages, the WhatsApp backup trap, why a VPN changes nothing, and what still leaks.",
      path: "/switch/", active: "home", body, alt: "/fr/switch/",
    })
  );
}

// press
{
  const body = `<div class="about">
  <h1>Press &amp; reuse</h1>
  <p class="lede">ScanRecords is a public, automated archive answering one question: which
  communication platforms scan under the EU's Chat Control — in their own documents and filings,
  recorded daily since ${fmtDate(baselineDate)}.</p>

  <h2>The facts</h2>
  <ul>
    <li><strong>${companies.length} platforms</strong>, ${docCount} documents and ${labelCount} App Store privacy labels, re-fetched daily at 06:17 UTC.</li>
    <li><strong>Exactly five providers</strong> file the derogation's mandatory reports — “Google, LinkedIn, Meta, Microsoft and Yubo” (COM(2025) 740). The <a href="/">checker</a> reflects precisely that.</li>
    <li>Changes are published with their full before/after, independently timestamped by the Internet Archive, and preserved in a <a href="${REPO}">public git history</a> nobody can quietly rewrite.</li>
    <li>The EU's own scanning statistics — error ratios included — are charted on <a href="/numbers/">the numbers page</a>.</li>
  </ul>

  <h2>Citing</h2>
  <p>Cite company pages or change pages directly — each change page carries a ready-made citation
  with content hashes. Statuses are observations of public statements and filings, each with its
  sources shown; companies can dispute them publicly under a fixed
  <a href="${REPO}/blob/main/POLICY.md">editorial policy</a>.</p>

  <h2>Reuse</h2>
  <ul>
    <li>All generated data is <strong>CC0</strong>: <a href="/data/">scanrecords.org/data</a>.</li>
    <li>Per-company status badges you can embed, updated with the record:
    <span class="mono">https://scanrecords.org/badge/&lt;company&gt;.svg</span> — e.g.
    <img src="/badge/signal.svg" alt="Signal Chat Control status badge" class="va-mid"> ·
    <img src="/badge/meta.svg" alt="Meta Chat Control status badge" class="va-mid"></li>
    <li>The card image: <a href="/og.png">og.png</a> · icons: <a href="/icons/icon-512.png">icon-512.png</a>.</li>
  </ul>

  <h2>Contact</h2>
  <p>Publicly, via <a href="${REPO}/issues">GitHub issues</a> — consistent with how everything
  else here works. The operator is a private individual; the work speaks through the record.</p>
  </div>`;
  mkdirSync(join(OUT, "press"), { recursive: true });
  writeFileSync(
    join(OUT, "press", "index.html"),
    page({
      title: "Press & reuse — ScanRecords",
      desc: "What ScanRecords is, the key facts, how to cite it, and CC0 data + embeddable status badges.",
      path: "/press/", active: "about", body,
    })
  );
}

// ------------------------------------------------------------ legal ----
{
  const body = `
  <div class="about">
  <h1>Legal &amp; privacy</h1>

  <h2>Privacy</h2>
  <p>This site sets <strong>no cookies</strong>, runs <strong>no analytics</strong>,
  and has no accounts. The only form is the optional email-alert signup below.
  Browsing stores nothing, which is why there is no consent banner.</p>
  <p>The site is served by Vercel Inc., which processes visitors' IP addresses
  transiently as a technical necessity of serving web requests. We do not
  receive, retain, sell, or share any visitor data.</p>
  <p><strong>Optional alerts.</strong> The <a href="/alerts/">alerts page</a> offers two
  opt-in channels, and they are the only features of this site that store anything.
  <em>Push:</em> we store your browser's push endpoint (a random URL it generates) and its two
  delivery keys — nothing that identifies you; delivery runs through your browser vendor's push
  service, and dead endpoints are deleted automatically. <em>Email:</em> if you subscribe by email
  and confirm the double-opt-in link, we store your address and a random token — nothing else, no
  IP, no name. Alert emails are sent via Resend, Inc. acting as our processor; every one carries a
  one-click unsubscribe, and unsubscribing (either channel) deletes the record immediately. Nothing
  is shared, sold, or used for anything except the alerts you asked for.</p>

  <h2>Mentions légales / Legal notice</h2>
  <p><strong>FR</strong> — Ce site est édité à titre non professionnel. Conformément à
  l'article 6, III, 2 de la loi n°2004-575 du 21 juin 2004 pour la confiance dans
  l'économie numérique (LCEN), l'éditeur, personne physique agissant à titre non
  professionnel, a communiqué ses éléments d'identification personnelle à
  l'hébergeur ci-dessous et n'est pas tenu de les rendre publics.</p>
  <p><strong>EN</strong> — This site is published non-commercially by a private
  individual. As provided by Article 6, III, 2 of the French LCEN law, the
  publisher's identity has been provided to the hosting provider below and is
  not required to be published.</p>
  <p><strong>Hébergeur / Host:</strong> Vercel Inc., 340 S Lemon Ave #4133,
  Walnut, CA 91789, United States — <a href="https://vercel.com">vercel.com</a></p>
  <p><strong>Contact:</strong>
  <a href="${REPO}/issues">github.com/Myrhex-x/redline/issues</a></p>

  <h2>The archive</h2>
  <p>Documents in the archive remain the property of their respective owners.
  They are preserved unmodified, as a public-interest record of documents that
  were published to the general public. Corrections, vendor responses, and
  takedown requests are handled per the
  <a href="${REPO}/blob/main/POLICY.md">editorial policy</a>.</p>
  </div>`;
  mkdirSync(join(OUT, "legal"), { recursive: true });
  writeFileSync(
    join(OUT, "legal", "index.html"),
    page({
      title: "Legal & privacy — ScanRecords",
      desc: "Legal notice and privacy information for scanrecords.org: no cookies, no analytics, nothing stored unless you opt into alerts.",
      path: "/legal/", active: "about", body,
    })
  );
}

// per-company status badges (embeddable SVG)
{
  const BADGE_COLORS = { confirmed: "#c2434d", global: "#9a6a12", unclear: "#6b6b6b", denies: "#2f8f4e", e2ee: "#2f8f4e" };
  const BADGE_TEXT = {
    confirmed: "scans under Chat Control", global: "scans · no EU evidence",
    unclear: "no clear statement", denies: "says it doesn't scan", e2ee: "E2EE — out of scope",
  };
  mkdirSync(join(OUT, "badge"), { recursive: true });
  for (const c of companies) {
    const st = c.chatControl?.status ?? "unclear";
    const left = shortName(c), right = BADGE_TEXT[st];
    const lw = Math.round(left.length * 6.6 + 14), rw = Math.round(right.length * 6.3 + 14);
    writeFileSync(
      join(OUT, "badge", `${c.slug}.svg`),
      `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + rw}" height="22" role="img" aria-label="${esc(left)}: ${esc(right)}">
<rect width="${lw}" height="22" rx="4" fill="#1a1a1a"/>
<rect x="${lw - 4}" width="4" height="22" fill="#1a1a1a"/>
<rect x="${lw}" width="${rw}" height="22" fill="${BADGE_COLORS[st]}"/>
<rect x="${lw}" width="${rw}" height="22" rx="4" fill="${BADGE_COLORS[st]}"/>
<rect x="${lw}" width="4" height="22" fill="${BADGE_COLORS[st]}"/>
<g fill="#ffffff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="15" text-anchor="middle">${esc(left)}</text>
<text x="${lw + rw / 2}" y="15" text-anchor="middle">${esc(right)}</text>
</g></svg>
`
    );
  }
}

// alerts — the one page with JavaScript, and it says so
{
  const body = `
  <h1>Get an alert when a company moves</h1>
  <p class="lede">The moment a tracked company changes a policy, an encryption claim, or an
  App Store label, your phone or your inbox can know. Free, no account, double opt-in —
  we store only what delivery needs (a push endpoint, or your email address and a token),
  and unsubscribing deletes it on the spot.</p>

  <div class="banner st-e2ee mt-16">
    <strong>On iPhone or Android, install the site first</strong>
    <div class="mt-04 dim">
      <strong>iPhone:</strong> Share&nbsp;→ <em>Add to Home Screen</em>, then open ScanRecords from the
      Home Screen and press subscribe (Apple only allows notifications for installed sites, iOS 16.4+).<br>
      <strong>Android:</strong> Chrome menu&nbsp;→ <em>Add to Home screen</em> — or just subscribe below.
    </div>
  </div>

  <p class="mt-14">
    <button id="subscribe" class="btn">Turn on alerts for this device</button>
    <button id="unsubscribe" class="btn" hidden>Turn off alerts</button>
  </p>
  <p id="alert-status" class="note" aria-live="polite"></p>

  <h2>Prefer email?</h2>
  <p class="note">Same alerts, by mail — one digest on days something changes, silence otherwise.
  Double opt-in: you'll get one confirmation link first.</p>
  <form class="mailform" method="post" action="/api/subscribe-email">
    <input class="mailinput" type="email" name="email" required placeholder="you@example.org" aria-label="Email address">
    <button class="btn" type="submit">Get email alerts</button>
  </form>

  <h2>What you'll be notified about</h2>
  <ul class="about pl-12">
    <li>A tracked company changed a policy, terms, security page, or an app-store privacy declaration — with a link to the exact before/after.</li>
    <li>Nothing else. No news, no campaigns, no "engagement". Most days, silence — quiet is the point.</li>
  </ul>

  <h2>The honesty box</h2>
  <p class="note">JavaScript exists only on this page, only for the push button. Subscribing by push
  stores your push endpoint — a random URL your browser generates — plus its two delivery keys;
  subscribing by email stores your address and a random token, nothing else. Each is deleted the
  moment you unsubscribe (email alerts carry a one-click unsubscribe in every message), and dead
  push endpoints are pruned automatically. No cookies, no identifiers, nothing shared, ever.
  Prefer zero storage at all? The <a href="/feed.xml">RSS feed</a> carries identical alerts.</p>
  <script src="/alerts.js" defer></script>`;
  mkdirSync(join(OUT, "alerts"), { recursive: true });
  writeFileSync(
    join(OUT, "alerts", "index.html"),
    page({
      title: "Alerts — ScanRecords",
      desc: "Push or email the moment a tracked company changes a policy or label under the EU's Chat Control. No account, double opt-in — and unsubscribing deletes everything.",
      path: "/alerts/", active: "alerts", body, alt: "/fr/alerts/",
    })
  );
}

// ---------------------------------------------------------------- locales ----
import { LOCALES, emitLocales, pathsFor } from "./i18n.mjs";

function langMenu(current, alts) {
  const items = [["en", "English"], ...Object.entries(LOCALES).map(([c, L]) => [c, L.name])];
  return `<details class="langmenu"><summary aria-label="Language">${GLOBE_SVG}${current.toUpperCase()}</summary><div class="panel">${items
    .map(([c, name]) => `<a href="${alts[c] ?? (c === "en" ? "/" : `/${c}/`)}" hreflang="${c}"${c === current ? " aria-current=\"true\"" : ""}>${name}</a>`)
    .join("")}</div></details>`;
}

function pageLoc(code, L, { title, desc, path, active, body, alts }) {
  SITEMAP.push(path);
  const navLink = (href, label, key) =>
    `<a href="/${code}/${href}"${active === key ? " aria-current=\"page\"" : ""}>${label}</a>`;
  const hreflang = Object.entries(alts)
    .map(([c, p]) => `<link rel="alternate" hreflang="${c}" href="${SITE}${p}">`)
    .join("\n") + `\n<link rel="alternate" hreflang="x-default" href="${SITE}${alts.en}">`;
  return `<!doctype html>
<html lang="${L.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${path}">
<link rel="alternate" type="application/rss+xml" title="ScanRecords — recorded changes" href="${SITE}/feed.xml">
<link rel="me" href="https://mastodon.social/@scanrecords_org">
${hreflang}
<link rel="icon" href="${FAVICON}">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ScanRecords">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<a class="skip" href="#main">${L.ui.skip}</a>
<header class="top"><div class="wrap">
  <a class="wm plain" href="/${code}/">Scan<span class="half">Records</span></a>
  <nav class="site">
    ${L.ui.nav.map(([href, label, key]) => navLink(href, label, key)).join("\n    ")}
    <a href="${REPO}">GitHub</a>
    ${langMenu(code, alts)}
  </nav>
</div></header>
<main id="main"><div class="wrap">
${body}
</div></main>
<footer class="site"><div class="wrap">
  <div class="fcol fbrand">
    <div class="feye" aria-hidden="true">${EYE_SVG}</div>
    <p><strong>ScanRecords</strong> — ${L.ui.brand}<br>${L.ui.brand2}</p>
  </div>
  <div class="fcol"><h4>${L.ui.cols[0]}</h4>
    ${L.ui.colExplore.map(([h, t]) => `<a href="/${code}/${h}">${t}</a>`).join("")}${L.ui.colExploreEN.map(([h, t]) => `<a href="${h}">${t}</a>`).join("")}
  </div>
  <div class="fcol"><h4>${L.ui.cols[1]}</h4>
    ${L.ui.colRecord.map(([h, t]) => `<a href="${h.startsWith("/") ? h : `/${code}/${h}`}">${t}</a>`).join("")}<a href="${REPO}">GitHub</a><a href="/feed.xml">RSS</a>
  </div>
  <div class="fcol"><h4>${L.ui.cols[2]}</h4>
    ${L.ui.colRules.map(([h, t]) => `<a href="${h}">${t}</a>`).join("")}<a href="${REPO}/blob/main/POLICY.md">${L.ui.policyLabel}</a>
  </div>
</div></footer>
</body>
</html>`;
}

emitLocales({
  esc, fmtDate, ASSESSED, companies, shortName, EYE_SVG, REPO,
  groupsFor: (statusMeta) =>
    Object.keys(statusMeta).map((k) => ({
      key: k, cls: STATUS[k].cls, ...statusMeta[k],
      companies: companies.filter((c) => (c.chatControl?.status ?? "unclear") === k),
    })),
  writePage: (code, key, { title, desc, active, body }) => {
    const alts = { en: pathsFor(key).en, ...Object.fromEntries(Object.keys(LOCALES).map((c) => [c, pathsFor(key)[c]])) };
    const path = alts[code];
    const dir = join(OUT, ...path.split("/").filter(Boolean));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), pageLoc(code, LOCALES[code], { title, desc, path, active, body, alts }));
  },
});

// 404
writeFileSync(
  join(OUT, "404.html"),
  page({
    title: "Not in the record — ScanRecords",
    desc: "This page is not in the record.",
    path: "/404", active: "none",
    body: `<h1>Not in the record.</h1>
  <p class="lede">Whatever was here, we have no snapshot of it.</p>
  <p class="note"><a href="/">Check your app</a> · <a href="/companies/">Tracked companies</a> · <a href="/changes/">The full record</a> · <a href="/chat-control/">What is Chat Control?</a> · <a href="/about/">About</a></p>`,
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
  for (const n of NOTES) {
    items.push(`<item>
  <title>${esc(n.title)}</title>
  <link>${SITE}/notes/${n.slug}/</link>
  <guid isPermaLink="true">${SITE}/notes/${n.slug}/</guid>
  <pubDate>${new Date(n.date + "T10:00:00Z").toUTCString()}</pubDate>
  <description>${esc(n.teaser)}</description>
</item>`);
  }
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

// per-company feeds — watch exactly one company (empty until it moves; quiet is the point)
{
  mkdirSync(join(OUT, "feed"), { recursive: true });
  for (const c of [...companies, ...institutions]) {
    const evts = (changesBySlug.get(c.slug) ?? []).filter((e) => e.kind !== "baseline");
    const items = evts.slice(0, 50).map(
      (e) => `<item>
  <title>${esc(`${e.company} changed its ${e.docTitle}`)}</title>
  <link>${SITE}/change/${e.id}/</link>
  <guid isPermaLink="true">${SITE}/change/${e.id}/</guid>
  <pubDate>${new Date(e.date + "T06:30:00Z").toUTCString()}</pubDate>
  <description>${esc(`+${e.added} lines added, −${e.removed} removed. Full before/after recorded.`)}</description>
</item>`
    );
    writeFileSync(
      join(OUT, "feed", `${c.slug}.xml`),
      `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>ScanRecords — ${esc(c.name)}</title>
<link>${SITE}/company/${c.slug}/</link>
<description>${esc(`Recorded changes to ${c.name}'s tracked documents and app-store declarations. Empty means nothing has changed since the baseline — that silence is the point.`)}</description>
<language>en</language>
${items.join("\n")}
</channel></rss>
`
    );
  }
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
if (existsSync(join(ROOT, "assets", "og"))) cpSync(join(ROOT, "assets", "og"), join(OUT, "og"), { recursive: true });
if (existsSync(join(ROOT, "assets", "fonts"))) cpSync(join(ROOT, "assets", "fonts"), join(OUT, "fonts"), { recursive: true });
if (existsSync(join(ROOT, "assets", "icons"))) cpSync(join(ROOT, "assets", "icons"), join(OUT, "icons"), { recursive: true });
cpSync(join(ROOT, "assets", "manifest.webmanifest"), join(OUT, "manifest.webmanifest"));
cpSync(join(ROOT, "assets", "sw.js"), join(OUT, "sw.js"));
cpSync(join(ROOT, "assets", "alerts.js"), join(OUT, "alerts.js"));

writeFileSync(
  join(OUT, "style.css"),
  CSS.trim() + "\n" + [...WIDTHS].map(([n, p]) => `.fill.${n} { width:${p}%; }`).join("\n") + "\n"
);

const pages = [];
(function count(dir) {
  for (const f of readdirSync(dir, { withFileTypes: true }))
    f.isDirectory() ? count(join(dir, f.name)) : f.name.endsWith(".html") && pages.push(1);
})(OUT);
console.log(`built ${pages.length} pages → public/`);
