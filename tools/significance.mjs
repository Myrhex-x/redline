/**
 * Recording is not announcing.
 *
 * The archive's job is to record every change to a tracked document, and it
 * should keep doing that: a navigation link moving is still a fact about the
 * page, and git holds it either way. But three of the first seven emails this
 * project ever sent were about a footer link. "Twitch changed its Privacy
 * Notice" is true and useless, and an alerts list that cries wolf about menu
 * items is one nobody reads on the day it matters.
 *
 * So an event can be recorded and still not be announced. This module decides
 * which. It is deliberately conservative: the cost of an extra email is
 * annoyance, and the cost of a missed one is the entire point of the archive.
 * Anything that is not obviously chrome is announced.
 */

/**
 * Vocabulary that always warrants a human's attention, whatever else the diff
 * looks like. Shared with tools/triage.mjs so the thing that opens a review
 * issue and the thing that sends the mail cannot drift apart.
 */
export const RELEVANT =
  /\b(scan(?:s|ned|ning)?|detect(?:s|ed|ion|ing)?|CSAM|child sexual|hash[- ]?match|PhotoDNA|CSAI|end[- ]?to[- ]?end|E2EE|encrypt(?:ed|ion)?|law enforcement|government request|derogation|2021\/1232|monitor(?:s|ed|ing)?)\b/i;

const CHROME_MAX_CHARS = 45; // a nav label; a policy sentence is longer
const CHROME_MAX_LINES = 6;  // beyond a handful, even short lines deserve a look

/**
 * Documents whose entire content is short declarations, where a one-word line
 * IS the disclosure.
 *
 * A Google Play data-safety page and an App Store privacy label say things
 * like "Messages", "Photos and videos", "No data collected". Every one of
 * those is short, unpunctuated and free of scanning vocabulary — identical in
 * shape to a footer link, and the opposite in meaning. Judged by shape alone,
 * a provider flipping from "No data collected" to "Messages" is filed as
 * chrome and nobody is told, which is precisely the event this archive was
 * built to catch.
 *
 * So these are decided by which document they are, not by what the lines look
 * like. Keyed on the doc id rather than on a per-document flag, because a
 * flag someone forgets to set fails toward silence.
 */
const DECLARATION_DOCS = new Set(["play-safety", "appstore-label"]);

/**
 * Does this diff deserve a notification?
 *
 * Returns { substantive, reason }. A diff is NOT substantive only when every
 * single changed line looks like page furniture: short, without sentence
 * punctuation, and containing none of the vocabulary this archive exists for.
 * Any one line failing any one of those tests makes the whole change
 * announceable — the tests are ANDed on purpose, so a single real sentence
 * hidden among menu items still gets through.
 */
export function assessDiff(hunks, { docId } = {}) {
  const lines = [];
  for (const h of hunks ?? []) {
    for (const l of h.lines ?? []) {
      if (l.t === "+" || l.t === "-") {
        const s = String(l.s).trim();
        if (s) lines.push(s);
      }
    }
  }
  if (!lines.length) return { substantive: false, reason: "no changed lines" };

  if (DECLARATION_DOCS.has(docId)) {
    return {
      substantive: true,
      reason: `${docId} is a declaration of what the company collects; every line in it is a disclosure`,
    };
  }

  const relevant = lines.find((s) => RELEVANT.test(s));
  if (relevant) {
    return { substantive: true, reason: `mentions tracked vocabulary: "${relevant.slice(0, 60)}"` };
  }

  // A year ticking over is not a policy change. Twenty documents in this
  // archive carry a "Copyright © <year>" line long enough to read as prose,
  // so on 1 January the whole mailing list would be told that twenty
  // companies had amended their policies overnight.
  //
  // Only the years may differ, and only if nothing else does: the added and
  // removed lines are compared with every year blanked, and the change is
  // dismissed solely when they then match exactly. "in force until 2026"
  // becoming "in force until 2028" is a year change on a line that matters —
  // but that line trips RELEVANT above, and this test is never reached.
  // A revision stamp moving is the loudest hint a document has been edited,
  // so it is announced even when nothing else in the diff looks like prose.
  const stamp = lines.find((s) => /\b(last updated|last modified|effective(?: date)?|updated on|version)\b/i.test(s));
  if (stamp) {
    return { substantive: true, reason: `the document's own revision stamp changed: "${stamp.slice(0, 60)}"` };
  }

  // Narrowed hard, on purpose. An earlier version dismissed any line whose
  // only difference was a year, which silenced "in force until April 2026"
  // becoming "April 2028" — the end date of the derogation this whole archive
  // is about. Only a copyright notice qualifies now: formulaic, legally inert,
  // and the thing that actually rolls over on 1 January.
  const isCopyright = (s) => /©|\bcopyright\b|all rights reserved/i.test(s);
  const blankYears = (s) => s.replace(/\b(19|20)\d{2}\b/g, "\u0000");
  if (lines.every((s) => isCopyright(s) && /\b(19|20)\d{2}\b/.test(s))) {
    const added = [], removed = [];
    for (const h of hunks ?? []) for (const l of h.lines ?? []) {
      const s = String(l.s).trim();
      if (!s) continue;
      if (l.t === "+") added.push(blankYears(s)); else if (l.t === "-") removed.push(blankYears(s));
    }
    const a = added.slice().sort(), b = removed.slice().sort();
    if (a.length && a.length === b.length && a.every((x, i) => x === b[i])) {
      return { substantive: false, reason: "only a year changed; the lines are otherwise identical" };
    }
  }
  // Any other year is potentially load-bearing. "in force until April 2026"
  // becoming "April 2028" is twenty-five characters, unpunctuated and free of
  // tracked vocabulary — indistinguishable from a menu item by shape, and it
  // is the expiry date of the derogation. Dates in policy text mean something:
  // effective dates, deadlines, retention periods. Copyright notices were
  // dismissed above; everything else with a year is announced.
  const dated = lines.find((s) => !isCopyright(s) && /\b(19|20)\d{2}\b/.test(s));
  if (dated) {
    return { substantive: true, reason: `carries a date: "${dated.slice(0, 60)}"` };
  }
  if (lines.length > CHROME_MAX_LINES) {
    return { substantive: true, reason: `${lines.length} lines changed` };
  }
  const prose = lines.find((s) => s.length >= CHROME_MAX_CHARS || /[.!?]["')\]]?$/.test(s));
  if (prose) {
    return { substantive: true, reason: `contains prose: "${prose.slice(0, 60)}"` };
  }
  return {
    substantive: false,
    reason: `${lines.length} short label${lines.length === 1 ? "" : "s"}, no prose and no tracked vocabulary: ${lines.map((s) => JSON.stringify(s.slice(0, 28))).join(", ")}`,
  };
}
