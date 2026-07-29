/**
 * Which events did THIS run actually record?
 *
 * Notification channels must answer that question, not "what happened today".
 * Filtering by date alone re-sends everything from earlier the same day
 * whenever a second run happens — and second runs do happen (a manual
 * test-fire beside the cron). One change would become repeated mail.
 *
 * The answer comes from git: history.json in the working tree contains this
 * run's events; the copy in HEAD is the state before it. The difference is
 * exactly what is new, and baselines never count as news.
 *
 * Fails closed: if the previous history cannot be read, nothing is new and
 * nothing is sent. Silence is always the safer error for a notifier.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function newEvents(history) {
  let previousIds;
  try {
    const prev = JSON.parse(
      execFileSync("git", ["show", "HEAD:history.json"], { encoding: "utf8", cwd: ROOT })
    );
    previousIds = new Set(prev.map((e) => e.id));
  } catch {
    return [];
  }
  // Baselines are not news, and a withdrawn record is the opposite of news:
  // announcing a change we have already established did not happen is how a
  // correction turns into a second false alarm.
  // Minor events stay in the record and on the site; they simply are not
  // worth an email. Three of the first seven alerts this project sent were
  // about a footer link, and a list that cries wolf is not read on the day
  // it matters.
  return history.filter(
    (e) => e.kind !== "baseline" && !e.corrected && !e.minor && !previousIds.has(e.id)
  );
}

/**
 * What the notifiers should actually send.
 *
 * newEvents() answers "what is in the working tree but not in HEAD", which
 * only holds BEFORE the run commits. But a notification must go out AFTER
 * the commit: the change page it links to is built from that commit, so mail
 * sent beforehand points at a URL that does not exist yet. Every alert this
 * project has ever sent linked to a page that was still 404.
 *
 * So the run records its events to a file while the answer is still
 * computable, and the notifiers — now running after the push — read it back.
 * Falls through to the git comparison when no file is set, which keeps a
 * plain `node tools/mail.mjs` working outside the workflow.
 */
export function pendingEvents(history) {
  const file = process.env.NEW_EVENTS_FILE;
  if (file && existsSync(file)) {
    return JSON.parse(readFileSync(file, "utf8"));
  }
  return newEvents(history);
}

// `node tools/new-events.mjs --save` — run before the commit step.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.env.NEW_EVENTS_FILE;
  if (!out) {
    console.error("new-events: set NEW_EVENTS_FILE to the path to write");
    process.exit(1);
  }
  const historyPath = join(ROOT, "history.json");
  const history = existsSync(historyPath)
    ? JSON.parse(readFileSync(historyPath, "utf8"))
    : [];
  const events = newEvents(history);
  writeFileSync(out, JSON.stringify(events, null, 1) + "\n");
  console.log(`new-events: recorded ${events.length} event(s) for the notifiers → ${out}`);
}
