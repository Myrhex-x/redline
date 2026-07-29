#!/usr/bin/env node
/**
 * The false-alarm guards, and proof they do not silence real changes.
 *
 * Of the first seven change events this project ever recorded, two were
 * withdrawn as false and three were footer links. Each was fixed reactively,
 * per document, after the mail had gone out. These tests exist so the fixes
 * are general and stay fixed.
 *
 * Every guard is tested twice: once that it catches the noise it is for, and
 * once that a genuine policy edit still gets through it. The second half is
 * the important half. On an archive whose purpose is catching a provider
 * quietly turning scanning on, a suppressed real change is the only failure
 * that actually matters.
 *
 * Run: node tools/test-guards.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assessDiff, RELEVANT } from "./significance.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}  ${detail}`); }
};

/** Mirror of history.mjs's guard, kept here so the rule itself is tested. */
function isPureReordering(hunks) {
  const added = [], removed = [];
  for (const h of hunks) for (const l of h.lines) {
    const s = l.s.trim();
    if (!s) continue;
    if (l.t === "+") added.push(s); else if (l.t === "-") removed.push(s);
  }
  if (!added.length || added.length !== removed.length) return false;
  const a = added.slice().sort(), b = removed.slice().sort();
  return a.every((x, i) => x === b[i]);
}

const hunk = (...lines) => [{ header: "@@", lines: lines.map(([t, s]) => ({ t, s })) }];

console.log("reordering guard — catches the noise");
check("swapped lines are not an edit", isPureReordering(hunk(
  ["-", "Council of the EU"], ["+", "German Permanent Representation to the EU"],
  ["-", "German Permanent Representation to the EU"], ["+", "Council of the EU"],
)));
check("whole block moved is not an edit", isPureReordering(hunk(
  ["-", "Alpha"], ["-", "Beta"], ["+", "Beta"], ["+", "Alpha"],
)));

console.log("reordering guard — does NOT silence a real edit");
check("one word changed is an edit", !isPureReordering(hunk(
  ["-", "We do not scan your messages"], ["+", "We may scan your messages"],
)));
check("a line added is an edit", !isPureReordering(hunk(
  ["-", "Alpha"], ["+", "Alpha"], ["+", "We scan for CSAM"],
)));
check("a line removed is an edit", !isPureReordering(hunk(["-", "We never scan messages"])));
check("one character changed is an edit", !isPureReordering(hunk(
  ["-", "We scan 0 messages"], ["+", "We scan 9 messages"],
)));

console.log("significance gate — chrome is recorded but not announced");
check("a single footer link", !assessDiff(hunk(["-", "Developers"])).substantive);
check("renamed menu items", !assessDiff(hunk(
  ["-", "Mail App"], ["+", "GMX App"], ["+", "Fotos & Dateien"],
)).substantive);

console.log("significance gate — does NOT silence a real edit");
const mustAnnounce = [
  ["short sentence about scanning", hunk(["+", "We scan messages."])],
  ["bare heading with tracked vocabulary", hunk(["+", "CSAM detection"])],
  ["the word derogation alone", hunk(["+", "derogation"])],
  ["a regulation reference", hunk(["+", "2021/1232"])],
  ["encryption claim removed", hunk(["-", "end-to-end encrypted"])],
  ["a long prose line with no vocabulary", hunk(["+", "We have updated the way this policy describes our practices."])],
  ["many short lines", hunk(["+", "a"], ["+", "b"], ["+", "c"], ["+", "d"], ["+", "e"], ["+", "f"], ["+", "g"])],
  ["monitoring language", hunk(["+", "We monitor content"])],
];
for (const [name, h] of mustAnnounce) {
  const a = assessDiff(h);
  check(`announces: ${name}`, a.substantive, a.reason);
}

console.log("the vocabulary is shared, not duplicated");
check("triage imports it", /from "\.\/significance\.mjs"/.test(readFileSync(join(ROOT, "tools/triage.mjs"), "utf8")));
check("matches scanning words", RELEVANT.test("we scan messages"));
check("does not match ordinary text", !RELEVANT.test("Careers and press"));

console.log("against every change this project has actually recorded");
const history = JSON.parse(readFileSync(join(ROOT, "history.json"), "utf8"));
const EXPECT = {
  "twitch/privacy": false, "tiktok/guidelines": false, "gmx/security": false,
  "zoom/privacy": true, "microsoft/eu-reports": true,
};
for (const e of history.filter((x) => x.kind === "change")) {
  const f = join(ROOT, "changes", `${e.id}.json`);
  if (!existsSync(f)) continue;
  const { hunks } = JSON.parse(readFileSync(f, "utf8"));
  const key = `${e.slug}/${e.doc}`;
  if (e.id === "2026-07-29-eu-parliament-derogation-procedure") {
    check("Parliament shuffle caught by the reordering guard", isPureReordering(hunks));
    continue;
  }
  if (!(key in EXPECT)) continue; // meta/privacy is a stub case, guarded upstream
  const a = assessDiff(hunks);
  check(`${key} ${EXPECT[key] ? "announced" : "not announced"}`, a.substantive === EXPECT[key], a.reason);
}

console.log(`\n${pass + fail} checks: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
