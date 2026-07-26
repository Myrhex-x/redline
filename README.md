# ScanRecords

**A public, tamper-evident archive of what communication platforms — and the EU
itself — say about scanning private messages under Chat Control.**

Every day at 06:17 UTC this repository re-fetches the policies, encryption
claims, app-store privacy declarations and official EU pages that decide one
question: *is your messaging app scanning under the EU's Chat Control?* When
any of them changes, the change is committed with its full before and after —
because a quiet policy edit can only be proven by someone who recorded the
page before it.

**Live at [scanrecords.org](https://scanrecords.org)** · also in
[Français](https://scanrecords.org/fr/), [Deutsch](https://scanrecords.org/de/),
[Español](https://scanrecords.org/es/), [Polski](https://scanrecords.org/pl/)

## Why

Under the EU's ePrivacy derogation (Regulation 2021/1232, "Chat Control 1.0",
in force until April 2028), scanning of private communications is
**voluntary**: each provider decides for itself. Providers do not announce
that decision. It surfaces, if it surfaces anywhere, as a quiet edit to a
policy document, an app-store label, or a transparency filing.

A baseline recorded today cannot be reconstructed later. Nobody was keeping
the record. Now the record keeps itself.

## The status rules

Each tracked company carries one of five statuses, and the bar for the red one
is deliberately high:

| Status | Rule |
|---|---|
| **Scans under the EU's Chat Control** | Only providers named by the European Commission as filing the derogation's own transparency reports (Art. 3(1)(g)(vii) — reports that exist *only* for providers scanning under Chat Control). Per [COM(2025) 740](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A52025DC0740), exactly five: Google, LinkedIn, Meta, Microsoft, Yubo. |
| **Scans globally — no EU evidence** | Documents disclose scanning under **US law** (NCMEC / PhotoDNA). That is a separate legal regime and is never presented as Chat Control use. |
| **No clear statement** | Not end-to-end encrypted, and no public position either way. |
| **States it does not scan** | The company says so publicly; the sentence is pinned to the archived text. |
| **E2EE — out of scope** | Content is end-to-end encrypted; E2EE is formally excluded from the derogation. |

**The negative statuses describe the record, not the world.** "No EU
evidence" and "no clear statement" mean nothing was found in public documents
and filings — a provider could scan and simply not disclose it. That is why
the confirmed group has a hard floor (the Commission's own naming) while the
others are provisional and re-read daily.

Where the public record is contradictory — Snapchat and iCloud Mail appear in
service lists but not among the report filers — company pages show both facts
and refuse to resolve them. Every status cites its evidence and can be
[disputed publicly](https://github.com/Myrhex-x/redline/issues); disputes and
their outcomes stay visible.

## What is tracked

- **87 documents across 31 companies + 2 EU institutions** — privacy policies,
  terms, security/encryption pages ("we cannot read your messages" changes
  first if client-side scanning ever arrives), law-enforcement guidelines,
  Telegram's FAQ, Microsoft's PhotoDNA page…
- **Apple App Store privacy labels** (25 apps) — extracted from the App Store's
  embedded data and canonicalized to JSON.
- **Google Play Data Safety declarations** (29 apps) — the Android counterpart,
  archived as extracted text.
- **The law's own pages** — the European Commission's child-sexual-abuse policy
  page and the European Parliament's legislative-train tracker for the draft
  "Chat Control 2.0" regulation. Institutions edit their pages too; those
  edits are recorded under the same rules.

## How the machine works

`companies.json` is the target list. Daily, GitHub Actions runs:

1. [`tools/snapshot.mjs`](tools/snapshot.mjs) — zero-dependency fetcher; writes
   `archive/<slug>/<doc>.html` (raw bytes, kept verbatim), `.txt` (extracted
   text — the thing that gets hashed and diffed), `.meta.json` (provenance:
   URLs, status, timestamp, SHA-256).
2. [`tools/labels.mjs`](tools/labels.mjs) — App Store privacy labels.
3. [`tools/headless.mjs`](tools/headless.mjs) — real-browser lane for the few
   JS-rendered targets.
4. [`tools/history.mjs`](tools/history.mjs) — turns today's diffs into
   `history.json` events + `changes/<id>.json` hunks. Recaptures of previously
   failed fetches are never presented as policy changes.
5. [`tools/verify-quotes.mjs`](tools/verify-quotes.mjs) — every quote displayed
   on the site must literally appear in that company's archived text; if a
   company edits a quoted line away, an issue opens automatically. Quotes are
   not allowed to outlive their evidence.
6. [`tools/wayback.mjs`](tools/wayback.mjs) — asks the Internet Archive to
   capture every changed source the same day, so each change carries two
   independent timestamps.
7. [`tools/triage.mjs`](tools/triage.mjs) — flags changes touching scanning
   language for human review (deterministic keywords, no AI in the record path).
8. [`tools/push.mjs`](tools/push.mjs) / [`tools/toot.mjs`](tools/toot.mjs) —
   opt-in Web Push alerts and a Mastodon announcement, real changes only.
9. Commit. If the run itself fails, a separate workflow opens an alarm issue —
   silence is never mistaken for "no changes". A monthly workflow opens a
   status-review checklist; closing it is the public record that review
   happened.

The website ([`tools/build-site.mjs`](tools/build-site.mjs)) is a
zero-dependency static generator: no cookies, no analytics, no JavaScript
except the opt-in alerts page, CSP with nothing inline.

- Fetches identify as `ScanRecordsBot` with a link back. When a site blocks
  the bot, **the block is the recorded fact** — we don't join an anti-bot arms
  race (Reddit, Roblox, Epic and Yubo policy pages are currently in that
  state, and say so on the site).

## Verify it yourself

```
git clone https://github.com/Myrhex-x/redline && cd redline
node tools/snapshot.mjs --only signal   # re-fetch one company right now
node tools/build-site.mjs               # rebuild the entire site into public/
node tools/verify-quotes.mjs            # check every displayed quote against the archive
```

Compare any `archive/**.txt` against its live source, its SHA-256 in
`.meta.json`, its git history here, and its same-day Wayback capture. The
claim is not "trust us" — it's "check".

## Reuse the data

Everything generated is **CC0**: [`history.json`](https://scanrecords.org/history.json)
(every event), [`companies.json`](https://scanrecords.org/companies.json)
(targets + statuses + sources), `archive/**` snapshots,
[RSS](https://scanrecords.org/feed.xml), per-company status badges
(`https://scanrecords.org/badge/<slug>.svg`). CORS is open on the data
endpoints. See [scanrecords.org/data](https://scanrecords.org/data/).

## Limitations

- The archive records what platforms **say**, not what their software
  **does**. Behavioral measurement is a separate, harder project.
- A few targets render only via JavaScript or block bots; each is handled
  per-target and the handling is visible in `companies.json`.

## Editorial policy

Corrections, vendor response windows, dispute handling and takedown rules were
written down in [POLICY.md](POLICY.md) before they were ever needed.

## License

Code is [MIT](LICENSE). Generated data is CC0. Archived documents remain the
property of their respective owners; they are preserved unmodified as a
public-interest record of documents that were published to the general public.
