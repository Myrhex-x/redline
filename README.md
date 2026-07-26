# ScanRecords

**A public archive of what communication platforms say they do with your messages.**

Every day, this repository takes a snapshot of the privacy policies and terms of
service of the major communication platforms serving EU users. When a document
changes, the change is committed — what changed, and when, with the full before
and after preserved in git history.

**Live at [scanrecords.org](https://scanrecords.org).**

## Why

Under the EU's ePrivacy derogation ("Chat Control 1.0", extended to April 2028),
scanning of private communications is **voluntary**: each provider decides for
itself whether to scan. Providers do not announce that decision. It appears, if
it appears anywhere, as a quiet edit to a policy document.

Nobody was keeping the record. Now the record keeps itself.

## What this is not

This archive publishes **observations, not conclusions**. A recorded change
means the document changed — nothing more. Interpretation is left to the
reader. We do not label companies, and a platform's presence in the archive
implies nothing about its behavior.

## What is tracked

- **Privacy policies and terms of service** — where scanning must eventually be
  disclosed.
- **Encryption description pages** (WhatsApp, Apple, Threema, Proton) — if
  client-side scanning ever arrives, the sentence "we cannot read your
  messages" changes first.
- **Law-enforcement / government-request pages** and **community guidelines**
  for the major platforms.
- **App Store privacy labels** — Apple requires every app to declare what data
  it collects; the declarations change silently and nobody archives them.

## Method

- [`companies.json`](companies.json) lists every tracked platform and document.
- [`tools/snapshot.mjs`](tools/snapshot.mjs) (zero-dependency Node) fetches each
  document, extracts readable text from the HTML, and writes
  `archive/<company>/<doc>.html` (raw response), `.txt` (extracted text), and
  `.meta.json` (URL, final URL after redirects, HTTP status, fetch time, SHA-256
  of the text).
- [`tools/labels.mjs`](tools/labels.mjs) extracts each app's `privacyDetails`
  from its App Store page (embedded server-side) and stores it as canonicalized
  JSON in `archive/<company>/appstore-label.json`.
- A snapshot is committed **only when the extracted text changed** — raw HTML
  churns on every request; text is the signal.
- Git history is the timestamped, tamper-evident record. GitHub Actions runs
  the snapshot daily at 06:17 UTC.
- Fetches identify themselves as `ScanRecordsBot` with a link to this project.
  If a site blocks the bot, that block is recorded before any workaround is
  considered.

## Reproduce it

```
node tools/snapshot.mjs --dry
```

Anyone can run the tool and compare results. No accounts, no keys, no
dependencies.

## Limitations

- Some pages render their content with JavaScript; a plain fetch archives only
  the server response. These are flagged `short-extract` in their meta files
  and handled per-target over time.
- The archive records what platforms **say**, not what they **do**. Behavioral
  measurement is a separate, harder project.

## Editorial policy

Corrections, vendor response windows, and takedown handling are fixed rules,
written down in [POLICY.md](POLICY.md) before they were ever needed.

## License

Code is MIT. The archived documents remain the property of their respective
owners; they are preserved here, unmodified, as a public-interest record of
documents that were published to the general public.
