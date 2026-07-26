# Show HN draft — post when ready

Best timing: after the GitHub Pages mirror is up and a handful of daily runs
are green (a first *real* recorded change in the feed is a bonus, not a
requirement — the baselines already demonstrate the machine).

Post from your own account. Titles under ~80 chars perform best; pick one:

**Title options**

1. Show HN: I record daily what 31 messaging apps say about EU Chat Control
2. Show HN: A tamper-evident archive of who scans messages under EU Chat Control
3. Show HN: ScanRecords – daily diffs of messaging apps' Chat Control policies

**URL**: https://scanrecords.org

---

**First comment (post it yourself immediately after submitting — HN expects
the author to explain, and it anchors the thread):**

The EU's "Chat Control" regulation (the ePrivacy derogation, in force until
April 2028) lets communication providers voluntarily scan private messages.
Voluntary means the real decisions live in quiet edits to privacy policies —
and a policy edit can only be proven if someone recorded the page *before*.

So this records, every day at 06:17 UTC: 85 policy/security/terms documents,
25 App Store privacy labels, 29 Google Play data-safety declarations, across
31 platforms — plus the Commission's and the EU Parliament's own Chat Control
pages, since institutions edit their pages too. Changes are committed to a
public git history with full before/after diffs, and the Internet Archive is
asked to capture changed sources the same day, so there are two independent
timestamps.

The statuses are deliberately narrow. "Scans under Chat Control" is only the
five providers the Commission itself names as filing the derogation's
mandatory transparency reports (Google, LinkedIn, Meta, Microsoft, Yubo —
COM(2025) 740). US-law scanning (NCMEC/PhotoDNA) is shown as a separate
status, because it's a separate legal regime and conflating them would
inflate the numbers. Where the public record is contradictory — Snapchat and
iCloud Mail appear in service lists but not among the report filers — the
pages show both facts and refuse to resolve them.

Tech: zero-dependency Node generator + fetcher (the only npm packages
anywhere are for the opt-in push alerts), no cookies, no analytics, no JS
except the alerts page, CSP with no inline anything. Quotes shown on company
pages are mechanically verified against the archived text on every run, so a
quote can't outlive the line it cites. Data is CC0, the repo is public, and
every status can be disputed in the open.

Reads in EN/FR/DE/ES/PL. Happy to answer anything — especially "your status
for X is wrong", which is exactly the kind of issue the site exists to host.

---

**Prediction of top questions (have answers ready):**

- "Why isn't <big platform> in the confirmed group?" → the COM(2025) 740
  five-filers rule; point at /notes/on-the-list-not-in-the-reports/.
- "How do I know you didn't edit history?" → public git + same-day Wayback
  double-timestamps; rebuild from repo.
- "What about 2.0 / client-side scanning?" → /chat-control/ 1.0-vs-2.0 table;
  it's a draft, the site tracks the Parliament's own status page daily.
- "Legal risk of archiving?" → public-interest record of publicly published
  documents, unmodified, with an open corrections policy (POLICY.md).
