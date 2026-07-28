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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
  return history.filter(
    (e) => e.kind !== "baseline" && !e.corrected && !previousIds.has(e.id)
  );
}
