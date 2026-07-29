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
 * Does this diff deserve a notification?
 *
 * Returns { substantive, reason }. A diff is NOT substantive only when every
 * single changed line looks like page furniture: short, without sentence
 * punctuation, and containing none of the vocabulary this archive exists for.
 * Any one line failing any one of those tests makes the whole change
 * announceable — the tests are ANDed on purpose, so a single real sentence
 * hidden among menu items still gets through.
 */
export function assessDiff(hunks) {
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

  const relevant = lines.find((s) => RELEVANT.test(s));
  if (relevant) {
    return { substantive: true, reason: `mentions tracked vocabulary: "${relevant.slice(0, 60)}"` };
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
